import { describe, expect, it } from 'vitest';
import { mittHusTemplate } from './mittHus';
import { pointAlong, wallHeightAt, wallLength } from '../geometry/walls';
import { polygonArea } from '../geometry/math';

const p = mittHusTemplate();
const level = (name: string) => p.levels.find((l) => l.name === name)!;

describe('Mitt hus template', () => {
  it('has the main body of the 1947 drawings: 8.50 × 7.50 m', () => {
    const et1 = level('1. etasje');
    const ext = p.walls.filter((w) => w.levelId === et1.id && w.thickness === 20);
    const west = Math.min(...ext.map((w) => Math.min(w.a.x, w.b.x))) - 10;
    const east = Math.max(...ext.map((w) => Math.max(w.a.x, w.b.x))) + 10;
    const south = Math.max(...ext.map((w) => Math.max(w.a.y, w.b.y))) + 10;
    expect(east - west).toBeCloseTo(850, -1);
    // North face of the main body is at y = 0
    expect(south).toBeCloseTo(750, -1);
  });

  it('has a 0.75 m stair bay on 2. etasje', () => {
    const et2 = level('2. etasje');
    const minY = Math.min(...p.walls.filter((w) => w.levelId === et2.id && w.thickness === 20).flatMap((w) => [w.a.y, w.b.y]));
    expect(minY - 10).toBeCloseTo(-75, -1);
  });

  it('keeps every door and window inside its wall, below the wall top', () => {
    for (const o of p.openings) {
      const w = p.walls.find((x) => x.id === o.wallId)!;
      const L = wallLength(w);
      expect(o.offset - o.width / 2).toBeGreaterThanOrEqual(-1);
      expect(o.offset + o.width / 2).toBeLessThanOrEqual(L + 1);
      for (const t of [o.offset - o.width / 2, o.offset + o.width / 2]) {
        expect(o.sill + o.height).toBeLessThanOrEqual(wallHeightAt(w, pointAlong(w, t)) + 1);
      }
    }
  });

  it('has sensible room sizes', () => {
    const area = (name: string) => Math.abs(polygonArea(p.rooms.find((r) => r.name === name)!.points)) / 10000;
    expect(area('Kjøkken')).toBeGreaterThan(14);
    expect(area('Kjøkken')).toBeLessThan(17);
    expect(area('Stue / spisestue')).toBeGreaterThan(30);
    expect(area('Stue / spisestue')).toBeLessThan(36);
  });

  it('fits the kitchen between its walls with room to walk', () => {
    const et1 = level('1. etasje');
    const units = p.items.filter((i) => i.levelId === et1.id && i.finish === 'putty-front');
    expect(units.length).toBeGreaterThan(10);
    const box = (i: (typeof units)[number]) => {
      const side = i.rotation % 180 !== 0;
      const [w, d] = side ? [i.depth, i.width] : [i.width, i.depth];
      return { x0: i.x - w / 2, x1: i.x + w / 2, y0: i.y - d / 2, y1: i.y + d / 2 };
    };
    // Inside faces of the west, north and hall walls, and of the wall towards the living room
    for (const i of units) {
      const b = box(i);
      expect(b.x0).toBeGreaterThanOrEqual(19);
      expect(b.y0).toBeGreaterThanOrEqual(19);
      expect(b.x1).toBeLessThanOrEqual(551.5);
      expect(b.y1).toBeLessThanOrEqual(314.5);
    }
    // At least 90 cm between the peninsula and the tall units opposite it
    const peninsula = box(units.find((i) => i.name === 'Halvøy (skuffer)')!);
    const fridge = box(units.find((i) => i.name === 'Integrert kjøleskap')!);
    expect(fridge.y0 - peninsula.y1).toBeGreaterThanOrEqual(90);
    // The farmhouse sink sits under the north window
    const sink = units.find((i) => i.kind === 'farmhouseSink')!;
    const north = p.walls.find((w) => w.levelId === et1.id && w.thickness === 20 && w.a.y < 20 && w.b.y < 20 && w.b.x > w.a.x)!;
    const win = p.openings.find((o) => o.wallId === north.id)!;
    expect(Math.abs(north.a.x + win.offset - sink.x)).toBeLessThan(2);
  });
});
