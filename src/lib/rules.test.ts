import { describe, it, expect } from 'vitest';
import {
  packedBlockers, canSetFoundryStage, canAddTracking, defaultShipBy, urgency, duration,
  detectCustomisation, courierFromShippingTitle, visibleToFoundry, money, type GateInput,
} from './rules';

const base: GateInput = {
  stage: 'PACKING', hasCustom: true, foundryCustomChecked: false, slipInBox: false, photoKinds: [], proofApprovedAt: null,
};

describe('packed gate', () => {
  it('lists every missing step', () => {
    expect(packedBlockers(base)).toHaveLength(3);
  });
  it('skips the custom check when there is no customisation', () => {
    expect(packedBlockers({ ...base, hasCustom: false, slipInBox: true, photoKinds: ['PHOTO_PACKED'] })).toEqual([]);
  });
  it('blocks the foundry from marking packed until done', () => {
    expect(canSetFoundryStage(base, 'PACKED').ok).toBe(false);
    const ready = { ...base, foundryCustomChecked: true, slipInBox: true, photoKinds: ['PHOTO_PACKED'] };
    expect(canSetFoundryStage(ready, 'PACKED').ok).toBe(true);
  });
  it('does not let the foundry move orders it has not accepted or already shipped', () => {
    expect(canSetFoundryStage({ ...base, stage: 'SENT' }, 'MANUFACTURING').ok).toBe(false);
    expect(canSetFoundryStage({ ...base, stage: 'SHIPPED' }, 'PACKING').ok).toBe(false);
    expect(canSetFoundryStage(base, 'SHIPPED').ok).toBe(false);
  });
});

describe('tracking gate', () => {
  it('needs the order to be packed', () => {
    expect(canAddTracking(base, false).ok).toBe(false);
    expect(canAddTracking({ ...base, stage: 'PACKED' }, false).ok).toBe(true);
  });
  it('optionally needs HQ approval', () => {
    expect(canAddTracking({ ...base, stage: 'PACKED' }, true).ok).toBe(false);
    expect(canAddTracking({ ...base, stage: 'PACKED', proofApprovedAt: new Date() }, true).ok).toBe(true);
  });
});

describe('deadlines', () => {
  it('moves a Saturday ship-by to Monday 10:00 SAST', () => {
    const d = defaultShipBy(new Date('2026-09-26T09:00:00Z'), 7); // Sat 3 Oct -> Mon 5 Oct
    expect(d.toISOString()).toBe('2026-10-05T08:00:00.000Z');
  });
  it('classifies urgency', () => {
    const now = new Date('2026-10-01T08:00:00Z');
    expect(urgency('MANUFACTURING', new Date('2026-09-30T08:00:00Z'), now)).toBe('late');
    expect(urgency('MANUFACTURING', new Date('2026-10-02T08:00:00Z'), now)).toBe('soon');
    expect(urgency('MANUFACTURING', new Date('2026-10-09T08:00:00Z'), now)).toBe('ok');
    expect(urgency('SHIPPED', new Date('2026-09-30T08:00:00Z'), now)).toBe('done');
  });
  it('formats durations', () => {
    expect(duration(30 * 60e3)).toBe('30 min');
    expect(duration(-5 * 36e5)).toBe('5 h');
    expect(duration(3 * 864e5)).toBe('3 d');
  });
});

describe('shopify mapping', () => {
  it('finds customisation text in line item properties', () => {
    expect(detectCustomisation([{ key: '_hidden', value: 'x' }, { key: 'Lid casting text', value: ' SMITH ' }]))
      .toEqual({ type: 'Cast lid', text: 'SMITH' });
    expect(detectCustomisation([{ key: 'Engraving', value: 'Nkosi Family' }])?.type).toBe('Engraving');
    expect(detectCustomisation([{ key: 'Gift wrap', value: 'Yes' }])).toBeNull();
  });
  it('splits courier and service', () => {
    expect(courierFromShippingTitle('The Courier Guy - Economy road')).toEqual({ courier: 'The Courier Guy', service: 'Economy road' });
    expect(courierFromShippingTitle('Aramex')).toEqual({ courier: 'Aramex', service: null });
  });
});

describe('access', () => {
  it('hides unsent orders from the foundry', () => {
    expect(visibleToFoundry('NEW')).toBe(false);
    expect(visibleToFoundry('CANCELLED')).toBe(false);
    expect(visibleToFoundry('SENT')).toBe(true);
  });
  it('formats rand', () => {
    expect(money(1490000)).toMatch(/^R 14\s900$/);
    expect(money(12345)).toMatch(/^R 123[.,]45$/);
  });
});
