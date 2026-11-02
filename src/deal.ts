// deal.ts — a pool-relative "deal score". NOT a market-wide value (we have no
// market data); it asks "cheap for THIS search?" by comparing a listing's price
// to similar-year/mileage peers already in the pool. Pure and deterministic.

import type { Listing, DealRating, DealBucket } from './types';
import { effYear, effMileage, effModel, effMake } from './effective';

const MIN_PEERS = 4; // below this, we don't have enough to judge -> neutral

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// Placeholder asks ("$1", "$123", "$1,111,111") aren't prices: never scored, never a peer.
const isRealPrice = (p: number | null): p is number => p !== null && p >= 100 && p < 1_000_000;

// A coarse "comparable class" key so a 2500HD is never priced against 1500s.
// Collapses "hd" variants (parser is inconsistent about it); falls back to make
// when the model is unknown.
function dealKey(l: Listing): string | undefined {
  const make = effMake(l);
  const m = effModel(l);
  if (m) {
    const model = m.replace(/\s*hd\b/g, '').replace(/\s+/g, ' ').trim();
    return make ? `${make}|${model}` : model;
  }
  return make;
}

// What peer matching reads from a listing, computed once per listing per pass
// (the pairwise loop below would otherwise re-derive it n² times).
interface Facts {
  id: string;
  key: string | undefined;
  year: number | undefined;
  miles: number | undefined;
  price: number | null;
}
const factsOf = (l: Listing): Facts => ({ id: l.id, key: dealKey(l), year: effYear(l), miles: effMileage(l), price: l.price });

/** Prices of COMPARABLE candidates: same model class, proximate year & mileage. */
function peerPrices(t: Facts, candidates: Facts[]): number[] {
  const prices: number[] = [];
  for (const c of candidates) {
    if (c.id === t.id || !isRealPrice(c.price)) continue;
    // a known class is only compared with the same known class — an unrecognized
    // listing could be anything (a G 63 next to a GLK), so it can't be its peer
    if (t.key && c.key !== t.key) continue;
    if (t.year !== undefined && c.year !== undefined && Math.abs(c.year - t.year) > 3) continue;
    if (t.miles !== undefined && c.miles !== undefined && Math.abs(c.miles - t.miles) > Math.max(30_000, t.miles * 0.3)) continue;
    prices.push(c.price);
  }
  return prices;
}

function rate(t: Facts, candidates: Facts[]): DealRating | null {
  if (!isRealPrice(t.price)) return null;
  const peers = peerPrices(t, candidates);
  if (peers.length < MIN_PEERS) return null;

  const expected = median(peers);
  const delta = Math.round(t.price - expected);
  const ratio = expected > 0 ? (t.price - expected) / expected : 0;

  let bucket: DealBucket;
  if (ratio <= -0.15) bucket = 'great';
  else if (ratio <= -0.05) bucket = 'good';
  else if (ratio < 0.1) bucket = 'fair';
  else bucket = 'high';

  return { bucket, delta, ratio };
}

/**
 * null = can't judge (no real price, or too few comparable listings). That's
 * "unknown", not "fair": the deal filter keeps unknowns visible (never-hide).
 */
export function dealFor(target: Listing, pool: Listing[]): DealRating | null {
  return rate(factsOf(target), pool.map(factsOf));
}

/** Annotate every listing with its deal rating (recompute whenever the pool changes). */
export function withDeals(pool: Listing[]): Listing[] {
  const facts = pool.map(factsOf);
  // A listing with a known class can only match its own class, so it only needs
  // to scan that group; one with no class is compared against everything.
  const byKey = new Map<string, Facts[]>();
  for (const f of facts) {
    if (!f.key) continue;
    const g = byKey.get(f.key);
    if (g) g.push(f);
    else byKey.set(f.key, [f]);
  }
  return pool.map((l, i) => {
    const f = facts[i]!;
    return { ...l, deal: rate(f, f.key ? byKey.get(f.key)! : facts) };
  });
}
