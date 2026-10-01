// Builds the HQ "Needs your attention" list. Pure function so it can be tested.
import type { OrderRow, InvoiceRow, PORow } from './data';
import type { Product } from './db/schema';
import { acceptDeadline, duration, HOUR, isOpen, money, STAGE_LABEL } from './rules';
import { day } from './format';

export type AttentionKind =
  | 'send' | 'question' | 'not-accepted' | 'late' | 'proof' | 'custom-unchecked' | 'tracking-failed'
  | 'invoice-overdue' | 'invoice-due' | 'pop-missing' | 'po-late' | 'low-stock';

export type Attention = {
  sev: 'bad' | 'hot' | 'warn' | 'mute';
  kind: AttentionKind;
  ref: string;            // order name, PO number or SKU
  supplier?: 'LL' | 'FOUNDRY' | 'OTHER';
  supplierLabel?: string | null;
  title: string;
  detail: string;
  orderId?: string;
  invoiceId?: string;
  poId?: string;
  productId?: string;
};

export function buildAttention(input: {
  orders: OrderRow[]; invoices: InvoiceRow[]; pos: PORow[]; llProducts: (Product & { available: number; onOrder: number })[];
  now: Date; acceptHours: number;
}): Attention[] {
  const { orders, invoices, pos, llProducts, now, acceptHours } = input;
  const A: Attention[] = [];
  const left = (d: Date) => d.getTime() - now.getTime();
  for (const o of orders) {
    const base = { ref: o.name, orderId: o.id };
    if (o.stage === 'NEW') A.push({ ...base, sev: 'hot', kind: 'send', title: 'New order: check and send to foundry', detail: `${o.customerName} · ${o.lines.map((l) => l.title).join(', ')} · ships ${day(o.shipBy)}` });
    if (o.openQuestion) A.push({ ...base, sev: 'hot', kind: 'question', title: 'Foundry has a question', detail: `“${o.openQuestion}”` });
    if (o.stage === 'SENT' && o.sentAt && acceptDeadline(o.sentAt, acceptHours) < now) A.push({ ...base, sev: 'bad', kind: 'not-accepted', title: `Not accepted after ${acceptHours} h`, detail: o.customerName });
    if (isOpen(o.stage) && o.stage !== 'NEW' && o.stage !== 'SENT' && left(o.shipBy) < 0) A.push({ ...base, sev: 'bad', kind: 'late', title: `Late by ${duration(left(o.shipBy))}: still ${STAGE_LABEL[o.stage].toLowerCase()}`, detail: `${o.customerName} · ${o.city ?? ''}` });
    const proofReady = o.fileKinds.includes('PHOTO_PACKED') && o.fileKinds.includes('PHOTO_PRODUCT');
    if (o.stage === 'PACKED' && !o.proofApprovedAt && proofReady) A.push({ ...base, sev: 'warn', kind: 'proof', title: 'Proof photos ready to approve', detail: o.customerName });
    const custom = o.lines.find((l) => l.customText);
    if (custom && isOpen(o.stage) && ['ACCEPTED', 'MANUFACTURING', 'PACKING'].includes(o.stage) && !o.foundryCustomChecked && left(o.shipBy) >= 0 && left(o.shipBy) < 48 * HOUR)
      A.push({ ...base, sev: 'warn', kind: 'custom-unchecked', title: 'Customisation not confirmed yet', detail: `Ships in ${duration(left(o.shipBy))} · “${custom.customText}”` });
    if (o.shopifySyncError && o.stage === 'SHIPPED' && !o.shopifyFulfillmentId) A.push({ ...base, sev: 'bad', kind: 'tracking-failed', title: 'Tracking did not reach Shopify', detail: o.shopifySyncError });
  }
  for (const i of invoices) {
    const base = { ref: i.number, invoiceId: i.id, supplier: i.supplier, supplierLabel: i.supplierLabel, orderId: i.orderId ?? undefined };
    const who = `${i.supplier === 'FOUNDRY' ? 'Foundry' : i.supplier === 'LL' ? 'LL' : i.supplierLabel || 'Supplier'} invoice`;
    if (!i.paidAt && i.dueAt < now) A.push({ ...base, sev: 'bad', kind: 'invoice-overdue', title: `${who} ${i.number} overdue · ${money(i.amountCents)}`, detail: `Was due ${duration(left(i.dueAt))} ago` });
    else if (!i.paidAt) A.push({ ...base, sev: 'mute', kind: 'invoice-due', title: `${who} ${i.number} unpaid · ${money(i.amountCents)}`, detail: `Due in ${duration(left(i.dueAt))}` });
    else if (!i.pop) A.push({ ...base, sev: 'mute', kind: 'pop-missing', title: `Proof of payment missing for ${i.number}`, detail: 'Upload the POP for the audit trail' });
  }
  for (const p of pos) {
    if (p.status !== 'DELIVERED' && p.status !== 'CANCELLED' && p.expectedAt && p.expectedAt < now)
      A.push({ sev: 'warn', kind: 'po-late', ref: p.number, poId: p.id, supplier: 'LL', title: 'LL delivery is late', detail: p.lines.map((l) => `${l.quantity} × ${l.product.name}`).join(', ') });
  }
  for (const x of llProducts) {
    if (x.active && x.available + x.onOrder < x.reorderLevel)
      A.push({ sev: 'warn', kind: 'low-stock', ref: x.sku, productId: x.id, supplier: 'LL', title: `Low stock: ${x.name}`, detail: `${x.available} available · reorder level ${x.reorderLevel}` });
  }
  const rank = { bad: 0, hot: 1, warn: 2, mute: 3 };
  return A.sort((a, b) => rank[a.sev] - rank[b.sev]);
}
