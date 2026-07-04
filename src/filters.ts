// filters.ts — the filter predicates + the multi-key sort. Two rules drive this:
//   1. Additive & unknown-inclusive: an attribute filter narrows to matches PLUS
//      listings whose value is still unknown (not yet enriched / unparseable).
//      It never hides something just because we don't know its value yet.
//   2. Explicit hide-toggles (sponsored, sold) DO remove — the user opted in.

import type { Listing, FuelType, Transmission, Drivetrain, DealBucket } from './types';
import {
  effYear, effMileage, effMake, effTrim, effBodyStyle, effDrivetrain,
  effFuel, effTransmission, effSeller, effTitleStatus, effColor,
} from './effective';

export interface FilterState {
  makes?: string[];
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  milesMin?: number;
  milesMax?: number;
  fuels?: FuelType[];
  transmissions?: Transmission[];
  cabStyles?: string[];
  trims?: string[];
  colors?: string[];
  drivetrains?: Drivetrain[];
  deals?: DealBucket[];
  titleCleanOnly?: boolean;
  privateOnly?: boolean;
  listedWithinDays?: number;
  keyword?: string;
  hideSponsored?: boolean;
  hideSoldPending?: boolean;
}

// membership that passes on: no filter, or unknown value (never-hide), or a hit.
const inSet = <T>(set: T[] | undefined, val: T | undefined): boolean =>
  !set || set.length === 0 || val === undefined || set.includes(val);

// range that passes unknown values through (never-hide).
const inRange = (val: number | null | undefined, min?: number, max?: number): boolean => {
  if (val === null || val === undefined) return true;
  if (min !== undefined && val < min) return false;
  if (max !== undefined && val > max) return false;
  return true;
};

export function applyFilters(listings: Listing[], f: FilterState, now: number = Date.now()): Listing[] {
  const kw = f.keyword?.trim().toLowerCase();
  return listings.filter((l) => {
    // explicit opt-in removals
    if (f.hideSponsored && l.sponsored) return false;
    if (f.hideSoldPending && (l.sold || l.pending)) return false;

    // additive, unknown-inclusive attribute filters
    if (!inSet(f.makes, effMake(l))) return false;
    if (!inRange(effYear(l), f.yearMin, f.yearMax)) return false;
    if (!inRange(l.price, f.priceMin, f.priceMax)) return false;
    if (!inRange(effMileage(l), f.milesMin, f.milesMax)) return false;
    if (!inSet(f.fuels, effFuel(l))) return false;
    if (!inSet(f.transmissions, effTransmission(l))) return false;
    if (!inSet(f.cabStyles, effBodyStyle(l))) return false;
    if (!inSet(f.trims, effTrim(l))) return false;
    if (!inSet(f.colors, effColor(l))) return false;
    if (!inSet(f.drivetrains, effDrivetrain(l))) return false;
    if (!inSet(f.deals, l.deal?.bucket)) return false;

    // clean-title / private-seller: unknown passes, known-mismatch fails
    if (f.titleCleanOnly) {
      const ts = effTitleStatus(l);
      if (ts !== undefined && ts !== 'clean') return false;
    }
    if (f.privateOnly) {
      const s = effSeller(l);
      if (s !== undefined && s !== 'private') return false;
    }

    if (f.listedWithinDays !== undefined && l.createdAt !== null) {
      if (l.createdAt < now - f.listedWithinDays * 86_400_000) return false;
    }

    if (kw) {
      const hay = `${l.rawTitle} ${l.sellerTitle ?? ''}`.toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });
}

// --- multi-key sort (the fix for FB's wall of identically-priced listings) ---

export type SortKey = 'price' | 'year' | 'miles' | 'newest' | 'deal';
export interface SortField {
  key: SortKey;
  dir: 'asc' | 'desc';
}

export const DEFAULT_SORT: SortField[] = [
  { key: 'price', dir: 'asc' },
  { key: 'year', dir: 'desc' },
  { key: 'miles', dir: 'asc' },
  { key: 'newest', dir: 'desc' },
];

const DEAL_RANK: Record<DealBucket, number> = { great: 0, good: 1, fair: 2, high: 3 };

function keyValue(l: Listing, key: SortKey): number | undefined {
  switch (key) {
    case 'price':
      return l.price ?? undefined;
    case 'year':
      return effYear(l);
    case 'miles':
      return effMileage(l);
    case 'newest':
      return l.createdAt ?? undefined;
    case 'deal':
      return l.deal ? DEAL_RANK[l.deal.bucket] : undefined;
  }
}

export function comparator(fields: SortField[]): (a: Listing, b: Listing) => number {
  return (a, b) => {
    for (const { key, dir } of fields) {
      const av = keyValue(a, key);
      const bv = keyValue(b, key);
      if (av === bv) continue;
      if (av === undefined) return 1; // unknowns always sort last, regardless of dir
      if (bv === undefined) return -1;
      const cmp = av < bv ? -1 : 1;
      return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  };
}

export function sortListings(listings: Listing[], fields: SortField[] = DEFAULT_SORT): Listing[] {
  return [...listings].sort(comparator(fields));
}
