// filterUi.ts — the sidebar's filter bookkeeping, kept out of React so it's
// unit-testable: defaults, parsing what the user types, the "active filters"
// summary, scoping make/model to one search, and validating persisted state.

import type { FilterState, SortPreset } from '../filters';
import { SORT_PRESETS } from '../filters';
import { titleCase, FUEL_LABEL, TRANS_LABEL, DEAL_LABEL, shortAmount } from './format';

/** What a fresh install (or "Reset") starts with: the two opt-in hides on. */
export const DEFAULT_FILTERS: FilterState = { hideSponsored: true, hideSoldPending: true };

export const SORT_LABEL: Record<SortPreset, string> = {
  cheapest: 'Cheapest first',
  priciest: 'Priciest first',
  deal: 'Best deals first',
  newest: 'Newest listings',
  miles: 'Lowest miles',
  year: 'Newest model year',
};

export const LISTED_OPTIONS: { days: number; label: string }[] = [
  { days: 1, label: '24 hours' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'Week' },
  { days: 30, label: 'Month' },
];

/**
 * What the user typed into a number box -> a number, or undefined (no limit).
 * Accepts "15000", "15,000", "$15k", "1.5k", "150k mi"; anything else is invalid.
 */
export function parseAmount(s: string): number | undefined {
  const t = s.trim().toLowerCase().replace(/[$,\s]|mi(les?)?$/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!m) return undefined;
  return Math.round(Number(m[1]) * (m[2] ? 1000 : 1));
}
/** True if a box holds text that parseAmount can't read (shown as invalid, filter not applied). */
export const isBadAmount = (s: string): boolean => s.trim() !== '' && parseAmount(s) === undefined;

export interface ActiveChip {
  id: string;
  label: string;
  /** The patch that removes just this restriction. */
  clear: Partial<FilterState>;
}

function range(lo: number | undefined, hi: number | undefined, fmt: (n: number) => string): string {
  if (lo !== undefined && hi !== undefined) return `${fmt(lo)}–${fmt(hi)}`;
  if (lo !== undefined) return `${fmt(lo)}+`;
  return `≤ ${fmt(hi!)}`;
}

/** One removable chip per active restriction (the default hides aren't restrictions the user added). */
export function activeChips(f: FilterState): ActiveChip[] {
  const out: ActiveChip[] = [];
  const each = <T extends string>(key: keyof FilterState, vals: T[] | undefined, label: (v: T) => string): void => {
    for (const v of vals ?? []) {
      out.push({ id: `${key}:${v}`, label: label(v), clear: { [key]: vals!.filter((x) => x !== v) } });
    }
  };
  each('makes', f.makes, titleCase);
  each('models', f.models, titleCase);
  if (f.yearMin !== undefined || f.yearMax !== undefined) {
    out.push({ id: 'year', label: range(f.yearMin, f.yearMax, String), clear: { yearMin: undefined, yearMax: undefined } });
  }
  if (f.priceMin !== undefined || f.priceMax !== undefined) {
    out.push({ id: 'price', label: range(f.priceMin, f.priceMax, (n) => `$${shortAmount(n)}`), clear: { priceMin: undefined, priceMax: undefined } });
  }
  if (f.milesMin !== undefined || f.milesMax !== undefined) {
    out.push({ id: 'miles', label: `${range(f.milesMin, f.milesMax, shortAmount)} mi`, clear: { milesMin: undefined, milesMax: undefined } });
  }
  if (f.keyword?.trim()) out.push({ id: 'keyword', label: `“${f.keyword.trim()}”`, clear: { keyword: undefined } });
  each('fuels', f.fuels, (v) => FUEL_LABEL[v]);
  each('transmissions', f.transmissions, (v) => TRANS_LABEL[v]);
  each('deals', f.deals, (v) => DEAL_LABEL[v]);
  if (f.listedWithinDays !== undefined) {
    const o = LISTED_OPTIONS.find((x) => x.days === f.listedWithinDays);
    out.push({ id: 'listed', label: `Listed in last ${o ? o.label.toLowerCase() : `${f.listedWithinDays} days`}`, clear: { listedWithinDays: undefined } });
  }
  if (f.titleCleanOnly) out.push({ id: 'clean', label: 'Clean title', clear: { titleCleanOnly: false } });
  if (f.privateOnly) out.push({ id: 'private', label: 'Private sellers', clear: { privateOnly: false } });
  return out;
}

/**
 * A new search gets a fresh pool, so make/model picks from the old one would
 * silently hide the new results (and their chips might not even be on screen).
 * Everything else — price, year, miles, fuel… — is a preference that carries over.
 */
export function forNewSearch(f: FilterState): FilterState {
  if (!f.makes?.length && !f.models?.length) return f;
  return { ...f, makes: undefined, models: undefined };
}

// --- persisted state (validated on load: storage may hold an older version's shape) ---

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const strs = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length > 0 ? (v as string[]) : undefined;

// Closed vocabularies: a stale value here (one a later version dropped) would match
// nothing and hide every listing whose value is known, so those are filtered out.
const ALLOWED: Partial<Record<keyof FilterState, ReadonlySet<string>>> = {
  fuels: new Set(Object.keys(FUEL_LABEL)),
  transmissions: new Set(Object.keys(TRANS_LABEL)),
  deals: new Set(Object.keys(DEAL_LABEL)),
  drivetrains: new Set(['4wd', 'awd', '2wd', 'rwd', 'fwd']),
};

/** Keep only well-typed fields; anything malformed is dropped (= no restriction). */
export function sanitizeFilters(raw: unknown): FilterState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FILTERS };
  const r = raw as Record<string, unknown>;
  const f: FilterState = {};
  for (const k of ['makes', 'models', 'fuels', 'transmissions', 'cabStyles', 'trims', 'colors', 'drivetrains', 'deals'] as const) {
    const allowed = ALLOWED[k];
    const v = strs(r[k])?.filter((x) => !allowed || allowed.has(x));
    if (v?.length) (f as Record<string, unknown>)[k] = v;
  }
  for (const k of ['yearMin', 'yearMax', 'priceMin', 'priceMax', 'milesMin', 'milesMax', 'listedWithinDays'] as const) {
    if (isNum(r[k])) f[k] = r[k] as number;
  }
  for (const k of ['titleCleanOnly', 'privateOnly', 'hideSponsored', 'hideSoldPending'] as const) {
    if (typeof r[k] === 'boolean') f[k] = r[k] as boolean;
  }
  if (typeof r.keyword === 'string' && r.keyword.trim()) f.keyword = r.keyword;
  return f;
}

export const sanitizeSort = (raw: unknown): SortPreset =>
  typeof raw === 'string' && raw in SORT_PRESETS ? (raw as SortPreset) : 'cheapest';
