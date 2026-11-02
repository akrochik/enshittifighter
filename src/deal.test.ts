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
    const d = dealFor(t, [t, ...peers()])!;
    expect(d.bucket).toBe('great');
    expect(d.delta).toBeLessThan(0);
  });

  it('overpriced -> high', () => {
    const t = at2015(22000, 't');
    expect(dealFor(t, [t, ...peers()])!.bucket).toBe('high');
  });

  it('priced with the pack -> fair', () => {
    const t = at2015(15000, 't');
    expect(dealFor(t, [t, ...peers()])!.bucket).toBe('fair');
  });

  it('too few peers -> null (unknown, not "fair": no false confidence)', () => {
    const t = at2015(10000, 't');
    expect(dealFor(t, [t, at2015(12000, 'x')])).toBeNull();
  });

  it('null price -> null', () => {
    const t = mkListing({ price: null });
    expect(dealFor(t, [t, ...peers()])).toBeNull();
  });

  it('placeholder prices are never scored and never used as peers', () => {
    const one = at2015(1, 'one');
    const silly = at2015(1_111_111, 'silly');
    expect(dealFor(one, [one, ...peers()])).toBeNull();
    expect(dealFor(silly, [silly, ...peers()])).toBeNull();
    // the placeholder doesn't drag the peer median: 15000 is still fair
    const t = at2015(15000, 't');
    const pool = [t, ...peers(), at2015(1, 'a'), at2015(1, 'b'), at2015(1, 'c'), at2015(1, 'd')];
    expect(dealFor(t, pool)!.bucket).toBe('fair');
  });

  it('a known model is not priced against unrecognized listings', () => {
    const glk = (p: number, id: string): Listing =>
      mkListing({ id, price: p, vehicle: { confidence: 'full', year: 2014, make: 'mercedes-benz', model: 'glk' } });
    const unknown = (p: number, id: string): Listing => mkListing({ id, price: p, vehicle: { confidence: 'none', year: 2014 } });
    const t = glk(12000, 't');
    const pool = [t, glk(12500, 'g1'), unknown(65000, 'u1'), unknown(70000, 'u2'), unknown(60000, 'u3'), unknown(68000, 'u4')];
    expect(dealFor(t, pool)).toBeNull(); // only one real peer -> can't judge, instead of a bogus "great"
  });

  it('does not price a 2500HD against a pool of 1500s (segments by model class)', () => {
    const hd = mkListing({ id: 't', price: 20000, vehicle: { confidence: 'full', year: 2015, mileage: 150_000, make: 'chevrolet', model: 'silverado 2500hd' } });
    const halfTons = [26000, 25000, 27000, 24000, 25500].map((p, i) =>
      mkListing({ id: `h${i}`, price: p, vehicle: { confidence: 'full', year: 2015, mileage: 150_000, make: 'chevrolet', model: 'silverado 1500' } }),
    );
    // Cheap 2500HD amid pricier 1500s used to read "great"; with segmentation it has no
    // comparable peers, so it's honestly unscored instead.
    expect(dealFor(hd, [hd, ...halfTons])).toBeNull();
  });
});

describe('withDeals', () => {
  it('annotates every listing when the pool is dense enough', () => {
    const scored = withDeals([at2015(10000, 't'), ...peers()]);
    expect(scored.every((l) => l.deal !== null)).toBe(true);
    expect(scored.find((l) => l.id === 't')!.deal!.bucket).toBe('great');
  });

  it('rates each listing exactly as dealFor would (the grouped pass is only faster)', () => {
    // a deterministic mixed pool: three model classes, some with no model, some
    // with no price/year/mileage, so every branch of peer matching is exercised
    const models = ['silverado 2500hd', 'silverado 1500', 'f-150', undefined];
    const pool: Listing[] = [];
    for (let i = 0; i < 60; i++) {
      const model = models[i % 4];
      pool.push(
        mkListing({
          id: `m${i}`,
          price: i % 11 === 0 ? null : 8000 + ((i * 7919) % 25000),
          vehicle: {
            confidence: model ? 'full' : 'none',
            make: model === 'f-150' ? 'ford' : model ? 'chevrolet' : undefined,
            model,
            year: i % 9 === 0 ? undefined : 2008 + (i % 12),
            mileage: i % 7 === 0 ? undefined : 40_000 + ((i * 104729) % 200_000),
          },
        }),
      );
    }
    const scored = withDeals(pool);
    pool.forEach((l, i) => expect(scored[i]!.deal).toEqual(dealFor(l, pool)));
    expect(scored.filter((l) => l.deal !== null).length).toBeGreaterThan(10); // the test isn't vacuous
  });

  it('ratio is the delta as a fraction of the peer median', () => {
    const t = at2015(12000, 't');
    const d = dealFor(t, [t, ...peers()])!; // peer median 15000
    expect(d.delta).toBe(-3000);
    expect(d.ratio).toBeCloseTo(-0.2);
  });
});
