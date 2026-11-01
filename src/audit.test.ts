// Regression tests for the backend audit fixes. Synthetic inputs only, so they
// run without the private Phase-0 fixtures.
import { describe, it, expect } from 'vitest';
import { extractListings, parseMilesText } from './adapter';
import { extractVehicleDetailFromHtml, mapVehicleTarget } from './pdpAdapter';
import { EnrichQueue } from './enrich/queue';
import { Pool } from './store';
import { ingestCapture } from './pipeline';
import { deriveSearchKey } from './searchKey';
import { mkListing } from './_testkit';
import type { PdpResult } from './pdpAdapter';

const feed = (listing: Record<string, unknown>): string =>
  JSON.stringify({ data: { marketplace_search: { feed_units: { edges: [{ node: { listing } }] } } } });

describe('adapter', () => {
  it('a blank or non-numeric price is unknown (null), not $0', () => {
    const r = extractListings(feed({ id: '1', marketplace_listing_title: '2014 Mercedes-Benz GLK 350', listing_price: { amount: '' } }), 'q');
    expect(r.listings[0]!.price).toBeNull();
    const free = extractListings(feed({ id: '2', marketplace_listing_title: 'x', listing_price: { amount: 'Free' } }), 'q');
    expect(free.listings[0]!.price).toBeNull();
  });

  it('a GraphQL error reply is not a schema miss', () => {
    const r = extractListings(JSON.stringify({ errors: [{ message: 'rate limited' }] }), 'q');
    expect(r.schemaMiss).toBe(false);
    expect(r.listings).toEqual([]);
  });

  it('a response without the listing container is still a schema miss', () => {
    expect(extractListings(JSON.stringify({ data: { something_else: {} } }), 'q').schemaMiss).toBe(true);
  });

  it.each<[string, number | undefined]>([
    ['385K miles', 385000],
    ['177K miles · Dealership', 177000],
    ['1.2K miles', 1200],
    ['170,000 miles', 170000],
    ['850 miles', 850],
    ['120K km', 74565],
    ['1385K miles', undefined], // no word boundary -> no partial "385K" read
    ['Dealership', undefined],
  ])('parseMilesText(%s) -> %s', (s, n) => {
    expect(parseMilesText(s)).toBe(n);
  });
});

describe('pdpAdapter', () => {
  const page = (...targets: object[]): string =>
    targets.map((t) => `<script type="application/json" data-sjs>${JSON.stringify({ require: [[{ target: t }]] })}</script>`).join('');

  it('takes the vehicle record of the listing that was fetched, not a related one', () => {
    const html = page(
      { id: '999', vehicle_fuel_type: 'DIESEL', vehicle_make_display_name: 'Ford' },
      { id: '123', vehicle_fuel_type: 'GASOLINE', vehicle_make_display_name: 'Mercedes-Benz' },
    );
    const r = extractVehicleDetailFromHtml(html, '123');
    expect(r.id).toBe('123');
    expect(r.detail).toMatchObject({ fuel: 'gas', make: 'mercedes-benz' });
  });

  it("never returns a record that is positively another listing's", () => {
    const r = extractVehicleDetailFromHtml(page({ id: '999', vehicle_fuel_type: 'DIESEL' }), '123');
    expect(r.detail).toBeNull();
    expect(r.schemaMiss).toBe(true);
  });

  it('reads a numeric-string odometer and plug-in hybrids', () => {
    expect(mapVehicleTarget({ vehicle_odometer_data: { unit: 'MILES', value: '72000' } }).mileage).toBe(72000);
    expect(mapVehicleTarget({ vehicle_fuel_type: 'PLUG_IN_HYBRID' }).fuel).toBe('hybrid');
  });
});

describe('EnrichQueue — rate-limit safety', () => {
  const fail = async (): Promise<PdpResult> => {
    throw new Error('429');
  };

  it('halts after N consecutive failures instead of hammering on', async () => {
    const calls: string[] = [];
    let halted = false;
    const q = new EnrichQueue(
      async (id) => {
        calls.push(id);
        return fail();
      },
      { onResult: () => {}, onHalt: () => (halted = true) },
      { delayMs: 0, maxConsecutiveFailures: 3 },
    );
    await q.setPriority(['a', 'b', 'c', 'd', 'e']);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(halted).toBe(true);
    expect(q.halted).toBe(true);
    expect(q.pending).toBe(0);
    await q.setPriority(['d', 'e']); // still halted
    expect(calls).toEqual(['a', 'b', 'c']);
    q.reset();
    expect(q.halted).toBe(false);
  });

  it('a success resets the failure streak', async () => {
    const calls: string[] = [];
    const q = new EnrichQueue(
      async (id) => {
        calls.push(id);
        if (id === 'ok') return { id, detail: { fuel: 'gas' }, schemaMiss: false };
        return fail();
      },
      { onResult: () => {} },
      { delayMs: 0, maxConsecutiveFailures: 2 },
    );
    await q.setPriority(['x1', 'ok', 'x2', 'ok2', 'x3']);
    expect(calls).toEqual(['x1', 'ok', 'x2', 'ok2']); // x2 + ok2 (also failing) trip it
  });

  it('never fetches what shouldFetch says is already enriched', async () => {
    const calls: string[] = [];
    const q = new EnrichQueue(
      async (id) => {
        calls.push(id);
        return { id, detail: {}, schemaMiss: false };
      },
      { onResult: () => {} },
      { delayMs: 0, shouldFetch: (id) => id !== 'opened-by-user' },
    );
    await q.setPriority(['a', 'opened-by-user', 'b']);
    expect(calls).toEqual(['a', 'b']);
  });
});

describe('Pool — at most one detail fetch per listing', () => {
  it('remembers details across Clear and search changes', () => {
    const p = new Pool();
    p.setSearch('glk 350');
    p.add([mkListing({ id: '1' }), mkListing({ id: '2' })]);
    p.enrich('1', { fuel: 'gas' });
    p.setEnrichmentStatus('2', 'failed');
    p.clear();
    p.add([mkListing({ id: '1' }), mkListing({ id: '2' })]);
    expect(p.get('1')).toMatchObject({ enrichment: 'enriched', detail: { fuel: 'gas' } });
    expect(p.get('2')!.enrichment).toBe('failed');
    expect(p.needsEnrichment('1')).toBe(false);
    p.setSearch('gl 450');
    p.add([mkListing({ id: '1' })]);
    expect(p.get('1')!.detail).toMatchObject({ fuel: 'gas' });
  });

  it('a detail page opened before the listing is pooled is kept for later', () => {
    const p = new Pool();
    p.setSearch('q');
    expect(p.enrich('7', { transmission: 'manual' })).toBe(false);
    p.add([mkListing({ id: '7' })]);
    expect(p.get('7')).toMatchObject({ enrichment: 'enriched', detail: { transmission: 'manual' } });
  });
});

describe('pipeline', () => {
  it('an HTTP error response is ignored, not reported as a schema break', () => {
    const pool = new Pool();
    const r = ingestCapture(pool, { transport: 'xhr', url: '', friendlyName: 'CometMarketplaceSearchContentPaginationQuery', status: 500, body: 'oops' }, 'q');
    expect(r).toMatchObject({ kind: 'ignore', schemaMiss: false });
  });
});

describe('searchKey', () => {
  it('collapses whitespace so the same search keeps one pool', () => {
    expect(deriveSearchKey('https://www.facebook.com/marketplace/nyc/search?query=GLK%20%20350%20')).toBe('glk 350');
  });
});
