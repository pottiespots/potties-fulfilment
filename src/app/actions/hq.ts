'use server';
// Potties HQ actions. Every function starts with requireHQ(); the foundry can never run these.
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { getUser, actorLabel, hashPassword } from '@/lib/auth';
import { getOrder, logEvent, touch } from '@/lib/data';
import { db, schema } from '@/lib/db';
import type { Stage, User } from '@/lib/db/schema';
import { STAGE_LABEL, STAGES } from '@/lib/rules';
import { dayTime, fromLocalInput } from '@/lib/format';
import { notifyFoundry, sendEmail } from '@/lib/notify';
import { checkUpload, putFile, storageKey } from '@/lib/storage';
import { syncRecentOrders, shopifyConfigured, addressFromShopify } from '@/lib/shopify';
import type { Res } from './orders';

async function requireHQ(): Promise<User> {
  const u = await getUser();
  if (!u || u.role !== 'HQ') throw new Error('Not allowed');
  return u;
}
const done = (msg: string): Res => { revalidatePath('/', 'layout'); return { ok: msg }; };
const cents = (v: FormDataEntryValue | null) => Math.round(Number(String(v ?? '').replace(/[^\d.]/g, '')) * 100);

// ---------------- orders ----------------
export async function sendToFoundry(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const o = await getOrder(orderId, 'HQ');
  if (!o) return { error: 'Order not found.' };
  if (o.stage !== 'NEW') return { error: 'Already sent.' };
  if (fd.get('confirm') !== 'on') return { error: 'Tick that you checked the customisation and address.' };
  for (const l of o.lines.filter((x) => x.customText)) {
    const v = String(fd.get(`custom_${l.id}`) ?? '').trim();
    if (v && v !== l.customText) {
      await db.update(schema.lineItems).set({ customText: v }).where(eq(schema.lineItems.id, l.id));
      await logEvent({ orderId, userId: u.id, actor: actorLabel(u), text: `Customisation changed from “${l.customText}” to “${v}”` });
    }
  }
  const shipBy = fromLocalInput(String(fd.get('shipBy') ?? '')) ?? o.shipBy;
  const courier = String(fd.get('courier') ?? '').trim() || o.courier;
  await touch(orderId, { stage: 'SENT', sentAt: new Date(), shipBy, courier, hqCustomChecked: true });
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), kind: 'status', text: `Checked and sent to foundry. Ship by ${dayTime(shipBy)}` });
  await notifyFoundry(`New Potties order ${o.name}`, `A new order is waiting for you to accept.\nShip by: ${dayTime(shipBy)}`, `/f/orders/${orderId}`);
  return done(`${o.name} sent to the foundry`);
}

export async function chaseFoundry(orderId: string): Promise<Res> {
  const u = await requireHQ();
  const o = await getOrder(orderId, 'HQ'); if (!o) return { error: 'Order not found.' };
  const r = await notifyFoundry(`Reminder: ${o.name}`, `Potties HQ is asking for an update on ${o.name} (${STAGE_LABEL[o.stage]}). Ship by ${dayTime(o.shipBy)}.`, `/f/orders/${orderId}`);
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), text: r.sent ? 'Reminder emailed to foundry' : 'Reminder logged (email not configured)' });
  return done(r.sent ? 'Reminder sent to the foundry' : 'Reminder logged. Email is not set up yet.');
}

export async function approveProof(orderId: string): Promise<Res> {
  const u = await requireHQ();
  await touch(orderId, { proofApprovedAt: new Date() });
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), kind: 'status', text: 'Proof photos approved. Customisation confirmed for shipping' });
  return done('Proof approved');
}

export async function requestRetake(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const why = String(fd.get('reason') ?? '').trim() || 'Please upload clearer photos.';
  await touch(orderId, { proofApprovedAt: null });
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), kind: 'note', text: `New photos needed: ${why}` });
  await notifyFoundry('New photos needed', why, `/f/orders/${orderId}`);
  return done('Foundry asked for new photos');
}

