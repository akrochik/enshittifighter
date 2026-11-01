// parser.ts — turn a free-text listing title into a structured ParsedVehicle.
// Pure and deterministic: no Facebook knowledge, no I/O. This is the piece the
// title-based filters lean on when the detail page hasn't been fetched.
//
// Facebook gives us a fairly normalized `marketplace_listing_title`, but it's
// still messy: "2006 Silverado 2500hd" (no make word), "2007 Chevrolet 2500 HD"
// (no model word), "...silverado 4x4 2500 diesel truck". So we regex the year /
// mileage / drivetrain and run a small make/model dictionary with inference.

import type { ParsedVehicle, Drivetrain, FuelType, ParseConfidence } from './types';

const CURRENT_YEAR = 2026;

// --- makes: canonical name -> title spellings. Canonical names follow Facebook's
// own make names (lowercased) so a title-parsed make and a detail-page make agree.
const MAKES: [string, string[]][] = [
  ['chevrolet', ['chevrolet', 'chevy']],
  ['gmc', ['gmc']],
  ['ford', ['ford']],
  ['ram', ['ram']],
  ['dodge', ['dodge']],
  ['toyota', ['toyota']],
  ['nissan', ['nissan']],
  ['honda', ['honda']],
  ['jeep', ['jeep']],
  ['mercedes-benz', ['mercedes-benz', 'mercedes benz', 'mercedes', 'benz']],
  ['bmw', ['bmw']],
  ['audi', ['audi']],
  ['porsche', ['porsche']],
  ['volvo', ['volvo']],
  ['lexus', ['lexus']],
  ['acura', ['acura']],
  ['infiniti', ['infiniti', 'infinity']],
  ['cadillac', ['cadillac']],
  ['buick', ['buick']],
  ['lincoln', ['lincoln']],
  ['chrysler', ['chrysler']],
  ['hyundai', ['hyundai']],
  ['kia', ['kia']],
  ['genesis', ['genesis']],
  ['subaru', ['subaru']],
  ['mazda', ['mazda']],
  ['mitsubishi', ['mitsubishi']],
  ['volkswagen', ['volkswagen', 'vw']],
  ['tesla', ['tesla']],
  ['land rover', ['land rover', 'range rover']],
  ['jaguar', ['jaguar']],
  ['mini', ['mini cooper', 'mini countryman', 'mini clubman']],
  ['alfa romeo', ['alfa romeo']],
  ['fiat', ['fiat']],
  ['maserati', ['maserati']],
  ['bentley', ['bentley']],
  ['ferrari', ['ferrari']],
  ['lamborghini', ['lamborghini']],
  ['rolls-royce', ['rolls-royce', 'rolls royce']],
  ['aston martin', ['aston martin']],
  ['mclaren', ['mclaren']],
  ['polestar', ['polestar']],
  ['rivian', ['rivian']],
  ['lucid', ['lucid']],
  ['pontiac', ['pontiac']],
  ['saturn', ['saturn']],
  ['scion', ['scion']],
  ['mercury', ['mercury']],
  ['hummer', ['hummer']],
  ['isuzu', ['isuzu']],
  ['saab', ['saab']],
  ['suzuki', ['suzuki']],
];

