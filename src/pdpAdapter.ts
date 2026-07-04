// pdpAdapter.ts — the ONE module that knows Facebook's listing-detail-page
// (MarketplacePDPContainerQuery) response shape. Raw text -> VehicleDetail, which
// the store merges into the pooled Listing to power the structured filters
// (fuel, transmission, exact mileage, title, seller, color) that the search feed
// can't provide. Mirror of adapter.ts; all field paths live here.

import type {
  VehicleDetail,
  FuelType,
  Transmission,
  SellerKind,
  TitleStatus,
} from './types';

const FB = {
  target: (doc: any) => doc?.data?.viewer?.marketplace_product_details_page?.target,
  id: (t: any) => t?.id,
  fuel: (t: any) => t?.vehicle_fuel_type,
  transmission: (t: any) => t?.vehicle_transmission_type,
  odometer: (t: any) => t?.vehicle_odometer_data, // { unit, value }
  make: (t: any) => t?.vehicle_make_display_name,
  model: (t: any) => t?.vehicle_model_display_name,
  trim: (t: any) => t?.vehicle_trim_display_name,
  seller: (t: any) => t?.vehicle_seller_type,
  exteriorColor: (t: any) => t?.vehicle_exterior_color,
  interiorColor: (t: any) => t?.vehicle_interior_color,
  titleStatus: (t: any) => t?.vehicle_title_status,
  owners: (t: any) => t?.vehicle_number_of_owners,
  vin: (t: any) => t?.vehicle_identification_number,
} as const;

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
  /** listing id the detail belongs to — used to match it to the pooled listing */
  id: string | null;
  detail: VehicleDetail | null;
  /** parsed a response but the vehicle target was missing (shape changed) */
  schemaMiss: boolean;
}

function firstDoc(rawResponseText: string): any {
  for (const line of rawResponseText.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    try {
      const doc = JSON.parse(s);
      if (FB.target(doc)) return doc;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

export function extractVehicleDetail(rawResponseText: string): PdpResult {
  const doc = firstDoc(rawResponseText);
  const t = doc ? FB.target(doc) : undefined;
  if (!t) return { id: null, detail: null, schemaMiss: true };

  const detail: VehicleDetail = {};

  const fuelRaw = FB.fuel(t);
  if (typeof fuelRaw === 'string' && fuelRaw) detail.fuel = FUEL[fuelRaw] ?? 'other';

  const transRaw = FB.transmission(t);
  if (typeof transRaw === 'string' && TRANS[transRaw]) detail.transmission = TRANS[transRaw];

  const od = FB.odometer(t);
  if (od && typeof od.value === 'number') {
    detail.mileage = od.unit === 'KILOMETERS' ? Math.round(od.value * 0.621371) : od.value;
  }

  const sellerRaw = FB.seller(t);
  if (typeof sellerRaw === 'string' && SELLER[sellerRaw]) detail.seller = SELLER[sellerRaw];

  const titleRaw = FB.titleStatus(t);
  if (typeof titleRaw === 'string' && titleRaw) detail.titleStatus = TITLE[titleRaw] ?? 'other';

  const ownersRaw = FB.owners(t);
  if (typeof ownersRaw === 'string' && OWNERS[ownersRaw] !== undefined) detail.numberOfOwners = OWNERS[ownersRaw];
  else if (typeof ownersRaw === 'number' && ownersRaw > 0) detail.numberOfOwners = ownersRaw;

  const make = str(FB.make(t));
  if (make) detail.make = make;
  const model = str(FB.model(t));
  if (model) detail.model = model;
  const trim = str(FB.trim(t));
  if (trim) detail.trim = trim;
  const ext = str(FB.exteriorColor(t));
  if (ext) detail.exteriorColor = ext;
  const int = str(FB.interiorColor(t));
  if (int) detail.interiorColor = int;
  const vin = str(FB.vin(t));
  if (vin) detail.vin = vin.toUpperCase();

  const rawId = FB.id(t);
  return { id: rawId === null || rawId === undefined ? null : String(rawId), detail, schemaMiss: false };
}
