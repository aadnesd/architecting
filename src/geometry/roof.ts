import type { Roof } from '../model/types';
import { rotate } from './math';

/** A 3D point in plan coordinates (cm) with height h (cm above the level floor). */
export interface P3 {
  x: number;
  y: number;
  h: number;
}

export type Poly3 = P3[];

export interface RoofGeometry {
  /** Underside faces of the roof surface (the roof is thickened upwards from these). */
  faces: Poly3[];
  /** Vertical infill polygons (gable ends), each with the horizontal direction to thicken it in. */
  infill: { poly: Poly3; inward: { x: number; y: number } }[];
  ridgeHeight: number;
}

type UV = [number, number, number]; // along-ridge, across, height

const tan = (d: number) => Math.tan((d * Math.PI) / 180);

/** Hip roof over a rectangle of half-sizes a (u) x b (v); swaps axes when a < b. */
function hipFaces(a: number, b: number, o: number, h0: number, s: number): UV[][] {
  if (a < b) {
    return hipFaces(b, a, o, h0, s).map((f) => f.map(([u, v, h]) => [v, u, h] as UV));
  }
  const ea = a + o;
  const eb = b + o;
  const he = h0 - o * s;
  const hr = h0 + b * s;
  const r = a - b;
  return [
    [[-ea, -eb, he], [ea, -eb, he], [r, 0, hr], [-r, 0, hr]],
    [[ea, eb, he], [-ea, eb, he], [-r, 0, hr], [r, 0, hr]],
    [[ea, -eb, he], [ea, eb, he], [r, 0, hr]],
    [[-ea, eb, he], [-ea, -eb, he], [-r, 0, hr]],
  ].map((f) => f.filter((p, i, arr) => i === 0 || !(p[0] === arr[i - 1][0] && p[1] === arr[i - 1][1]))) as UV[][];
}

