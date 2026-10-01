import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { checkIntegrationToken, mapSupplier, toCents, toDate } from '@/lib/integration';
import { logEvent } from '@/lib/data';

// POST /api/integration/invoices  — the COGS sheet's "8. Invoices" register, one item per invoice.
// Creates or updates by (supplier, invoice number). The sheet is in charge of amounts and payments;
// a payment marked only in the dashboard is kept until the sheet records it.
const Item = z.object({
  supplier: z.string().min(1),
  number: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  issuedAt: z.string().optional().nullable(),
  dueAt: z.string().optional().nullable(),
  paidAt: z.string().optional().nullable(),
  paidAmount: z.union([z.number(), z.string()]).optional().nullable(),
  orderName: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
  driveUrl: z.string().url().optional().nullable(),
  notes: z.string().optional().nullable(),
});
const Body = z.object({ invoices: z.array(Item).max(500) });

export async function POST(req: Request) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Bad request', details: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const items = parsed.data.invoices;

  const names = [...new Set(items.map((i) => i.orderName?.trim()).filter(Boolean) as string[])].map((n) => (n.startsWith('#') ? n : `#${n}`));
  const poNums = [...new Set(items.map((i) => i.poNumber?.trim()).filter(Boolean) as string[])];
  const [orders, pos] = await Promise.all([
    names.length ? db.select({ id: schema.orders.id, name: schema.orders.name }).from(schema.orders).where(inArray(schema.orders.name, names)) : [],
    poNums.length ? db.select({ id: schema.purchaseOrders.id, number: schema.purchaseOrders.number }).from(schema.purchaseOrders).where(inArray(schema.purchaseOrders.number, poNums)) : [],
  ]);
  const result = { created: 0, updated: 0, skipped: [] as string[], unmatchedOrders: [] as string[] };

  for (const it of items) {
    const { supplier, label } = mapSupplier(it.supplier);
    const amountCents = toCents(it.amount);
    if (amountCents === null) { result.skipped.push(`${it.number}: amount not readable`); continue; }
    const issuedAt = toDate(it.issuedAt) ?? new Date();
    const dueAt = toDate(it.dueAt) ?? new Date(issuedAt.getTime() + 30 * 864e5);
    const orderKey = it.orderName ? (it.orderName.startsWith('#') ? it.orderName : `#${it.orderName}`) : null;
    const orderId = orderKey ? orders.find((o) => o.name === orderKey)?.id ?? null : null;
    if (orderKey && !orderId) result.unmatchedOrders.push(orderKey);
    const purchaseOrderId = it.poNumber ? pos.find((p) => p.number === it.poNumber)?.id ?? null : null;
    const sheetPaidAt = toDate(it.paidAt);
    const values = {
      supplier, supplierLabel: label, number: it.number.trim(), amountCents, issuedAt, dueAt,
      paidAmountCents: toCents(it.paidAmount ?? null), driveUrl: it.driveUrl ?? null, notes: it.notes ?? null,
      source: 'cogs-sheet', updatedAt: new Date(),
      ...(orderId ? { orderId } : {}), ...(purchaseOrderId ? { purchaseOrderId } : {}),
    };
    const [existing] = await db.select().from(schema.supplierInvoices)
      .where(and(eq(schema.supplierInvoices.supplier, supplier), eq(schema.supplierInvoices.number, values.number)));
    if (existing) {
      await db.update(schema.supplierInvoices).set({ ...values, paidAt: sheetPaidAt ?? existing.paidAt }).where(eq(schema.supplierInvoices.id, existing.id));
      result.updated++;
      if (sheetPaidAt && !existing.paidAt && existing.orderId) {
        await logEvent({ orderId: existing.orderId, actor: 'COGS sheet', text: `Invoice ${values.number} recorded as paid`, internal: true });
      }
    } else {
      const [row] = await db.insert(schema.supplierInvoices).values({ ...values, paidAt: sheetPaidAt }).returning();
      result.created++;
      if (row.orderId) await logEvent({ orderId: row.orderId, actor: 'COGS sheet', text: `Supplier invoice ${row.number} added from the COGS sheet`, internal: true });
    }
  }
  return NextResponse.json(result);
}
