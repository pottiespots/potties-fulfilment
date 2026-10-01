import 'server-only';
import { and, asc, desc, eq, inArray, isNotNull, ne, or, gte } from 'drizzle-orm';
import { db, schema } from './db';
import type { Order, LineItem, OrderFile, Event, SupplierInvoice, Role } from './db/schema';
import { DAY, visibleToFoundry, type GateInput } from './rules';

export type OrderRow = Order & {
  lines: LineItem[];
  fileKinds: string[];
  invoice: SupplierInvoice | null;
};

export const hasCustom = (o: { lines: LineItem[] }) => o.lines.some((l) => l.customText);
export const customLines = (o: { lines: LineItem[] }) => o.lines.filter((l) => l.customText);
export const itemsSummary = (o: { lines: LineItem[] }) =>
  o.lines.map((l) => `${l.title}${l.variant ? ` · ${l.variant}` : ''}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`).join(', ');

export function gateInput(o: OrderRow): GateInput {
  return {
    stage: o.stage, hasCustom: hasCustom(o), foundryCustomChecked: o.foundryCustomChecked,
    slipInBox: o.slipInBox, photoKinds: o.fileKinds, proofApprovedAt: o.proofApprovedAt,
  };
}

/** Orders for lists: everything open, plus anything shipped/delivered in the last 30 days. */
export async function listOrders(role: Role): Promise<OrderRow[]> {
  const since = new Date(Date.now() - 30 * DAY);
  let rows = await db.select().from(schema.orders)
    .where(and(ne(schema.orders.stage, 'CANCELLED'),
      or(inArray(schema.orders.stage, ['NEW', 'SENT', 'ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED']), gte(schema.orders.updatedAt, since))))
    .orderBy(asc(schema.orders.shipBy));
  if (role === 'FOUNDRY') rows = rows.filter((o) => visibleToFoundry(o.stage));
  return attach(rows, role);
}

async function attach(rows: Order[], _role: Role): Promise<OrderRow[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [lines, files, invs] = await Promise.all([
    db.select().from(schema.lineItems).where(inArray(schema.lineItems.orderId, ids)),
    db.select({ orderId: schema.orderFiles.orderId, kind: schema.orderFiles.kind }).from(schema.orderFiles).where(inArray(schema.orderFiles.orderId, ids)),
    db.select().from(schema.supplierInvoices).where(and(inArray(schema.supplierInvoices.orderId, ids), eq(schema.supplierInvoices.supplier, 'FOUNDRY'))),
  ]);
  return rows.map((o) => ({
    ...o,
    lines: lines.filter((l) => l.orderId === o.id),
    fileKinds: files.filter((f) => f.orderId === o.id).map((f) => f.kind),
    invoice: invs.find((i) => i.orderId === o.id) ?? null,
  }));
}

export type OrderDetail = OrderRow & { files: OrderFile[]; events: Event[]; invoicePop: boolean };

/** One order with everything on it. Returns null if this role may not see it. */
export async function getOrder(id: string, role: Role): Promise<OrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  // One round of parallel queries: the database is far from the server on the free plans,
  // so every sequential query adds noticeable delay.
  const [[o], lines, allFiles, allEvents, [invoice]] = await Promise.all([
    db.select().from(schema.orders).where(eq(schema.orders.id, id)),
    db.select().from(schema.lineItems).where(eq(schema.lineItems.orderId, id)),
    db.select().from(schema.orderFiles).where(eq(schema.orderFiles.orderId, id)).orderBy(asc(schema.orderFiles.createdAt)),
    db.select().from(schema.events).where(eq(schema.events.orderId, id)).orderBy(desc(schema.events.createdAt)),
    db.select().from(schema.supplierInvoices).where(and(eq(schema.supplierInvoices.orderId, id), eq(schema.supplierInvoices.supplier, 'FOUNDRY'))),
  ]);
  if (!o) return null;
  if (role === 'FOUNDRY' && !visibleToFoundry(o.stage)) return null;
  // Proof-of-payment files are stored with the order id, so they are already in allFiles.
  const invoicePop = !!invoice && allFiles.some((f) => f.invoiceId === invoice.id && f.kind === 'POP');
  const files = role === 'FOUNDRY' ? allFiles.filter((f) => f.kind !== 'INVOICE' && f.kind !== 'POP') : allFiles;
  const events = role === 'FOUNDRY' ? allEvents.filter((e) => !e.internal) : allEvents;
  return { ...o, lines, fileKinds: allFiles.map((f) => f.kind), invoice: invoice ?? null, files, events, invoicePop };
}

