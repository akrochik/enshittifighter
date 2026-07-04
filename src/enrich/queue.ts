// queue.ts — the throttled enrichment queue, driven by the sidebar's current view.
// The UI hands it the ids currently passing the filters (in sort order) via
// setPriority(); it fetches those one at a time, throttled, skips ones already
// attempted, and never touches listings the user filtered out. Re-calling
// setPriority (filters/sort/pool changed) re-orders what gets fetched next — so
// the detail-dependent fields fill in fast for the trucks you actually care about,
// and far fewer pages get fetched overall.

import type { PdpResult } from '../pdpAdapter';

export type PdpFetcher = (id: string) => Promise<PdpResult>;

export interface EnrichHandlers {
  onPending?: (id: string) => void;
  onResult: (id: string, result: PdpResult) => void;
}

export interface EnrichOptions {
  delayMs?: number;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class EnrichQueue {
  private done = new Set<string>(); // ids already attempted (success or fail) — never refetched
  private order: string[] = []; // the work-list, in priority order
  private running = false;

  constructor(
    private readonly fetcher: PdpFetcher,
    private readonly handlers: EnrichHandlers,
    private readonly opts: EnrichOptions = {},
  ) {}

  /** Replace the work-list with the current filtered view (in order). Only these ids get fetched. */
  setPriority(ids: string[]): Promise<void> {
    this.order = ids;
    return this.run();
  }

  /** Clear the work-list and the attempted-memory — call when the pool clears on a new search. */
  reset(): void {
    this.done.clear();
    this.order = [];
  }

  /** How many of the current work-list still need fetching. */
  get pending(): number {
    let n = 0;
    for (const id of this.order) if (!this.done.has(id)) n++;
    return n;
  }

  private next(): string | undefined {
    for (const id of this.order) if (!this.done.has(id)) return id;
    return undefined;
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let id: string | undefined;
      while ((id = this.next()) !== undefined) {
        this.done.add(id); // mark before fetching so we don't re-pick it mid-flight
        this.handlers.onPending?.(id);
        let result: PdpResult;
        try {
          result = await this.fetcher(id);
        } catch {
          result = { id, detail: null, schemaMiss: false }; // a fetch failure ≠ a schema break
        }
        this.handlers.onResult(id, result);
        // re-check next() each loop so a priority change mid-drain takes effect immediately
        if (this.next() !== undefined && this.opts.delayMs) await wait(this.opts.delayMs);
      }
    } finally {
      this.running = false;
    }
  }
}
