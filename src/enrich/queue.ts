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
  /** The queue stopped itself after repeated failures (see maxConsecutiveFailures). */
  onHalt?: () => void;
}

export interface EnrichOptions {
  delayMs?: number;
  /**
   * Stop fetching after this many failures in a row (thrown fetch, or a page we
   * couldn't read). A run of failures means Facebook is refusing or the page format
   * changed — either way, continuing would only send more requests for nothing.
   * Rate-limit safety, not evasion: once halted it stays halted until reset().
   */
  maxConsecutiveFailures?: number;
  /**
   * Source of truth for "already enriched": consulted before every pick, so a
   * listing enriched some other way (the user opened it, or it was fetched before a
   * Clear) is never fetched again.
   */
  shouldFetch?: (id: string) => boolean;
}

const DEFAULT_MAX_FAILURES = 5;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class EnrichQueue {
  private done = new Set<string>(); // ids already attempted (success or fail) — never refetched
  private order: string[] = []; // the work-list, in priority order
  private running = false;
  private failStreak = 0;
  private haltedFlag = false;

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
    this.failStreak = 0;
    this.haltedFlag = false;
  }

  /** True once the failure breaker has tripped; nothing more is fetched until reset(). */
  get halted(): boolean {
    return this.haltedFlag;
  }

  /** How many of the current work-list still need fetching (0 once halted). */
  get pending(): number {
    if (this.haltedFlag) return 0;
    let n = 0;
    for (const id of this.order) if (this.wants(id)) n++;
    return n;
  }

  private wants(id: string): boolean {
    return !this.done.has(id) && (this.opts.shouldFetch?.(id) ?? true);
  }

  private next(): string | undefined {
    for (const id of this.order) if (this.wants(id)) return id;
    return undefined;
  }

  private async run(): Promise<void> {
    if (this.running || this.haltedFlag) return;
    this.running = true;
    try {
      let id: string | undefined;
      while ((id = this.next()) !== undefined) {
        this.done.add(id); // mark before fetching so we don't re-pick it mid-flight
        this.handlers.onPending?.(id);
        let result: PdpResult;
        let failed: boolean;
        try {
          result = await this.fetcher(id);
          failed = !result.detail;
        } catch {
          result = { id, detail: null, schemaMiss: false }; // a fetch failure ≠ a schema break
          failed = true;
        }
        this.handlers.onResult(id, result);
        this.failStreak = failed ? this.failStreak + 1 : 0;
        if (this.failStreak >= (this.opts.maxConsecutiveFailures ?? DEFAULT_MAX_FAILURES)) {
          this.haltedFlag = true;
          this.handlers.onHalt?.();
          return;
        }
        // re-check next() each loop so a priority change mid-drain takes effect immediately
        if (this.next() !== undefined && this.opts.delayMs) await wait(this.opts.delayMs);
      }
    } finally {
      this.running = false;
    }
  }
}
