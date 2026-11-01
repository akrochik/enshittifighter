import { describe, it, expect, beforeAll } from 'vitest';
import { extractListings, parseMilesText } from './adapter';
import { describeWithFixtures, itWithFixtures, readFixture } from './_fixtures';

// Real Phase-0 fixtures live in /fixtures (gitignored — present locally, absent on a fresh clone,
// where the suites that read them are skipped). See _fixtures.ts.

describeWithFixtures(['search-content-container.json'], 'extractListings — initial search container fixture', () => {
  let r: ReturnType<typeof extractListings>;
  beforeAll(() => {
    r = extractListings(readFixture('search-content-container.json'), 'silverado 2500');
  });

  it('extracts every organic listing, no schema miss', () => {
    expect(r.schemaMiss).toBe(false);
    expect(r.listings).toHaveLength(15);
    expect(r.adUnitsSkipped).toBe(0);
  });

  it('maps the first listing to the internal shape', () => {
    const l = r.listings[0]!;
    expect(l.id).toBe('1346563490742167');
    expect(l.rawTitle).toContain('2015 Chevrolet Silverado 2500 HD');
    expect(l.price).toBe(10400);
    expect(l.previousPrice).toBe(11900); // strikethrough price drop
    expect(l.currency).toBe('USD');
    expect(l.locationText).toBe('Belmont, NC');
    expect(l.listingUrl).toBe('https://www.facebook.com/marketplace/item/1346563490742167');
    expect(l.sponsored).toBe(false);
    expect(l.photoUrl).toMatch(/^https:\/\//);
  });

  it('enriches the first listing via the title parser + subtitle mileage', () => {
    const v = r.listings[0]!.vehicle;
    expect(v.year).toBe(2015);
    expect(v.make).toBe('chevrolet');
    expect(v.model).toBe('silverado 2500hd');
    expect(v.trim).toBe('ltz');
    expect(v.mileage).toBe(385000); // from the "385K miles" subtitle, not the title
  });

  it('every listing has an id and a marketplace item URL', () => {
    for (const l of r.listings) {
      expect(l.id).toBeTruthy();
      expect(l.listingUrl).toBe(`https://www.facebook.com/marketplace/item/${l.id}`);
      expect(l.enrichment).toBe('unfetched');
      expect(l.detail).toBeNull();
    }
  });
});

describeWithFixtures(['search-content-pagination-chunked.json'], 'extractListings — chunked pagination fixture with ad units', () => {
  let r: ReturnType<typeof extractListings>;
  beforeAll(() => {
    r = extractListings(readFixture('search-content-pagination-chunked.json'), 'silverado 2500');
  });

  it('parses the multi-chunk response and skips ad units (tallying them)', () => {
    expect(r.schemaMiss).toBe(false);
    // 26 edges: 2 are MarketplaceFeedAdStory with no product -> skipped, 24 listings.
    expect(r.adUnitsSkipped).toBe(2);
    expect(r.listings).toHaveLength(24);
  });
});

describe('extractListings — fail-loud vs empty', () => {
  itWithFixtures(['search-root.json'], 'a response with no listing container is a schema miss, not empty', () => {
    const r = extractListings(readFixture('search-root.json'), 'silverado 2500');
    expect(r.schemaMiss).toBe(true);
    expect(r.listings).toHaveLength(0);
  });

  it('garbage input is a schema miss, never a throw', () => {
    const r = extractListings('not json at all\n{"partial":', 'x');
    expect(r.schemaMiss).toBe(true);
    expect(r.listings).toHaveLength(0);
  });
});

describe('parseMilesText', () => {
  it.each([
    ['385K miles', 385000],
    ['177K miles · Dealership', 177000],
    ['150,000 miles', 150000],
    ['38k mi', undefined], // "mi" not "miles" — subtitle form is always "miles"
  ])('%s -> %s', (input, expected) => {
    expect(parseMilesText(input)).toBe(expected);
  });
});
