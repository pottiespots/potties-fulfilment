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
