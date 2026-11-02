// Isolated-world relay. Owns the pool + enrichment queue, mounts the React
// sidebar, and pushes a fresh snapshot to it on every capture/enrichment.
import { Pool } from '../src/store';
import { ingestCapture } from '../src/pipeline';
import { deriveSearchKey } from '../src/searchKey';
import { isCaptureMessage } from '../src/capture/types';
import { EnrichQueue } from '../src/enrich/queue';
import { fetchVehicleDetail } from '../src/enrich/fetchPdp';
import { UiStore } from '../src/ui/uiStore';
import type { SiftActions } from '../src/ui/uiStore';
import { mountSidebar } from '../components/mount';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

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

    const queue = new EnrichQueue(
      fetchVehicleDetail,
      {
        onPending: (id) => {
          pool.setEnrichmentStatus(id, 'pending');
          push();
        },
        onResult: (id, r) => {
          if (r.detail && !r.schemaMiss) pool.enrich(id, r.detail);
          else pool.setEnrichmentStatus(id, 'failed');
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
        void queue.setPriority(ids);
        // The "N to go" count depends on the work-list, which just changed even if no
        // fetch starts (everything on screen already done). Update only that field:
        // pushing a new listings array here would re-trigger this very callback.
        const s = store.get();
        if (s.enriching !== queue.pending || s.enrichHalted !== queue.halted) {
          store.set({ enriching: queue.pending, enrichHalted: queue.halted });
        }
      },
    };
    void mountSidebar(ctx, store, actions);

    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (!isCaptureMessage(e.data)) return;

      const searchKey = deriveSearchKey(location.href);
      const r = ingestCapture(pool, e.data.payload, searchKey);
      if (r.kind === 'ignore') return;

      if (r.schemaMiss) {
        // fail loud: captured a search response, extracted nothing. A detail page we
        // couldn't read only costs that one listing its details — not the results banner.
        if (r.kind === 'search') push({ schemaError: true });
        return;
      }
      if (r.kind === 'search' && searchKey !== lastSearchKey) {
        lastSearchKey = searchKey; // new query -> pool cleared; drop the old work-list
        queue.reset();
      }
      push({ schemaError: false });
    });
  },
});
