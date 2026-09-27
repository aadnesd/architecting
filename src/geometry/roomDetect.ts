import type { Vec2, Wall } from '../model/types';
import { add, dist, lineIntersect, normalize, perp, pointInPolygon, polygonArea, projectOnSegment, scale, sub, cross } from './math';

interface Seg {
  a: Vec2;
  b: Vec2;
  thickness: number;
}

const key = (p: Vec2) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`;

/** Split wall centre lines where they touch or cross, so they form a planar graph. */
function planarSegments(walls: Wall[]): Seg[] {
  const out: Seg[] = [];
  for (const w of walls) {
    const cuts: number[] = [0, 1];
    for (const o of walls) {
      if (o === w) continue;
      for (const p of [o.a, o.b]) {
        const pr = projectOnSegment(p, w.a, w.b);
        if (pr.distance < 1 && pr.t > 0.001 && pr.t < 0.999) cuts.push(pr.t);
      }
      // Proper crossings
      const d1 = sub(w.b, w.a);
      const d2 = sub(o.b, o.a);
      const den = cross(d1, d2);
      if (Math.abs(den) > 1e-9) {
        const t = cross(sub(o.a, w.a), d2) / den;
        const u = cross(sub(o.a, w.a), d1) / den;
        if (t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < cuts.length; i++) {
      if (cuts[i + 1] - cuts[i] < 1e-4) continue;
      const a = add(w.a, scale(sub(w.b, w.a), cuts[i]));
      const b = add(w.a, scale(sub(w.b, w.a), cuts[i + 1]));
      if (dist(a, b) > 0.5) out.push({ a, b, thickness: w.thickness });
    }
  }
  return out;
}

export interface Face {
  points: Vec2[];
  thickness: number[];
  area: number;
}

/** All bounded faces enclosed by wall centre lines. */
export function findFaces(walls: Wall[]): Face[] {
  const segs = planarSegments(walls);
  const nodes = new Map<string, Vec2>();
  const adj = new Map<string, { to: string; angle: number; thickness: number }[]>();
  const addEdge = (a: Vec2, b: Vec2, t: number) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return;
    nodes.set(ka, a);
    nodes.set(kb, b);
    const list = adj.get(ka) ?? [];
    if (!list.some((e) => e.to === kb)) list.push({ to: kb, angle: Math.atan2(b.y - a.y, b.x - a.x), thickness: t });
    adj.set(ka, list);
  };
  for (const s of segs) {
    addEdge(s.a, s.b, s.thickness);
    addEdge(s.b, s.a, s.thickness);
  }
  for (const list of adj.values()) list.sort((x, y) => x.angle - y.angle);

  const visited = new Set<string>();
  const faces: Face[] = [];
  for (const [from, list] of adj) {
    for (const e of list) {
      const start = `${from}>${e.to}`;
      if (visited.has(start)) continue;
      const pts: Vec2[] = [];
      const th: number[] = [];
      let u = from;
      let edge = e;
      let guard = 0;
      while (guard++ < 10000) {
        const hk = `${u}>${edge.to}`;
        if (visited.has(hk)) break;
        visited.add(hk);
        pts.push(nodes.get(u)!);
        th.push(edge.thickness);
        const v = edge.to;
        const out = adj.get(v)!;
        // Next edge: the one immediately before the reverse edge in angular order (turn as far as possible).
        const back = Math.atan2(nodes.get(u)!.y - nodes.get(v)!.y, nodes.get(u)!.x - nodes.get(v)!.x);
        let idx = out.findIndex((o) => Math.abs(o.angle - back) < 1e-9 || o.to === u);
        idx = (idx - 1 + out.length) % out.length;
        u = v;
        edge = out[idx];
      }
      if (pts.length >= 3) {
        const area = polygonArea(pts);
        // With y pointing down, this traversal gives bounded faces a positive signed area.
        if (area > 1) faces.push({ points: pts, thickness: th, area });
      }
    }
  }
  return faces;
}

/** Offset a face's centre-line polygon inwards by half of each edge's wall thickness. */
export function insetFace(face: Face): Vec2[] {
  const n = face.points.length;
  const sign = face.area > 0 ? 1 : -1;
  const lines = face.points.map((p, i) => {
    const q = face.points[(i + 1) % n];
    const d = normalize(sub(q, p));
    // Inward normal: for a positive-area polygon in y-down coordinates, the interior is on the right (−perp).
    const inward = scale(perp(d), -sign);
    return { p: add(p, scale(inward, face.thickness[i] / 2)), d };
  });
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n];
    const cur = lines[i];
    const x = lineIntersect(prev.p, prev.d, cur.p, cur.d);
    if (x) out.push(x);
    else out.push(cur.p);
  }
  // Drop collinear duplicates
  return out.filter((p, i) => dist(p, out[(i + 1) % out.length]) > 0.5);
}

/** The smallest enclosed area around a point, as an interior (wall-face) polygon. */
export function detectRoomAt(p: Vec2, walls: Wall[]): Vec2[] | null {
  const faces = findFaces(walls).filter((f) => pointInPolygon(p, f.points));
  if (!faces.length) return null;
  faces.sort((a, b) => Math.abs(a.area) - Math.abs(b.area));
  const poly = insetFace(faces[0]);
  return poly.length >= 3 ? poly : null;
}
