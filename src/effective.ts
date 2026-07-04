// effective.ts — the "which value do we actually use" helpers. A field can come
// from the title parser or the (authoritative) detail page; these encode the
// precedence once, so filters, sort, and deal score all agree. `undefined` means
// genuinely unknown — callers treat that as "don't hide", never as a mismatch.

import type { Listing, FuelType, Transmission, SellerKind, TitleStatus, Drivetrain } from './types';

export const effYear = (l: Listing): number | undefined => l.vehicle.year; // year is title-only (not on the PDP)
export const effMileage = (l: Listing): number | undefined => l.detail?.mileage ?? l.vehicle.mileage;
export const effMake = (l: Listing): string | undefined => l.detail?.make ?? l.vehicle.make;
export const effModel = (l: Listing): string | undefined => l.detail?.model ?? l.vehicle.model;
export const effTrim = (l: Listing): string | undefined => l.detail?.trim ?? l.vehicle.trim;
export const effBodyStyle = (l: Listing): string | undefined => l.vehicle.bodyStyle;
export const effDrivetrain = (l: Listing): Drivetrain | undefined => l.vehicle.drivetrain; // title-only
export const effFuel = (l: Listing): FuelType | undefined => l.detail?.fuel; // detail-only
export const effTransmission = (l: Listing): Transmission | undefined => l.detail?.transmission; // detail-only
export const effSeller = (l: Listing): SellerKind | undefined => l.detail?.seller; // detail-only
export const effTitleStatus = (l: Listing): TitleStatus | undefined => l.detail?.titleStatus; // detail-only
export const effColor = (l: Listing): string | undefined => l.detail?.exteriorColor; // detail-only
