// pipeline.ts — routes one captured response into the pool. The isolated-world
// relay calls this for every MS_CAPTURE; it decides search-vs-pdp, runs the right
// adapter, and updates the store. No FB field knowledge here (that's the adapters).

import { Pool } from './store';
import { extractListings } from './adapter';
import { extractVehicleDetail } from './pdpAdapter';
import { classify } from './capture/classify';
import type { Captured } from './capture/types';

export interface PipelineResult {
  kind: 'search' | 'pdp' | 'ignore';
  added: number; // listings added/updated (search)
  enrichedId: string | null; // listing enriched (pdp), if it was in the pool
  schemaMiss: boolean; // parsed a response of this kind but the shape was wrong
}

const base = (kind: PipelineResult['kind']): PipelineResult => ({
  kind,
  added: 0,
  enrichedId: null,
  schemaMiss: false,
});

export function ingestCapture(pool: Pool, cap: Captured, searchKey: string): PipelineResult {
  const kind = classify(cap.friendlyName);

  if (kind === 'search') {
    const r = extractListings(cap.body, searchKey);
    if (r.schemaMiss) return { ...base('search'), schemaMiss: true };
    pool.setSearch(searchKey); // clears the pool if the query changed
    pool.add(r.listings);
    return { ...base('search'), added: r.listings.length };
  }

  if (kind === 'pdp') {
    const r = extractVehicleDetail(cap.body);
    if (r.schemaMiss || !r.id) return { ...base('pdp'), schemaMiss: r.schemaMiss };
    const enriched = pool.enrich(r.id, r.detail ?? {});
    return { ...base('pdp'), enrichedId: enriched ? r.id : null };
  }

  return base('ignore');
}
