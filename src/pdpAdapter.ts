// pdpAdapter.ts — the ONE module that knows the listing-detail vehicle shape.
// Two ways in, same output:
//   - extractVehicleDetail(text): the GraphQL response (MarketplacePDPContainerQuery),
//     as captured passively when the user opens a listing.
//   - extractVehicleDetailFromHtml(html): the item-page HTML fetched with
//     Accept:text/html, which embeds the same query result in RelayPrefetchedStreamCache
//     blocks. This is how the throttled enricher reads listings the user hasn't opened.
// Both funnel the raw `target` object through mapVehicleTarget().

import type {
  VehicleDetail,
  FuelType,
  Transmission,
  SellerKind,
  TitleStatus,
} from './types';

const FUEL: Record<string, FuelType> = {
  GASOLINE: 'gas', GAS: 'gas', DIESEL: 'diesel', HYBRID: 'hybrid',
  PLUGIN_HYBRID: 'hybrid', ELECTRIC: 'electric',
};
const TRANS: Record<string, Transmission> = { AUTOMATIC: 'automatic', MANUAL: 'manual' };
const SELLER: Record<string, SellerKind> = { PRIVATE_SELLER: 'private', DEALER: 'dealer', DEALERSHIP: 'dealer' };
const TITLE: Record<string, TitleStatus> = {
  CLEAN: 'clean', SALVAGE: 'salvage', REBUILT: 'rebuilt', REBUILT_SALVAGE: 'rebuilt',
};
const OWNERS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : undefined;

export interface PdpResult {
  id: string | null; // the listing this detail belongs to
  detail: VehicleDetail | null;
  schemaMiss: boolean; // parsed a response/page but the vehicle target was missing
}

/** Map a raw FB vehicle `target` object to the internal VehicleDetail. */
export function mapVehicleTarget(t: any): VehicleDetail {
  const detail: VehicleDetail = {};

  const fuel = t?.vehicle_fuel_type;
  if (typeof fuel === 'string' && fuel) detail.fuel = FUEL[fuel] ?? 'other';

  const trans = t?.vehicle_transmission_type;
  if (typeof trans === 'string' && TRANS[trans]) detail.transmission = TRANS[trans];

  const od = t?.vehicle_odometer_data;
  if (od && typeof od.value === 'number') {
    detail.mileage = od.unit === 'KILOMETERS' ? Math.round(od.value * 0.621371) : od.value;
  }

  const seller = t?.vehicle_seller_type;
  if (typeof seller === 'string' && SELLER[seller]) detail.seller = SELLER[seller];

  const title = t?.vehicle_title_status;
  if (typeof title === 'string' && title) detail.titleStatus = TITLE[title] ?? 'other';

  const owners = t?.vehicle_number_of_owners;
  if (typeof owners === 'string' && OWNERS[owners] !== undefined) detail.numberOfOwners = OWNERS[owners];
  else if (typeof owners === 'number' && owners > 0) detail.numberOfOwners = owners;

  const make = str(t?.vehicle_make_display_name);
  if (make) detail.make = make;
  const model = str(t?.vehicle_model_display_name);
  if (model) detail.model = model;
  const trim = str(t?.vehicle_trim_display_name);
  if (trim) detail.trim = trim;
  const ext = str(t?.vehicle_exterior_color);
  if (ext) detail.exteriorColor = ext;
  const int = str(t?.vehicle_interior_color);
  if (int) detail.interiorColor = int;
  const vin = str(t?.vehicle_identification_number);
  if (vin) detail.vin = vin.toUpperCase();

  return detail;
}

function idOf(t: any): string | null {
  const raw = t?.id;
  return raw === null || raw === undefined ? null : String(raw);
}

/** Deep-search a parsed object graph for the first object that owns `key`. */
function deepFindByKey(o: any, key: string, depth = 0): any {
  if (!o || typeof o !== 'object' || depth > 40) return null;
  if (Object.prototype.hasOwnProperty.call(o, key)) return o;
  for (const k in o) {
    const r = deepFindByKey(o[k], key, depth + 1);
    if (r) return r;
  }
  return null;
}

// --- GraphQL response form (passive capture) ---
function firstDoc(rawResponseText: string): any {
  for (const line of rawResponseText.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const doc = JSON.parse(s);
      if (doc?.data?.viewer?.marketplace_product_details_page?.target) return doc;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function extractVehicleDetail(rawResponseText: string): PdpResult {
  const doc = firstDoc(rawResponseText);
  const t = doc?.data?.viewer?.marketplace_product_details_page?.target;
  if (!t) return { id: null, detail: null, schemaMiss: true };
  return { id: idOf(t), detail: mapVehicleTarget(t), schemaMiss: false };
}

// --- HTML form (active enrichment: GET item page with Accept:text/html) ---
const SCRIPT_JSON = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;

export function extractVehicleDetailFromHtml(html: string): PdpResult {
  SCRIPT_JSON.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_JSON.exec(html)) !== null) {
    let parsed: any;
    try {
      parsed = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    const target = deepFindByKey(parsed, 'vehicle_fuel_type');
    if (target) return { id: idOf(target), detail: mapVehicleTarget(target), schemaMiss: false };
  }
  return { id: null, detail: null, schemaMiss: true };
}