export function buildRoofGeometry(roof: Roof): RoofGeometry {
  const alongWidth = roof.ridgeAlong === 'width';
  const L = alongWidth ? roof.width : roof.depth;
  const S = alongWidth ? roof.depth : roof.width;
  const a = L / 2;
  const b = S / 2;
  const o = Math.max(0, roof.overhang);
  const h0 = roof.baseHeight;
  const pitch = Math.max(0, Math.min(roof.pitch, 80));
  const s = tan(pitch);
  const ea = a + o;
  const eb = b + o;

  const faces: UV[][] = [];
  const infill: { poly: UV[]; inward: [number, number] }[] = [];
  let ridge = h0;

  switch (roof.type) {
    case 'flat': {
      faces.push([[-ea, -eb, h0], [ea, -eb, h0], [ea, eb, h0], [-ea, eb, h0]]);
      break;
    }
    case 'shed': {
      // Low eave at v = -b, rising towards v = +b.
      const hLow = h0 - o * s;
      const hHigh = h0 + (2 * b + o) * s;
      faces.push([[-ea, -eb, hLow], [ea, -eb, hLow], [ea, eb, hHigh], [-ea, eb, hHigh]]);
      const top = h0 + 2 * b * s;
      ridge = top;
      infill.push({ poly: [[a, -b, h0], [a, b, h0], [a, b, top]], inward: [-1, 0] });
      infill.push({ poly: [[-a, -b, h0], [-a, b, top], [-a, b, h0]], inward: [1, 0] });
      infill.push({ poly: [[-a, b, h0], [a, b, h0], [a, b, top], [-a, b, top]], inward: [0, -1] });
      break;
    }
    case 'gable': {
      const he = h0 - o * s;
      const hr = h0 + b * s;
      ridge = hr;
      faces.push([[-ea, -eb, he], [ea, -eb, he], [ea, 0, hr], [-ea, 0, hr]]);
      faces.push([[ea, eb, he], [-ea, eb, he], [-ea, 0, hr], [ea, 0, hr]]);
      for (const sgn of [1, -1]) {
        infill.push({ poly: [[sgn * a, -b, h0], [sgn * a, b, h0], [sgn * a, 0, hr]], inward: [-sgn, 0] });
      }
      break;
    }
    case 'hip': {
      faces.push(...hipFaces(a, b, o, h0, s));
      ridge = h0 + Math.min(a, b) * s;
      break;
    }
    case 'gambrel': {
      // Steep lower slope, the chosen pitch on the upper slope; gable ends.
      const s1 = tan(Math.min(75, Math.max(pitch + 25, 55)));
      const bk = b * 0.5;
      const hb = h0 + (b - bk) * s1;
      const hr = hb + bk * s;
      const he = h0 - o * s1;
      ridge = hr;
      for (const sgn of [-1, 1]) {
        faces.push([[-ea, sgn * eb, he], [ea, sgn * eb, he], [ea, sgn * bk, hb], [-ea, sgn * bk, hb]]);
        faces.push([[-ea, sgn * bk, hb], [ea, sgn * bk, hb], [ea, 0, hr], [-ea, 0, hr]]);
      }
      for (const sgn of [1, -1]) {
        infill.push({
          poly: [[sgn * a, -b, h0], [sgn * a, b, h0], [sgn * a, bk, hb], [sgn * a, 0, hr], [sgn * a, -bk, hb]],
          inward: [-sgn, 0],
        });
      }
      break;
    }
    case 'mansard': {
      const s1 = tan(Math.min(78, Math.max(pitch + 35, 60)));
      const d = Math.min(a, b) * 0.35;
      const hm = h0 + d * s1;
      const he = h0 - o * s1;
      const ia = a - d;
      const ib = b - d;
      faces.push([[-ea, -eb, he], [ea, -eb, he], [ia, -ib, hm], [-ia, -ib, hm]]);
      faces.push([[ea, eb, he], [-ea, eb, he], [-ia, ib, hm], [ia, ib, hm]]);
      faces.push([[ea, -eb, he], [ea, eb, he], [ia, ib, hm], [ia, -ib, hm]]);
      faces.push([[-ea, eb, he], [-ea, -eb, he], [-ia, -ib, hm], [-ia, ib, hm]]);
      faces.push(...hipFaces(ia, ib, 0, hm, s));
      ridge = hm + Math.min(ia, ib) * s;
      break;
    }
  }

  // Map (u, v) into roof-local plan coordinates, then rotate and translate into plan space.
  const toPlan = ([u, vv, h]: UV): P3 => {
    const lx = alongWidth ? u : vv;
    const ly = alongWidth ? vv : u;
    const p = rotate({ x: lx, y: ly }, roof.rotation);
    return { x: p.x + roof.x, y: p.y + roof.y, h };
  };
  const dirToPlan = ([du, dv]: [number, number]) => {
    const lx = alongWidth ? du : dv;
    const ly = alongWidth ? dv : du;
    return rotate({ x: lx, y: ly }, roof.rotation);
  };

  return {
    faces: faces.map((f) => f.map(toPlan)),
    infill: roof.gableWalls ? infill.map((f) => ({ poly: f.poly.map(toPlan), inward: dirToPlan(f.inward) })) : [],
    ridgeHeight: ridge,
  };
}

/** Plan-view line segments (eaves outline, ridges, hips) for drawing a roof in the 2D plan. */
export function roofPlanLines(roof: Roof) {
  const g = buildRoofGeometry(roof);
  const seen = new Map<string, { a: P3; b: P3; count: number }>();
  const key = (p: P3) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  for (const f of g.faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      const k1 = key(a);
      const k2 = key(b);
      if (k1 === k2) continue;
      const k = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      const e = seen.get(k);
      if (e) e.count++;
      else seen.set(k, { a, b, count: 1 });
    }
  }
  const outline: { a: P3; b: P3 }[] = [];
  const inner: { a: P3; b: P3 }[] = [];
  for (const e of seen.values()) (e.count === 1 ? outline : inner).push(e);
  return { outline, inner, ridgeHeight: g.ridgeHeight };
}
