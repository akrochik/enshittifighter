// parser.ts — turn a free-text listing title into a structured ParsedVehicle.
// Pure and deterministic: no Facebook knowledge, no I/O. This is the piece the
// title-based filters lean on when the detail page hasn't been fetched.
//
// Facebook gives us a fairly normalized `marketplace_listing_title`, but it's
// still messy: "2006 Silverado 2500hd" (no make word), "2007 Chevrolet 2500 HD"
// (no model word), "...silverado 4x4 2500 diesel truck". So we regex the year /
// mileage / drivetrain and run a small make/model dictionary with inference.

import type { ParsedVehicle, Drivetrain, ParseConfidence } from './types';

const CURRENT_YEAR = 2026;

// --- make aliases (folded to canonical) ---
const MAKE_ALIASES: Record<string, string[]> = {
  chevrolet: ['chevrolet', 'chevy'],
  gmc: ['gmc'],
  ford: ['ford'],
  ram: ['ram', 'dodge'],
  toyota: ['toyota'],
  nissan: ['nissan'],
  honda: ['honda'],
  jeep: ['jeep'],
};

// --- model families that also imply a make (e.g. "silverado" -> chevrolet) ---
interface Family {
  kw: string;
  make: string;
  weightClass?: boolean; // takes a 1500/2500/3500 class + optional hd
}
const FAMILIES: Family[] = [
  { kw: 'silverado', make: 'chevrolet', weightClass: true },
  { kw: 'sierra', make: 'gmc', weightClass: true },
  { kw: 'colorado', make: 'chevrolet' },
  { kw: 'tahoe', make: 'chevrolet' },
  { kw: 'suburban', make: 'chevrolet' },
  { kw: 'canyon', make: 'gmc' },
  { kw: 'tundra', make: 'toyota' },
  { kw: 'tacoma', make: 'toyota' },
  { kw: 'titan', make: 'nissan' },
  { kw: 'frontier', make: 'nissan' },
  { kw: 'ranger', make: 'ford' },
  { kw: 'civic', make: 'honda' },
  { kw: 'accord', make: 'honda' },
  { kw: 'wrangler', make: 'jeep' },
];

// trims, longest-first so "ltz" beats "lt" and "laramie longhorn" beats "laramie"
const TRIMS: string[] = [
  'high country', 'king ranch', 'laramie longhorn', 'trd pro', 'work truck',
  'big horn', 'trail boss', 'eddie bauer', 'tradesman', 'denali', 'platinum',
  'limited', 'laramie', 'lariat', 'rebel', 'z71', 'ltz', 'slt', 'sle', 'sr5',
  'rst', 'xlt', 'trd', 'fx4', 'lt', 'ls', 'xl', 'wt',
].sort((a, b) => b.length - a.length);
const TRIM_ALIASES: Record<string, string> = { 'work truck': 'wt' };

// cab / body styles, longest-first
const BODIES: string[] = [
  'extended cab', 'regular cab', 'double cab', 'quad cab', 'super cab',
  'access cab', 'king cab', 'mega cab', 'crew cab', 'supercrew', 'super crew',
  'crewmax', 'ext cab', 'reg cab',
].sort((a, b) => b.length - a.length);
const BODY_ALIASES: Record<string, string> = {
  'ext cab': 'extended cab',
  'reg cab': 'regular cab',
  'super crew': 'supercrew',
};

const has = (t: string, kw: string): boolean =>
  new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t);

function extractYear(t: string): number | undefined {
  const m = t.match(/\b(19[0-9]\d|20[0-4]\d)\b/g);
  if (!m) return undefined;
  for (const y of m) {
    const n = Number(y);
    if (n >= 1900 && n <= CURRENT_YEAR + 1) return n;
  }
  return undefined;
}

function extractMileage(t: string): number | undefined {
  // "168k", "168k miles", "38k mi"
  let m = t.match(/\b(\d{1,3})\s?k(?:\s?(?:miles|mile|mi))?\b/);
  if (m?.[1]) return Number(m[1]) * 1000;
  // "170,000 miles"
  m = t.match(/\b(\d{1,3},\d{3})\s?(?:miles|mile|mi)\b/);
  if (m?.[1]) return Number(m[1].replace(/,/g, ''));
  // "170000 miles"
  m = t.match(/\b(\d{4,6})\s?(?:miles|mile|mi)\b/);
  if (m?.[1]) return Number(m[1]);
  return undefined;
}

