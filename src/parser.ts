// parser.ts — turn a free-text listing title into a structured ParsedVehicle.
// Pure and deterministic: no Facebook knowledge, no I/O. This is the piece the
// title-based filters lean on when the detail page hasn't been fetched.
//
// Facebook gives us a fairly normalized `marketplace_listing_title`, but it's
// still messy: "2006 Silverado 2500hd" (no make word), "2007 Chevrolet 2500 HD"
// (no model word), "...silverado 4x4 2500 diesel truck". So we regex the year /
// mileage / drivetrain and run the make/model dictionary (vehicleDb) with inference.

import type { ParsedVehicle, Drivetrain, FuelType, ParseConfidence } from './types';
import { MAKES, MODELS, INFER_MAKE_FROM, PATTERNS, PATTERN_FIRST } from './vehicleDb';


const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// keyword -> regex source where a space/hyphen also matches nothing
const kwSource = (kw: string): string => escapeRe(kw).replace(/[-\s]+/g, '[-\\s]?');
const wordRe = (src: string): RegExp => new RegExp(`(?<![a-z0-9])${src}(?![a-z0-9])`);

interface Family {
  make: string;
  model: string;
  re: RegExp;
  kwLength: number;
  weightClass: boolean; // takes a 1500/2500/3500… class + optional hd
}
const WEIGHT_CLASS_FAMILIES = new Set(['silverado', 'sierra']);

const FAMILIES: Record<string, Family[]> = {};
for (const [make, entries] of Object.entries(MODELS)) {
  FAMILIES[make] = entries
    .map((e): Family => {
      const [kw, model] = typeof e === 'string' ? [e, e] : e;
      return { make, model, re: wordRe(kwSource(kw)), kwLength: kw.length, weightClass: WEIGHT_CLASS_FAMILIES.has(model) };
    })
    .sort((a, b) => b.kwLength - a.kwLength); // longest first: "grand cherokee" beats "cherokee"
}

// Inference candidates: allow-listed AND owned by exactly one make.
const modelOwners = new Map<string, Set<string>>();
for (const f of Object.values(FAMILIES).flat()) {
  const owners = modelOwners.get(f.model) ?? new Set<string>();
  owners.add(f.make);
  modelOwners.set(f.model, owners);
}
const INFERABLE: Family[] = Object.values(FAMILIES)
  .flat()
  .filter((f) => INFER_MAKE_FROM.has(f.model) && modelOwners.get(f.model)!.size === 1)
  .sort((a, b) => b.kwLength - a.kwLength);

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

const HAS_CACHE = new Map<string, RegExp>();
const has = (t: string, kw: string): boolean => {
  let re = HAS_CACHE.get(kw);
  if (!re) {
    re = new RegExp(`\\b${escapeRe(kw)}\\b`);
    HAS_CACHE.set(kw, re);
  }
  return re.test(t);
};

