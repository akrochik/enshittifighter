// vehicleDb.ts — the make/model dictionary the title parser runs on. Pure data
// plus a few lineup patterns; no Facebook knowledge, no I/O.
//
// Canonical names are lowercase and follow the names Facebook's detail page uses
// ("cr-v", "grand cherokee", "3 series"), so a title-parsed model and an enriched
// one land on the same filter chip. Coverage: every make sold new in the US from
// roughly 1980 on (plus a few classic-only brands), with their passenger, truck and
// van lineups. Motorcycles, RVs, boats and heavy trucks are out of scope.

// --- makes: canonical name -> spellings seen in titles ---
export const MAKES: [string, string[]][] = [
  ['acura', ['acura']],
  ['alfa romeo', ['alfa romeo', 'alfa']],
  ['aston martin', ['aston martin']],
  ['audi', ['audi']],
  ['bentley', ['bentley']],
  ['bmw', ['bmw']],
  ['buick', ['buick']],
  ['cadillac', ['cadillac', 'caddy']],
  ['chevrolet', ['chevrolet', 'chevy']],
  ['chrysler', ['chrysler']],
  ['datsun', ['datsun']],
  ['dodge', ['dodge']],
  ['ferrari', ['ferrari']],
  ['fiat', ['fiat']],
  ['ford', ['ford']],
  ['genesis', ['genesis']],
  ['gmc', ['gmc']],
  ['honda', ['honda']],
  ['hummer', ['hummer']],
  ['hyundai', ['hyundai']],
  ['infiniti', ['infiniti', 'infinity']],
  ['isuzu', ['isuzu']],
  ['jaguar', ['jaguar']],
  ['jeep', ['jeep']],
  ['kia', ['kia']],
  ['lamborghini', ['lamborghini']],
  ['land rover', ['land rover', 'landrover', 'range rover']],
  ['lexus', ['lexus']],
  ['lincoln', ['lincoln']],
  ['lotus', ['lotus']],
  ['lucid', ['lucid']],
  ['maserati', ['maserati']],
  ['mazda', ['mazda']],
  ['mclaren', ['mclaren']],
  ['mercedes-benz', ['mercedes-benz', 'mercedes benz', 'mercedes', 'benz']],
  ['mercury', ['mercury']],
  ['mini', ['mini cooper', 'mini countryman', 'mini clubman', 'mini hardtop', 'mini paceman']],
  ['mitsubishi', ['mitsubishi']],
  ['nissan', ['nissan']],
  ['oldsmobile', ['oldsmobile', 'olds']],
  ['plymouth', ['plymouth']],
  ['polestar', ['polestar']],
  ['pontiac', ['pontiac']],
  ['porsche', ['porsche']],
  ['ram', ['ram']],
  ['rivian', ['rivian']],
  ['rolls-royce', ['rolls-royce', 'rolls royce']],
  ['saab', ['saab']],
  ['saturn', ['saturn']],
  ['scion', ['scion']],
  ['smart', ['smart fortwo', 'smart car', 'smart eq']],
  ['subaru', ['subaru']],
  ['suzuki', ['suzuki']],
  ['tesla', ['tesla']],
  ['toyota', ['toyota']],
  ['volkswagen', ['volkswagen', 'vw']],
  ['volvo', ['volvo']],
];

// --- model families per make ---
// A string is both the title keyword and the canonical model; a [keyword,
// canonical] pair folds a variant spelling or sub-model into its family. In a
// keyword, a space or hyphen also matches no separator ("cr-v" ~ "crv" ~ "cr v").
// Order doesn't matter: longer keywords are always tried first.
export type ModelEntry = string | [string, string];

