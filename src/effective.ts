// effective.ts — the "which value do we actually use" helpers. A field can come
// from the title parser or the (authoritative) detail page; these encode the
// precedence once, so filters, sort, and deal score all agree. `undefined` means
// genuinely unknown — callers treat that as "don't hide", never as a mismatch.

import type { Listing, FuelType, Transmission, SellerKind, TitleStatus, Drivetrain, VehicleDetail, ParsedVehicle } from './types';
import { parseVehicleTitle } from './parser';

// The detail page's make/model are Facebook's display names ("GLK-Class",
// "Mercedes-AMG GLE") or, for some listings, seller free text. Run them through
// the same dictionary as titles so both sources land on one vocabulary and the
// make/model chips don't split one model into several. Cached per detail object.
const detailNames = new WeakMap<VehicleDetail, ParsedVehicle>();
function canonicalDetail(d: VehicleDetail): ParsedVehicle {
  let p = detailNames.get(d);
  if (!p) {
    p = parseVehicleTitle(`${d.make ?? ''} ${d.model ?? ''}`);
    detailNames.set(d, p);
  }
  return p;
}

export const effYear = (l: Listing): number | undefined => l.vehicle.year; // year is title-only (not on the PDP)
export const effMileage = (l: Listing): number | undefined => l.detail?.mileage ?? l.vehicle.mileage;
export const effMake = (l: Listing): string | undefined => {
  const d = l.detail;
  if (!d?.make) return l.vehicle.make;
  return canonicalDetail(d).make ?? d.make;
};
// Detail model wins when the dictionary recognizes it; otherwise prefer the
// title's recognized model over an unrecognized detail string.
export const effModel = (l: Listing): string | undefined => {
  const d = l.detail;
  if (!d?.model) return l.vehicle.model;
  return canonicalDetail(d).model ?? l.vehicle.model ?? d.model;
};
export const effTrim = (l: Listing): string | undefined => l.detail?.trim ?? l.vehicle.trim;
export const effBodyStyle = (l: Listing): string | undefined => l.vehicle.bodyStyle;
export const effDrivetrain = (l: Listing): Drivetrain | undefined => l.vehicle.drivetrain; // title-only
export const effFuel = (l: Listing): FuelType | undefined => l.detail?.fuel ?? l.vehicle.fuel; // detail authoritative, else title-mined
export const effTransmission = (l: Listing): Transmission | undefined => l.detail?.transmission; // detail-only
export const effSeller = (l: Listing): SellerKind | undefined => l.detail?.seller; // detail-only
export const effTitleStatus = (l: Listing): TitleStatus | undefined => l.detail?.titleStatus; // detail-only
export const effColor = (l: Listing): string | undefined => l.detail?.exteriorColor; // detail-only