export async function answerQuestion(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const reply = String(fd.get('reply') ?? '').trim();
  if (!reply) return { error: 'Type a reply.' };
  await touch(orderId, { openQuestion: null, openQuestionAt: null });
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), kind: 'note', text: `Reply: ${reply}` });
  await notifyFoundry('Reply from Potties HQ', reply, `/f/orders/${orderId}`);
  return done('Reply sent');
}

export async function changeShipBy(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const d = fromLocalInput(String(fd.get('shipBy') ?? ''));
  if (!d) return { error: 'Pick a date and time.' };
  await touch(orderId, { shipBy: d });
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), text: `Ship-by date changed to ${dayTime(d)}` });
  return done('Ship-by date updated');
}

const ADDRESS_FIELDS = ['customerName', 'address1', 'address2', 'city', 'zip', 'province', 'country', 'phone', 'deliveryNote'] as const;
type AddressFields = Record<(typeof ADDRESS_FIELDS)[number], string | null>;
const oneLine = (a: AddressFields) => [a.customerName, a.address1, a.address2, [a.city, a.zip].filter(Boolean).join(' '), a.province, a.country, a.phone ? `Tel ${a.phone}` : null]
  .filter(Boolean).join(', ');

/** Saves a new shipping address, drops the old packing slip PDF (the Drive sync makes a new one) and tells the foundry. */
async function applyAddress(u: User, orderId: string, next: AddressFields, edited: boolean, note: string): Promise<Res> {
  const o = await getOrder(orderId, 'HQ');
  if (!o) return { error: 'Order not found.' };
  if (['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(o.stage)) return { error: 'This order has already left. Change the address with the courier.' };
  const before = oneLine(o);
  const after = oneLine(next);
  if (before === after && (o.deliveryNote ?? null) === next.deliveryNote) return { error: 'Nothing changed.' };
  await touch(orderId, {
    ...next, customerName: next.customerName || 'Customer', addressEditedAt: edited ? new Date() : null, addressEditedBy: edited ? u.name : null,
    // The foundry must put the new slip in the box.
    ...(o.slipInBox ? { slipInBox: false } : {}),
  });
  await db.delete(schema.orderFiles).where(and(eq(schema.orderFiles.orderId, orderId), eq(schema.orderFiles.kind, 'PACKING_SLIP')));
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), kind: 'note',
    text: `${edited ? 'Shipping address changed' : 'Shipping address reset to Shopify'}. Ship to: ${after}${next.deliveryNote ? `. Delivery note: ${next.deliveryNote}` : ''}${note ? `. ${note}` : ''} (was: ${before})` });
  if (o.stage !== 'NEW') {
    await notifyFoundry(`New shipping address for ${o.name}`,
      `Potties HQ changed where ${o.name} must go.\n\nShip to: ${after}${next.deliveryNote ? `\nDelivery note: ${next.deliveryNote}` : ''}${note ? `\n\n${note}` : ''}\n\nPlease print the new packing slip and use this address on the waybill.`,
      `/f/orders/${orderId}`);
  }
  return done(edited ? 'Address updated. The packing slip now shows the new address.' : 'Address reset to the Shopify address.');
}

export async function editAddress(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const v = (k: string) => String(fd.get(k) ?? '').trim().slice(0, 300) || null;
  const next = Object.fromEntries(ADDRESS_FIELDS.map((k) => [k, v(k)])) as AddressFields;
  if (!next.customerName || !next.address1 || !next.city || !next.country) return { error: 'Name, street address, town and country are needed.' };
  return applyAddress(u, orderId, next, true, v('note') ?? '');
}

export async function resetAddress(orderId: string): Promise<Res> {
  const u = await requireHQ();
  const o = await getOrder(orderId, 'HQ');
  if (!o?.shopifyData?.shippingAddress) return { error: 'No Shopify address stored for this order. Press Sync Shopify first.' };
  return applyAddress(u, orderId, addressFromShopify(o.shopifyData.shippingAddress, o.shopifyData.note ?? null), false, '');
}

