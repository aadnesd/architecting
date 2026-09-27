import { describe, expect, it } from 'vitest';
import { parseLength, formatLength } from './units';
import { detectRoomAt, findFaces } from './roomDetect';
import { polygonArea } from './math';
import { wallFootprint } from './walls';
import { buildRoofGeometry, roofPlanLines } from './roof';
import { createRoof, createWall, wallLoop } from '../model/factory';

const square = (s: number) => [
  { x: 0, y: 0 },
  { x: s, y: 0 },
  { x: s, y: s },
  { x: 0, y: s },
];

describe('units', () => {
  it('parses plain numbers in the default unit', () => {
    expect(parseLength('240', 'cm')).toBe(240);
    expect(parseLength('2.4', 'm')).toBeCloseTo(240);
    expect(parseLength('2400', 'mm')).toBeCloseTo(240);
  });
  it('parses explicit units and feet-inches', () => {
    expect(parseLength('2.4m', 'cm')).toBeCloseTo(240);
    expect(parseLength("8'6\"", 'cm')).toBeCloseTo(8 * 30.48 + 6 * 2.54);
    expect(parseLength('36in', 'cm')).toBeCloseTo(91.44);
    expect(parseLength('2,5 m', 'cm')).toBeCloseTo(250);
  });
  it('evaluates arithmetic', () => {
    expect(parseLength('240+60', 'cm')).toBe(300);
    expect(parseLength('(300-10)/2', 'cm')).toBe(145);
    expect(parseLength('3*60', 'cm')).toBe(180);
    expect(parseLength('1m+20cm', 'mm')).toBeCloseTo(120);
  });
  it('rejects garbage', () => {
    expect(parseLength('abc', 'cm')).toBeNull();
    expect(parseLength('', 'cm')).toBeNull();
    expect(parseLength('5/0', 'cm')).toBeNull();
  });
  it('formats', () => {
    expect(formatLength(250, 'm')).toBe('2.5 m');
    expect(formatLength(91.44, 'ft')).toBe(`3' 0"`);
    expect(formatLength(12.34, 'mm')).toBe('123 mm');
  });
});

describe('wall mitres', () => {
  it('meets at the outer and inner corners of an L joint', () => {
    const w1 = createWall('L', { x: 0, y: 0 }, { x: 400, y: 0 }, { thickness: 20 });
    const w2 = createWall('L', { x: 400, y: 0 }, { x: 400, y: 300 }, { thickness: 20 });
    const f = wallFootprint(w1, [w1, w2]);
    // Left of w1 (a->b along +x in a y-down plan) is y < 0, the outside of the corner.
    expect(f.endLeft.x).toBeCloseTo(410);
    expect(f.endLeft.y).toBeCloseTo(-10);
    expect(f.endRight.x).toBeCloseTo(390);
    expect(f.endRight.y).toBeCloseTo(10);
    // Free end stays square
    expect(f.startLeft).toEqual({ x: 0, y: -10 });
  });
});

describe('room detection', () => {
  it('finds one bounded face for a closed square', () => {
    const walls = wallLoop('L', square(400), { thickness: 20 });
    const faces = findFaces(walls);
    expect(faces).toHaveLength(1);
    expect(Math.abs(faces[0].area)).toBeCloseTo(160000);
  });
  it('returns the wall-face polygon around a point', () => {
    const walls = wallLoop('L', square(400), { thickness: 20 });
    const poly = detectRoomAt({ x: 100, y: 100 }, walls)!;
    expect(poly).not.toBeNull();
    expect(Math.abs(polygonArea(poly))).toBeCloseTo(380 * 380);
  });
  it('handles a dividing wall with T-junctions', () => {
    const walls = [...wallLoop('L', square(400), { thickness: 20 }), createWall('L', { x: 200, y: 0 }, { x: 200, y: 400 }, { thickness: 10 })];
    const left = detectRoomAt({ x: 50, y: 200 }, walls)!;
    const right = detectRoomAt({ x: 350, y: 200 }, walls)!;
    expect(Math.abs(polygonArea(left))).toBeCloseTo((200 - 10 - 5) * 380);
    expect(Math.abs(polygonArea(right))).toBeCloseTo((200 - 10 - 5) * 380);
  });
  it('returns null outside', () => {
    const walls = wallLoop('L', square(400), { thickness: 20 });
    expect(detectRoomAt({ x: 600, y: 100 }, walls)).toBeNull();
  });
});

describe('roofs', () => {
  it('computes gable ridge height from pitch', () => {
    const r = createRoof('L', 0, 0, 800, 600, { type: 'gable', pitch: 45, baseHeight: 250, overhang: 0 });
    const g = buildRoofGeometry(r);
    expect(g.faces).toHaveLength(2);
    expect(g.ridgeHeight).toBeCloseTo(250 + 300);
    expect(g.infill).toHaveLength(2);
  });
  it('produces a hip roof with 4 faces and a ridge of length L - S', () => {
    const r = createRoof('L', 0, 0, 1000, 600, { type: 'hip', pitch: 30, overhang: 0 });
    const lines = roofPlanLines(r);
    expect(lines.outline).toHaveLength(4);
    // 1 ridge + 4 hips
    expect(lines.inner).toHaveLength(5);
  });
  it('turns into a pyramid for square hip roofs', () => {
    const r = createRoof('L', 0, 0, 600, 600, { type: 'hip', pitch: 30, overhang: 0 });
    expect(roofPlanLines(r).inner).toHaveLength(4);
  });
  it('rotates the ridge with ridgeAlong', () => {
    const r = createRoof('L', 0, 0, 800, 400, { type: 'gable', pitch: 45, overhang: 0, ridgeAlong: 'depth' });
    // Span is now the width (800) → ridge is 400 above base
    expect(buildRoofGeometry(r).ridgeHeight).toBeCloseTo(r.baseHeight + 400);
  });
  it('builds every roof type', () => {
    for (const type of ['flat', 'shed', 'gable', 'hip', 'gambrel', 'mansard'] as const) {
      const g = buildRoofGeometry(createRoof('L', 0, 0, 900, 700, { type }));
      expect(g.faces.length).toBeGreaterThan(0);
      for (const f of g.faces) for (const p of f) expect(Number.isFinite(p.h)).toBe(true);
    }
  });
});
