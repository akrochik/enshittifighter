import { describe, it, expect } from 'vitest';
import { mkListing } from './_testkit';
import { applyFilters, sortListings, DEFAULT_SORT, SORT_PRESETS } from './filters';

describe('applyFilters — additive & unknown-inclusive', () => {
  it('fuel filter keeps matches AND not-yet-known, drops known mismatches', () => {
    const diesel = mkListing({ id: 'd', detail: { fuel: 'diesel' } });
    const gas = mkListing({ id: 'g', detail: { fuel: 'gas' } });
    const unknown = mkListing({ id: 'u' }); // no detail -> fuel unknown
    const out = applyFilters([diesel, gas, unknown], { fuels: ['diesel'] });
    expect(out.map((l) => l.id).sort()).toEqual(['d', 'u']);
  });

  it('make filter narrows by effective make', () => {
    const chevy = mkListing({ id: 'c', vehicle: { confidence: 'full', make: 'chevrolet' } });
    const ford = mkListing({ id: 'f', vehicle: { confidence: 'full', make: 'ford' } });
    expect(applyFilters([chevy, ford], { makes: ['chevrolet'] }).map((l) => l.id)).toEqual(['c']);
  });

  it('model filter narrows by effective model (2500HD vs 1500)', () => {
    const hd = mkListing({ id: 'hd', vehicle: { confidence: 'full', model: 'silverado 2500hd' } });
    const half = mkListing({ id: 'half', vehicle: { confidence: 'full', model: 'silverado 1500' } });
    const unknown = mkListing({ id: 'u' });
    const out = applyFilters([hd, half, unknown], { models: ['silverado 2500hd'] });
    expect(out.map((l) => l.id).sort()).toEqual(['hd', 'u']);
  });

  it('price range keeps null-price listings (never hide)', () => {
    const a = mkListing({ id: 'a', price: 8000 });
    const b = mkListing({ id: 'b', price: 30000 });
    const nullp = mkListing({ id: 'n', price: null });
    const out = applyFilters([a, b, nullp], { priceMin: 5000, priceMax: 20000 });
    expect(out.map((l) => l.id).sort()).toEqual(['a', 'n']);
  });

  it('keyword matches the title', () => {
    const d = mkListing({ id: 'd', rawTitle: '2015 Silverado Duramax' });
    const g = mkListing({ id: 'g', rawTitle: '2015 Silverado gas' });
    expect(applyFilters([d, g], { keyword: 'duramax' }).map((l) => l.id)).toEqual(['d']);
  });

  it('hideSponsored removes sponsored (opt-in)', () => {
    const s = mkListing({ id: 's', sponsored: true });
    const o = mkListing({ id: 'o' });
    expect(applyFilters([s, o], { hideSponsored: true }).map((l) => l.id)).toEqual(['o']);
  });

  it('clean-title-only keeps unknown title status, drops known salvage', () => {
    const clean = mkListing({ id: 'c', detail: { titleStatus: 'clean' } });
    const salvage = mkListing({ id: 's', detail: { titleStatus: 'salvage' } });
    const unknown = mkListing({ id: 'u' });
    const out = applyFilters([clean, salvage, unknown], { titleCleanOnly: true });
    expect(out.map((l) => l.id).sort()).toEqual(['c', 'u']);
  });

  it('deal filter keeps unscored (null) listings', () => {
    const great = mkListing({ id: 'gr', deal: { bucket: 'great', delta: -2000, ratio: -0.2 } });
    const high = mkListing({ id: 'hi', deal: { bucket: 'high', delta: 3000, ratio: 0.3 } });
    const unscored = mkListing({ id: 'un', deal: null });
    const out = applyFilters([great, high, unscored], { deals: ['great', 'good'] });
    expect(out.map((l) => l.id).sort()).toEqual(['gr', 'un']);
  });
});

describe('multi-key sort — the wall-of-identical-prices fix', () => {
  it('breaks equal prices by year desc, then miles asc', () => {
    const older = mkListing({ id: 'older', price: 12000, vehicle: { confidence: 'full', year: 2012, mileage: 100000 } });
    const newer = mkListing({ id: 'newer', price: 12000, vehicle: { confidence: 'full', year: 2016, mileage: 120000 } });
    const newerLow = mkListing({ id: 'newer-low', price: 12000, vehicle: { confidence: 'full', year: 2016, mileage: 80000 } });
    const sorted = sortListings([older, newer, newerLow], DEFAULT_SORT).map((l) => l.id);
    expect(sorted).toEqual(['newer-low', 'newer', 'older']);
  });

  it('cheaper price comes first', () => {
    const cheap = mkListing({ id: 'cheap', price: 9000 });
    const dear = mkListing({ id: 'dear', price: 20000 });
    expect(sortListings([dear, cheap], DEFAULT_SORT).map((l) => l.id)).toEqual(['cheap', 'dear']);
  });

  it('unknown sort values sort last', () => {
    const known = mkListing({ id: 'k', price: 10000 });
    const unknown = mkListing({ id: 'u', price: null });
    expect(sortListings([unknown, known], DEFAULT_SORT).map((l) => l.id)).toEqual(['k', 'u']);
  });

  it('best deals first ranks by % under peers, not by bucket-then-price', () => {
    // a $20k truck 40% under its peers beats a $3k truck 16% under, though both are "great"
    const cheapSmall = mkListing({ id: 'small', price: 3000, deal: { bucket: 'great', delta: -570, ratio: -0.16 } });
    const dearBig = mkListing({ id: 'big', price: 20000, deal: { bucket: 'great', delta: -13000, ratio: -0.4 } });
    const unrated = mkListing({ id: 'unrated', price: 1000, deal: null });
    expect(sortListings([cheapSmall, unrated, dearBig], SORT_PRESETS.deal).map((l) => l.id)).toEqual(['big', 'small', 'unrated']);
  });

  it('every preset falls back to the default tie-break chain', () => {
    const a = mkListing({ id: 'a', price: 9000, createdAt: 5, vehicle: { confidence: 'full', year: 2015 } });
    const b = mkListing({ id: 'b', price: 8000, createdAt: 5, vehicle: { confidence: 'full', year: 2015 } });
    expect(sortListings([a, b], SORT_PRESETS.newest).map((l) => l.id)).toEqual(['b', 'a']); // same age -> cheaper first
    expect(sortListings([a, b], SORT_PRESETS.year).map((l) => l.id)).toEqual(['b', 'a']);
  });
});
