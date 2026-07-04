// Isolated-world relay. Owns the pool + enrichment queue, mounts the React
// sidebar, and pushes a fresh snapshot to it on every capture/enrichment.
import { Pool } from '../src/store';
import { ingestCapture } from '../src/pipeline';
import { deriveSearchKey } from '../src/searchKey';
import { isCaptureMessage } from '../src/capture/types';
import { EnrichQueue } from '../src/enrich/queue';
import { fetchVehicleDetail } from '../src/enrich/fetchPdp';
import { UiStore } from '../src/ui/uiStore';
import { mountSidebar } from '../components/mount';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';

export default defineContentScript({
  matches: ['https://www.facebook.com/marketplace/*'],
  runAt: 'document_start',
  main(ctx: ContentScriptContext) {
    const store = new UiStore();
    void mountSidebar(ctx, store);

    const pool = new Pool();
    let lastSearchKey = '';

    const push = (extra: Record<string, unknown> = {}): void =>
      store.set({ listings: pool.all(), poolCount: pool.size, enriching: queue.pending, searchLabel: lastSearchKey, ...extra });

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
      },
      { delayMs: 2000 },
    );

    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (!isCaptureMessage(e.data)) return;

      const searchKey = deriveSearchKey(location.href);
      const r = ingestCapture(pool, e.data.payload, searchKey);
      if (r.kind === 'ignore') return;

      if (r.schemaMiss) {
        push({ schemaError: true }); // fail loud: captured a response, extracted nothing
        return;
      }
      if (r.kind === 'search') {
        if (searchKey !== lastSearchKey) {
          lastSearchKey = searchKey;
          queue.reset();
        }
        void queue.enqueue(pool.pendingEnrichment());
      }
      push({ schemaError: false });
    });
  },
});