export async function logEvent(e: {
  orderId?: string | null; purchaseOrderId?: string | null; userId?: string | null;
  actor: string; kind?: 'system' | 'note' | 'status'; text: string; internal?: boolean;
}) {
  await db.insert(schema.events).values({
    orderId: e.orderId ?? null, purchaseOrderId: e.purchaseOrderId ?? null, userId: e.userId ?? null,
    actor: e.actor, kind: e.kind ?? 'system', text: e.text, internal: e.internal ?? false,
  });
}

export async function touch(orderId: string, patch: Partial<Order>) {
  await db.update(schema.orders).set({ ...patch, updatedAt: new Date() }).where(eq(schema.orders.id, orderId));
}

// ---------- suppliers ----------
export async function invoicesWithPop() {
  const [invs, files] = await Promise.all([
    db.select().from(schema.supplierInvoices).orderBy(asc(schema.supplierInvoices.dueAt)),
    db.select({ invoiceId: schema.orderFiles.invoiceId, kind: schema.orderFiles.kind, id: schema.orderFiles.id })
      .from(schema.orderFiles).where(isNotNull(schema.orderFiles.invoiceId)),
  ]);
  return invs.map((i) => ({
    ...i,
    pop: files.some((f) => f.invoiceId === i.id && f.kind === 'POP'),
    invoiceFileId: files.find((f) => f.invoiceId === i.id && f.kind === 'INVOICE')?.id ?? null,
    popFileId: files.find((f) => f.invoiceId === i.id && f.kind === 'POP')?.id ?? null,
  }));
}
export type InvoiceRow = Awaited<ReturnType<typeof invoicesWithPop>>[number];

export async function purchaseOrdersFull() {
  const [pos, lines, prods] = await Promise.all([
    db.select().from(schema.purchaseOrders).orderBy(desc(schema.purchaseOrders.placedAt)),
    db.select().from(schema.purchaseOrderLines),
    db.select().from(schema.products),
  ]);
  return pos.map((p) => {
    const ls = lines.filter((l) => l.purchaseOrderId === p.id).map((l) => ({ ...l, product: prods.find((x) => x.id === l.productId)! }));
    return { ...p, lines: ls, totalCents: ls.reduce((s, l) => s + l.quantity * l.unitCostCents, 0) };
  });
}
export type PORow = Awaited<ReturnType<typeof purchaseOrdersFull>>[number];

/** Units reserved for open customer orders, by SKU. */
export async function allocatedBySku() {
  const open = await db.select({ sku: schema.lineItems.sku, qty: schema.lineItems.quantity })
    .from(schema.lineItems).innerJoin(schema.orders, eq(schema.lineItems.orderId, schema.orders.id))
    .where(inArray(schema.orders.stage, ['NEW', 'SENT', 'ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED']));
  const m = new Map<string, number>();
  for (const r of open) if (r.sku) m.set(r.sku, (m.get(r.sku) ?? 0) + r.qty);
  return m;
}

/** Products with live stock figures: available = on hand − reserved for open orders; on order = open LL POs. */
export async function productsWithStock(supplier: 'LL' | 'FOUNDRY') {
  const [prods, alloc, pos] = await Promise.all([
    db.select().from(schema.products).where(eq(schema.products.supplier, supplier)).orderBy(asc(schema.products.name)),
    allocatedBySku(),
    supplier === 'LL' ? purchaseOrdersFull() : Promise.resolve([] as PORow[]),
  ]);
  return prods.map((p) => {
    const allocated = alloc.get(p.sku) ?? 0;
    const onOrder = pos.filter((po) => po.status === 'ORDERED' || po.status === 'IN_PRODUCTION')
      .reduce((s, po) => s + po.lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0), 0);
    return { ...p, allocated, available: p.onHand - allocated, onOrder };
  });
}
export type StockRow = Awaited<ReturnType<typeof productsWithStock>>[number];
