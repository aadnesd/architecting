import { describe, expect, it } from 'vitest';
import { mittHusTemplate } from '../model/mittHus';
import { elevationSheet, elevationWalls } from './elevation';

const p = mittHusTemplate();
const et1 = p.levels.find((l) => l.name === '1. etasje')!;
const views = elevationWalls(p, et1.id);
const byTitle = (t: string) => views.find((v) => v.title === t)!;
/** Dimension texts on a sheet (numbers only). */
const dims = (svg: string) => [...svg.matchAll(/>(\d+)<\/text>/g)].map((m) => +m[1]);

describe('wall elevations', () => {
  it('finds the three kitchen walls with furniture against them', () => {
    expect(views.map((v) => v.title).sort()).toEqual(['Kjøkken – North wall', 'Kjøkken – South wall', 'Kjøkken – West wall']);
  });

  it('crops each wall to the stretch between the walls that meet it', () => {
    const south = byTitle('Kjøkken – South wall');
    // From the free wall end to the hall wall's face: the 2643 mm range wall
    expect(south.t1 - south.t0).toBeCloseTo(264.3, 0);
    const north = byTitle('Kjøkken – North wall');
    expect(north.t1 - north.t0).toBeCloseTo(531.2, 0);
  });

  it('dimensions the units along the floor, the window and the heights, in mm', () => {
    const south = dims(elevationSheet(p, byTitle('Kjøkken – South wall')));
    // Drawers 443, range 1000, oven and fridge 600, overall 2643; worktop 900 and hood clearance 550
    for (const d of [443, 1000, 600, 2643, 900, 550]) expect(south).toContain(d);
    const north = dims(elevationSheet(p, byTitle('Kjøkken – North wall')));
    // Farmhouse sink 800, window 900 wide with a 1050 mm sill, overall 5312
    for (const d of [800, 900, 1050, 5312]) expect(north).toContain(d);
  });

  it('draws an A3 sheet at a standard scale with a title block', () => {
    const svg = elevationSheet(p, byTitle('Kjøkken – West wall'), { number: 'A2' });
    expect(svg).toMatch(/^<svg[^>]+width="420mm" height="297mm"/);
    expect(svg).toMatch(/Scale 1:(10|20|25|50) \(A3\)/);
    expect(svg).toContain('>A2<');
    expect(svg).toContain('Elevation – Kjøkken – West wall');
  });
});
