'use server';
// Actions on a single order that the foundry (and in some cases HQ) can take.
// Every action re-checks the session, the role and the order's current state on the server.
import { revalidatePath } from 'next/cache';
import { getUser, actorLabel } from '@/lib/auth';
import { getOrder, logEvent, touch, gateInput, type OrderDetail } from '@/lib/data';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import type { FileKind, User } from '@/lib/db/schema';
import { canAddTracking, canSetFoundryStage, FOUNDRY_LABEL } from '@/lib/rules';
import { KIND_LABEL } from '@/lib/labels';
import { checkUpload, putFile, removeFile, storageKey } from '@/lib/storage';
import { pushTracking, shopifyConfigured } from '@/lib/shopify';
import { notifyHQ } from '@/lib/notify';
import { dayTime } from '@/lib/format';

export type Res = { ok?: string; error?: string } | null;

async function load(orderId: string): Promise<{ u: User; o: OrderDetail } | { error: string }> {
  const u = await getUser();
  if (!u) return { error: 'Your session has ended. Sign in again.' };
  const o = await getOrder(orderId, u.role);
  if (!o) return { error: 'Order not found.' };
  return { u, o };
}

function done(msg: string): Res {
  revalidatePath('/', 'layout');
  return { ok: msg };
}

export async function acceptOrder(orderId: string): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  if (u.role !== 'FOUNDRY') return { error: 'Only the foundry can accept orders.' };
  if (o.stage !== 'SENT') return { error: 'This order has already been accepted.' };
  await touch(o.id, { stage: 'ACCEPTED', acceptedAt: new Date() });
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u), kind: 'status', text: `Order accepted. Ready for courier by ${dayTime(o.shipBy)}` });
  return done('Order accepted');
}

export async function askQuestion(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  const q = String(fd.get('question') ?? '').trim();
  if (u.role !== 'FOUNDRY') return { error: 'Not allowed.' };
  if (!q) return { error: 'Type your question first.' };
  await touch(o.id, { openQuestion: q, openQuestionAt: new Date() });
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u), kind: 'note', text: `Question: ${q}` });
  await notifyHQ(`Foundry question on ${o.name}`, `${u.name} asked: ${q}`, `/hq/orders/${o.id}`);
  return done('Question sent to Potties HQ');
}

export async function setFoundryStage(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  if (u.role !== 'FOUNDRY') return { error: 'Not allowed.' };
  const to = String(fd.get('to')) as OrderDetail['stage'];
  if (to === o.stage) return null;
  const check = canSetFoundryStage(gateInput(o), to);
  if (!check.ok) return { error: check.reason };
  await touch(o.id, { stage: to, ...(to === 'PACKED' ? { packedAt: new Date() } : {}) });
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u), kind: 'status', text: `Status changed to ${FOUNDRY_LABEL[to]}` });
  return done(`Status: ${FOUNDRY_LABEL[to]}`);
}

const CHECK_FIELDS = { foundryCustomChecked: 'Customisation checked against the order', slipInBox: 'Packing slip is in the box' } as const;

export async function setCheck(orderId: string, field: keyof typeof CHECK_FIELDS, value: boolean): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  if (u.role !== 'FOUNDRY') return { error: 'Not allowed.' };
  if (!(field in CHECK_FIELDS)) return { error: 'Unknown check.' };
  if (!['ACCEPTED', 'MANUFACTURING', 'PACKING'].includes(o.stage)) return { error: 'Checks can only change before the order is packed.' };
  await touch(o.id, { [field]: value });
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u), text: `${value ? 'Ticked' : 'Unticked'}: ${CHECK_FIELDS[field]}` });
  return done('Saved');
}

const FOUNDRY_KINDS: FileKind[] = ['PHOTO_PRODUCT', 'PHOTO_CUSTOM', 'PHOTO_PACKED', 'PHOTO_WAYBILL', 'WAYBILL', 'OTHER'];
const HQ_ORDER_KINDS: FileKind[] = [...FOUNDRY_KINDS, 'ARTWORK'];

export async function uploadOrderFile(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  const kind = String(fd.get('kind')) as FileKind;
  const allowed = u.role === 'HQ' ? HQ_ORDER_KINDS : FOUNDRY_KINDS;
  if (!allowed.includes(kind)) return { error: 'You can’t upload that kind of file here.' };
  if (u.role === 'FOUNDRY' && ['SHIPPED', 'DELIVERED'].includes(o.stage) && kind !== 'OTHER') return { error: 'This order has shipped.' };
  const file = fd.get('file') as File;
  const bad = checkUpload(file); if (bad) return { error: bad };
  const key = storageKey(`orders/${o.id}`, file.name);
  try {
    await putFile(key, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await db.insert(schema.orderFiles).values({ orderId: o.id, kind, storageKey: key, filename: file.name, mime: file.type, size: file.size, uploadedById: u.id });
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u), text: `Uploaded: ${KIND_LABEL[kind]}` });
  return done('Uploaded');
}

