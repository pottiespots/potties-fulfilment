import { describe, it, expect } from 'vitest';
import { buildAttention } from './attention';
import type { OrderRow } from './data';

const now = new Date('2026-10-01T08:00:00Z');
const order = (p: Partial<OrderRow>): OrderRow => ({
  id: 'o1', name: '#PT1', stage: 'MANUFACTURING', shipBy: new Date('2026-09-30T08:00:00Z'), placedAt: now, customerName: 'A', city: 'Paarl',
  lines: [], fileKinds: [], invoice: null, openQuestion: null, sentAt: null, proofApprovedAt: null, foundryCustomChecked: false,
  shopifySyncError: null, shopifyFulfillmentId: null, ...p,
} as OrderRow);

describe('attention list', () => {
  it('flags late orders first and new orders to send', () => {
    const A = buildAttention({ orders: [order({ id: 'n', stage: 'NEW', shipBy: new Date('2026-10-08T08:00:00Z') }), order({})], invoices: [], pos: [], llProducts: [], now, acceptHours: 24 });
    expect(A.map((a) => a.kind)).toEqual(['late', 'send']);
  });
  it('flags orders not accepted within the window', () => {
    const A = buildAttention({ orders: [order({ stage: 'SENT', sentAt: new Date('2026-09-29T08:00:00Z'), shipBy: new Date('2026-10-08T08:00:00Z') })], invoices: [], pos: [], llProducts: [], now, acceptHours: 24 });
    expect(A[0].kind).toBe('not-accepted');
  });
  it('asks HQ to approve proof once photos are in', () => {
    const A = buildAttention({ orders: [order({ stage: 'PACKED', shipBy: new Date('2026-10-02T08:00:00Z'), fileKinds: ['PHOTO_PRODUCT', 'PHOTO_PACKED'] })], invoices: [], pos: [], llProducts: [], now, acceptHours: 24 });
    expect(A.map((a) => a.kind)).toContain('proof');
  });
});