function extractYear(t: string): number | undefined {
  const m = t.match(/\b(19[0-9]\d|20[0-4]\d)\b/g);
  if (!m) return undefined;
  for (const y of m) {
    const n = Number(y);
    if (n >= 1900 && n <= new Date().getFullYear() + 1) return n; // next model year is on sale
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

// Only high-confidence signals — a truck that names its diesel engine is definitely
// diesel. We do NOT guess "gas" from weak cues (that's the enrichment's job); leaving
// it undefined keeps the never-hide behavior for the genuinely-unknown ones.
function extractFuel(t: string): FuelType | undefined {
  if (/\b(diesel|duramax|cummins|power ?stroke|turbo ?diesel|l5p|lb7|lbz|lly|lml)\b/.test(t)) return 'diesel';
  if (/\bgasoline\b/.test(t)) return 'gas';
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  return undefined;
}

function firstMatch(t: string, list: string[], aliases: Record<string, string>): string | undefined {
  for (const kw of list) if (has(t, kw)) return aliases[kw] ?? kw;
  return undefined;
}

const MAKE_RES: [string, RegExp][] = MAKES.flatMap(([make, aliases]) =>
  aliases.map((a): [string, RegExp] => [make, new RegExp(`(?<![a-z0-9])${escapeRe(a)}(?![a-z0-9])`)]),
);

// The make named EARLIEST in the title wins ("2012 Hyundai Genesis" -> hyundai).
function detectMake(t: string): string | undefined {
  let best: string | undefined;
  let bestAt = Infinity;
  for (const [make, re] of MAKE_RES) {
    const m = re.exec(t);
    if (m && m.index < bestAt) {
      best = make;
      bestAt = m.index;
    }
  }
  // pre-2010 Ram pickups were sold as "Dodge Ram" — fold those into ram,
  // but leave Dodge's cars (Charger, Durango…) as dodge.
  if (best === 'dodge' && (/\bram\b/.test(t) || detectWeightClass(t))) return 'ram';
  return best;
}

// Weight class for pickups/chassis cabs: "2500", "2500 hd", "2500hd", "k2500",
// "3500hd", "5500" -> { cls:"2500", hd:true }. Not inside a longer number like
// "250000" (a comma-less mileage) and not a mileage itself ("1500 miles").
const WEIGHT_CLASS = /(?<![a-z0-9])[ck]?([1-6])500(?!\d)(?!\s?(?:miles?|mi|km)\b)/;
export function detectWeightClass(t: string): { cls: string; hd: boolean } | undefined {
  const m = t.match(WEIGHT_CLASS);
  if (!m) return undefined;
  const cls = `${m[1]}500`;
  // "hd" may appear at a different occurrence than the first class hit, so scan the whole title.
  const hd = new RegExp(`(?<!\\d)${cls}\\s?-?\\s?hd\\b`).test(t);
  return { cls, hd };
}

interface ModelResult {
  model: string;
  makeFromModel?: string;
  modelInferred: boolean;
}

function familyModel(fam: Family, t: string): string {
  if (!fam.weightClass) return fam.model;
  const wc = detectWeightClass(t);
  return wc ? `${fam.model} ${wc.cls}${wc.hd ? 'hd' : ''}` : fam.model;
}

function detectModel(t: string, make: string | undefined): ModelResult | undefined {
  if (make) {
    // 1) a family keyword of THIS make, or a lineup named by pattern (Mercedes
    //    "GLK 350", BMW "328i", Audi "Q5", Ford "F-250"); some makes check the pattern first
    const byKeyword = (): string | undefined => {
      const fam = (FAMILIES[make] ?? []).find((f) => f.re.test(t));
      return fam ? familyModel(fam, t) : undefined;
    };
    const byPattern = (): string | undefined => PATTERNS[make]?.(t);
    const model = PATTERN_FIRST.has(make) ? byPattern() ?? byKeyword() : byKeyword() ?? byPattern();
    if (model) return { model, modelInferred: false };

    // 2) bare weight class + a truck make -> infer the family model
    const wc = detectWeightClass(t);
    if (wc) {
      const hd = wc.hd ? 'hd' : '';
      if (make === 'chevrolet') return { model: `silverado ${wc.cls}${hd}`, modelInferred: true };
      if (make === 'gmc') return { model: `sierra ${wc.cls}${hd}`, modelInferred: true };
      if (make === 'ram') return { model: `ram ${wc.cls}${hd}`, modelInferred: true };
    }
    return undefined;
  }

  // No make in the title: only distinctive model names may imply one.
  const fam = INFERABLE.find((f) => f.re.test(t));
  if (fam) return { model: familyModel(fam, t), makeFromModel: fam.make, modelInferred: false };
  const fs = PATTERNS.ford?.(t);
  if (fs?.startsWith('f-')) return { model: fs, makeFromModel: 'ford', modelInferred: false };
  return undefined;
}

export function parseVehicleTitle(rawTitle: string): ParsedVehicle {
  const t = ` ${(rawTitle || '').toLowerCase()} `.replace(/\s+/g, ' ');

  const year = extractYear(t);
  const mileage = extractMileage(t);
  const drivetrain = extractDrivetrain(t);
  const fuel = extractFuel(t);
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
  if (trimRaw && trimRaw !== model) v.trim = trimRaw; // Lexus "LS 460": LS is the model, not a trim
  if (bodyStyle) v.bodyStyle = bodyStyle;
  if (mileage !== undefined) v.mileage = mileage;
  if (drivetrain) v.drivetrain = drivetrain;
  if (fuel) v.fuel = fuel;
  if (makeInferred) v.makeInferred = true;
  if (modelInferred) v.modelInferred = true;
  return v;
}
