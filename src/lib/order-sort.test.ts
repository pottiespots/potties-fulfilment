import { describe, it, expect } from 'vitest';
import { sortOrders, ORDER_SORTS, type OrderSortKey } from './order-sort';
import type { OrderRow } from './data';

const now = new Date('2026-10-01T08:00:00Z');
const o = (p: Partial<OrderRow>): OrderRow => ({
  id: p.name, stage: 'MANUFACTURING', placedAt: now, updatedAt: now, shipBy: new Date('2026-10-05T08:00:00Z'), customerName: 'A', city: 'Paarl', province: null,
  lines: [], fileKinds: [], invoice: null, proofApprovedAt: null, foundryCustomChecked: false, trackingNumber: null, courier: null, ...p,
} as OrderRow);

describe('order sorting', () => {
  const rows = () => [
    o({ name: '#PT1002', customerName: 'Zanele', shipBy: new Date('2026-10-03T08:00:00Z'), invoice: { paidAt: now } as never }),
    o({ name: '#PT1010', customerName: 'anna', shipBy: new Date('2026-09-30T08:00:00Z'), invoice: { paidAt: null } as never }),
    o({ name: '#PT1005', customerName: 'Johan', shipBy: new Date('2026-10-09T08:00:00Z') }),
  ];
  it('sorts order numbers as numbers, both ways', () => {
    expect(sortOrders(rows(), 'order', 'asc', now).map((r) => r.name)).toEqual(['#PT1002', '#PT1005', '#PT1010']);
    expect(sortOrders(rows(), 'order', 'desc', now).map((r) => r.name)).toEqual(['#PT1010', '#PT1005', '#PT1002']);
  });
  it('sorts names ignoring case', () => {
    expect(sortOrders(rows(), 'customer', 'asc', now).map((r) => r.customerName)).toEqual(['anna', 'Johan', 'Zanele']);
  });
  it('puts unpaid invoices first', () => {
    expect(sortOrders(rows(), 'invoice', 'asc', now).map((r) => r.name)).toEqual(['#PT1010', '#PT1005', '#PT1002']);
  });
  it('puts the latest order first by time left', () => {
    expect(sortOrders(rows(), 'late', 'asc', now)[0].name).toBe('#PT1010');
  });
  it('every sort option runs', () => {
    for (const k of Object.keys(ORDER_SORTS) as OrderSortKey[]) expect(sortOrders(rows(), k, 'desc', now)).toHaveLength(3);
  });
});