// --- model families per make. A string is both the title keyword and the
// canonical model; a [keyword, canonical] pair folds a spelling. In keywords, a
// space or hyphen also matches "no separator" ("cr-v" matches "crv", "cr v").
type ModelEntry = string | [string, string];
const MODELS: Record<string, ModelEntry[]> = {
  chevrolet: [
    'silverado', 'colorado', 'tahoe', 'suburban', 'camaro', 'corvette', 'malibu', 'equinox',
    'traverse', 'impala', 'cruze', 'trailblazer', 'blazer', 'trax', 'avalanche', 'express',
    ['s10', 's-10'], ['s-10', 's-10'], 'bolt', 'volt', 'sonic', 'spark', 'cobalt', 'hhr', 'monte carlo', 'caprice', 'el camino',
  ],
  gmc: ['sierra', 'canyon', 'yukon', 'acadia', 'terrain', 'envoy', 'savana', 'jimmy', 'sonoma', 'hummer ev'],
  ford: [
    'ranger', 'mustang', 'explorer', 'expedition', 'escape', 'edge', 'bronco sport', 'bronco',
    'fusion', 'focus', 'fiesta', 'taurus', 'flex', 'transit connect', 'transit', 'maverick',
    'econoline', 'excursion', 'crown victoria', 'thunderbird', 'ecosport', 'freestar', 'windstar',
  ],
  ram: ['promaster city', 'promaster'],
  dodge: [
    'charger', 'challenger', 'durango', 'journey', 'grand caravan', 'caravan', 'dart', 'avenger',
    'viper', 'nitro', 'dakota', 'magnum', 'neon', 'hornet', 'caliber', 'stratus',
  ],
  toyota: [
    'tundra', 'tacoma', 'camry', 'corolla cross', 'corolla', 'rav4', 'highlander', '4runner', 'sienna',
    'prius', 'sequoia', 'land cruiser', 'avalon', 'venza', 'c-hr', 'supra', 'fj cruiser', 'yaris',
    'gr86', 'matrix', 'solara', 'celica', 'grand highlander',
  ],
  nissan: [
    'titan', 'frontier', 'altima', 'maxima', 'sentra', 'versa', 'rogue', 'murano', 'pathfinder',
    'armada', 'xterra', 'juke', 'kicks', 'leaf', '350z', '370z', 'gt-r', 'quest', 'nv200', 'nv',
  ],
  honda: [
    'civic', 'accord', 'cr-v', 'hr-v', 'pilot', 'odyssey', 'ridgeline', 'fit', 'passport', 'element',
    'insight', 's2000', 'prelude', 'crosstour', 'cr-z',
  ],
  jeep: [
    'wrangler', 'grand cherokee', 'cherokee', 'compass', 'renegade', 'gladiator', 'patriot', 'liberty',
    'commander', 'grand wagoneer', 'wagoneer',
  ],
  'mercedes-benz': [
    'sprinter', 'metris', 'amg gt', ['g wagon', 'g-class'], ['gwagon', 'g-class'], 'eqs', 'eqe', 'eqb', 'maybach',
  ],
  bmw: [],
  audi: ['allroad', 'e-tron gt', 'e-tron', 'tt', 'r8'],
  porsche: ['911', '718', 'cayenne', 'macan', 'panamera', 'boxster', 'cayman', 'taycan'],
  volvo: [],
  lexus: [],
  acura: ['mdx', 'rdx', 'tlx', 'ilx', 'tsx', 'rlx', 'zdx', 'rsx', 'nsx', 'integra', 'tl', 'rl'],
  infiniti: [],
  cadillac: [
    'escalade', 'cts', 'ats', 'xts', 'srx', 'xt4', 'xt5', 'xt6', 'ct4', 'ct5', 'ct6', 'dts', 'sts',
    'deville', 'lyriq', 'eldorado',
  ],
  buick: ['enclave', 'encore', 'envision', 'lacrosse', 'regal', 'lucerne', 'verano', 'rainier', 'rendezvous'],
  lincoln: [
    'navigator', 'aviator', 'nautilus', 'corsair', 'mkz', 'mkx', 'mkc', 'mkt', 'town car', 'continental',
  ],
  chrysler: ['pacifica', ['town & country', 'town and country'], 'town and country', 'pt cruiser', 'sebring', 'voyager', '300', '200'],
  hyundai: [
    'elantra', 'sonata', 'tucson', 'santa fe', 'santa cruz', 'palisade', 'kona', 'accent', 'veloster',
    'ioniq 5', 'ioniq 6', 'ioniq', 'venue', 'azera', 'genesis',
  ],
  kia: [
    'optima', 'k5', 'sorento', 'sportage', 'telluride', 'soul', 'forte', 'rio', 'stinger', 'carnival',
    'sedona', 'niro', 'ev6', 'ev9', 'seltos',
  ],
  genesis: ['gv60', 'gv70', 'gv80', 'g70', 'g80', 'g90'],
  subaru: ['outback', 'forester', 'crosstrek', 'impreza', 'wrx', 'legacy', 'ascent', 'brz', 'baja'],
  mazda: ['cx-30', 'cx-3', 'cx-50', 'cx-5', 'cx-90', 'cx-9', ['miata', 'mx-5'], 'mx-5', 'rx-8', 'tribute', ['mazda3', 'mazda3'], ['mazda 3', 'mazda3'], ['mazda6', 'mazda6'], ['mazda 6', 'mazda6']],
  mitsubishi: ['eclipse cross', 'outlander sport', 'outlander', 'eclipse', 'lancer', 'mirage', 'galant', 'montero'],
  volkswagen: ['jetta', 'passat', 'golf', 'gti', 'tiguan', 'atlas', 'beetle', 'touareg', 'arteon', 'taos', 'id.4', 'cc'],
  tesla: [['model 3', 'model 3'], ['model s', 'model s'], ['model x', 'model x'], ['model y', 'model y'], 'cybertruck'],
  'land rover': [
    'range rover sport', 'range rover evoque', 'range rover velar', 'range rover', 'defender',
    'discovery sport', 'discovery', 'lr4', 'lr3', 'lr2',
  ],
  jaguar: ['f-pace', 'e-pace', 'i-pace', 'f-type', 'xf', 'xj', 'xe', 'xk', 's-type', 'x-type'],
  mini: ['countryman', 'clubman', 'cooper'],
  'alfa romeo': ['giulia', 'stelvio', 'tonale'],
  fiat: ['500x', '500l', '500'],
  maserati: ['ghibli', 'levante', 'quattroporte', 'granturismo'],
  pontiac: ['grand prix', 'firebird', 'trans am', 'solstice', 'vibe', 'gto', 'g6', 'g8'],
  scion: ['fr-s', 'tc', 'xb', 'xd'],
  hummer: ['h1', 'h2', 'h3'],
};