function extractDrivetrain(t: string): Drivetrain | undefined {
  if (/\b(4x4|4wd|4 wd|four wheel drive)\b/.test(t)) return '4wd';
  if (/\bawd\b/.test(t)) return 'awd';
  if (/\b(2wd|2 wd)\b/.test(t)) return '2wd';
  if (/\brwd\b/.test(t)) return 'rwd';
  if (/\bfwd\b/.test(t)) return 'fwd';
  return undefined;
}

function firstMatch(t: string, list: string[], aliases: Record<string, string>): string | undefined {
  for (const kw of list) if (has(t, kw)) return aliases[kw] ?? kw;
  return undefined;
}

function detectMake(t: string): string | undefined {
  for (const make of Object.keys(MAKE_ALIASES)) {
    const aliases = MAKE_ALIASES[make];
    if (aliases && aliases.some((a) => has(t, a))) return make;
  }
  return undefined;
}

// weight class for pickups: "2500", "2500 hd", "2500hd" -> { cls:"2500", hd:true }
function detectWeightClass(t: string): { cls: string; hd: boolean } | undefined {
  // match "2500" even when glued to "hd" ("2500hd") — but not inside a longer
  // number like "250000" (a comma-less mileage).
  const m = t.match(/\b([123])500(?!\d)/);
  if (!m) return undefined;
  const cls = `${m[1]}500`;
  // "hd" may appear at a different occurrence than the first class hit, so scan the whole title.
  const hd = new RegExp(`\\b${cls}\\s?-?\\s?hd\\b`).test(t);
  return { cls, hd };
}

interface ModelResult {
  model: string;
  makeFromModel?: string;
  modelInferred: boolean;
}

function detectModel(t: string, make: string | undefined): ModelResult | undefined {
  // 1) explicit family keyword (also implies a make)
  const fam = FAMILIES.find((f) => has(t, f.kw));
  if (fam) {
    if (fam.weightClass) {
      const wc = detectWeightClass(t);
      const model = wc ? `${fam.kw} ${wc.cls}${wc.hd ? 'hd' : ''}` : fam.kw;
      return { model, makeFromModel: fam.make, modelInferred: false };
    }
    return { model: fam.kw, makeFromModel: fam.make, modelInferred: false };
  }

  // 2) Ford F-series: "f-150", "f250", "f 350"
  const fseries = t.match(/\bf[-\s]?([123])50\b/);
  if (fseries) return { model: `f-${fseries[1]}50`, makeFromModel: 'ford', modelInferred: false };

  // 3) bare weight class + a known make -> infer the family model
  const wc = detectWeightClass(t);
  if (wc) {
    const eff = make ?? detectMake(t);
    if (eff === 'chevrolet') return { model: `silverado ${wc.cls}${wc.hd ? 'hd' : ''}`, modelInferred: true };
    if (eff === 'gmc') return { model: `sierra ${wc.cls}${wc.hd ? 'hd' : ''}`, modelInferred: true };
    if (eff === 'ram') return { model: `ram ${wc.cls}${wc.hd ? 'hd' : ''}`, modelInferred: true };
  }
  return undefined;
}

export function parseVehicleTitle(rawTitle: string): ParsedVehicle {
  const t = ` ${(rawTitle || '').toLowerCase()} `.replace(/\s+/g, ' ');

  const year = extractYear(t);
  const mileage = extractMileage(t);
  const drivetrain = extractDrivetrain(t);
  const trimRaw = firstMatch(t, TRIMS, TRIM_ALIASES);
  const bodyStyle = firstMatch(t, BODIES, BODY_ALIASES);

  let make = detectMake(t);
  let makeInferred = false;
  const modelRes = detectModel(t, make);
  let model: string | undefined;
  let modelInferred = false;

  if (modelRes) {
    model = modelRes.model;
    modelInferred = modelRes.modelInferred;
    if (!make && modelRes.makeFromModel) {
      make = modelRes.makeFromModel;
      makeInferred = true;
    }
  }

  let confidence: ParseConfidence;
  if (!make || !model) confidence = 'none';
  else if (makeInferred || modelInferred || year === undefined) confidence = 'partial';
  else confidence = 'full';

  const v: ParsedVehicle = { confidence };
  if (year !== undefined) v.year = year;
  if (make) v.make = make;
  if (model) v.model = model;
  if (trimRaw) v.trim = trimRaw;
  if (bodyStyle) v.bodyStyle = bodyStyle;
  if (mileage !== undefined) v.mileage = mileage;
  if (drivetrain) v.drivetrain = drivetrain;
  if (makeInferred) v.makeInferred = true;
  if (modelInferred) v.modelInferred = true;
  return v;
}