export const MODELS: Record<string, ModelEntry[]> = {
  acura: [
    'mdx', 'rdx', 'tlx', 'ilx', 'tsx', 'rlx', 'zdx', 'rsx', 'nsx', 'integra', 'legend', 'vigor', 'slx',
    'adx', 'tl', 'rl', 'cl',
  ],
  'alfa romeo': ['giulia', 'stelvio', 'tonale', 'giulietta', '4c', 'spider'],
  'aston martin': ['vantage', 'db11', 'db12', 'db9', 'dbs', 'dbx', 'rapide', 'vanquish'],
  audi: [
    'allroad', 'e-tron gt', 'e-tron', 'tts', 'tt', 'r8',
    // a3–a8, s3–s8, rs3–rs7, q3–q8, sq5–sq8 come from AUDI_PATTERN
  ],
  bentley: ['continental', 'bentayga', 'flying spur', 'mulsanne', 'arnage', 'azure'],
  bmw: ['alpina'], // 1–8 series, x1–x7, z3/z4/z8, m2–m8, i3/i4/i5/i7/i8/ix come from BMW_PATTERN
  buick: [
    'enclave', 'encore gx', 'encore', 'envision', 'envista', 'lacrosse', 'regal', 'lucerne', 'verano',
    'rainier', 'rendezvous', 'terraza', 'century', 'lesabre', 'park avenue', 'riviera', 'roadmaster',
    'skylark', 'cascada', 'allure', 'electra', 'reatta', 'grand national',
  ],
  cadillac: [
    'escalade', ['escalade esv', 'escalade'], ['escalade ext', 'escalade'], 'cts', 'ats', 'xts', 'srx',
    'xt4', 'xt5', 'xt6', 'ct4', 'ct5', 'ct6', 'dts', 'sts', 'deville', 'seville', 'eldorado', 'catera',
    'elr', 'xlr', 'lyriq', 'optiq', 'allante', 'brougham', 'fleetwood',
  ],
  chevrolet: [
    'silverado', 'colorado', ['s10', 's-10'], 's-10', 'avalanche', 'tahoe', 'suburban', 'blazer',
    ['k5 blazer', 'blazer'], 'trailblazer', 'traverse', 'equinox', 'trax', 'captiva', 'uplander',
    'venture', 'astro', 'express', 'city express', 'lumina', 'malibu', 'impala', 'caprice',
    'monte carlo', 'cavalier', 'cobalt', 'cruze', 'sonic', 'spark', 'aveo', 'volt', 'bolt', 'bolt euv',
    'camaro', 'corvette', 'ssr', 'hhr', 'chevelle', 'nova', 'el camino', 'beretta', 'corsica',
    'celebrity', 'citation', 'chevette', 'prizm', 'metro', 'tracker', 'luv', 'c10', 'k10', 'c20', 'k20',
    'c30', 'k30', 'bel air', 'apache', 'brightdrop',
  ],
  chrysler: [
    'pacifica', ['town & country', 'town and country'], 'town and country', 'voyager', 'aspen',
    'pt cruiser', 'crossfire', 'sebring', 'concorde', 'lhs', 'cirrus', 'prowler', 'new yorker',
    'lebaron', 'imperial', ['300c', '300'], ['300m', '300'], ['300s', '300'], '300', '200',
  ],
  datsun: ['240z', '260z', '280z', '280zx', '510', '620'],
  dodge: [
    'charger', 'challenger', 'durango', 'journey', 'grand caravan', 'caravan', 'dart', 'avenger',
    'viper', 'nitro', 'dakota', 'magnum', 'neon', ['srt-4', 'neon'], 'hornet', 'caliber', 'stratus',
    'intrepid', 'stealth', 'spirit', 'shadow', 'dynasty', 'daytona', 'omni', 'ramcharger', 'sprinter',
    'power wagon',
  ],
  ferrari: [
    '296', '458', '488', '812', 'f8', 'f430', '360', 'sf90', 'roma', 'portofino', 'california',
    'purosangue', 'testarossa', 'f12',
  ],
  fiat: ['500x', '500l', '500e', '500', '124 spider'],
  ford: [
    'ranger', 'maverick', 'bronco', 'bronco sport', 'explorer', 'explorer sport trac', 'sport trac',
    'expedition', 'excursion', 'escape', 'edge', 'flex', 'freestyle', 'taurus', 'taurus x', 'five hundred',
    'crown victoria', 'fusion', 'focus', 'fiesta', 'contour', 'tempo', 'escort', 'probe', 'thunderbird',
    'mustang', 'mustang mach-e', ['mach-e', 'mustang mach-e'], 'ecosport', 'transit', 'transit connect',
    'econoline', ['e-series', 'econoline'], 'windstar', 'freestar', 'aerostar', 'c-max', 'f-series',
    'model a', 'model t', 'gt40', // "F-150 Lightning" is an F-150 (pattern)
    // f-150 … f-750 and e-150 … e-450 come from FORD_PATTERN
  ],
  genesis: ['gv60', 'gv70', 'gv80', 'g70', 'g80', 'g90'],
  gmc: [
    'sierra', 'canyon', 'sonoma', 's-15', 'syclone', 'typhoon', 'jimmy', 'yukon', 'yukon xl', 'envoy',
    'acadia', 'terrain', 'savana', 'safari', 'vandura', 'hummer ev',
  ],
  honda: [
    'civic', 'accord', 'cr-v', 'hr-v', 'pilot', 'passport', 'odyssey', 'ridgeline', 'fit', 'element',
    'insight', 'prelude', 's2000', 'cr-z', 'del sol', 'clarity', 'prologue', 'crosstour',
    ['accord crosstour', 'crosstour'],
  ],
  hummer: ['h1', 'h2', 'h3', ['h3t', 'h3']],
  hyundai: [
    'elantra', 'sonata', 'tucson', 'santa fe', 'santa cruz', 'palisade', 'kona', 'accent', 'veloster',
    'ioniq', 'ioniq 5', 'ioniq 6', 'venue', 'azera', 'genesis', 'genesis coupe', 'equus', 'entourage',
    'veracruz', 'tiburon', 'xg350', 'nexo', 'excel',
  ],
  infiniti: [], // q/qx/g/fx/ex/jx/m codes come from INFINITI_PATTERN
  isuzu: [
    'rodeo', 'trooper', 'amigo', 'axiom', 'ascender', 'hombre', 'vehicross', 'npr', 'nqr',
    ['i-280', 'i-series'], ['i-290', 'i-series'], ['i-350', 'i-series'], ['i-370', 'i-series'],
  ],
  jaguar: [
    'f-pace', 'e-pace', 'i-pace', 'f-type', 's-type', 'x-type', 'xf', 'xe', 'xj', ['xj6', 'xj'],
    ['xj8', 'xj'], ['xjr', 'xj'], 'xk', ['xk8', 'xk'], ['xkr', 'xk'], 'e-type',
  ],
  jeep: [
    'wrangler', 'grand cherokee', 'cherokee', 'compass', 'patriot', 'renegade', 'liberty', 'commander',
    'gladiator', 'wagoneer', 'grand wagoneer', 'comanche', 'cj', ['cj5', 'cj'], ['cj7', 'cj'],
    ['cj8', 'cj'], 'scrambler',
  ],
  kia: [
    'optima', 'k5', 'k900', 'cadenza', 'sorento', 'sportage', 'telluride', 'soul', 'forte', 'rio',
    'stinger', 'carnival', 'sedona', 'niro', 'ev6', 'ev9', 'seltos', 'borrego', 'amanti', 'spectra',
    'sephia', 'rondo',
  ],
  lamborghini: ['huracan', 'urus', 'aventador', 'gallardo', 'murcielago', 'revuelto', 'countach'],
  'land rover': [
    'range rover', 'range rover sport', 'range rover evoque', 'range rover velar', 'defender',
    'discovery', 'discovery sport', 'lr2', 'lr3', 'lr4', 'freelander',
  ],
  lexus: ['lfa'], // rx/gx/lx/nx/ux/tx/rz/es/is/gs/ls/rc/lc/ct/hs/sc come from LEXUS_PATTERN
  lincoln: [
    'navigator', 'aviator', 'nautilus', 'corsair', 'mkz', 'mkx', 'mkc', 'mkt', 'mks', 'mark lt',
    'mark viii', 'blackwood', 'town car', 'continental', 'zephyr', 'ls',
  ],
  lotus: ['elise', 'exige', 'evora', 'emira', 'eletre'],
  lucid: ['air', 'gravity'],
  maserati: ['ghibli', 'levante', 'quattroporte', 'granturismo', 'grancabrio', 'grecale', 'mc20'],
  mazda: [
    ['mazda 3', 'mazda3'], ['mazda 6', 'mazda6'], ['mazda 2', 'mazda2'], ['mazda 5', 'mazda5'],
    'cx-3', 'cx-30', 'cx-5', 'cx-50', 'cx-7', 'cx-9', 'cx-70', 'cx-90', 'mx-5', ['miata', 'mx-5'],
    'mx-30', 'mx-6', 'rx-7', 'rx-8', 'tribute', 'protege', '626', 'millenia', 'mpv', '323', 'navajo',
    ['b2300', 'b-series'], ['b2500', 'b-series'], ['b3000', 'b-series'], ['b4000', 'b-series'], 'b-series',
  ],
  mclaren: ['720s', '765lt', '570s', '600lt', '650s', 'artura', '750s', 'gt'],
  'mercedes-benz': [
    'sprinter', 'metris', 'amg gt', ['g wagon', 'g-class'], ['g-wagen', 'g-class'], 'eqs', 'eqe', 'eqb',
    'eqa', 'maybach', 'slr',
    // a/b/c/e/g/m/r/s-class, gl/glk/gla/glb/glc/gle/gls, cl/cla/cls/clk, sl/slk/slc, ml come from MB_PATTERN
  ],
  mercury: [
    'grand marquis', 'marauder', 'mountaineer', 'mariner', 'milan', 'montego', 'sable', 'cougar',
    'mystique', 'tracer', 'villager', 'monterey', 'topaz', 'capri',
  ],
  mini: [
    'countryman', 'clubman', 'paceman', ['hardtop', 'cooper'], 'cooper', ['cooper s', 'cooper'],
    ['john cooper works', 'cooper'],
  ],
  mitsubishi: [
    'outlander', 'outlander sport', 'eclipse', 'eclipse cross', 'lancer', ['lancer evolution', 'lancer'],
    'mirage', 'galant', 'montero', 'montero sport', 'endeavor', 'raider', 'diamante', '3000gt', 'i-miev',
  ],
  nissan: [
    'titan', ['titan xd', 'titan'], 'frontier', 'altima', 'maxima', 'sentra', 'versa', 'rogue',
    ['rogue sport', 'rogue'], 'murano', 'pathfinder', 'armada', 'xterra', 'juke', 'kicks', 'leaf',
    'ariya', '350z', '370z', '300zx', '240sx', '200sx', 'gt-r', 'quest', 'nv200', 'nv', 'cube', 'stanza',
    'pulsar', 'hardbody',
  ],
  oldsmobile: [
    'cutlass', 'cutlass supreme', 'alero', 'aurora', 'bravada', 'silhouette', 'intrigue', 'achieva',
    'delta 88', '88', '98', 'toronado', '442',
  ],
  plymouth: ['voyager', 'neon', 'breeze', 'prowler', 'barracuda', 'road runner', 'duster', 'fury', 'acclaim'],
  polestar: ['polestar 1', 'polestar 2', 'polestar 3', 'polestar 4'],
  pontiac: [
    'grand prix', 'grand am', 'firebird', 'trans am', 'solstice', 'vibe', 'g3', 'g5', 'g6', 'g8', 'gto',
    'aztek', 'bonneville', 'sunfire', 'montana', 'torrent', 'fiero', 'lemans',
  ],
  porsche: [
    '911', ['carrera', '911'], '718', 'cayenne', 'macan', 'panamera', 'boxster', 'cayman', 'taycan',
    '944', '928', '968', '914', '356',
  ],
  ram: ['promaster', 'promaster city', 'dakota', 'c/v'],
  rivian: ['r1t', 'r1s', 'r2', 'r3'],
  'rolls-royce': ['ghost', 'phantom', 'wraith', 'dawn', 'cullinan', 'spectre', 'silver shadow'],
  saab: ['9-2x', '9-3', '9-4x', '9-5', '9-7x', '900', '9000'],
  saturn: [
    'ion', 'vue', 'aura', 'outlook', 'sky', 'relay', 'astra', ['l200', 'l-series'], ['l300', 'l-series'],
    'l-series', ['sl1', 's-series'], ['sl2', 's-series'], ['sc2', 's-series'], 's-series',
  ],
  scion: ['fr-s', 'tc', 'xb', 'xa', 'xd', 'iq', 'ia', 'im'],
  smart: ['fortwo', 'forfour'],
  subaru: [
    'outback', 'forester', 'crosstrek', ['xv crosstrek', 'crosstrek'], 'impreza', 'wrx', ['wrx sti', 'wrx'],
    'legacy', 'ascent', 'brz', 'baja', 'tribeca', ['b9 tribeca', 'tribeca'], 'svx', 'solterra', 'justy',
    'loyale',
  ],
  suzuki: [
    'grand vitara', 'vitara', 'sx4', 'kizashi', 'xl-7', 'samurai', 'sidekick', 'equator', 'aerio',
    'forenza', 'reno', 'esteem', 'swift',
  ],
  tesla: [
    ['model 3', 'model 3'], ['model s', 'model s'], ['model x', 'model x'], ['model y', 'model y'],
    'cybertruck', 'roadster',
  ],
  toyota: [
    'tundra', 'tacoma', 't100', 'camry', ['camry solara', 'solara'], 'solara', 'corolla', 'corolla cross',
    ['gr corolla', 'corolla'], 'rav4', 'highlander', 'grand highlander', '4runner', 'sienna', 'sequoia',
    'land cruiser', 'avalon', 'venza', 'c-hr', 'prius', ['prius prime', 'prius'], 'mirai', 'bz4x',
    'supra', 'gr86', '86', 'celica', 'mr2', 'matrix', 'yaris', 'echo', 'tercel', 'paseo', 'previa',
    'fj cruiser', 'crown', 'cressida',
  ],
  volkswagen: [
    'jetta', 'passat', 'golf', 'gti', ['golf gti', 'gti'], ['golf r', 'golf r'], 'alltrack', 'tiguan',
    'atlas', ['atlas cross sport', 'atlas cross sport'], 'beetle', ['new beetle', 'beetle'], 'touareg',
    'arteon', 'taos', 'id.4', 'id. buzz', ['id buzz', 'id. buzz'], 'cc', 'eos', 'rabbit', 'phaeton',
    'routan', 'cabrio', 'corrado', 'vanagon', 'eurovan', 'scirocco', 'jetta gli', ['gli', 'jetta gli'],
  ],
  volvo: ['240', '740', '760', '850', '940', '960'], // xc/s/v/c/ex codes come from VOLVO_PATTERN
};

