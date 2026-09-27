import type { Item, Project, Vec2, Wall } from '../model/types';
import { add, angleOf, dist, dot, normalize, perp, projectOnSegment, rad, rotate, scale, snapTo, sub } from '../geometry/math';
import { sideOfWall, wallDir, wallLength } from '../geometry/walls';
import { getCatalogItem } from '../model/catalog';

export interface Guide {
  a: Vec2;
  b: Vec2;
}

export interface SnapResult {
  point: Vec2;
  /** What the point snapped to, for visual feedback. */
  kind: 'none' | 'grid' | 'endpoint' | 'wall' | 'angle' | 'align';
  guides: Guide[];
}

export interface SnapOptions {
  grid: number;
  snapGrid: boolean;
  snapObjects: boolean;
  /** World units per screen pixel. */
  pxToWorld: number;
  /** Previous point of a chain, enabling angle snapping. */
  from?: Vec2;
  /** End points to ignore (e.g. the one being dragged). */
  ignore?: Vec2[];
  disabled?: boolean;
}

/** Snap a point for wall drawing / editing: end points, walls, alignment, angles and grid. */
export function snapPoint(p: Vec2, walls: Wall[], o: SnapOptions): SnapResult {
  if (o.disabled) return { point: p, kind: 'none', guides: [] };
  const tol = 12 * o.pxToWorld;
  const ignored = (q: Vec2) => o.ignore?.some((i) => dist(i, q) < 0.5);
  const endpoints = walls.flatMap((w) => [w.a, w.b]).filter((q) => !ignored(q));

  if (o.snapObjects) {
    let best: Vec2 | null = null;
    let bestD = tol;
    for (const q of endpoints) {
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    if (best) return { point: { ...best }, kind: 'endpoint', guides: [] };
  }

  let point = { ...p };
  let kind: SnapResult['kind'] = 'none';
  const guides: Guide[] = [];

  // Angle snapping relative to the chain start: lock to 15° steps when close.
  if (o.from && dist(o.from, p) > 1) {
    const ang = angleOf(o.from, p);
    const snapped = Math.round(ang / 15) * 15;
    if (Math.abs(snapped - ang) < 4) {
      const L = dist(o.from, p);
      const Ls = o.snapGrid ? Math.max(o.grid, snapTo(L, o.grid)) : L;
      point = add(o.from, { x: Math.cos(rad(snapped)) * Ls, y: Math.sin(rad(snapped)) * Ls });
      kind = 'angle';
    }
  }

  if (o.snapObjects) {
    // Align with other end points horizontally / vertically.
    let ax: Vec2 | null = null;
    let ay: Vec2 | null = null;
    for (const q of endpoints) {
      if (Math.abs(q.x - point.x) < tol * 0.7 && (!ax || Math.abs(q.x - point.x) < Math.abs(ax.x - point.x))) ax = q;
      if (Math.abs(q.y - point.y) < tol * 0.7 && (!ay || Math.abs(q.y - point.y) < Math.abs(ay.y - point.y))) ay = q;
    }
    const angleLockedAxis = kind === 'angle' && o.from ? Math.round(angleOf(o.from, point)) % 90 === 0 : false;
    if (ax && !(angleLockedAxis && Math.abs(point.x - o.from!.x) < 0.5)) {
      point.x = ax.x;
      guides.push({ a: ax, b: { ...point } });
      kind = 'align';
    }
    if (ay && !(angleLockedAxis && Math.abs(point.y - o.from!.y) < 0.5)) {
      point.y = ay.y;
      guides.push({ a: ay, b: { ...point } });
      kind = 'align';
    }
    if (kind !== 'none') return { point, kind, guides };

    // On an existing wall axis (T-junction)
    for (const w of walls) {
      const pr = projectOnSegment(p, w.a, w.b);
      if (pr.distance < Math.max(tol * 0.6, w.thickness / 2)) {
        let q = pr.point;
        if (o.snapGrid) {
          const L = wallLength(w);
          const t = snapTo(pr.t * L, o.grid) / L;
          if (t > 0 && t < 1) q = add(w.a, scale(sub(w.b, w.a), t));
        }
        return { point: q, kind: 'wall', guides: [] };
      }
    }
  }

  if (kind === 'angle') return { point, kind, guides };
  if (o.snapGrid) return { point: { x: snapTo(p.x, o.grid), y: snapTo(p.y, o.grid) }, kind: 'grid', guides: [] };
  return { point, kind, guides };
}

export interface ItemSnap {
  x: number;
  y: number;
  rotation: number;
  guides: Guide[];
  wallId?: string;
}

/**
 * Magnetic placement for furniture: backs snap against the nearest wall face (rotating to face the room),
 * and sides snap to neighbouring items and perpendicular walls.
 */
export function snapItem(item: Pick<Item, 'kind' | 'width' | 'depth' | 'rotation' | 'id'>, p: Vec2, project: Project, levelId: string, o: SnapOptions): ItemSnap {
  const walls = project.walls.filter((w) => w.levelId === levelId);
  const others = project.items.filter((i) => i.levelId === levelId && i.id !== item.id);
  const wallSnap = getCatalogItem(item.kind)?.wallSnap ?? false;
  if (o.disabled || !o.snapObjects) {
    return o.snapGrid && !o.disabled ? { x: snapTo(p.x, o.grid), y: snapTo(p.y, o.grid), rotation: item.rotation, guides: [] } : { ...p, rotation: item.rotation, guides: [] };
  }

  if (wallSnap) {
    let best: { w: Wall; d: number } | null = null;
    for (const w of walls) {
      const pr = projectOnSegment(p, w.a, w.b);
      if (pr.t <= 0 || pr.t >= 1) continue;
      const reach = w.thickness / 2 + item.depth / 2 + Math.max(25, item.depth * 0.5);
      if (pr.distance < reach && (!best || pr.distance < best.d)) best = { w, d: pr.distance };
    }
    if (best) {
      const w = best.w;
      const u = wallDir(w);
      const side = sideOfWall(w, p);
      const n = scale(perp(u), side);
      const rotation = ((Math.round(angleOf({ x: 0, y: 0 }, n) - 90) % 360) + 360) % 360;
      let s = dot(sub(p, w.a), u);
      const off = w.thickness / 2 + item.depth / 2;
      const guides: Guide[] = [];
      // Candidate side positions along the wall
      const cands: { s: number; guide?: Guide }[] = [];
      const faceLine = add(w.a, scale(n, w.thickness / 2));
      for (const it of others) {
        const rd = Math.abs((((it.rotation - rotation) % 360) + 540) % 360 - 180);
        if (rd > 1) continue;
        const dn = dot(sub(it, faceLine), n);
        if (dn < -5 || dn > it.depth + 60) continue;
        const si = dot(sub(it, w.a), u);
        cands.push({ s: si + it.width / 2 + item.width / 2 }, { s: si - it.width / 2 - item.width / 2 });
      }
      for (const w2 of walls) {
        if (w2 === w) continue;
        const u2 = wallDir(w2);
        if (Math.abs(dot(u2, u)) > 0.1) continue;
        for (const sg of [1, -1]) {
          const face = add(w2.a, scale(perp(u2), (sg * w2.thickness) / 2));
          const sf = dot(sub(face, w.a), u);
          cands.push({ s: sf + item.width / 2 }, { s: sf - item.width / 2 });
        }
      }
      const tol = 10;
      let bestC: number | null = null;
      for (const c of cands) if (Math.abs(c.s - s) < tol && (bestC === null || Math.abs(c.s - s) < Math.abs(bestC - s))) bestC = c.s;
      if (bestC !== null) s = bestC;
      else if (o.snapGrid) s = snapTo(s, o.grid / 2);
      const c = add(add(w.a, scale(u, s)), scale(n, off));
      return { x: c.x, y: c.y, rotation, guides, wallId: w.id };
    }
  }

  // Free placement: align edges with neighbouring items of the same orientation.
  let x = p.x;
  let y = p.y;
  const tol = 8 * o.pxToWorld + 2;
  let snappedX = false;
  let snappedY = false;
  const guides: Guide[] = [];
  const ext = (it: { width: number; depth: number; rotation: number }) => {
    const r = Math.round(it.rotation) % 180;
    return r === 90 ? { hw: it.depth / 2, hd: it.width / 2 } : { hw: it.width / 2, hd: it.depth / 2 };
  };
  const me = ext(item);
  if (Math.round(item.rotation) % 90 === 0) {
    for (const it of others) {
      if (Math.round(it.rotation) % 90 !== 0) continue;
      const e = ext(it);
      const xs = [it.x - e.hw - me.hw, it.x + e.hw + me.hw, it.x - e.hw + me.hw, it.x + e.hw - me.hw, it.x];
      const ys = [it.y - e.hd - me.hd, it.y + e.hd + me.hd, it.y - e.hd + me.hd, it.y + e.hd - me.hd, it.y];
      if (!snappedX)
        for (const cx of xs)
          if (Math.abs(cx - x) < tol) {
            x = cx;
            snappedX = true;
            guides.push({ a: { x: cx, y: it.y }, b: { x: cx, y } });
            break;
          }
      if (!snappedY)
        for (const cy of ys)
          if (Math.abs(cy - y) < tol) {
            y = cy;
            snappedY = true;
            guides.push({ a: { x: it.x, y: cy }, b: { x, y: cy } });
            break;
          }
    }
  }
  if (o.snapGrid) {
    if (!snappedX) x = snapTo(x, o.grid);
    if (!snappedY) y = snapTo(y, o.grid);
  }
  return { x, y, rotation: item.rotation, guides };
}

/** Nearest wall to a point within a tolerance, and the offset along it. */
export function nearestWall(p: Vec2, walls: Wall[], maxDist: number) {
  let best: { wall: Wall; offset: number; distance: number } | null = null;
  for (const w of walls) {
    const pr = projectOnSegment(p, w.a, w.b);
    if (pr.distance < maxDist + w.thickness / 2 && (!best || pr.distance < best.distance)) {
      best = { wall: w, offset: pr.t * wallLength(w), distance: pr.distance };
    }
  }
  return best;
}

/** Item corners in plan coordinates. */
export function itemCorners(it: Pick<Item, 'x' | 'y' | 'width' | 'depth' | 'rotation'>) {
  const hw = it.width / 2;
  const hd = it.depth / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((q) => add(rotate(q, it.rotation), it));
}

export const unitDir = (a: Vec2, b: Vec2) => normalize(sub(b, a));
