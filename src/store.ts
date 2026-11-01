// store.ts — the accumulating listing pool. Deduped by id, scoped to one search
// (clears when the search query changes), and the place enrichment gets merged
// in. Pure state container: no FB knowledge, no chrome.storage here (the relay
// wires persistence around it).

import type { Listing, VehicleDetail, EnrichmentStatus } from './types';

interface Attempt {
  detail: VehicleDetail | null;
  enrichment: 'enriched' | 'failed';
}

export class Pool {
  private key = '';
  private map = new Map<string, Listing>();
  // Detail-page outcomes by id, kept across clear() and search changes. The
  // enrichment rule is "at most once per listing": a listing that drops out of the
  // pool and comes back (Clear + re-scroll, or the same car under another search)
  // gets its detail back instead of being fetched again.
  private attempts = new Map<string, Attempt>();

  get searchKey(): string {
    return this.key;
  }
  get size(): number {
    return this.map.size;
  }

  /** Set the active search. If it changed, the pool clears (pool scoping). */
  setSearch(searchKey: string): void {
    if (searchKey !== this.key) {
      this.map.clear();
      this.key = searchKey;
    }
  }

  /**
   * Accumulate captured listings, deduped by id. Re-seeing a listing refreshes
   * its feed snapshot (price may have changed) but PRESERVES any enrichment,
   * deal, and enrichment status already attached.
   */
  add(listings: Listing[]): void {
    for (const l of listings) {
      const existing = this.map.get(l.id);
      if (!existing) {
        const prior = this.attempts.get(l.id);
        this.map.set(l.id, prior ? { ...l, detail: prior.detail, enrichment: prior.enrichment } : l);
        continue;
      }
      this.map.set(l.id, {
        ...l,
        detail: existing.detail,
        enrichment: existing.enrichment,
        deal: existing.deal,
      });
    }
  }

  /**
   * Merge detail-page fields into a pooled listing and mark it enriched. False if
   * the id isn't pooled — the detail is still remembered for when it shows up.
   */
  enrich(id: string, detail: VehicleDetail): boolean {
    const e = this.map.get(id);
    const merged = { ...(e?.detail ?? this.attempts.get(id)?.detail ?? {}), ...detail };
    this.attempts.set(id, { detail: merged, enrichment: 'enriched' });
    if (!e) return false;
    this.map.set(id, { ...e, detail: merged, enrichment: 'enriched' });
    return true;
  }

  setEnrichmentStatus(id: string, status: EnrichmentStatus): boolean {
    if (status === 'failed' && this.attempts.get(id)?.enrichment !== 'enriched') {
      this.attempts.set(id, { detail: null, enrichment: 'failed' });
    }
    const e = this.map.get(id);
    if (!e) return false;
    this.map.set(id, { ...e, enrichment: status });
    return true;
  }

  /** True if this listing still needs its one detail-page attempt. */
  needsEnrichment(id: string): boolean {
    return this.map.get(id)?.enrichment === 'unfetched';
  }

  /** ids still needing enrichment — the work-list for the throttled fetch queue. */
  pendingEnrichment(): string[] {
    const ids: string[] = [];
    for (const l of this.map.values()) if (l.enrichment === 'unfetched') ids.push(l.id);
    return ids;
  }

  get(id: string): Listing | undefined {
    return this.map.get(id);
  }

  /** Empty the pool, keeping the current search key. Backs the UI "Clear" button. */
  clear(): void {
    this.map.clear();
  }

  all(): Listing[] {
    return [...this.map.values()];
  }
}
