// store.ts — the accumulating listing pool. Deduped by id, scoped to one search
// (clears when the search query changes), and the place enrichment gets merged
// in. Pure state container: no FB knowledge, no chrome.storage here (the relay
// wires persistence around it).

import type { Listing, VehicleDetail, EnrichmentStatus } from './types';

export class Pool {
  private key = '';
  private map = new Map<string, Listing>();

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
        this.map.set(l.id, l);
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

  /** Merge detail-page fields into a pooled listing and mark it enriched. False if the id isn't pooled. */
  enrich(id: string, detail: VehicleDetail): boolean {
    const e = this.map.get(id);
    if (!e) return false;
    this.map.set(id, { ...e, detail: { ...(e.detail ?? {}), ...detail }, enrichment: 'enriched' });
    return true;
  }

  setEnrichmentStatus(id: string, status: EnrichmentStatus): boolean {
    const e = this.map.get(id);
    if (!e) return false;
    this.map.set(id, { ...e, enrichment: status });
    return true;
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
