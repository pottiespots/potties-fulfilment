// Pure business rules: stages, deadlines, compliance gates. No database or framework imports,
// so these are unit-tested directly (rules.test.ts).
import type { Stage } from './db/schema';

export const HOUR = 36e5;
export const DAY = 24 * HOUR;

export const STAGES: Stage[] = ['NEW', 'SENT', 'ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED', 'SHIPPED', 'DELIVERED'];
export const stageIndex = (s: Stage) => (s === 'CANCELLED' ? -1 : STAGES.indexOf(s));

export const STAGE_LABEL: Record<Stage, string> = {
  NEW: 'New order', SENT: 'Sent to foundry', ACCEPTED: 'Accepted', MANUFACTURING: 'Manufacturing',
  PACKING: 'Packing', PACKED: 'Packed', SHIPPED: 'In transit', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};
export const STAGE_SHORT: Record<Stage, string> = {
  NEW: 'New', SENT: 'Sent', ACCEPTED: 'Accepted', MANUFACTURING: 'Making', PACKING: 'Packing',
  PACKED: 'Packed', SHIPPED: 'Transit', DELIVERED: 'Done', CANCELLED: 'Cancelled',
};
// What the foundry reads on its own screens.
export const FOUNDRY_LABEL: Record<Stage, string> = {
  NEW: 'Not sent yet', SENT: 'New: please accept', ACCEPTED: 'Accepted', MANUFACTURING: 'In manufacturing',
  PACKING: 'Packing', PACKED: 'Packed, waiting for courier', SHIPPED: 'Collected, tracking sent',
  DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

/** Stages the foundry may set with the status buttons (accepting and shipping have their own actions). */
export const FOUNDRY_SETTABLE: Stage[] = ['ACCEPTED', 'MANUFACTURING', 'PACKING', 'PACKED'];

/** The foundry only ever sees orders HQ has sent. */
export const visibleToFoundry = (s: Stage) => stageIndex(s) >= stageIndex('SENT');
export const isOpen = (s: Stage) => stageIndex(s) >= 0 && stageIndex(s) <= stageIndex('PACKED');

export type GateInput = {
  stage: Stage;
  hasCustom: boolean;
  foundryCustomChecked: boolean;
  slipInBox: boolean;
  photoKinds: string[];
  proofApprovedAt: Date | null;
};

/** Reasons an order cannot be marked Packed yet; empty means allowed. */
export function packedBlockers(o: GateInput): string[] {
  const out: string[] = [];
  if (o.hasCustom && !o.foundryCustomChecked) out.push('tick the customisation check');
  if (!o.slipInBox) out.push('tick “packing slip is in the box”');
  if (!o.photoKinds.includes('PHOTO_PACKED')) out.push('upload a photo of the packed box');
  return out;
}

export function canSetFoundryStage(o: GateInput, to: Stage): { ok: boolean; reason?: string } {
  const from = stageIndex(o.stage);
  if (from < stageIndex('ACCEPTED') || from > stageIndex('PACKED')) return { ok: false, reason: 'This order can’t be changed from here.' };
  if (!FOUNDRY_SETTABLE.includes(to)) return { ok: false, reason: 'Not a status the foundry can set.' };
  if (to === 'PACKED') {
    const b = packedBlockers(o);
    if (b.length) return { ok: false, reason: `To mark Packed: ${b.join(', ')}.` };
  }
  return { ok: true };
}

export function canAddTracking(o: GateInput, requireApproval: boolean): { ok: boolean; reason?: string } {
  if (o.stage !== 'PACKED') return { ok: false, reason: 'Tracking can be added once the order is packed.' };
  if (requireApproval && !o.proofApprovedAt) return { ok: false, reason: 'Potties HQ must approve the proof photos first.' };
  return { ok: true };
}

/** Default ship-by: N days after the order, 10:00 Johannesburg (08:00 UTC), moved off weekends. */
export function defaultShipBy(placedAt: Date, leadDays: number): Date {
  const d = new Date(placedAt.getTime() + leadDays * DAY);
  d.setUTCHours(8, 0, 0, 0);
  const dow = d.getUTCDay();
  if (dow === 6) d.setTime(d.getTime() + 2 * DAY);
  if (dow === 0) d.setTime(d.getTime() + DAY);
  return d;
}

export type Urgency = 'late' | 'soon' | 'ok' | 'done';

/** Late = past ship-by while still open; soon = within 72 h. */
export function urgency(stage: Stage, shipBy: Date, now: Date): Urgency {
  if (!isOpen(stage)) return 'done';
  const h = (shipBy.getTime() - now.getTime()) / HOUR;
  if (h < 0) return 'late';
  if (h < 72) return 'soon';
  return 'ok';
}

export function acceptDeadline(sentAt: Date, windowHours: number) {
  return new Date(sentAt.getTime() + windowHours * HOUR);
}

/** "3 h", "2 d", "45 min" — always positive; callers add "late by"/"in". */
export function duration(ms: number): string {
  const h = Math.abs(ms) / HOUR;
  if (h >= 48) return `${Math.round(h / 24)} d`;
  if (h >= 1) return `${Math.round(h)} h`;
  return `${Math.max(1, Math.round(h * 60))} min`;
}

export function timeLeftLabel(shipBy: Date, now: Date): string {
  const ms = shipBy.getTime() - now.getTime();
  return ms < 0 ? `Late by ${duration(ms)}` : `Ship in ${duration(ms)}`;
}

// ---------- customisation detection from Shopify line item properties ----------
const CUSTOM_KEY = /(engrav|lid|cast|name|initial|monogram|personal|custom|text|message)/i;

export function detectCustomisation(props: { key: string; value: string }[]): { type: string; text: string } | null {
  const visible = props.filter((p) => !p.key.startsWith('_') && p.value && p.value.trim());
  const hit = visible.find((p) => CUSTOM_KEY.test(p.key));
  if (!hit) return null;
  const type = /engrav/i.test(hit.key) ? 'Engraving' : /lid|cast/i.test(hit.key) ? 'Cast lid' : hit.key;
  return { type, text: hit.value.trim() };
}

/** Courier name from the Shopify shipping line title, e.g. "The Courier Guy – Economy". */
export function courierFromShippingTitle(title: string | null | undefined): { courier: string | null; service: string | null } {
  if (!title) return { courier: null, service: null };
  const parts = title.split(/\s+[-–|·]\s+/);
  return { courier: parts[0].trim(), service: parts.slice(1).join(' · ').trim() || null };
}

export const money = (cents: number) =>
  'R ' + (cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
