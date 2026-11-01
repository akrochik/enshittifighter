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

describe('parseVehicleTitle — beyond pickups (real titles from a "glk 350" search)', () => {
  it.each<[string, string | undefined, string | undefined]>([
    ['2014 Mercedes-Benz glk 350 4 matic', 'mercedes-benz', 'glk'],
    ['2014 Mercedes-Benz glk-class GLK 350 4MATIC', 'mercedes-benz', 'glk'],
    ['2013 Mercedes-Benz glk-class', 'mercedes-benz', 'glk'],
    ['2014 Mercedes-Benz gl-class 450', 'mercedes-benz', 'gl'],
    ['2007 Mercedes-Benz GL-Class · GL 450', 'mercedes-benz', 'gl'],
    ['2017 Mercedes-Benz G-Class · G 63 AMG 4MATIC Sport Utility 4D', 'mercedes-benz', 'g-class'],
    ['2025 Mercedes-Benz GLS · GLS 450 4MATIC Sport Utility 4D', 'mercedes-benz', 'gls'],
    ['2016 Mercedes-Benz Mercedes-AMG GLE · 63s', 'mercedes-benz', 'gle'],
    ['2017 Mercedes-Benz e 300 4matic', 'mercedes-benz', 'e-class'],
    ['2020 Mercedes-Benz C-Class · C 300 4MATIC Sport Sedan 4D', 'mercedes-benz', 'c-class'],
    ['2020 Mercedes-Benz GLB 250 4MATIC', 'mercedes-benz', 'glb'],
    ['2010 Mercedes ML350', 'mercedes-benz', 'm-class'],
    ['2014 Porsche Cayenne · GTS Sport Utility 4D', 'porsche', 'cayenne'],
    ['2018 Audi Q5 Premium Plus', 'audi', 'q5'],
    ['2015 BMW 328i xDrive', 'bmw', '3 series'],
    ['2019 BMW X5 xDrive40i', 'bmw', 'x5'],
    ['2018 Volvo V60 T5', 'volvo', 'v60'],
    ['2016 Lexus RX 350', 'lexus', 'rx'],
    ['2017 Honda CRV EX', 'honda', 'cr-v'],
    ['2019 Jeep Grand Cherokee Limited', 'jeep', 'grand cherokee'],
    ['2018 Volkswagen Atlas SE', 'volkswagen', 'atlas'],
    ['2015 Dodge Charger SXT', 'dodge', 'charger'],
  ])('%s -> %s / %s', (title, make, model) => {
    const v = parseVehicleTitle(title);
    expect(v.make).toBe(make);
    expect(v.model).toBe(model);
  });

  it('a Dodge Ram pickup still folds into ram', () => {
    expect(parseVehicleTitle('2008 Dodge Ram 2500 SLT').make).toBe('ram');
  });

  it('the earliest-named make wins (Hyundai Genesis is a Hyundai)', () => {
    expect(parseVehicleTitle('2012 Hyundai Genesis 3.8').make).toBe('hyundai');
  });

  it('common words do not invent a make on their own', () => {
    expect(parseVehicleTitle('2015 Edge of town cruiser, needs work').make).toBeUndefined();
  });

  it('parses Facebook detail-page make/model names into the same vocabulary', () => {
    expect(parseVehicleTitle('mercedes-benz glk-class')).toMatchObject({ make: 'mercedes-benz', model: 'glk' });
    expect(parseVehicleTitle('mercedes-benz mercedes-amg gls')).toMatchObject({ make: 'mercedes-benz', model: 'gls' });
    expect(parseVehicleTitle('chevrolet silverado 2500hd')).toMatchObject({ make: 'chevrolet', model: 'silverado 2500hd' });
    expect(parseVehicleTitle('ford f-250 super duty')).toMatchObject({ make: 'ford', model: 'f-250' });
  });
});
