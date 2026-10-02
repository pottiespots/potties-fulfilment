// Pure maths behind the dashboard's sales and cash figures (tested in insights-calc.test.ts).

export type InsightRange = '7' | '30' | 'month' | 'all';
/** Ranges that use the period comparison (everything except All time). */
export type PeriodRange = Exclude<InsightRange, 'all'>;
export const RANGE_LABEL: Record<InsightRange, string> = { '7': 'Last 7 days', '30': 'Last 30 days', month: 'This month', all: 'All time' };
export const isRange = (v: string | undefined): v is InsightRange => v === '7' || v === '30' || v === 'month' || v === 'all';

type Money = { shopMoney: { amount: string; currencyCode?: string } };
export type ShopifyOrderLite = {
  id: string; name: string; createdAt: string; cancelledAt: string | null; test: boolean; sourceName: string | null;
  displayFinancialStatus: string | null;
  totalPriceSet: Money; totalRefundedSet: Money; totalOutstandingSet: Money;
  transactions: { id?: string; kind: string; status: string; processedAt: string | null; gateway: string | null; formattedGateway: string | null; amountSet: Money }[];
  lineItems: { nodes: { title: string; quantity: number; discountedTotalSet: Money }[] };
};

export type PeriodTotals = { orders: number; salesCents: number; refundsCents: number; netCents: number; aovCents: number; cashInCents: number; refundsPaidCents: number };
export type SalesSummary = {
  range: PeriodRange; from: string; to: string; prevFrom: string; prevTo: string; currency: string;
  cur: PeriodTotals; prev: PeriodTotals;
  daily: { date: string; netCents: number; orders: number }[];
  gateways: { name: string; cents: number }[];
  channels: { name: string; orders: number; cents: number }[];
  topProducts: { title: string; qty: number; cents: number }[];
  awaiting: { orders: number; cents: number };
  fetchedAt: string; truncated: boolean;
};
export type Traffic = { cur: TrafficTotals; prev: TrafficTotals };
export type TrafficTotals = { sessions: number; visitors: number; conversionRate: number };

const SA_OFFSET = 2 * 3600 * 1000; // South Africa is UTC+2 all year
const DAY = 864e5;
/** Midnight in South Africa at the start of the day `d` falls on. */
export function saMidnight(d: Date) {
  const sa = new Date(d.getTime() + SA_OFFSET);
  return new Date(Date.UTC(sa.getUTCFullYear(), sa.getUTCMonth(), sa.getUTCDate()) - SA_OFFSET);
}
export const saDay = (d: Date) => new Date(d.getTime() + SA_OFFSET).toISOString().slice(0, 10);

export type Period = { from: Date; to: Date; prevFrom: Date; prevTo: Date };
/** The chosen period, and the one just before it of the same length, for comparison. */
export function periodFor(range: PeriodRange, now: Date): Period {
  const today = saMidnight(now);
  if (range === 'month') {
    const sa = new Date(now.getTime() + SA_OFFSET);
    const from = new Date(Date.UTC(sa.getUTCFullYear(), sa.getUTCMonth(), 1) - SA_OFFSET);
    const prevFrom = new Date(Date.UTC(sa.getUTCFullYear(), sa.getUTCMonth() - 1, 1) - SA_OFFSET);
    // Same number of days into last month, so a part month is compared fairly.
    const prevTo = new Date(Math.min(prevFrom.getTime() + (now.getTime() - from.getTime()), from.getTime()));
    return { from, to: now, prevFrom, prevTo };
  }
  const days = Number(range);
  const from = new Date(today.getTime() - (days - 1) * DAY);
  return { from, to: now, prevFrom: new Date(from.getTime() - days * DAY), prevTo: from };
}

