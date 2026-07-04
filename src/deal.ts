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

// A coarse "comparable class" key so a 2500HD is never priced against 1500s.
// Collapses "hd" variants (parser is inconsistent about it); falls back to make
// when the model is unknown.
function dealKey(l: Listing): string | undefined {
  const m = effModel(l);
  if (m) return m.replace(/\s*hd\b/g, '').replace(/\s+/g, ' ').trim();
  return effMake(l);
}

/** Prices of pooled listings COMPARABLE to `target`: same model class, proximate year & mileage. */
function peerPrices(target: Listing, pool: Listing[]): number[] {
  const tKey = dealKey(target);
  const ty = effYear(target);
  const tm = effMileage(target);
  const prices: number[] = [];
  for (const l of pool) {
    if (l.id === target.id || l.price === null) continue;
    const lKey = dealKey(l);
    if (tKey && lKey && lKey !== tKey) continue; // don't compare across model classes
    const ly = effYear(l);
    if (ty !== undefined && ly !== undefined && Math.abs(ly - ty) > 3) continue;
    const lm = effMileage(l);
    if (tm !== undefined && lm !== undefined && Math.abs(lm - tm) > Math.max(30_000, tm * 0.3)) continue;
    prices.push(l.price);
  }
  return prices;
}

export function dealFor(target: Listing, pool: Listing[]): DealRating {
  if (target.price === null) return { bucket: 'fair', delta: null };
  const peers = peerPrices(target, pool);
  if (peers.length < MIN_PEERS) return { bucket: 'fair', delta: null };

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
