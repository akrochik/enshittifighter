import { describe, it, expect } from 'vitest';
import { EnrichQueue } from './queue';
import type { PdpResult } from '../pdpAdapter';

const ok = (id: string): PdpResult => ({ id, detail: { fuel: 'diesel' }, schemaMiss: false });

describe('EnrichQueue', () => {
  it('fetches the priority list in order, once each', async () => {
    const calls: string[] = [];
    const results: string[] = [];
    const q = new EnrichQueue(
      async (id) => { calls.push(id); return ok(id); },
      { onResult: (id) => results.push(id) },
      { delayMs: 0 },
    );
    await q.setPriority(['a', 'b', 'c']);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('only fetches ids in the work-list — filtered-out listings are never fetched', async () => {
    const calls: string[] = [];
    const q = new EnrichQueue(async (id) => { calls.push(id); return ok(id); }, { onResult: () => {} }, { delayMs: 0 });
    await q.setPriority(['a', 'b']); // 'x','y' never handed over -> never fetched
    expect(calls).toEqual(['a', 'b']);
  });

  it('skips already-attempted ids when the work-list is re-set', async () => {
    const calls: string[] = [];
    const q = new EnrichQueue(async (id) => { calls.push(id); return ok(id); }, { onResult: () => {} }, { delayMs: 0 });
    await q.setPriority(['a', 'b']);
    await q.setPriority(['a', 'b', 'c']); // a,b done -> only c fetched
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('marks pending before each fetch', async () => {
    const pending: string[] = [];
    const q = new EnrichQueue(async (id) => ok(id), { onPending: (id) => pending.push(id), onResult: () => {} }, { delayMs: 0 });
    await q.setPriority(['x', 'y']);
    expect(pending).toEqual(['x', 'y']);
  });

  it('keeps going after a fetch throws (reports a null-detail result)', async () => {
    const out: string[] = [];
    const q = new EnrichQueue(
      async (id) => { if (id === 'b') throw new Error('boom'); return ok(id); },
      { onResult: (id, r) => out.push(`${id}:${r.detail ? 'ok' : 'fail'}`) },
      { delayMs: 0 },
    );
    await q.setPriority(['a', 'b', 'c']);
    expect(out).toEqual(['a:ok', 'b:fail', 'c:ok']);
  });

  it('pending counts only un-attempted ids in the work-list', async () => {
    let paused: (() => void) | null = null;
    const gate = new Promise<void>((r) => { paused = r; });
    const q = new EnrichQueue(async (id) => { if (id === 'a') await gate; return ok(id); }, { onResult: () => {} }, { delayMs: 0 });
    const run = q.setPriority(['a', 'b', 'c']);
    expect(q.pending).toBe(2); // 'a' is in-flight (marked done), b + c remain
    paused!();
    await run;
    expect(q.pending).toBe(0);
  });

  it('reset clears the work-list and the attempted-memory', async () => {
    const calls: string[] = [];
    const q = new EnrichQueue(async (id) => { calls.push(id); return ok(id); }, { onResult: () => {} }, { delayMs: 0 });
    await q.setPriority(['a']);
    q.reset();
    await q.setPriority(['a']);
    expect(calls).toEqual(['a', 'a']);
  });
});
