// view.ts — turns the raw pool into what the sidebar shows: deal-scored, then
// filtered, then sorted. Deals are computed on the FULL pool first (so peer
// comparison is accurate) and only then filtered — a pure, re-runnable selector.
// The two steps are exposed separately so the panel can score once per pool
// change and re-filter cheaply on every keystroke.

import type { Listing } from './types';
import { withDeals } from './deal';
import { applyFilters, sortListings, DEFAULT_SORT } from './filters';
import type { FilterState, SortField } from './filters';

export interface View {
  listings: Listing[]; // filtered + sorted, deal-scored
  poolCount: number; // everything captured for this search
  matchCount: number; // how many pass the active filters
}

/** Filter + sort a pool that is already deal-scored (see withDeals). */
export function viewOf(scored: Listing[], filters: FilterState = {}, sort: SortField[] = DEFAULT_SORT): View {
  const matched = applyFilters(scored, filters);
  return {
    listings: sortListings(matched, sort),
    poolCount: scored.length,
    matchCount: matched.length,
  };
}

export function selectView(
  pool: Listing[],
  filters: FilterState = {},
  sort: SortField[] = DEFAULT_SORT,
): View {
  return viewOf(withDeals(pool), filters, sort);
}
