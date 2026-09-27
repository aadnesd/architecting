import type { Opening, Vec2, Wall } from '../model/types';
import { add, angleOf, dist, lineIntersect, normAngle, normalize, perp, samePoint, scale, sub, projectOnSegment, dot } from './math';

export interface WallFootprint {
  startLeft: Vec2;
  startRight: Vec2;
  endLeft: Vec2;
  endRight: Vec2;
}

export const wallLength = (w: Wall) => dist(w.a, w.b);
export const wallDir = (w: Wall) => normalize(sub(w.b, w.a));

/** Walls (other than `self`) that have an end point at `p`. */
export function wallsAtPoint(p: Vec2, walls: Wall[], self?: Wall) {
  return walls.filter((w) => w !== self && w.id !== self?.id && (samePoint(w.a, p) || samePoint(w.b, p)));
}

/**
 * Corner points for one end of `wall` at joint point `p`, mitred against the neighbouring walls.
 * Returns [left, right] relative to the direction pointing away from the joint along the wall.
 */
function jointCorners(wall: Wall, p: Vec2, walls: Wall[]): [Vec2, Vec2] {
  const other = samePoint(wall.a, p) ? wall.b : wall.a;
  const d = normalize(sub(other, p));
  const n = perp(d);
  const ht = wall.thickness / 2;
  const plainLeft = add(p, scale(n, ht));
  const plainRight = add(p, scale(n, -ht));
  const neighbours = wallsAtPoint(p, walls, wall).filter((w) => w.levelId === wall.levelId);
  if (!neighbours.length) return [plainLeft, plainRight];

  const aw = angleOf({ x: 0, y: 0 }, d);
  let leftN: { w: Wall; d: Vec2 } | null = null;
  let rightN: { w: Wall; d: Vec2 } | null = null;
  let minT = Infinity;
  let maxT = -Infinity;
  for (const w of neighbours) {
    const o = samePoint(w.a, p) ? w.b : w.a;
    const dn = normalize(sub(o, p));
    // Rotating towards the left side corresponds to decreasing screen angle.
    const theta = normAngle(aw - angleOf({ x: 0, y: 0 }, dn));
    if (theta < 0.5 || theta > 359.5) continue; // overlapping walls
    if (theta < minT) {
      minT = theta;
      leftN = { w, d: dn };
    }
    if (theta > maxT) {
      maxT = theta;
      rightN = { w, d: dn };
    }
  }

  const limit = Math.max(wall.thickness, 1) * 4;
  const miter = (sideSign: 1 | -1, nb: { w: Wall; d: Vec2 } | null, fallback: Vec2) => {
    if (!nb) return fallback;
    const nn = perp(nb.d);
    // Our left side meets the neighbour's right side, and vice versa.
    const ourLine = add(p, scale(n, sideSign * ht));
    const theirLine = add(p, scale(nn, -sideSign * (nb.w.thickness / 2)));
    const x = lineIntersect(ourLine, d, theirLine, nb.d);
    if (!x || dist(x, p) > limit) return fallback;
    return x;
  };
  return [miter(1, leftN, plainLeft), miter(-1, rightN, plainRight)];
}

export function wallFootprint(wall: Wall, walls: Wall[]): WallFootprint {
  const [sL, sR] = jointCorners(wall, wall.a, walls);
  const [eL, eR] = jointCorners(wall, wall.b, walls);
  // At the b end, "left relative to away direction" is the wall's right side.
  return { startLeft: sL, startRight: sR, endLeft: eR, endRight: eL };
}

export function footprintPolygon(f: WallFootprint): Vec2[] {
  return [f.startLeft, f.endLeft, f.endRight, f.startRight];
}

/** Wall height at a point, interpolated along the wall axis (for sloped walls). */
export function wallHeightAt(wall: Wall, p: Vec2) {
  const hEnd = wall.heightEnd ?? wall.height;
  if (hEnd === wall.height) return wall.height;
  const { t } = projectOnSegment(p, wall.a, wall.b);
  return wall.height + (hEnd - wall.height) * t;
}

/** Point on the wall axis at a distance along it. */
export function pointAlong(wall: Wall, offset: number): Vec2 {
  return add(wall.a, scale(wallDir(wall), offset));
}

export function openingCenter(wall: Wall, o: Opening) {
  return pointAlong(wall, o.offset);
}

export function clampOpeningOffset(wall: Wall, width: number, offset: number) {
  const L = wallLength(wall);
  const half = Math.min(width / 2, L / 2);
  return Math.max(half, Math.min(L - half, offset));
}

/** Split a wall at a distance from a; openings are redistributed. Returns the two new walls. */
export function splitWallAt(wall: Wall, offset: number, newId: string): [Wall, Wall] {
  const p = pointAlong(wall, offset);
  const L = wallLength(wall);
  const hEnd = wall.heightEnd ?? wall.height;
  const hMid = wall.height + ((hEnd - wall.height) * offset) / L;
  const w1: Wall = { ...wall, b: p, heightEnd: wall.heightEnd !== undefined ? hMid : undefined };
  const w2: Wall = { ...wall, id: newId, a: p, height: wall.heightEnd !== undefined ? hMid : wall.height };
  return [w1, w2];
}

/** Which side of the wall axis a point is on: 1 for left, -1 for right. */
export function sideOfWall(wall: Wall, p: Vec2): 1 | -1 {
  return dot(sub(p, wall.a), perp(wallDir(wall))) >= 0 ? 1 : -1;
}
