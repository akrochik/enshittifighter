import { describe, it, expect } from 'vitest';
import { mkListing } from './_testkit';
import { dealFor, withDeals } from './deal';
import type { Listing } from './types';

const at2015 = (price: number | null, id?: string): Listing =>
  mkListing({ id, price, vehicle: { confidence: 'full', year: 2015, mileage: 150_000 } });

const peers = (): Listing[] => [15000, 15500, 14500, 16000, 15000].map((p, i) => at2015(p, `p${i}`));

describe('dealFor — pool-relative pricing', () => {
  it('clearly underpriced -> great deal, negative delta', () => {
    const t = at2015(10000, 't');
    const d = dealFor(t, [t, ...peers()]);
    expect(d.bucket).toBe('great');
    expect(d.delta).toBeLessThan(0);
  });

  it('overpriced -> high', () => {
    const t = at2015(22000, 't');
    expect(dealFor(t, [t, ...peers()]).bucket).toBe('high');
  });

  it('priced with the pack -> fair', () => {
    const t = at2015(15000, 't');
    expect(dealFor(t, [t, ...peers()]).bucket).toBe('fair');
  });

  it('too few peers -> fair with null delta (no false confidence)', () => {
    const t = at2015(10000, 't');
    const d = dealFor(t, [t, at2015(12000, 'x')]);
    expect(d.bucket).toBe('fair');
    expect(d.delta).toBeNull();
  });

  it('null price -> fair/null', () => {
    const t = mkListing({ price: null });
    expect(dealFor(t, [t, ...peers()])).toEqual({ bucket: 'fair', delta: null });
  });
});

describe('withDeals', () => {
  it('annotates every listing when the pool is dense enough', () => {
    const scored = withDeals([at2015(10000, 't'), ...peers()]);
    expect(scored.every((l) => l.deal !== null)).toBe(true);
    expect(scored.find((l) => l.id === 't')!.deal!.bucket).toBe('great');
  });
});
