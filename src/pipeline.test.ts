import { describe, it, expect } from 'vitest';
import { Pool } from './store';
import { ingestCapture } from './pipeline';
import { selectView } from './view';
import { dealFor } from './deal';
import { mkListing } from './_testkit';
import { describeWithFixtures, itWithFixtures, readFixture } from './_fixtures';
import type { Captured } from './capture/types';

// Real captures are gitignored: absent on a fresh clone, where the tests that read them are skipped.
// See _fixtures.ts.
const CONTAINER = 'search-content-container.json';
const cap = (friendlyName: string, body: string): Captured => ({ transport: 'xhr', url: '', friendlyName, status: 200, body });

describe('ingestCapture — search responses', () => {
  itWithFixtures([CONTAINER], 'routes a search response into the pool', () => {
    const pool = new Pool();
    const r = ingestCapture(pool, cap('CometMarketplaceSearchContentContainerQuery', readFixture(CONTAINER)), 'silverado 2500');
    expect(r).toMatchObject({ kind: 'search', added: 15, schemaMiss: false });
    expect(pool.size).toBe(15);
    expect(pool.searchKey).toBe('silverado 2500');
  });

  itWithFixtures([CONTAINER, 'search-content-pagination-chunked.json'], 'a new search query clears the pool', () => {
    const pool = new Pool();
    ingestCapture(pool, cap('CometMarketplaceSearchContentContainerQuery', readFixture(CONTAINER)), 'silverado 2500');
    ingestCapture(pool, cap('CometMarketplaceSearchContentPaginationQuery', readFixture('search-content-pagination-chunked.json')), 'f250 diesel');
    expect(pool.searchKey).toBe('f250 diesel');
    expect(pool.size).toBe(24); // fresh pool from the new-query response only
  });

  itWithFixtures(['search-root.json'], 'reports a schema miss without adding anything', () => {
    const pool = new Pool();
    const r = ingestCapture(pool, cap('CometMarketplaceSearchContentContainerQuery', readFixture('search-root.json')), 'x');
    expect(r.schemaMiss).toBe(true);
    expect(pool.size).toBe(0);
  });
});

describeWithFixtures(['pdp-vehicle-1.json'], 'ingestCapture — detail (PDP) responses', () => {
  it('enriches a pooled listing whose detail page loads', () => {
    const pool = new Pool();
    pool.setSearch('ford f150');
    pool.add([mkListing({ id: '1277856354164190' })]);
    const r = ingestCapture(pool, cap('MarketplacePDPContainerQuery', readFixture('pdp-vehicle-1.json')), 'ford f150');
    expect(r.enrichedId).toBe('1277856354164190');
    expect(pool.get('1277856354164190')!.detail).toMatchObject({ fuel: 'gas', transmission: 'automatic', mileage: 170000 });
    expect(pool.get('1277856354164190')!.enrichment).toBe('enriched');
  });

  it('a detail page for a listing not in the pool is a no-op', () => {
    const pool = new Pool();
    pool.setSearch('ford f150');
    const r = ingestCapture(pool, cap('MarketplacePDPContainerQuery', readFixture('pdp-vehicle-1.json')), 'ford f150');
    expect(r.enrichedId).toBeNull();
  });
});

describe('ingestCapture — decoy queries are ignored', () => {
  it('ignores non-marketplace queries', () => {
    const pool = new Pool();
    const r = ingestCapture(pool, cap('MAWSecureThreadQPContainerQuery', '{}'), 'x');
    expect(r.kind).toBe('ignore');
    expect(pool.size).toBe(0);
  });
});

describeWithFixtures([CONTAINER], 'selectView — end to end from the pool', () => {
  it('deal-scores, filters, and sorts the captured pool', () => {
    const pool = new Pool();
    ingestCapture(pool, cap('CometMarketplaceSearchContentContainerQuery', readFixture(CONTAINER)), 'silverado 2500');
    const all = selectView(pool.all());
    expect(all.poolCount).toBe(15);
    expect(all.matchCount).toBe(15);
    // Each listing is rated against its own model class (2500HDs vs 2500HDs, never vs 1500s);
    // one with too few comparable listings is unrated (null = unknown), not "fair".
    const raw = pool.all();
    for (const l of all.listings) expect(l.deal).toEqual(dealFor(raw.find((r) => r.id === l.id)!, raw));
    expect(all.listings.some((l) => l.deal !== null)).toBe(true);

    // a price ceiling narrows the match count but the pool stays whole
    const filtered = selectView(pool.all(), { priceMax: 12000 });
    expect(filtered.poolCount).toBe(15);
    expect(filtered.matchCount).toBeLessThan(15);
    expect(filtered.listings[0]!.price).toBeLessThanOrEqual(12000);
  });
});