/** Removes a proof photo or document from an order (e.g. wrong or blurry photo). Logged in the history. */
export async function deleteOrderFile(orderId: string, fileId: string): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  const [f] = await db.select().from(schema.orderFiles).where(and(eq(schema.orderFiles.id, fileId), eq(schema.orderFiles.orderId, o.id)));
  if (!f) return { error: 'That file was already removed.' };
  const allowed = u.role === 'HQ' ? HQ_ORDER_KINDS : FOUNDRY_KINDS;
  if (!allowed.includes(f.kind)) return { error: 'This file can’t be removed here.' };
  if (u.role === 'FOUNDRY' && ['SHIPPED', 'DELIVERED'].includes(o.stage)) return { error: 'This order has shipped, so its photos are kept as the record. Ask Potties HQ if one must go.' };
  await db.delete(schema.orderFiles).where(eq(schema.orderFiles.id, f.id));
  try { await removeFile(f.storageKey); } catch { /* the record is gone; a leftover stored file is harmless */ }
  // A changed set of photos needs a fresh look from HQ.
  const isProof = f.kind.startsWith('PHOTO_');
  if (isProof && o.proofApprovedAt) await touch(o.id, { proofApprovedAt: null });
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u),
    text: `Removed: ${KIND_LABEL[f.kind]} (${f.filename})${isProof && o.proofApprovedAt ? '. Proof needs approving again' : ''}` });
  return done('Removed');
}

export async function addNote(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  const text = String(fd.get('text') ?? '').trim().slice(0, 2000);
  if (!text) return { error: 'Type a note first.' };
  const internal = u.role === 'HQ' && fd.get('internal') === 'on';
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u), kind: 'note', text, internal });
  if (u.role === 'FOUNDRY' && /^problem|delay/i.test(text)) await notifyHQ(`Foundry flagged a problem on ${o.name}`, text, `/hq/orders/${o.id}`);
  return done('Note added');
}

/** Saves tracking, marks Shipped, and creates the Shopify fulfilment so the customer is emailed. */
export async function addTracking(orderId: string, _p: Res, fd: FormData): Promise<Res> {
  const r = await load(orderId); if ('error' in r) return r;
  const { u, o } = r;
  const company = String(fd.get('courier') ?? '').trim();
  const number = String(fd.get('tracking') ?? '').trim().replace(/\s+/g, '');
  if (!company) return { error: 'Choose the courier.' };
  if (!/^[A-Za-z0-9-]{4,40}$/.test(number)) return { error: 'Enter the tracking / waybill number (letters and numbers only).' };
  const check = canAddTracking(gateInput(o), process.env.REQUIRE_HQ_PROOF_APPROVAL === 'true');
  if (!check.ok) return { error: check.reason };

  let fulfillmentId: string | null = null, syncError: string | null = null;
  if (o.shopifyId && shopifyConfigured()) {
    try { fulfillmentId = await pushTracking(o.shopifyId, company, number); }
    catch (e) { syncError = (e as Error).message; }
  } else if (o.shopifyId) {
    syncError = 'Shopify is not connected yet.';
  }
  await touch(o.id, {
    stage: 'SHIPPED', shippedAt: new Date(), trackingCompany: company, trackingNumber: number, courier: company,
    shopifyFulfillmentId: fulfillmentId, shopifySyncError: syncError,
  });
  await logEvent({ orderId: o.id, userId: u.id, actor: actorLabel(u), kind: 'status',
    text: `Collected by ${company}. Tracking ${number}${fulfillmentId ? ' sent to Shopify, customer notified' : ''}` });
  if (syncError) {
    await logEvent({ orderId: o.id, actor: 'Shopify', text: `Tracking not sent to Shopify: ${syncError}`, internal: true });
    await notifyHQ(`Tracking for ${o.name} did not reach Shopify`, `${syncError}\nTracking: ${company} ${number}`, `/hq/orders/${o.id}`);
  }
  return done(fulfillmentId ? 'Tracking sent. The customer has been emailed.' : 'Tracking saved');
}

