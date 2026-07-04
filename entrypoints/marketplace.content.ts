// Isolated-world relay. Receives captures from the MAIN-world hook, runs the
// pipeline into the pool, and (Phase 3) will mount the sidebar. For now it logs
// so the Phase-2 live checkpoint can confirm real captures -> Listings.
import { Pool } from '../src/store';
import { ingestCapture } from '../src/pipeline';
import { deriveSearchKey } from '../src/searchKey';
import { isCaptureMessage } from '../src/capture/types';
import { selectView } from '../src/view';

export default defineContentScript({
  matches: ['https://www.facebook.com/marketplace/*'],
  runAt: 'document_start',
  main() {
    const pool = new Pool();

    window.addEventListener('message', (e: MessageEvent) => {
      if (e.source !== window || e.origin !== location.origin) return;
      if (!isCaptureMessage(e.data)) return;

      const searchKey = deriveSearchKey(location.href);
      const r = ingestCapture(pool, e.data.payload, searchKey);
      if (r.kind === 'ignore') return;

      if (r.schemaMiss) {
        console.warn('[Marketplace Sift] SCHEMA MISS on', r.kind, '— Facebook may have changed its format');
        return;
      }
      const view = selectView(pool.all());
      console.log(
        `[Marketplace Sift] ${r.kind} · pool ${pool.size} · matches ${view.matchCount}`,
        r.kind === 'search' ? view.listings.slice(0, 3).map((l) => `${l.vehicle.year ?? '?'} ${l.vehicle.make ?? '?'} ${l.vehicle.model ?? '?'} $${l.price}`) : `enriched ${r.enrichedId ?? '(not pooled)'}`,
      );
    });

    console.log('[Marketplace Sift] relay ready (passive capture)');
  },
});
