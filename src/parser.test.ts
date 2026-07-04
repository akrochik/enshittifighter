import { describe, it, expect } from 'vitest';
import { parseVehicleTitle } from './parser';
import type { ParseConfidence } from './types';

// Real titles captured in Phase 0 (marketplace_listing_title), plus edge cases.
interface Case {
  t: string;
  e: Record<string, unknown>; // fields we assert are present/equal
  c: ParseConfidence;
}

const cases: Case[] = [
  {
    t: '2015 Chevrolet Silverado 2500 HD Crew Cab · LTZ Pickup 4D 6 1/2 ft',
    e: { year: 2015, make: 'chevrolet', model: 'silverado 2500hd', trim: 'ltz', bodyStyle: 'crew cab' },
    c: 'full',
  },
  {
    t: '2001 Chevrolet Silverado 2500 HD Crew Cab · LT Pickup 4D 8 ft',
    e: { year: 2001, make: 'chevrolet', model: 'silverado 2500hd', trim: 'lt', bodyStyle: 'crew cab' },
    c: 'full',
  },
  {
    t: '2016 Chevrolet silverado 4x4 2500 diesel truck · LTZ 4X4 2500HD Diesel Crew',
    e: { year: 2016, make: 'chevrolet', model: 'silverado 2500hd', trim: 'ltz', drivetrain: '4wd' },
    c: 'full',
  },
  {
    t: '2013 Chevrolet Silverado 2500HD LT 4x4 Duramax',
    e: { year: 2013, make: 'chevrolet', model: 'silverado 2500hd', trim: 'lt', drivetrain: '4wd' },
    c: 'full',
  },
  {
    t: '2005 Chevrolet Silverado 2500HD LS - DURAMAX - 4x4 - 168k MILES',
    e: { year: 2005, make: 'chevrolet', model: 'silverado 2500hd', trim: 'ls', drivetrain: '4wd', mileage: 168000 },
    c: 'full',
  },
  // make missing -> inferred from "silverado"
  {
    t: '2006 Silverado 2500hd',
    e: { year: 2006, make: 'chevrolet', model: 'silverado 2500hd', makeInferred: true },
    c: 'partial',
  },
  // model word missing -> inferred from "2500 HD" + chevrolet
  {
    t: '2007 Chevrolet 2500 HD Extended Cab · Short Bed',
    e: { year: 2007, make: 'chevrolet', model: 'silverado 2500hd', bodyStyle: 'extended cab', modelInferred: true },
    c: 'partial',
  },
  {
    t: '2004 Chevrolet 2500 Crew Cab · Short Bed',
    e: { year: 2004, make: 'chevrolet', model: 'silverado 2500', bodyStyle: 'crew cab', modelInferred: true },
    c: 'partial',
  },
  {
    t: '2024 Chevrolet Silverado 2500 HD',
    e: { year: 2024, make: 'chevrolet', model: 'silverado 2500hd' },
    c: 'full',
  },
  {
    t: '2019 Chevrolet Silverado 2500 HD Double Cab',
    e: { year: 2019, make: 'chevrolet', model: 'silverado 2500hd', bodyStyle: 'double cab' },
    c: 'full',
  },
  // --- synthetic edge cases beyond the captured corpus ---
  {
    t: '2018 Ford F-250 Super Duty Lariat 4x4',
    e: { year: 2018, make: 'ford', model: 'f-250', trim: 'lariat', drivetrain: '4wd' },
    c: 'full',
  },
  {
    t: '2012 GMC Sierra 2500HD 150,000 miles',
    e: { year: 2012, make: 'gmc', model: 'sierra 2500hd', mileage: 150000 },
    c: 'full',
  },
  {
    t: '2016 Ram 2500 Laramie',
    e: { year: 2016, make: 'ram', model: 'ram 2500', trim: 'laramie', modelInferred: true },
    c: 'partial',
  },
  {
    t: '2018 Honda Civic EX',
    e: { year: 2018, make: 'honda', model: 'civic' },
    c: 'full',
  },
];

describe('parseVehicleTitle — captured corpus + edge cases', () => {
  for (const { t, e, c } of cases) {
    it(`${t}`, () => {
      const v = parseVehicleTitle(t);
      expect(v).toMatchObject(e);
      expect(v.confidence).toBe(c);
    });
  }
});

describe('parseVehicleTitle — unparseable titles are flagged, never crash', () => {
  it('junk title yields confidence "none" with no make/model', () => {
    const v = parseVehicleTitle('Reduced today!! runs strong, clean title, no low-ballers');
    expect(v.confidence).toBe('none');
    expect(v.make).toBeUndefined();
    expect(v.model).toBeUndefined();
  });

  it('empty string does not throw', () => {
    expect(() => parseVehicleTitle('')).not.toThrow();
    expect(parseVehicleTitle('').confidence).toBe('none');
  });

  it('does not mistake a model number for a mileage or year', () => {
    const v = parseVehicleTitle('2015 Chevrolet Silverado 2500HD');
    expect(v.year).toBe(2015);
    expect(v.mileage).toBeUndefined();
    expect(v.model).toBe('silverado 2500hd');
  });
});

describe('parseVehicleTitle — best-effort fuel from the title', () => {
  it.each<[string, string | undefined]>([
    ['2015 GMC Sierra 2500 HD Crew Cab · Denali 6.6 LML Duramax', 'diesel'],
    ['2016 Ram 2500 Cummins Turbo Diesel', 'diesel'],
    ['2018 Ford F-250 6.7 Power Stroke', 'diesel'],
    ['2005 Chevrolet Silverado 2500HD LS - DURAMAX - 4x4', 'diesel'],
    ['2015 Chevrolet Silverado 1500 LT Crew Cab', undefined], // no signal -> stays unknown
  ])('%s -> fuel %s', (title, fuel) => {
    expect(parseVehicleTitle(title).fuel).toBe(fuel);
  });
});
