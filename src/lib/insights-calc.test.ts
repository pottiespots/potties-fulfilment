import { describe, it, expect } from 'vitest';
import { periodFor, summariseSales, change, allTimeCashflow, type ShopifyOrderLite } from './insights-calc';

const m = (a: number) => ({ shopMoney: { amount: String(a), currencyCode: 'ZAR' } });
const now = new Date('2026-10-15T10:00:00Z'); // 12:00 in South Africa
const order = (p: Partial<ShopifyOrderLite> & { total?: number; at: string }): ShopifyOrderLite => ({
  id: p.at, name: '#1', createdAt: p.at, cancelledAt: null, test: false, sourceName: 'web', displayFinancialStatus: 'PAID',
  totalPriceSet: m(p.total ?? 1000), totalRefundedSet: m(0), totalOutstandingSet: m(0),
  transactions: [{ kind: 'SALE', status: 'SUCCESS', processedAt: p.at, gateway: 'payfast', formattedGateway: 'PayFast', amountSet: m(p.total ?? 1000) }],
  lineItems: { nodes: [{ title: 'No. 3 Potjie', quantity: 1, discountedTotalSet: m(p.total ?? 1000) }] }, ...p,
});

describe('dashboard sales maths', () => {
  it('uses South African days for the 7-day period', () => {
    const p = periodFor('7', now);
    expect(p.from.toISOString()).toBe('2026-10-08T22:00:00.000Z'); // 9 Oct 00:00 SAST
    expect(p.prevTo).toEqual(p.from);
  });
  it('compares this month with the same days of last month', () => {
    const p = periodFor('month', now);
    expect(p.from.toISOString()).toBe('2026-09-30T22:00:00.000Z');
    expect(p.prevFrom.toISOString()).toBe('2026-08-31T22:00:00.000Z');
    expect(p.prevTo.getTime() - p.prevFrom.getTime()).toBe(now.getTime() - p.from.getTime());
  });
  it('adds sales, refunds, cash received and the previous period', () => {
    const p = periodFor('30', now);
    const s = summariseSales([
      order({ at: '2026-10-14T08:00:00Z', total: 1500, totalRefundedSet: m(500),
        transactions: [
          { kind: 'SALE', status: 'SUCCESS', processedAt: '2026-10-14T08:00:00Z', gateway: 'payfast', formattedGateway: 'PayFast', amountSet: m(1500) },
          { kind: 'REFUND', status: 'SUCCESS', processedAt: '2026-10-14T09:00:00Z', gateway: 'payfast', formattedGateway: 'PayFast', amountSet: m(500) },
        ] }),
      order({ at: '2026-10-01T08:00:00Z', total: 1000, displayFinancialStatus: 'PENDING', totalOutstandingSet: m(1000), transactions: [] }),
      order({ at: '2026-09-01T08:00:00Z', total: 800 }), // previous period
      order({ at: '2026-10-02T08:00:00Z', total: 9999, test: true }), // test orders never count
    ], p, now);
    expect(s.cur).toMatchObject({ orders: 2, salesCents: 250000, refundsCents: 50000, netCents: 200000, cashInCents: 150000, refundsPaidCents: 50000, aovCents: 125000 });
    expect(s.prev).toMatchObject({ orders: 1, salesCents: 80000, cashInCents: 80000 });
    expect(s.awaiting).toEqual({ orders: 1, cents: 100000 });
    expect(s.gateways).toEqual([{ name: 'PayFast', cents: 150000 }]);
    expect(s.daily).toHaveLength(30);
    expect(s.daily.find((d) => d.date === '2026-10-14')).toMatchObject({ netCents: 100000, orders: 1 });
  });
  it('works out the change against last period', () => {
    expect(change(120, 100)).toBe(20);
    expect(change(5, 0)).toBeNull();
  });
});

describe('all-time cash flow', () => {
  it('adds money in and out per month with a running total', () => {
    const a = allTimeCashflow(
      [
        { kind: 'in', amountCents: 100000, occurredAt: new Date('2026-08-21T08:00:00Z') },
        { kind: 'in', amountCents: 500000, occurredAt: new Date('2026-09-14T08:00:00Z') },
        { kind: 'refund', amountCents: 40000, occurredAt: new Date('2026-09-15T08:00:00Z') },
      ],
      [
        { supplier: 'LL', supplierLabel: null, amountCents: 160000, paidAmountCents: 160000, paidAt: new Date('2026-09-21T08:00:00Z'), issuedAt: new Date('2026-09-10T08:00:00Z') },
        { supplier: 'FOUNDRY', supplierLabel: null, amountCents: 200000, paidAmountCents: 100000, paidAt: null, issuedAt: new Date('2026-10-01T08:00:00Z') }, // deposit only
        { supplier: 'FOUNDRY', supplierLabel: null, amountCents: 50000, paidAmountCents: null, paidAt: null, issuedAt: new Date('2026-10-01T08:00:00Z') }, // unpaid
      ],
      new Date('2026-10-15T08:00:00Z'));
    expect(a.months.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(a.months.map((m) => m.balanceCents)).toEqual([100000, 400000, 300000]);
    expect(a.totals).toEqual({ inCents: 600000, refundCents: 40000, outCents: 260000, netCents: 300000 });
    expect(a.bySupplier).toEqual([{ name: 'LL Manufacturing', cents: 160000 }, { name: 'Foundry', cents: 100000 }]);
    expect(a.undatedPayments).toBe(1);
  });
  it('fills empty months', () => {
    const a = allTimeCashflow([{ kind: 'in', amountCents: 1, occurredAt: new Date('2026-06-28T08:00:00Z') }], [], new Date('2026-09-02T08:00:00Z'));
    expect(a.months.map((m) => m.month)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09']);
  });
});
