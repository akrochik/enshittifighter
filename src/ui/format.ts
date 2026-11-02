// format.ts — user-facing labels and number formatting for the sidebar. Pure, so
// it's unit-testable. Nothing here reveals where a value came from (title vs.
// detail page): the shipped UI shows information, not provenance.

import type { FuelType, Transmission, DealBucket } from '../types';

export const FUEL_LABEL: Record<FuelType, string> = { gas: 'Gas', diesel: 'Diesel', hybrid: 'Hybrid', electric: 'Electric', other: 'Other' };
export const TRANS_LABEL: Record<Transmission, string> = { automatic: 'Auto', manual: 'Manual' };
export const DRIVE_LABEL: Record<string, string> = { '4wd': '4x4', awd: 'AWD', '2wd': '2WD', rwd: 'RWD', fwd: 'FWD' };
export const DEAL_LABEL: Record<DealBucket, string> = { great: 'Great deal', good: 'Good deal', fair: 'Fair price', high: 'High price' };

const UPPER = new Set(['hd', 'gmc', 'awd', 'ram', 'gt', 'gle', 'gla', 'cla', 'amg', 'es', 'is', 'gti', 'suv', 'ev', 'sle', 'xle', 'se', 'le', 'ex', 'exl', 'sel', 'sxt']);

// One word (or hyphen part) for display: codes go upper-case ("GLK", "X5", "LTZ",
// "CR-V"), plain words get a capital ("Silverado", "Mercedes-Benz", "C-Class").
function casePart(w: string): string {
  if (!w) return w;
  if (UPPER.has(w)) return w.toUpperCase();
  if (/^\d/.test(w)) return w.replace(/hd$/i, 'HD'); // "2500hd", "4runner", "911"
  if (/^[a-z]{1,3}\d+[a-z]{0,2}$/.test(w)) return w.toUpperCase(); // x5, q7, rs6, xc90, v60
  if (/^[a-z]{1,3}$/.test(w) && !/[aeiouy]/.test(w)) return w.toUpperCase(); // glk, ltz, rx, mdx
  return w.charAt(0).toUpperCase() + w.slice(1);
}
export function titleCase(s?: string): string {
  if (!s) return '';
  return s
    .split(' ')
    .map((w) => w.split('-').map(casePart).join('-'))
    .join(' ');
}

export const fmtMiles = (n?: number): string => (n === undefined ? '' : n >= 1000 ? `${Math.round(n / 1000)}k mi` : `${n} mi`);
export const fmtPrice = (n: number | null): string => (n === null ? '—' : '$' + n.toLocaleString('en-US'));
export const fmtDelta = (n: number): string => (n >= 0 ? '' : `$${Math.round(-n / 100) / 10}k under similar`);

/** Compact amount for filter summaries: 15000 -> "15k", 1500 -> "1.5k", 850 -> "850". */
export function shortAmount(n: number): string {
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return `${k}k`;
}