// Families whose name alone is distinctive enough to imply the make when the
// title never names it ("2006 Silverado 2500hd" -> chevrolet). Short or common-word
// names (edge, focus, express, pilot…) only count when the make is in the title.
const NO_INFER = new Set([
  'express', 'legacy', 'escape', 'focus', 'flex', 'journey', 'compass', 'pilot', 'liberty', 'element',
  'insight', 'passport', 'commander', 'venue', 'nitro', 'magnum', 'sonic', 'spark', 'matrix', 'cooper',
  'eclipse', 'mirage', 'envoy', 'terrain', 'avenger', 'quest', 'ascent', 'genesis', 'defender', 'discovery',
  'continental', 'regal', 'encore', 'envision', 'aviator', 'corsair', 'nautilus', 'voyager', 'carnival',
  'fiesta', 'taurus', 'atlas', 'charger', 'transit', 'maverick', 'accent', 'stinger', 'dakota', 'jimmy',
  'caliber', 'hornet', 'element', 'vibe', 'solstice', 'saturn', 'outlander', 'tribute', 'freestar',
  'rendezvous', 'impala', 'cobalt', 'caprice', 'neon', 'viper', 'sprinter',
]);

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// keyword -> regex source where a space/hyphen also matches nothing
const kwSource = (kw: string): string => escapeRe(kw).replace(/[-\s]+/g, '[-\\s]?');

interface Family {
  make: string;
  model: string;
  re: RegExp;
  inferable: boolean;
  weightClass?: boolean; // takes a 1500/2500/3500 class + optional hd
}
const WEIGHT_CLASS_FAMILIES = new Set(['silverado', 'sierra']);

function buildFamilies(): Record<string, Family[]> {
  const out: Record<string, Family[]> = {};
  for (const [make, entries] of Object.entries(MODELS)) {
    const fams = entries.map((e): Family => {
      const [kw, model] = typeof e === 'string' ? [e, e] : e;
      return {
        make,
        model,
        re: new RegExp(`(?<![a-z0-9])${kwSource(kw)}(?![a-z0-9])`),
        inferable: /^[a-z ]{5,}$/.test(kw) && !NO_INFER.has(kw),
        weightClass: WEIGHT_CLASS_FAMILIES.has(model),
      };
    });
    // longest keyword first, so "grand cherokee" beats "cherokee"
    out[make] = fams.sort((a, b) => b.re.source.length - a.re.source.length);
  }
  return out;
}
const FAMILIES = buildFamilies();
const INFERABLE: Family[] = Object.values(FAMILIES).flat().filter((f) => f.inferable);