// Model names distinctive enough to imply the make when a title never names it
// ("2006 Silverado 2500hd" -> chevrolet). Deliberately an allow-list: ordinary
// words (edge, focus, express, journey…) and names shared by two makes never
// imply a make on their own.
export const INFER_MAKE_FROM: Set<string> = new Set([
  'silverado', 'sierra', 'colorado', 'tahoe', 'suburban', 'canyon', 'yukon', 'tundra', 'tacoma', 'titan',
  'frontier', 'ranger', 'civic', 'accord', 'wrangler', 'cherokee', 'grand cherokee', 'gladiator',
  'camry', 'corolla', 'rav4', '4runner', 'highlander', 'prius', 'sienna', 'sequoia', 'avalanche',
  'camaro', 'corvette', 'malibu', 'equinox', 'traverse', 'trailblazer', 'mustang', 'explorer',
  'expedition', 'bronco', 'escalade', 'outback', 'forester', 'crosstrek', 'impreza', 'cr-v', 'hr-v',
  'odyssey', 'ridgeline', 'altima', 'sentra', 'maxima', 'pathfinder', 'xterra', 'elantra', 'sonata',
  'tucson', 'santa fe', 'palisade', 'sorento', 'sportage', 'telluride', 'jetta', 'passat', 'tiguan',
  'cayenne', 'macan', 'panamera', 'durango', 'challenger', 'grand caravan', 'pacifica', 'navigator',
  'mdx', 'rdx', 'cybertruck', 'land cruiser', 'fj cruiser', 'econoline', 'promaster',
]);

