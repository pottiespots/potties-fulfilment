import { NextResponse } from 'next/server';
import { desc, gte } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { checkIntegrationToken, appUrl } from '@/lib/integration';
import { listOrders, invoicesWithPop, purchaseOrdersFull, productsWithStock } from '@/lib/data';
import { STAGE_LABEL, stageIndex } from '@/lib/rules';

// Everything the daily COGS routine needs to update the sheet and archive documents to Drive.
// GET /api/integration/export?since=2026-10-01T00:00:00Z  (since limits the files list)
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = checkIntegrationToken(req); if (denied) return denied;
  const since = new Date(new URL(req.url).searchParams.get('since') ?? Date.now() - 7 * 864e5);
  const base = appUrl();
  const [orders, invoices, pos, llStock, potStock, files, runs] = await Promise.all([
    listOrders('HQ'), invoicesWithPop(), purchaseOrdersFull(), productsWithStock('LL'), productsWithStock('FOUNDRY'),
    db.select().from(schema.orderFiles).where(gte(schema.orderFiles.createdAt, isNaN(since.getTime()) ? new Date(0) : since)),
    db.select().from(schema.syncRuns).orderBy(desc(schema.syncRuns.createdAt)).limit(1),
  ]);
  const orderName = new Map(orders.map((o) => [o.id, o.name]));
  const poNumber = new Map(pos.map((p) => [p.id, p.number]));
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    lastSync: runs[0] ?? null,
    orders: orders.map((o) => ({
      name: o.name, shopifyId: o.shopifyId, stage: o.stage, stageLabel: STAGE_LABEL[o.stage],
      customerName: o.customerName, city: o.city, province: o.province,
      placedAt: o.placedAt, shipBy: o.shipBy, sentToFoundryAt: o.sentAt, acceptedAt: o.acceptedAt, packedAt: o.packedAt,
      shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, courier: o.trackingCompany ?? o.courier, trackingNumber: o.trackingNumber,
      proofApproved: Boolean(o.proofApprovedAt), openQuestion: o.openQuestion,
      lines: o.lines.map((l) => ({ title: l.title, variant: l.variant, sku: l.sku, quantity: l.quantity, customType: l.customType, customText: l.customText })),
      foundryInvoice: o.invoice ? { number: o.invoice.number, paid: Boolean(o.invoice.paidAt) } : null,
      packingSlipUrl: stageIndex(o.stage) >= stageIndex('SENT') ? `${base}/api/integration/orders/${o.id}/packing-slip` : null,
      dashboardUrl: `${base}/hq/orders/${o.id}`,
    })),
    invoices: invoices.map((i) => ({
      supplier: i.supplier, supplierLabel: i.supplierLabel, number: i.number, amount: i.amountCents / 100,
      issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt, paidAmount: i.paidAmountCents === null ? null : i.paidAmountCents / 100,
      source: i.source, orderName: i.orderId ? orderName.get(i.orderId) ?? null : null, poNumber: i.purchaseOrderId ? poNumber.get(i.purchaseOrderId) ?? null : null,
      driveUrl: i.driveUrl, hasProofOfPayment: i.pop,
      proofOfPaymentUrl: i.popFileId ? `${base}/api/integration/files/${i.popFileId}` : null,
    })),
    purchaseOrders: pos.map((p) => ({
      number: p.number, status: p.status, placedAt: p.placedAt, expectedAt: p.expectedAt, receivedAt: p.receivedAt, total: p.totalCents / 100,
      lines: p.lines.map((l) => ({ sku: l.product.sku, name: l.product.name, quantity: l.quantity, unitCost: l.unitCostCents / 100 })),
    })),
    stock: [...potStock, ...llStock].map((x) => ({ sku: x.sku, name: x.name, supplier: x.supplier, onHand: x.onHand, reservedForOrders: x.allocated, onOrder: x.onOrder, available: x.available, reorderLevel: x.reorderLevel })),
    // New files since `since`: proof photos, waybills, artwork, invoices and proofs of payment uploaded in the dashboard.
    files: files.filter((f) => !f.driveUrl).map((f) => ({
      id: f.id, orderName: f.orderId ? orderName.get(f.orderId) ?? null : null, kind: f.kind, filename: f.filename, mime: f.mime,
      createdAt: f.createdAt, downloadUrl: `${base}/api/integration/files/${f.id}`,
    })),
  });
}
