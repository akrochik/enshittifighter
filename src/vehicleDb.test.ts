import { describe, it, expect } from 'vitest';
import { MAKES, MODELS } from './vehicleDb';
import { parseVehicleTitle } from './parser';

// Every dictionary entry, written as a title, must parse back to itself — this
// catches keyword collisions inside a make (e.g. a short code shadowing a name).
describe('vehicleDb — every entry round-trips through the parser', () => {
  const cases: [string, string, string][] = [];
  for (const [make, aliases] of MAKES) {
    const alias = aliases[0]!;
    for (const e of MODELS[make] ?? []) {
      const [kw, model] = typeof e === 'string' ? [e, e] : e;
      cases.push([`2015 ${alias} ${kw}`, make, model]);
    }
  }
  it.each(cases)('%s -> %s / %s', (title, make, model) => {
    const v = parseVehicleTitle(title);
    expect(v.make).toBe(make);
    expect(v.model).toBe(model);
  });

  it('every make in MODELS is a known make', () => {
    const known = new Set(MAKES.map(([m]) => m));
    for (const make of Object.keys(MODELS)) expect(known.has(make)).toBe(true);
  });
});
