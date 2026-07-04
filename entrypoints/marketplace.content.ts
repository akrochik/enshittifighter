// Isolated-world relay. Receives captures from the MAIN-world hook, runs the
// pipeline into the pool, and drives the throttled enrichment queue. (Phase 3
// mounts the sidebar here; for now it logs so the live checkpoint can watch it.)
import { Pool } from '../src/store';
import { ingestCapture } from '../src/pipeline';
import { deriveSearchKey } from '../src/searchKey';
import { isCaptureMessage } from '../src/capture/types';
import { selectView } from '../src/view';
import { EnrichQueue } from '../src/enrich/queue';
import { fetchVehicleDetail } from '../src/enrich/fetchPdp';

export default defineContentScript({
  matches: ['https://www.facebook.com/marketplace/*'],
  runAt: 'document_start',
  main() {
    const pool = new Pool();
    let lastSearchKey = '';

    // Bounded enrichment: fetch each pooled listing's detail page, one at a time,
    // throttled. Only ever processes ids the pool hands it — never crawls.
    const queue = new EnrichQueue(
      fetchVehicleDetail,
      {
        onPending: (id) => pool.setEnrichmentStatus(id, 'pending'),
        onResult: (id, r) => {
          if (r.detail && !r.schemaMiss) pool.enrich(id, r.detail);
          else pool.setEnrichmentStatus(id, 'failed');
          // Phase 3: re-render the sidebar here.
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
        console.warn(`[Marketplace Sift] SCHEMA MISS on ${r.kind} — Facebook may have changed its format`);
        return;
      }

      if (r.kind === 'search') {
        if (searchKey !== lastSearchKey) {
          lastSearchKey = searchKey; // pool was cleared for a new query
          queue.reset();
        }
        void queue.enqueue(pool.pendingEnrichment());
      }

      const view = selectView(pool.all());
      console.log(`[Marketplace Sift] ${r.kind} · pool ${pool.size} · matches ${view.matchCount} · enriching ${queue.pending}`);
    });

    console.log('[Marketplace Sift] relay ready (passive capture + bounded enrichment)');
  },
});