// --- pattern-named lineups (letters + number), only tried once the make is known ---
const MB_CODES = 'glk|glc|gle|gls|gla|glb|gl|cla|cls|clk|cl|slk|slc|sl|ml|[abcegmrs]';
const MB_NUMBERED = new RegExp(`\\b(${MB_CODES})\\s?-?\\s?\\d{2,3}(?!\\d)`);
const MB_CLASS = new RegExp(`\\b(${MB_CODES})[-\\s]?class\\b`);
const MB_BARE = /\b(glk|glc|gle|gls|gla|glb|gl|cla|cls|clk|slk|slc|sl|ml)\b/;
function mercedesModel(code: string): string {
  if (code === 'ml') return 'm-class';
  return code.length === 1 ? `${code}-class` : code;
}

const PATTERNS: Record<string, (t: string) => string | undefined> = {
  'mercedes-benz': (t) => {
    const m = t.match(MB_NUMBERED) ?? t.match(MB_CLASS) ?? t.match(MB_BARE);
    return m?.[1] ? mercedesModel(m[1]) : undefined;
  },
  bmw: (t) => {
    let m = t.match(/\b([1-8])[-\s]?series\b/) ?? t.match(/\bm?([1-8])\d{2}(?:i|d|xi|ci|li|is|e|xd)\b/);
    if (m?.[1]) return `${m[1]} series`;
    m = t.match(/\b(x[1-7]|z[348]|m[2-8]|i[3478x])\b/);
    return m?.[1];
  },
  audi: (t) => t.match(/\b(a[3-8]|s[3-8]|rs\s?[3-7]|q[2-8]|sq[5-8])\b/)?.[1]?.replace(/\s/g, ''),
  volvo: (t) => t.match(/\b(xc\d{2}|[svc]\d{2})\b/)?.[1],
  lexus: (t) => t.match(/\b(rx|gx|lx|nx|ux|es|is|gs|ls|rc|lc|ct|hs|sc)\s?-?\d{3}[hl]?\b/)?.[1] ?? t.match(/\b(rx|gx|lx|nx|ux)\b/)?.[1],
  infiniti: (t) => t.match(/\b(qx\d{2}|q\d{2}|g3[57]|fx\d{2}|ex35|jx35|m3[57]|m45|m56)\b/)?.[1],
};

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
  if (best === 'dodge' && (/\bram\b/.test(t) || /\b[123]500(?!\d)/.test(t))) return 'ram';
  return best;
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

function familyModel(fam: Family, t: string): string {
  if (!fam.weightClass) return fam.model;
  const wc = detectWeightClass(t);
  return wc ? `${fam.model} ${wc.cls}${wc.hd ? 'hd' : ''}` : fam.model;
}

const FSERIES = /\bf[-\s]?([1-7])50\b/;

function detectModel(t: string, make: string | undefined): ModelResult | undefined {
  if (make) {
    // 1) a family keyword of THIS make
    const fam = (FAMILIES[make] ?? []).find((f) => f.re.test(t));
    if (fam) return { model: familyModel(fam, t), modelInferred: false };

    // 2) lineups named by pattern (Mercedes "GLK 350", BMW "328i", Audi "Q5"…)
    const pat = PATTERNS[make]?.(t);
    if (pat) return { model: pat, modelInferred: false };

    // 3) Ford F-series: "f-150", "f250", "f 350"
    if (make === 'ford') {
      const fs = t.match(FSERIES);
      if (fs) return { model: `f-${fs[1]}50`, modelInferred: false };
    }

    // 4) bare weight class + a truck make -> infer the family model
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
  const fs = t.match(FSERIES);
  if (fs) return { model: `f-${fs[1]}50`, makeFromModel: 'ford', modelInferred: false };
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
  if (trimRaw) v.trim = trimRaw;
  if (bodyStyle) v.bodyStyle = bodyStyle;
  if (mileage !== undefined) v.mileage = mileage;
  if (drivetrain) v.drivetrain = drivetrain;
  if (fuel) v.fuel = fuel;
  if (makeInferred) v.makeInferred = true;
  if (modelInferred) v.modelInferred = true;
  return v;
}
