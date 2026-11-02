import { describe, it, expect } from 'vitest';
import { pruneCache, mergeCache, DETAIL_TTL_MS, DETAIL_CACHE_MAX } from './detailCache';
import { Pool } from '../store';
import { mkListing } from '../_testkit';

const NOW = 1_800_000_000_000;

describe('detail cache', () => {
  it('drops expired, future-dated and malformed entries', () => {
    const c = pruneCache(
      {
        fresh: { detail: { fuel: 'diesel' }, at: NOW - 1000 },
        old: { detail: { fuel: 'gas' }, at: NOW - DETAIL_TTL_MS - 1 },
        future: { detail: {}, at: NOW + 5 },
        junk: { at: 'x' },
        nodetail: { at: NOW },
      },
      NOW,
    );
    expect(Object.keys(c)).toEqual(['fresh']);
  });

  it('garbage storage -> empty cache', () => {
    expect(pruneCache(undefined, NOW)).toEqual({});
    expect(pruneCache('x', NOW)).toEqual({});
  });

  it('keeps only the newest entries past the cap', () => {
    const raw: Record<string, unknown> = {};
    for (let i = 0; i < DETAIL_CACHE_MAX + 10; i++) raw[`id${i}`] = { detail: {}, at: NOW - (DETAIL_CACHE_MAX + 10 - i) };
    const c = pruneCache(raw, NOW);
    expect(Object.keys(c)).toHaveLength(DETAIL_CACHE_MAX);
    expect(c.id0).toBeUndefined(); // the oldest went
    expect(c[`id${DETAIL_CACHE_MAX + 9}`]).toBeDefined();
  });

  it('merges fresh details over what another tab stored', () => {
    const stored = { a: { detail: { fuel: 'gas' }, at: NOW - 10 }, b: { detail: { fuel: 'gas' }, at: NOW - 10 } };
    const c = mergeCache(stored, [['b', { fuel: 'diesel' }], ['c', { transmission: 'manual' }]], NOW);
    expect(c.a!.detail).toEqual({ fuel: 'gas' });
    expect(c.b).toEqual({ detail: { fuel: 'diesel' }, at: NOW });
    expect(c.c!.detail).toEqual({ transmission: 'manual' });
  });
});

describe('Pool.remember — details from an earlier page load', () => {
  it('a remembered listing is enriched on arrival and never needs a fetch', () => {
    const pool = new Pool();
    pool.remember([['1', { fuel: 'diesel' }]]);
    pool.add([mkListing({ id: '1' })]);
    expect(pool.get('1')!.detail).toEqual({ fuel: 'diesel' });
    expect(pool.needsEnrichment('1')).toBe(false);
  });

  it('fills a pooled listing that was still waiting', () => {
    const pool = new Pool();
    pool.add([mkListing({ id: '1' })]);
    pool.remember([['1', { fuel: 'gas' }]]);
    expect(pool.get('1')!.enrichment).toBe('enriched');
  });

  it('never overrides what this page already learned', () => {
    const pool = new Pool();
    pool.add([mkListing({ id: '1' })]);
    pool.enrich('1', { fuel: 'diesel', mileage: 90000 });
    pool.remember([['1', { fuel: 'gas' }]]);
    expect(pool.get('1')!.detail).toEqual({ fuel: 'diesel', mileage: 90000 });
    expect(pool.detailOf('1')).toEqual({ fuel: 'diesel', mileage: 90000 });
  });
});
