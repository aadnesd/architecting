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
    expect(area('Kjøkken')).toBeGreaterThan(7);
    expect(area('Kjøkken')).toBeLessThan(9);
    expect(area('Stue / spisestue')).toBeGreaterThan(38);
    expect(area('Stue / spisestue')).toBeLessThan(45);
  });
});
