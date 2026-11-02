// uiStore.ts — the bridge between the (imperative) content-script relay and the
// (declarative) React panel. The relay pushes a snapshot via set(); the panel
// reads it with useSyncExternalStore. Filter/sort state lives in React, not here
// — this only carries what the relay produces.

import type { Listing } from '../types';

/** UI -> relay actions (the panel can ask the relay to do things). */
export interface SiftActions {
  clearPool: () => void;
  /** The current filtered view, in order — the enricher fetches these first. */
  setEnrichPriority: (ids: string[]) => void;
}

export interface UiSnapshot {
  listings: Listing[]; // the raw pool; the panel deal-scores/filters/sorts it
  poolCount: number;
  enriching: number; // detail pages still queued/in-flight
  enrichHalted: boolean; // detail fetching stopped itself after repeated failures
  schemaError: boolean; // captured a response but extracted 0 listings (fail loud)
  searchLabel: string; // the current Facebook search text, for the header
  onMarketplace: boolean; // false after an in-app navigation away from Marketplace -> panel hides
  onSearchPage: boolean; // the URL is a search (?query=…), so scrolling it feeds the pool
}

type Listener = () => void;

const EMPTY: UiSnapshot = {
  listings: [],
  poolCount: 0,
  enriching: 0,
  enrichHalted: false,
  schemaError: false,
  searchLabel: '',
  onMarketplace: true,
  onSearchPage: false,
};

export class UiStore {
  private snap: UiSnapshot = EMPTY;
  private listeners = new Set<Listener>();

  get = (): UiSnapshot => this.snap;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  set = (patch: Partial<UiSnapshot>): void => {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  };
}
