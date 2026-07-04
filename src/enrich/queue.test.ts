import { describe, it, expect } from 'vitest';
import { EnrichQueue } from './queue';
import type { PdpResult } from '../pdpAdapter';

const ok = (id: string): PdpResult => ({ id, detail: { fuel: 'diesel' }, schemaMiss: false });

describe('EnrichQueue', () => {
  it('fetches each id once, in order, reporting results', async () => {
    const calls: string[] = [];
    const results: string[] = [];
    const q = new EnrichQueue(
      async (id) => { calls.push(id); return ok(id); },
      { onResult: (id) => results.push(id) },
      { delayMs: 0 },
    );
    await q.enqueue(['a', 'b', 'c']);
    expect(calls).toEqual(['a', 'b', 'c']);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('dedups ids it has already seen', async () => {
    const calls: string[] = [];
    const q = new EnrichQueue(async (id) => { calls.push(id); return ok(id); }, { onResult: () => {} }, { delayMs: 0 });
    await q.enqueue(['a', 'b']);
    await q.enqueue(['a', 'b', 'c']);
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('marks pending before each fetch', async () => {
    const pending: string[] = [];
    const q = new EnrichQueue(async (id) => ok(id), { onPending: (id) => pending.push(id), onResult: () => {} }, { delayMs: 0 });
    await q.enqueue(['x', 'y']);
    expect(pending).toEqual(['x', 'y']);
  });

  it('keeps going after a fetch throws (reports a null-detail result)', async () => {
    const out: string[] = [];
    const q = new EnrichQueue(
      async (id) => { if (id === 'b') throw new Error('boom'); return ok(id); },
      { onResult: (id, r) => out.push(`${id}:${r.detail ? 'ok' : 'fail'}`) },
      { delayMs: 0 },
    );
    await q.enqueue(['a', 'b', 'c']);
    expect(out).toEqual(['a:ok', 'b:fail', 'c:ok']);
  });

  it('reset() clears the queue and the once-each memory', async () => {
    const calls: string[] = [];
    const q = new EnrichQueue(async (id) => { calls.push(id); return ok(id); }, { onResult: () => {} }, { delayMs: 0 });
    await q.enqueue(['a']);
    q.reset();
    await q.enqueue(['a']);
    expect(calls).toEqual(['a', 'a']);
  });
});
