// detailCache.ts — detail-page results remembered across page loads, so a
// refresh or a second Marketplace tab doesn't fetch the same listing's page again
// (the "at most once per listing" rule, beyond one page's lifetime). Pure: the
// relay stores the object in chrome.storage.local. Only successes are kept — a
// failure may be transient (timeout, rate limit) and gets one retry per page load.

import type { VehicleDetail } from '../types';

export interface CachedDetail {
  detail: VehicleDetail;
  at: number; // ms epoch it was fetched
}
export type DetailCache = Record<string, CachedDetail>;

/** Sellers do edit listings (mileage, title status), so a cached detail goes stale. */
export const DETAIL_TTL_MS = 14 * 86_400_000;
/** ~250 bytes each: a few hundred KB of the 10 MB chrome.storage.local quota. */
export const DETAIL_CACHE_MAX = 3000;

const isEntry = (v: unknown): v is CachedDetail =>
  !!v && typeof v === 'object' && typeof (v as CachedDetail).at === 'number' && !!(v as CachedDetail).detail && typeof (v as CachedDetail).detail === 'object';

/** Drop expired and malformed entries; keep the newest DETAIL_CACHE_MAX. */
export function pruneCache(raw: unknown, now: number): DetailCache {
  if (!raw || typeof raw !== 'object') return {};
  const live = Object.entries(raw as Record<string, unknown>).filter(
    (e): e is [string, CachedDetail] => isEntry(e[1]) && now - e[1].at < DETAIL_TTL_MS && e[1].at <= now,
  );
  live.sort((a, b) => b[1].at - a[1].at);
  return Object.fromEntries(live.slice(0, DETAIL_CACHE_MAX));
}

/** Fold freshly fetched details into what's stored (another tab may have written since we read). */
export function mergeCache(stored: unknown, fresh: Iterable<[string, VehicleDetail]>, now: number): DetailCache {
  const out: DetailCache = { ...pruneCache(stored, now) };
  for (const [id, detail] of fresh) out[id] = { detail, at: now };
  return pruneCache(out, now);
}