// Lineups named by pattern rather than a word. Each takes the lowercased,
// space-padded title and returns a canonical model or undefined. They only run
// once the make is known, because the codes are short and ambiguous on their own.
const MB_CODES = 'glk|glc|gle|gls|gla|glb|gl|cla|cls|clk|cl|slk|slc|sl|ml|[abcegmrs]';
const MB_NUMBERED = new RegExp(`\\b(${MB_CODES})\\s?-?\\s?\\d{2,3}[a-z]{0,2}(?!\\d)`);
const MB_CLASS = new RegExp(`\\b(${MB_CODES})[-\\s]?class\\b`);
const MB_BARE = /\b(glk|glc|gle|gls|gla|glb|gl|cla|cls|clk|slk|slc|sl|ml)\b/;
// old-style "300 CE", "560 SL", "300SD": number first, body letters after
const MB_OLD = /\b\d{3}\s?(sel|sec|sl|slc|se|sd|ce|cd|te|td|e|d)\b/;
function mbModel(code: string): string {
  if (code === 'ml') return 'm-class';
  return code.length === 1 ? `${code}-class` : code;
}
const MB_OLD_MAP: Record<string, string> = {
  sel: 's-class', sec: 's-class', se: 's-class', sd: 's-class', sl: 'sl', slc: 'slc',
  ce: 'e-class', cd: 'e-class', te: 'e-class', td: 'e-class', e: 'e-class', d: 'e-class',
};