/** Manual correction: HQ can put an order in any stage (logged). */
export async function hqSetStage(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const to = String(fd.get('to')) as Stage;
  if (![...STAGES, 'CANCELLED'].includes(to)) return { error: 'Unknown stage.' };
  const now = new Date();
  await touch(orderId, {
    stage: to,
    ...(to === 'SENT' ? { sentAt: now } : {}), ...(to === 'ACCEPTED' ? { acceptedAt: now } : {}),
    ...(to === 'PACKED' ? { packedAt: now } : {}), ...(to === 'DELIVERED' ? { deliveredAt: now } : {}),
  });
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), kind: 'status', text: `HQ moved order to ${STAGE_LABEL[to]}` });
  return done(`Moved to ${STAGE_LABEL[to]}`);
}

export async function markDelivered(orderId: string): Promise<Res> {
  const u = await requireHQ();
  await touch(orderId, { stage: 'DELIVERED', deliveredAt: new Date() });
  await logEvent({ orderId, userId: u.id, actor: actorLabel(u), kind: 'status', text: 'Delivery confirmed. Order fulfilled' });
  return done('Marked delivered');
}

export async function syncShopify(): Promise<Res> {
  await requireHQ();
  if (!shopifyConfigured()) return { error: 'Shopify is not connected yet. Add the Shopify keys in the hosting settings.' };
  try {
    const c = await syncRecentOrders();
    return done(`Shopify synced: ${c.created} new, ${c.updated} updated`);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

// ---------------- invoices ----------------
export async function createInvoice(_p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const supplier = String(fd.get('supplier')) === 'LL' ? 'LL' : 'FOUNDRY';
  const number = String(fd.get('number') ?? '').trim();
  const amountCents = cents(fd.get('amount'));
  const issuedAt = fromLocalInput(String(fd.get('issuedAt') ?? '')) ?? new Date();
  const dueAt = fromLocalInput(String(fd.get('dueAt') ?? '')) ?? new Date(issuedAt.getTime() + 30 * 864e5);
  const orderId = String(fd.get('orderId') ?? '') || null;
  const purchaseOrderId = String(fd.get('purchaseOrderId') ?? '') || null;
  if (!number) return { error: 'Enter the invoice number.' };
  if (!(amountCents > 0)) return { error: 'Enter the amount.' };
  const file = fd.get('file') as File | null;
  if (file && file.size) { const bad = checkUpload(file); if (bad) return { error: bad }; }
  const [inv] = await db.insert(schema.supplierInvoices).values({ supplier, number, amountCents, issuedAt, dueAt, orderId, purchaseOrderId }).returning();
  if (file && file.size) {
    const key = storageKey(`invoices/${inv.id}`, file.name);
    await putFile(key, Buffer.from(await file.arrayBuffer()), file.type);
    await db.insert(schema.orderFiles).values({ invoiceId: inv.id, orderId, kind: 'INVOICE', storageKey: key, filename: file.name, mime: file.type, size: file.size, uploadedById: u.id });
  }
  if (orderId) await logEvent({ orderId, userId: u.id, actor: actorLabel(u), text: `Foundry invoice ${number} attached`, internal: true });
  return done(`Invoice ${number} added`);
}

export async function markInvoicePaid(invoiceId: string): Promise<Res> {
  const u = await requireHQ();
  const [inv] = await db.update(schema.supplierInvoices).set({ paidAt: new Date() }).where(eq(schema.supplierInvoices.id, invoiceId)).returning();
  if (!inv) return { error: 'Invoice not found.' };
  if (inv.orderId) await logEvent({ orderId: inv.orderId, userId: u.id, actor: actorLabel(u), text: `Invoice ${inv.number} marked paid` });
  return done(`${inv.number} marked paid`);
}

export async function uploadPop(invoiceId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const [inv] = await db.select().from(schema.supplierInvoices).where(eq(schema.supplierInvoices.id, invoiceId));
  if (!inv) return { error: 'Invoice not found.' };
  const file = fd.get('file') as File;
  const bad = checkUpload(file); if (bad) return { error: bad };
  const key = storageKey(`invoices/${inv.id}`, file.name);
  await putFile(key, Buffer.from(await file.arrayBuffer()), file.type);
  await db.insert(schema.orderFiles).values({ invoiceId: inv.id, orderId: inv.orderId, kind: 'POP', storageKey: key, filename: file.name, mime: file.type, size: file.size, uploadedById: u.id });
  if (!inv.paidAt) await db.update(schema.supplierInvoices).set({ paidAt: new Date() }).where(eq(schema.supplierInvoices.id, inv.id));
  if (inv.orderId) await logEvent({ orderId: inv.orderId, userId: u.id, actor: actorLabel(u), text: `Proof of payment uploaded for ${inv.number}`, internal: true });
  return done('Proof of payment attached');
}

// ---------------- LL Manufacturing purchase orders ----------------
export async function createPO(_p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const productId = String(fd.get('productId') ?? '');
  const qty = Math.floor(Number(fd.get('quantity')));
  const expectedAt = fromLocalInput(String(fd.get('expectedAt') ?? ''));
  const [prod] = await db.select().from(schema.products).where(eq(schema.products.id, productId));
  if (!prod || prod.supplier !== 'LL') return { error: 'Choose a product.' };
  if (!(qty > 0)) return { error: 'Enter a quantity.' };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.purchaseOrders);
  const number = `PO-LL-${String(n + 1).padStart(3, '0')}`;
  const [po] = await db.insert(schema.purchaseOrders).values({ number, supplier: 'LL', expectedAt, notes: String(fd.get('notes') ?? '') || null }).returning();
  await db.insert(schema.purchaseOrderLines).values({ purchaseOrderId: po.id, productId, quantity: qty, unitCostCents: prod.unitCostCents });
  await logEvent({ purchaseOrderId: po.id, userId: u.id, actor: actorLabel(u), text: `${number} created: ${qty} × ${prod.name}` });
  const to = process.env.LL_ORDER_EMAIL;
  if (to) await sendEmail(to, `Potties purchase order ${number}`, `Hi LL Manufacturing,\n\nPlease supply:\n${qty} × ${prod.name} (${prod.sku})\n${expectedAt ? `Needed by ${dayTime(expectedAt)}\n` : ''}\nThank you,\nPotties`);
  return done(`${number} created${to ? ' and emailed to LL' : ''}`);
}

export async function setPOStatus(poId: string, _p: Res, fd: FormData): Promise<Res> {
  const u = await requireHQ();
  const status = String(fd.get('status'));
  const [po] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId));
  if (!po) return { error: 'Purchase order not found.' };
  if (po.status === 'DELIVERED') return { error: 'Already received.' };
  if (status === 'DELIVERED') {
    const lines = await db.select().from(schema.purchaseOrderLines).where(eq(schema.purchaseOrderLines.purchaseOrderId, poId));
    await db.transaction(async (tx) => {
      for (const l of lines) await tx.update(schema.products).set({ onHand: sql`${schema.products.onHand} + ${l.quantity}` }).where(eq(schema.products.id, l.productId));
      await tx.update(schema.purchaseOrders).set({ status: 'DELIVERED', receivedAt: new Date() }).where(eq(schema.purchaseOrders.id, poId));
    });
    await logEvent({ purchaseOrderId: poId, userId: u.id, actor: actorLabel(u), text: `${po.number} received. Stock updated` });
    return done(`${po.number} received. Stock updated`);
  }
  if (status !== 'IN_PRODUCTION' && status !== 'CANCELLED') return { error: 'Unknown status.' };
  await db.update(schema.purchaseOrders).set({ status }).where(eq(schema.purchaseOrders.id, poId));
  return done(`${po.number} updated`);
}

