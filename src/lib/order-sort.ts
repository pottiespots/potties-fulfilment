// Sort options for the HQ orders table. Pure so it can be tested.
import type { OrderRow } from './data';
import { stageIndex } from './rules';

export type SortDir = 'asc' | 'desc';
type Sort = { label: string; asc: string; desc: string; dir: SortDir; key: (o: OrderRow, now: Date) => number | string };

const hasCustom = (o: OrderRow) => o.lines.some((l) => l.customText);
const orderNo = (o: OrderRow) => Number(o.name.replace(/\D/g, '')) || 0;
const customRank = (o: OrderRow) => (!hasCustom(o) ? 3 : o.proofApprovedAt ? 2 : o.foundryCustomChecked ? 1 : 0);
const proofRank = (o: OrderRow) => {
  if (o.proofApprovedAt) return 3;
  const need = ['PHOTO_PRODUCT', 'PHOTO_PACKED', ...(hasCustom(o) ? ['PHOTO_CUSTOM'] : [])];
  const n = need.filter((k) => o.fileKinds.includes(k)).length;
  return n === need.length ? 0 : 1 + (1 - n / need.length); // ready to review first, then by how many photos are in
};
const invoiceRank = (o: OrderRow) => (!o.invoice ? 1 : o.invoice.paidAt ? 2 : 0);

/** Every way the orders table can be sorted. `dir` is the direction used on the first click. */
export const ORDER_SORTS = {
  shipBy:   { label: 'Ship-by date',      asc: 'soonest first',            desc: 'latest first',           dir: 'asc',  key: (o) => o.shipBy.getTime() },
  placed:   { label: 'Date placed',       asc: 'oldest first',             desc: 'newest first',           dir: 'desc', key: (o) => o.placedAt.getTime() },
  order:    { label: 'Order number',      asc: 'low to high',              desc: 'high to low',            dir: 'desc', key: orderNo },
  customer: { label: 'Customer name',     asc: 'A to Z',                   desc: 'Z to A',                 dir: 'asc',  key: (o) => o.customerName.toLowerCase() },
  town:     { label: 'Town',              asc: 'A to Z',                   desc: 'Z to A',                 dir: 'asc',  key: (o) => `${o.city ?? '~'} ${o.province ?? ''}`.toLowerCase() },
  province: { label: 'Province',          asc: 'A to Z',                   desc: 'Z to A',                 dir: 'asc',  key: (o) => `${o.province ?? '~'} ${o.city ?? ''}`.toLowerCase() },
  stage:    { label: 'Stage',             asc: 'new first',                desc: 'furthest along first',   dir: 'asc',  key: (o) => stageIndex(o.stage) },
  late:     { label: 'Time left',         asc: 'most late first',          desc: 'most time left first',   dir: 'asc',  key: (o, now) => (['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(o.stage) ? Number.MAX_SAFE_INTEGER : o.shipBy.getTime() - now.getTime()) },
  custom:   { label: 'Customisation',     asc: 'unchecked first',          desc: 'none first',             dir: 'asc',  key: customRank },
  proof:    { label: 'Proof photos',      asc: 'ready to approve first',   desc: 'approved first',         dir: 'asc',  key: proofRank },
  tracking: { label: 'Tracking',          asc: 'no tracking first',        desc: 'with tracking first',    dir: 'asc',  key: (o) => (o.trackingNumber ? 1 : 0) },
  invoice:  { label: 'Invoice',           asc: 'unpaid first',             desc: 'paid first',             dir: 'asc',  key: invoiceRank },
  courier:  { label: 'Courier',           asc: 'A to Z',                   desc: 'Z to A',                 dir: 'asc',  key: (o) => (o.courier ?? '~').toLowerCase() },
  items:    { label: 'Number of items',   asc: 'fewest first',             desc: 'most first',             dir: 'desc', key: (o) => o.lines.reduce((t, l) => t + l.quantity, 0) },
  updated:  { label: 'Last updated',      asc: 'oldest first',             desc: 'most recent first',      dir: 'desc', key: (o) => o.updatedAt.getTime() },
} satisfies Record<string, Sort>;

export type OrderSortKey = keyof typeof ORDER_SORTS;
export const isSortKey = (k: string | undefined): k is OrderSortKey => !!k && k in ORDER_SORTS;

/** Sorts in place. Ties are broken by ship-by date so the order is always stable. */
export function sortOrders(rows: OrderRow[], sort: OrderSortKey, dir: SortDir, now: Date) {
  const key = ORDER_SORTS[sort].key as Sort['key'];
  const sign = dir === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    const x = key(a, now), y = key(b, now);
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
    return c * sign || a.shipBy.getTime() - b.shipBy.getTime();
  });
}
