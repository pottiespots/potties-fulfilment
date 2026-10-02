import { describe, it, expect } from 'vitest';
import { foundryChecklist, foundryComplete, type ChecklistInput } from './checklist';

const base: ChecklistInput = { stage: 'ACCEPTED', hasCustom: true, foundryCustomChecked: false, slipInBox: false, photoKinds: [], proofApprovedAt: null, acceptedAt: new Date(), packedAt: null, shippedAt: null, trackingNumber: null };

describe('foundry checklist', () => {
  it('lists the customisation steps only when there is customisation', () => {
    expect(foundryChecklist(base).map((s) => s.key)).toContain('custom');
    expect(foundryChecklist({ ...base, hasCustom: false }).map((s) => s.key)).not.toContain('photo-custom');
  });
  it('ticks off what is done', () => {
    const s = foundryChecklist({ ...base, stage: 'MANUFACTURING', photoKinds: ['PHOTO_PRODUCT'] });
    expect(s.filter((x) => x.done).map((x) => x.key)).toEqual(['accept', 'make', 'photo-product']);
  });
  it('is complete once the courier has collected', () => {
    const s = foundryChecklist({ ...base, stage: 'SHIPPED', foundryCustomChecked: true, slipInBox: true, photoKinds: ['PHOTO_PRODUCT', 'PHOTO_CUSTOM', 'PHOTO_PACKED'], trackingNumber: 'TCG1' });
    expect(s.every((x) => x.done)).toBe(true);
    expect(foundryComplete({ stage: 'SHIPPED' })).toBe(true);
    expect(foundryComplete({ stage: 'PACKED' })).toBe(false);
  });
});
