// fetchPdp.ts — the one active request the extension makes. GETs a listing's
// detail page with Accept:text/html (which makes Facebook embed the full vehicle
// record in the page's RelayPrefetchedStreamCache blocks) and extracts it. A
// plain page fetch — no doc_id, no session token, no forged API call.

import { extractVehicleDetailFromHtml } from '../pdpAdapter';
import type { PdpResult } from '../pdpAdapter';

const ITEM_URL = (id: string): string => `https://www.facebook.com/marketplace/item/${encodeURIComponent(id)}/`;

export async function fetchVehicleDetail(id: string): Promise<PdpResult> {
  const res = await fetch(ITEM_URL(id), {
    credentials: 'include',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  const html = await res.text();
  return extractVehicleDetailFromHtml(html);
}
