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

/** Prices of pooled listings COMPARABLE to `target`: same model class, proximate year & mileage. */
function peerPrices(target: Listing, pool: Listing[]): number[] {
  const tKey = dealKey(target);
  const ty = effYear(target);
  const tm = effMileage(target);
  const prices: number[] = [];
  for (const l of pool) {
    if (l.id === target.id || !isRealPrice(l.price)) continue;
    const lKey = dealKey(l);
    // a known class is only compared with the same known class — an unrecognized
    // listing could be anything (a G 63 next to a GLK), so it can't be its peer
    if (tKey && lKey !== tKey) continue;
    const ly = effYear(l);
    if (ty !== undefined && ly !== undefined && Math.abs(ly - ty) > 3) continue;
    const lm = effMileage(l);
    if (tm !== undefined && lm !== undefined && Math.abs(lm - tm) > Math.max(30_000, tm * 0.3)) continue;
    prices.push(l.price);
  }
  return prices;
}

/**
 * null = can't judge (no real price, or too few comparable listings). That's
 * "unknown", not "fair": the deal filter keeps unknowns visible (never-hide).
 */
export function dealFor(target: Listing, pool: Listing[]): DealRating | null {
  if (!isRealPrice(target.price)) return null;
  const peers = peerPrices(target, pool);
  if (peers.length < MIN_PEERS) return null;

  const expected = median(peers);
  const delta = Math.round(target.price - expected);
  const ratio = expected > 0 ? (target.price - expected) / expected : 0;

  let bucket: DealBucket;
  if (ratio <= -0.15) bucket = 'great';
  else if (ratio <= -0.05) bucket = 'good';
  else if (ratio < 0.1) bucket = 'fair';
  else bucket = 'high';

  return { bucket, delta };
}

/** Annotate every listing with its deal rating (recompute whenever the pool changes). */
export function withDeals(pool: Listing[]): Listing[] {
  return pool.map((l) => ({ ...l, deal: dealFor(l, pool) }));
}