// ---------------- stock ----------------
export async function saveProduct(productId: string, _p: Res, fd: FormData): Promise<Res> {
  await requireHQ();
  const n = (k: string) => { const v = fd.get(k); return v === null || v === '' ? undefined : Math.max(0, Math.floor(Number(v))); };
  await db.update(schema.products).set({
    onHand: n('onHand'), reorderLevel: n('reorderLevel'), inProduction: n('inProduction'),
    ...(fd.get('unitCost') !== null && fd.get('unitCost') !== '' ? { unitCostCents: cents(fd.get('unitCost')) } : {}),
  }).where(eq(schema.products.id, productId));
  return done('Stock saved');
}

export async function createProduct(_p: Res, fd: FormData): Promise<Res> {
  await requireHQ();
  const name = String(fd.get('name') ?? '').trim(), sku = String(fd.get('sku') ?? '').trim().toUpperCase();
  const supplier = String(fd.get('supplier')) === 'LL' ? 'LL' : 'FOUNDRY';
  if (!name || !sku) return { error: 'Enter a name and SKU. Use the same SKU as in Shopify.' };
  const exists = await db.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.sku, sku));
  if (exists.length) return { error: 'That SKU already exists.' };
  await db.insert(schema.products).values({ name, sku, supplier, unitCostCents: cents(fd.get('unitCost')), reorderLevel: Number(fd.get('reorderLevel')) || 0 });
  return done(`${name} added`);
}

