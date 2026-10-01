import { describe, it, expect } from 'vitest';
import { mapSupplier, toCents, toDate } from './integration';

describe('COGS sheet mapping', () => {
  it('maps supplier names', () => {
    expect(mapSupplier('Foundry').supplier).toBe('FOUNDRY');
    expect(mapSupplier('LL Manufacturing').supplier).toBe('LL');
    expect(mapSupplier('Huntlea')).toEqual({ supplier: 'OTHER', label: 'Huntlea' });
  });
  it('reads rand amounts in either style', () => {
    expect(toCents(1490.5)).toBe(149050);
    expect(toCents('R 14 900,00')).toBe(1490000);
    expect(toCents('R14,900.00')).toBe(1490000);
    expect(toCents('')).toBeNull();
  });
  it('reads dates', () => {
    expect(toDate('2026-10-01')?.toISOString()).toBe('2026-10-01T10:00:00.000Z');
    expect(toDate('nonsense')).toBeNull();
  });
});
