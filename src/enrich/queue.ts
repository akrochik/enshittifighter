// queue.ts — the throttled enrichment queue. Fetches at most one detail page at
// a time, once per listing id, with a delay between each. This is the "bounded"
// in bounded-enrichment: it only ever processes ids handed to it (pool members),
// never crawls, and keeps the request footprint small and polite.

import type { PdpResult } from '../pdpAdapter';

export type PdpFetcher = (id: string) => Promise<PdpResult>;

export interface EnrichHandlers {
  onPending?: (id: string) => void;
  onResult: (id: string, result: PdpResult) => void;
}

export interface EnrichOptions {
  delayMs?: number; // throttle between fetches
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class EnrichQueue {
  private seen = new Set<string>();
  private queue: string[] = [];
  private draining: Promise<void> | null = null;

  constructor(
    private readonly fetcher: PdpFetcher,
    private readonly handlers: EnrichHandlers,
    private readonly opts: EnrichOptions = {},
  ) {}

  /** Queue ids (skipping any already fetched/queued). Resolves when the queue drains. */
  enqueue(ids: string[]): Promise<void> {
    for (const id of ids) {
      if (!this.seen.has(id)) {
        this.seen.add(id);
        this.queue.push(id);
      }
    }
    if (!this.draining) {
      this.draining = this.drain().finally(() => {
        this.draining = null;
      });
    }
    return this.draining;
  }

  /** Clear the queue and the once-each memory — call when the pool clears on a new search. */
  reset(): void {
    this.queue = [];
    this.seen.clear();
  }

  get pending(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    while (this.queue.length) {
      const id = this.queue.shift()!;
      this.handlers.onPending?.(id);
      let result: PdpResult;
      try {
        result = await this.fetcher(id);
      } catch {
        result = { id, detail: null, schemaMiss: false }; // a fetch failure ≠ a schema break
      }
      this.handlers.onResult(id, result);
      if (this.queue.length && this.opts.delayMs) await wait(this.opts.delayMs);
    }
  }
}