// ---------------- users ----------------
export async function createUser(_p: Res, fd: FormData): Promise<Res> {
  await requireHQ();
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const name = String(fd.get('name') ?? '').trim();
  const role = String(fd.get('role')) === 'HQ' ? 'HQ' : 'FOUNDRY';
  const password = String(fd.get('password') ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) return { error: 'Enter a name and a valid email.' };
  if (password.length < 10) return { error: 'Password must be at least 10 characters.' };
  const exists = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
  if (exists.length) return { error: 'A login with that email already exists.' };
  await db.insert(schema.users).values({ email, name, role, passwordHash: await hashPassword(password) });
  return done(`Login created for ${name}`);
}

export async function setUserActive(userId: string, active: boolean): Promise<Res> {
  const u = await requireHQ();
  if (userId === u.id && !active) return { error: 'You can’t switch off your own login.' };
  await db.update(schema.users).set({ active }).where(eq(schema.users.id, userId));
  return done(active ? 'Login switched on' : 'Login switched off');
}

export async function resetPassword(userId: string, _p: Res, fd: FormData): Promise<Res> {
  await requireHQ();
  const password = String(fd.get('password') ?? '');
  if (password.length < 10) return { error: 'Password must be at least 10 characters.' };
  await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, userId));
  return done('Password changed');
}

export async function goToOrder(fd: FormData) {
  await requireHQ();
  const q = String(fd.get('q') ?? '').trim().replace(/^#?/, '#');
  const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.name, q)));
  redirect(o ? `/hq/orders/${o.id}` : `/hq/orders?q=${encodeURIComponent(q)}`);
}

// ---------------- packing slip template ----------------
export async function savePackingSlipTemplate(_p: Res, fd: FormData): Promise<Res> {
  await requireHQ();
  const value = String(fd.get('template') ?? '').trim();
  if (!value) {
    await db.delete(schema.settings).where(eq(schema.settings.key, 'packing_slip_template'));
    return done('Using Shopify’s standard packing slip');
  }
  try {
    const { Liquid } = await import('liquidjs');
    new Liquid().parse(value); // reject a template with broken Liquid before saving it
  } catch (e) {
    return { error: `That template has an error: ${(e as Error).message.slice(0, 200)}` };
  }
  await db.insert(schema.settings).values({ key: 'packing_slip_template', value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedAt: new Date() } });
  return done('Packing slip template saved');
}
