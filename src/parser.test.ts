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

describe('parseVehicleTitle — tricky real-world titles', () => {
  it.each<[string, string | undefined, string | undefined]>([
    ['2023 Ford F-150 Lightning Lariat', 'ford', 'f-150'],
    ['2008 Ford E-350 Super Duty Van', 'ford', 'econoline'],
    ['2017 Audi A4 allroad Premium', 'audi', 'a4'],
    ['2016 Audi allroad', 'audi', 'allroad'],
    ['2021 BMW M340i xDrive', 'bmw', '3 series'],
    ['2012 BMW 5 Series · 535i xDrive', 'bmw', '5 series'],
    ['2015 Lexus IS · IS 250 Sedan 4D', 'lexus', 'is'],
    ['2009 Infiniti G37 Journey', 'infiniti', 'g37'],
    ['1998 Chevrolet K2500 4x4', 'chevrolet', 'silverado 2500'],
    ['2019 Chevrolet Silverado 3500HD Dually', 'chevrolet', 'silverado 3500hd'],
    ['2015 Ram 5500 Chassis Cab', 'ram', 'ram 5500'],
    ['2018 Toyota 86 GT', 'toyota', '86'],
    ['2021 Tesla Model Y Long Range', 'tesla', 'model y'],
    ['2019 Land Rover Range Rover Sport HSE', 'land rover', 'range rover sport'],
    ['2020 Range Rover Velar', 'land rover', 'range rover velar'],
    ['2022 Mazda CX-50 Turbo', 'mazda', 'cx-50'],
    ['2016 Mazda Mazda3 Touring', 'mazda', 'mazda3'],
    ['2018 Volkswagen Golf R', 'volkswagen', 'golf r'],
    ['1991 Mercedes-Benz 300 CE', 'mercedes-benz', 'e-class'],
    ['2016 Mercedes-Benz Sprinter 2500 High Roof', 'mercedes-benz', 'sprinter'],
    ['2020 Ram ProMaster 2500 High Roof', 'ram', 'promaster'],
    ['2019 Volvo XC90 T6 Inscription', 'volvo', 'xc90'],
    ['2005 Saab 9-3 Aero', 'saab', '9-3'],
    ['2010 Mini Cooper S', 'mini', 'cooper'],
    ['2014 Jeep Wrangler Unlimited Sahara', 'jeep', 'wrangler'],
    ['2012 Honda Accord Crosstour', 'honda', 'crosstour'],
    ['2013 Subaru WRX STI', 'subaru', 'wrx'],
    ['2015 Camry SE', 'toyota', 'camry'], // make inferred from a distinctive model
  ])('%s -> %s / %s', (title, make, model) => {
    const v = parseVehicleTitle(title);
    expect(v.make).toBe(make);
    expect(v.model).toBe(model);
  });

  it('a mileage is not a weight class ("1500 miles")', () => {
    expect(parseVehicleTitle('2015 Chevrolet Malibu 1500 miles').model).toBe('malibu');
    expect(parseVehicleTitle('2015 Chevrolet 1500 miles').model).toBeUndefined();
  });

  it('a short code shared with a trim is not repeated as the trim', () => {
    const v = parseVehicleTitle('2010 Lexus LS 460');
    expect(v.model).toBe('ls');
    expect(v.trim).toBeUndefined();
  });

  it('ordinary words never imply a make ("Edge", "Journey", "Express")', () => {
    for (const t of ['2015 Edge Sport', '2012 Journey SXT', '2009 Express 2500 van']) {
      expect(parseVehicleTitle(t).make).toBeUndefined();
    }
  });
});
