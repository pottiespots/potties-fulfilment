// The foundry's to-do list for one order: what is done and what is still needed until it leaves the foundry.
import { stageIndex } from './rules';
import type { GateInput } from './rules';

export type ChecklistInput = GateInput & {
  acceptedAt: Date | null; packedAt: Date | null; shippedAt: Date | null; trackingNumber: string | null;
};
export type Step = { key: string; label: string; hint: string; done: boolean; at: Date | null; href: string; who?: 'HQ' | 'Foundry' };

export function foundryChecklist(o: ChecklistInput): Step[] {
  const past = (s: Parameters<typeof stageIndex>[0]) => stageIndex(o.stage) >= stageIndex(s);
  const photo = (k: string) => o.photoKinds.includes(k);
  const steps: (Step | false)[] = [
    { key: 'accept', label: 'Accept the order', hint: 'Check the packing slip and customisation, then accept', done: past('ACCEPTED'), at: o.acceptedAt, href: '#status' },
    { key: 'make', label: 'Start manufacturing', hint: 'Tap “In manufacturing”', done: past('MANUFACTURING'), at: null, href: '#status' },
    o.hasCustom && { key: 'custom', label: 'Check the customisation', hint: 'Tick that the lid / engraving reads exactly right', done: o.foundryCustomChecked, at: null, href: '#make' },
    { key: 'photo-product', label: 'Photo of the finished product', hint: 'Upload under Proof photos', done: photo('PHOTO_PRODUCT'), at: null, href: '#proof' },
    o.hasCustom && { key: 'photo-custom', label: 'Close-up of the lid / engraving', hint: 'Upload under Proof photos', done: photo('PHOTO_CUSTOM'), at: null, href: '#proof' },
    { key: 'packing', label: 'Start packing', hint: 'Tap “Packing”', done: past('PACKING'), at: null, href: '#status' },
    { key: 'slip', label: 'Packing slip in the box', hint: 'Print the latest slip and tick it off', done: o.slipInBox || past('SHIPPED'), at: null, href: '#make' },
    { key: 'photo-packed', label: 'Photo of the packed box', hint: 'Show the slip in the box', done: photo('PHOTO_PACKED'), at: null, href: '#proof' },
    { key: 'packed', label: 'Mark as Packed', hint: 'Ready for the courier', done: past('PACKED'), at: o.packedAt, href: '#status' },
    { key: 'tracking', label: 'Courier collected: add tracking', hint: 'The customer gets the tracking link', done: !!o.trackingNumber || past('SHIPPED'), at: o.shippedAt, href: '#tracking' },
  ];
  return steps.filter((s): s is Step => !!s);
}

/** Done once the parcel has left the foundry. */
export const foundryComplete = (o: Pick<ChecklistInput, 'stage'>) => o.stage === 'SHIPPED' || o.stage === 'DELIVERED';

/** HQ's view: the foundry's steps plus HQ's own (send, approve proof) through to delivery. */
export function hqChecklist(o: ChecklistInput & { sentAt: Date | null; deliveredAt: Date | null }): Step[] {
  const past = (s: Parameters<typeof stageIndex>[0]) => stageIndex(o.stage) >= stageIndex(s);
  const href: Record<string, string> = { '#status': '#next', '#make': '#items', '#proof': '#proof', '#tracking': '#tracking' };
  const foundry = foundryChecklist(o).map((s): Step => ({ ...s, href: href[s.href] ?? s.href, who: 'Foundry' }));
  const at = foundry.findIndex((s) => s.key === 'tracking');
  foundry.splice(at, 0, { key: 'approve', label: 'Approve the proof photos', hint: 'Check the photos, then approve', done: !!o.proofApprovedAt, at: o.proofApprovedAt, href: '#proof', who: 'HQ' });
  return [
    { key: 'send', label: 'Check and send to foundry', hint: 'Confirm the customisation and address', done: past('SENT'), at: o.sentAt, href: '#next', who: 'HQ' },
    ...foundry,
    { key: 'delivered', label: 'Delivered to the customer', hint: 'Shopify reports it, or press Mark delivered', done: o.stage === 'DELIVERED', at: o.deliveredAt, href: '#next', who: 'HQ' },
  ];
}
