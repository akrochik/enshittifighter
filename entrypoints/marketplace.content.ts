// Isolated-world relay. Owns the pool + enrichment queue, mounts the React
// sidebar, and pushes a fresh snapshot to it on every capture/enrichment.
import { storage } from 'wxt/utils/storage';
import { Pool } from '../src/store';
import { ingestCapture } from '../src/pipeline';
import { deriveSearchKey } from '../src/searchKey';
import { isCaptureMessage } from '../src/capture/types';
import { classify } from '../src/capture/classify';
import { EnrichQueue } from '../src/enrich/queue';
import { fetchVehicleDetail } from '../src/enrich/fetchPdp';
import { pruneCache, mergeCache } from '../src/enrich/detailCache';
import type { DetailCache } from '../src/enrich/detailCache';
import { UiStore } from '../src/ui/uiStore';
import type { SiftActions } from '../src/ui/uiStore';
import type { VehicleDetail } from '../src/types';
import { mountSidebar } from '../components/mount';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

// Detail-page results from earlier page loads (see src/enrich/detailCache.ts).
const detailCacheItem = storage.defineItem<DetailCache>('local:sift:details', { fallback: {} });

const onMarketplacePath = (): boolean => location.pathname.startsWith('/marketplace');

export default defineContentScript({
  matches: ['https://www.facebook.com/marketplace/*'],
  runAt: 'document_start',
  main(ctx: ContentScriptContext) {
    const store = new UiStore();
    const pool = new Pool();
    let lastSearchKey = '';

    const push = (extra: Record<string, unknown> = {}): void =>
      store.set({
        listings: pool.all(),
        poolCount: pool.size,
        enriching: queue.pending,
        enrichHalted: queue.halted,
        searchLabel: lastSearchKey,
        ...extra,
      });

    // --- detail cache: load once, write back new results in batches ---
    const fresh = new Map<string, VehicleDetail>();
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const remember = (id: string): void => {
      const d = pool.detailOf(id);
      if (!d) return;
      fresh.set(id, d);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const batch = [...fresh];
        fresh.clear();
        // re-read before writing: another Marketplace tab may have saved since
        void detailCacheItem
          .getValue()
          .then((stored) => detailCacheItem.setValue(mergeCache(stored, batch, Date.now())))
          .catch(() => {});
      }, 3000);
    };
    // Enrichment waits for this, so a listing cached by an earlier page load is
    // never fetched just because its capture beat the storage read.
    const cacheReady: Promise<void> = detailCacheItem
      .getValue()
      .then((raw) => {
        pool.remember(Object.entries(pruneCache(raw, Date.now())).map(([id, c]): [string, VehicleDetail] => [id, c.detail]));
        if (pool.size) push();
      })
      .catch(() => {});

    const queue = new EnrichQueue(
      fetchVehicleDetail,
      {
        onPending: (id) => {
          pool.setEnrichmentStatus(id, 'pending');
          push();
        },
        onResult: (id, r) => {
          if (r.detail && !r.schemaMiss) {
            pool.enrich(id, r.detail);
            remember(id);
          } else pool.setEnrichmentStatus(id, 'failed');
          push();
        },
        onHalt: () => push(),
      },
      // pool.needsEnrichment is the source of truth for "fetched already", so a
      // listing the user opened themselves (passive PDP capture) is never refetched.
      { delayMs: 2000, maxConsecutiveFailures: 5, shouldFetch: (id) => pool.needsEnrichment(id) },
    );

    // "Clear" empties the pool so a re-scroll (e.g. after applying Facebook's own
    // price filter) repopulates it cleanly — without waiting for a new search term.
    const actions: SiftActions = {
      clearPool: () => {
        pool.clear();
        queue.reset();
        push({ schemaError: false });
      },
      // The sidebar drives enrichment: it hands over the filtered view (in order),
      // so we fetch details for the trucks that currently matter first.
      setEnrichPriority: (ids) => {
        void cacheReady.then(() => {
          void queue.setPriority(ids);
          // The "N to go" count depends on the work-list, which just changed even if no
          // fetch starts (everything on screen already done). Update only that field:
          // pushing a new listings array here would re-trigger this very callback.
          const s = store.get();
          if (s.enriching !== queue.pending || s.enrichHalted !== queue.halted) {
            store.set({ enriching: queue.pending, enrichHalted: queue.halted });
          }
        });
      },
    };
    void mountSidebar(ctx, store, actions);

    // Facebook is a single-page app: leaving Marketplace (or starting a search)
    // changes the URL without reloading this script.
    const syncLocation = (): void => {
      store.set({ onMarketplace: onMarketplacePath(), onSearchPage: deriveSearchKey(location.href) !== '' });
    };
    syncLocation();
    ctx.addEventListener(window, 'wxt:locationchange', syncLocation);

    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (!isCaptureMessage(e.data)) return;

      const searchKey = deriveSearchKey(location.href);
      let r: ReturnType<typeof ingestCapture>;
      try {
        r = ingestCapture(pool, e.data.payload, searchKey);
      } catch {
        // An adapter throwing on a search response is the same signal as a schema miss.
        if (classify(e.data.payload.friendlyName) === 'search') push({ schemaError: true });
        return;
      }
      if (r.kind === 'ignore') return;

      if (r.schemaMiss) {
        // fail loud: captured a search response, extracted nothing. A detail page we
        // couldn't read only costs that one listing its details — not the results banner.
        if (r.kind === 'search') push({ schemaError: true });
        return;
      }
      if (r.enrichedId) remember(r.enrichedId); // the user opened this listing themselves
      if (r.kind === 'search' && searchKey !== lastSearchKey) {
        lastSearchKey = searchKey; // new query -> pool cleared; drop the old work-list
        queue.reset();
      }
      push({ schemaError: false });
    });
  },
});