export const PATTERNS: Record<string, (t: string) => string | undefined> = {
  'mercedes-benz': (t) => {
    const m = t.match(MB_NUMBERED) ?? t.match(MB_CLASS) ?? t.match(MB_BARE);
    if (m?.[1]) return mbModel(m[1]);
    const o = t.match(MB_OLD);
    return o?.[1] ? MB_OLD_MAP[o[1]] : undefined;
  },
  bmw: (t) => {
    let m = t.match(/\b([1-8])[-\s]?series\b/) ?? t.match(/\b([1-8])\d{2}(?:i|d|xi|ci|li|is|e|xd|e)\b/);
    if (m?.[1]) return `${m[1]} series`;
    m = t.match(/\bm([2-8])\d{2}(?:i|d|xi|e)\b/); // m340i, m550i -> 3/5 series
    if (m?.[1]) return `${m[1]} series`;
    m = t.match(/\b(x[1-7]|z[348]|m[2-8]|i[345789x]|1m)(?:\s?m)?\b/);
    return m?.[1];
  },
  audi: (t) => t.match(/\b(a[1-8]|s[3-8]|rs\s?[3-7]|q[2-8]|sq[5-8])\b/)?.[1]?.replace(/\s/g, ''),
  volvo: (t) => t.match(/\b(xc\d{2}|ex\d{2}|[svc]\d{2})\b/)?.[1],
  lexus: (t) =>
    t.match(/\b(rx|gx|lx|nx|ux|tx|rz|es|is|gs|ls|rc|lc|ct|hs|sc)\s?-?\d{3}[a-z]?\b/)?.[1] ??
    t.match(/\b(rx|gx|lx|nx|ux|tx|rz)\b/)?.[1] ??
    t.match(/\blexus (es|is|gs|ls|rc|lc|ct|hs|sc)\b/)?.[1],
  infiniti: (t) => t.match(/\b(qx\d{1,2}|q\d{2}|g\d{2}|fx\d{2}|ex3[57]|jx35|m3[57]|m45|m56|i3[05]|j30)\b/)?.[1],
  ford: (t) => {
    const f = t.match(/\bf[-\s]?([1-7])50\b/);
    if (f?.[1]) return `f-${f[1]}50`;
    if (/\be[-\s]?[1-4]50\b/.test(t)) return 'econoline';
    return undefined;
  },
};

// Lineups where the pattern should win over a keyword match: Audi's "A4 allroad"
// is an A4 (a bare "allroad" still matches the keyword).
// Ford's "F-150 Lightning" is an F-150; Volvo's "XC90 … 240 hp" is an XC90.
export const PATTERN_FIRST: Set<string> = new Set(['audi', 'ford', 'volvo']);