const cents = (m: Money | null | undefined) => Math.round(Number(m?.shopMoney.amount ?? 0) * 100);
const CHANNEL: Record<string, string> = { web: 'Online store', pos: 'Point of sale', shopify_draft_order: 'Draft orders', iphone: 'Shopify app', android: 'Shopify app' };
const channelName = (s: string | null) => (s ? CHANNEL[s] ?? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : 'Other');
const gatewayName = (t: ShopifyOrderLite['transactions'][number]) => {
  const g = t.formattedGateway || t.gateway || 'Other';
  return /^manual$/i.test(g) ? 'Manual / EFT' : g;
};

function emptyTotals(): PeriodTotals { return { orders: 0, salesCents: 0, refundsCents: 0, netCents: 0, aovCents: 0, cashInCents: 0, refundsPaidCents: 0 }; }

export function summariseSales(orders: ShopifyOrderLite[], p: Period, now: Date): Omit<SalesSummary, 'truncated' | 'range'> {
  const inP = (d: Date, a: Date, b: Date) => d >= a && d < b;
  const cur = emptyTotals(), prev = emptyTotals();
  const days = new Map<string, { netCents: number; orders: number }>();
  for (let t = p.from.getTime(); t <= p.to.getTime(); t += DAY) days.set(saDay(new Date(t)), { netCents: 0, orders: 0 });
  const gateways = new Map<string, number>(), channels = new Map<string, { orders: number; cents: number }>(), products = new Map<string, { qty: number; cents: number }>();
  const awaiting = { orders: 0, cents: 0 };
  let currency = 'ZAR';
  const end = new Date(p.to.getTime() + 1); // include "now"

  for (const o of orders) {
    if (o.test) continue;
    currency = o.totalPriceSet.shopMoney.currencyCode ?? currency;
    const created = new Date(o.createdAt);
    const sales = cents(o.totalPriceSet), refunds = cents(o.totalRefundedSet);
    for (const [bucket, a, b] of [[cur, p.from, end], [prev, p.prevFrom, p.prevTo]] as const) {
      if (!inP(created, a, b)) continue;
      bucket.orders++; bucket.salesCents += sales; bucket.refundsCents += refunds;
    }
    if (inP(created, p.from, end)) {
      const d = days.get(saDay(created));
      if (d) { d.netCents += sales - refunds; d.orders++; }
      const ch = channels.get(channelName(o.sourceName)) ?? { orders: 0, cents: 0 };
      ch.orders++; ch.cents += sales - refunds; channels.set(channelName(o.sourceName), ch);
      if (!o.cancelledAt) for (const l of o.lineItems.nodes) {
        const x = products.get(l.title) ?? { qty: 0, cents: 0 };
        x.qty += l.quantity; x.cents += cents(l.discountedTotalSet); products.set(l.title, x);
      }
    }
    // Cash: money that actually moved in the period, whenever the order was placed.
    for (const t of o.transactions) {
      if (t.status !== 'SUCCESS' || !t.processedAt) continue;
      const at = new Date(t.processedAt), amt = cents(t.amountSet);
      for (const [bucket, a, b] of [[cur, p.from, end], [prev, p.prevFrom, p.prevTo]] as const) {
        if (!inP(at, a, b)) continue;
        if (t.kind === 'SALE' || t.kind === 'CAPTURE') bucket.cashInCents += amt;
        if (t.kind === 'REFUND') bucket.refundsPaidCents += amt;
      }
      if ((t.kind === 'SALE' || t.kind === 'CAPTURE') && inP(at, p.from, end)) gateways.set(gatewayName(t), (gateways.get(gatewayName(t)) ?? 0) + amt);
    }
    if (!o.cancelledAt && ['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID'].includes(o.displayFinancialStatus ?? '')) {
      awaiting.orders++; awaiting.cents += cents(o.totalOutstandingSet);
    }
  }
  for (const b of [cur, prev]) { b.netCents = b.salesCents - b.refundsCents; b.aovCents = b.orders ? Math.round(b.salesCents / b.orders / 100) * 100 : 0; }
  const desc = <T extends { cents: number }>(a: T, b: T) => b.cents - a.cents;
  return {
    from: p.from.toISOString(), to: p.to.toISOString(), prevFrom: p.prevFrom.toISOString(), prevTo: p.prevTo.toISOString(), currency, cur, prev,
    daily: [...days].map(([date, v]) => ({ date, ...v })),
    gateways: [...gateways].map(([name, c]) => ({ name, cents: c })).sort(desc),
    channels: [...channels].map(([name, v]) => ({ name, ...v })).sort(desc),
    topProducts: [...products].map(([title, v]) => ({ title, ...v })).sort(desc).slice(0, 6),
    awaiting, fetchedAt: now.toISOString(),
  };
}

