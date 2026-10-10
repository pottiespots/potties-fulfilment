import type { FileKind } from './db/schema';

export const KIND_LABEL: Record<FileKind, string> = {
  PHOTO_PRODUCT: 'Finished product', PHOTO_CUSTOM: 'Close-up of lid / engraving', PHOTO_PACKED: 'Packed box with slip',
  PHOTO_WAYBILL: 'Waybill on box', WAYBILL: 'Courier waybill', ARTWORK: 'Lid / engraving artwork', OTHER: 'Other file',
  INVOICE: 'Invoice', POP: 'Proof of payment', PACKING_SLIP: 'Packing slip (Shopify)',
};

/** Display name for a supplier, e.g. Foundry, LL, Huntlea. */
export const supplierName = (supplier: string, label?: string | null) =>
  supplier === 'FOUNDRY' ? 'Foundry' : supplier === 'LL' ? 'LL' : label || 'Other';

export const PHOTO_SLOTS: FileKind[] = ['PHOTO_PRODUCT', 'PHOTO_CUSTOM', 'PHOTO_PACKED', 'PHOTO_WAYBILL'];
export const COURIERS = ['The Courier Guy', 'Aramex', 'Pargo', 'PostNet', 'Fastway', 'DSV', 'Other'];
export const NOTE_PRESETS = ['Mould ready', 'Poured today', 'Cooling / fettling', 'Seasoned', 'Waiting on materials', 'Problem / delay: ', 'Courier booked'];

/** Courier's own tracking page for a waybill, when we know it. The number is also copied when the link is clicked. */
export function trackingUrl(company: string | null | undefined, number: string): string | null {
  if (/courier ?guy|tcg/i.test(company ?? '') || /^TCG/i.test(number)) return `https://thecourierguy.co.za/tracking/?waybill=${encodeURIComponent(number)}`;
  return null;
}

/** Phone number in international form for WhatsApp / SMS links (South African 0xx numbers become 27xx). */
export function intlPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) return d.slice(1);
  if (d.startsWith('00')) return d.slice(2);
  if (d.startsWith('0') && d.length === 10) return `27${d.slice(1)}`;
  return d.length >= 9 ? d : null;
}
export function trackingMessage(o: { name: string; customerName: string; trackingCompany: string | null; trackingNumber: string | null }) {
  const url = o.trackingNumber ? trackingUrl(o.trackingCompany, o.trackingNumber) : null;
  return `Hi ${o.customerName.split(' ')[0]}, your Potties order ${o.name} is on its way with ${o.trackingCompany ?? 'the courier'}. Tracking number: ${o.trackingNumber}.${url ? ` Track it here: https://thecourierguy.co.za/tracking/` : ''}`;
}
