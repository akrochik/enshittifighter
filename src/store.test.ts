import { describe, it, expect } from 'vitest';
import { Pool } from './store';
import { extractListings } from './adapter';
import { describeWithFixtures, itWithFixtures, readFixture } from './_fixtures';

// Real capture, gitignored: absent on a fresh clone, where the tests that read it are skipped.
// See _fixtures.ts.
const CONTAINER = 'search-content-container.json';
const listings = (): ReturnType<typeof extractListings>['listings'] =>
  extractListings(readFixture(CONTAINER), 'silverado 2500').listings;

describeWithFixtures([CONTAINER], 'Pool — accumulate + dedup', () => {
  it('accumulates listings and dedups by id', () => {
    const p = new Pool();
    p.setSearch('silverado 2500');
    p.add(listings());
    expect(p.size).toBe(15);
    p.add(listings()); // re-scroll re-sees the same ids
    expect(p.size).toBe(15);
  });
});

describeWithFixtures([CONTAINER], 'Pool — clear on new search (pool scoping)', () => {
  it('clears when the search query changes', () => {
    const p = new Pool();
    p.setSearch('silverado 2500');
    p.add(listings());
    expect(p.size).toBe(15);
    p.setSearch('f250 diesel');
    expect(p.size).toBe(0);
    expect(p.searchKey).toBe('f250 diesel');
  });

  it('setting the same search does not clear', () => {
    const p = new Pool();
    p.setSearch('silverado 2500');
    p.add(listings());
    p.setSearch('silverado 2500');
    expect(p.size).toBe(15);
  });
});

describe('Pool — enrichment merge', () => {
  itWithFixtures([CONTAINER], 'merges detail, marks enriched, and survives a re-add', () => {
    const p = new Pool();
    p.setSearch('silverado 2500');
    p.add(listings());
    const id = p.all()[0]!.id;

    expect(p.enrich(id, { fuel: 'diesel', transmission: 'automatic' })).toBe(true);
    expect(p.get(id)!.detail).toMatchObject({ fuel: 'diesel', transmission: 'automatic' });
    expect(p.get(id)!.enrichment).toBe('enriched');

    // re-seeing the listing from the feed must not wipe the enrichment
    p.add(listings());
    expect(p.get(id)!.detail).toMatchObject({ fuel: 'diesel' });
    expect(p.get(id)!.enrichment).toBe('enriched');
  });

  it('enriching an id not in the pool returns false', () => {
    const p = new Pool();
    p.setSearch('x');
    expect(p.enrich('999', { fuel: 'gas' })).toBe(false);
  });

  itWithFixtures([CONTAINER], 'pendingEnrichment lists only un-fetched listings', () => {
    const p = new Pool();
    p.setSearch('silverado 2500');
    p.add(listings());
    const all = p.all();
    expect(p.pendingEnrichment()).toHaveLength(15);
    p.enrich(all[0]!.id, { fuel: 'gas' });
    p.setEnrichmentStatus(all[1]!.id, 'pending');
    expect(p.pendingEnrichment()).toHaveLength(13); // 15 - 1 enriched - 1 pending
  });
});