/** "+12%" style change against the previous period, or null when there is nothing to compare. */
export function change(cur: number, prev: number): number | null {
  if (!prev) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}

// ---------------- all-time cash flow ----------------
export type LedgerRow = { kind: string; amountCents: number; occurredAt: Date };
export type InvoiceLite = { supplier: string; supplierLabel: string | null; amountCents: number; paidAmountCents: number | null; paidAt: Date | null; issuedAt: Date };
export type MonthRow = { month: string; inCents: number; refundCents: number; outCents: number; netCents: number; balanceCents: number };
export type AllTime = {
  months: MonthRow[];
  totals: { inCents: number; refundCents: number; outCents: number; netCents: number };
  bySupplier: { name: string; cents: number }[];
  firstAt: Date | null; undatedPayments: number;
};

const saMonth = (d: Date) => saDay(d).slice(0, 7);
const supplierLabel = (i: InvoiceLite) => (i.supplier === 'FOUNDRY' ? 'Foundry' : i.supplier === 'LL' ? 'LL Manufacturing' : i.supplierLabel || 'Other suppliers');

/** Month-by-month money in (Shopify) and out (suppliers), with a running total, from the first payment to now. */
export function allTimeCashflow(ledger: LedgerRow[], invoices: InvoiceLite[], now: Date): AllTime {
  const months = new Map<string, MonthRow>();
  const row = (m: string) => {
    let r = months.get(m);
    if (!r) { r = { month: m, inCents: 0, refundCents: 0, outCents: 0, netCents: 0, balanceCents: 0 }; months.set(m, r); }
    return r;
  };
  let first: Date | null = null;
  const seen = (d: Date) => { if (!first || d < first) first = d; };
  for (const l of ledger) {
    if (l.kind === 'in') row(saMonth(l.occurredAt)).inCents += l.amountCents;
    else if (l.kind === 'refund') row(saMonth(l.occurredAt)).refundCents += l.amountCents;
    else continue;
    seen(l.occurredAt);
  }
  const suppliers = new Map<string, number>();
  let undated = 0;
  for (const i of invoices) {
    const paid = i.paidAmountCents ?? (i.paidAt ? i.amountCents : 0);
    if (paid <= 0) continue;
    // Part-paid invoices have no payment date yet; they are counted in the month the invoice was issued.
    const at = i.paidAt ?? i.issuedAt;
    if (!i.paidAt) undated++;
    row(saMonth(at)).outCents += paid;
    seen(at);
    suppliers.set(supplierLabel(i), (suppliers.get(supplierLabel(i)) ?? 0) + paid);
  }
  // Fill empty months so the table has no gaps.
  if (first) {
    const d = new Date(`${saMonth(first)}-15T12:00:00Z`), end = saMonth(now);
    while (saMonth(d) <= end) { row(saMonth(d)); d.setUTCMonth(d.getUTCMonth() + 1); }
  }
  const list = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  let bal = 0;
  const totals = { inCents: 0, refundCents: 0, outCents: 0, netCents: 0 };
  for (const r of list) {
    r.netCents = r.inCents - r.refundCents - r.outCents;
    bal += r.netCents; r.balanceCents = bal;
    totals.inCents += r.inCents; totals.refundCents += r.refundCents; totals.outCents += r.outCents;
  }
  totals.netCents = totals.inCents - totals.refundCents - totals.outCents;
  return { months: list, totals, bySupplier: [...suppliers].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents), firstAt: first, undatedPayments: undated };
}

export const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
