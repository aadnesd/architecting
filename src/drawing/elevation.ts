import type { Item, Opening, Project, Vec2, Wall } from '../model/types';
import { add, dot, perp, pointInPolygon, rotate, scale, sub } from '../geometry/math';
import { pointAlong, wallDir, wallHeightAt, wallLength } from '../geometry/walls';
import { getMaterialDef } from '../model/materials';
import { isDoorKind } from '../model/catalog';
import { itemCorners } from '../plan/snapping';

/**
 * Wall elevations ("oppriss") as A3 drawing sheets at a true architectural scale: the wall seen
 * straight on from one side, with its doors and windows, the furniture standing against it drawn
 * in front view (doors, drawers, handles, worktops, hoods…), and dimension chains in millimetres.
 * Sheets are SVG with sizes in mm, so printing at 100 % gives the stated scale.
 */

export interface ElevationView {
  wall: Wall;
  /** 1 = the wall's left side (looking from a to b), -1 = its right side. */
  side: 1 | -1;
  /** Visible stretch of the wall, as distances from its start point a. */
  t0: number;
  t1: number;
  items: Item[];
  title: string;
  /** Whether another wall meets this one at each end of the stretch (drawn as a cut wall). */
  cutStart: boolean;
  cutEnd: boolean;
}

const PLINTH = 10;
const TOP = 4;
/** How far in front of the wall face objects are still drawn. */
const MAX_DEPTH = 100;

/** Objects that look the same from every side. */
const ROUND = new Set(['pendantLamp', 'schoolhousePendant', 'ceilingLight', 'floorLamp', 'plant', 'roundTable', 'barStool', 'cylinder', 'tree', 'conifer', 'shrub']);

const BASE_KINDS = new Set(['baseCabinet', 'drawerCabinet', 'cornerCabinet', 'sinkCabinet', 'farmhouseSink', 'cooktopCabinet', 'dishwasher']);

// ───────────────────────── geometry of a view ─────────────────────────

interface Frame {
  /** Unit vector pointing out of the wall face towards the viewer. */
  n: Vec2;
  /** Viewer's right-hand direction. */
  r: Vec2;
  /** A point on the face line (at the wall's start). */
  o: Vec2;
}

function frameOf(wall: Wall, side: 1 | -1): Frame {
  const u = wallDir(wall);
  const n = scale(perp(u), side);
  // Facing the wall means looking along -n; on a y-down plan, right of a heading f is (-f.y, f.x).
  const f = scale(n, -1);
  const r = { x: -f.y, y: f.x };
  return { n, r, o: add(wall.a, scale(n, wall.thickness / 2)) };
}

/** Horizontal drawing coordinate (cm) of a plan point. */
const X = (fr: Frame, p: Vec2) => dot(sub(p, fr.o), fr.r);
/** Distance of a plan point in front of the face. */
const depthOf = (fr: Frame, p: Vec2) => dot(sub(p, fr.o), fr.n);

function itemDepth(fr: Frame, it: Item) {
  const d = itemCorners(it).map((c) => depthOf(fr, c));
  return { min: Math.min(...d), max: Math.max(...d) };
}

function itemSpan(fr: Frame, it: Item) {
  const xs = itemCorners(it).map((c) => X(fr, c));
  return { x0: Math.min(...xs), x1: Math.max(...xs), cx: X(fr, it) };
}

function candidates(p: Project, wall: Wall, side: 1 | -1) {
  const fr = frameOf(wall, side);
  return p.items.filter((it) => {
    if (it.levelId !== wall.levelId || it.kind === 'rug' || it.kind === 'terrainPlatform') return false;
    const d = itemDepth(fr, it);
    return d.max > 0.5 && d.min > -5 && d.min < MAX_DEPTH;
  });
}

/** Distances along `wall` where other walls meet its face on `side` (their near faces). */
function crossings(p: Project, wall: Wall, side: 1 | -1): number[] {
  const fr = frameOf(wall, side);
  const u = wallDir(wall);
  const L = wallLength(wall);
  const out: number[] = [0, L];
  for (const w of p.walls) {
    if (w.id === wall.id || w.levelId !== wall.levelId) continue;
    const da = depthOf(fr, w.a);
    const db = depthOf(fr, w.b);
    // The other wall must reach the face and run out into the room on this side
    const near = Math.min(Math.abs(da), Math.abs(db));
    if (near > wall.thickness / 2 + w.thickness / 2 + 2 || Math.max(da, db) < 20) continue;
    const dir = wallDir(w);
    if (Math.abs(dot(dir, u)) > 0.3) continue;
    const at = Math.abs(da) < Math.abs(db) ? w.a : w.b;
    const t = dot(sub(at, wall.a), u);
    if (t < -w.thickness || t > L + w.thickness) continue;
    out.push(t - w.thickness / 2, t + w.thickness / 2);
  }
  return [...new Set(out.map((t) => Math.round(Math.max(0, Math.min(L, t)) * 10) / 10))].sort((a, b) => a - b);
}

/** Whether another wall on the level ends at or passes through point `q`. */
function joined(p: Project, wall: Wall, q: Vec2) {
  return p.walls.some((w) => w.id !== wall.id && w.levelId === wall.levelId && Math.hypot(w.a.x - q.x, w.a.y - q.y) + Math.hypot(w.b.x - q.x, w.b.y - q.y) - wallLength(w) < 1);
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Builds the view of one side of a wall, cropped to the stretch between the walls that meet it. */
export function elevationView(p: Project, wallId: string, side?: 1 | -1): ElevationView | null {
  const wall = p.walls.find((w) => w.id === wallId);
  if (!wall) return null;
  const s: 1 | -1 = side ?? (candidates(p, wall, 1).length >= candidates(p, wall, -1).length ? 1 : -1);
  const fr = frameOf(wall, s);
  const u = wallDir(wall);
  const tOf = (it: Item) => dot(sub(it, wall.a), u);
  const all = candidates(p, wall, s);
  const cuts = crossings(p, wall, s);
  // Pick the stretch between crossings that holds the most furniture (ties: the longest)
  let best = { t0: 0, t1: wallLength(wall), n: -1 };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i], cuts[i + 1]];
    if (b - a < 30) continue;
    const n = all.filter((it) => tOf(it) > a && tOf(it) < b).length;
    if (n > best.n || (n === best.n && b - a > best.t1 - best.t0)) best = { t0: a, t1: b, n };
  }
  const items = all.filter((it) => tOf(it) > best.t0 && tOf(it) < best.t1);
  // Name the wall by the compass direction the viewer looks in (plan: -y is north, +x is east)
  const look = scale(fr.n, -1);
  const bearing = (Math.atan2(look.x, -look.y) * 180) / Math.PI;
  const facing = DIRS[(Math.round(((bearing % 360) + 360) / 45) % 8 + 8) % 8];
  // Name the room the furniture stands in (or the middle of the stretch when there is none)
  const mid = items.length
    ? { x: items.reduce((s, i) => s + i.x, 0) / items.length, y: items.reduce((s, i) => s + i.y, 0) / items.length }
    : add(pointAlong(wall, (best.t0 + best.t1) / 2), scale(fr.n, wall.thickness / 2 + 40));
  const room = p.rooms.find((r) => r.levelId === wall.levelId && pointInPolygon(mid, r.points));
  const title = `${room ? `${room.name} – ` : ''}${facing[0].toUpperCase()}${facing.slice(1)} wall`;
  const L = wallLength(wall);
  return { wall, side: s, t0: best.t0, t1: best.t1, items, title, cutStart: best.t0 > 0.5 || joined(p, wall, wall.a), cutEnd: best.t1 < L - 0.5 || joined(p, wall, wall.b) };
}

/** Walls on a level worth drawing: at least three objects stand with their back against them. */
export function elevationWalls(p: Project, levelId: string): ElevationView[] {
  const out: ElevationView[] = [];
  for (const wall of p.walls.filter((w) => w.levelId === levelId)) {
    for (const side of [1, -1] as const) {
      const fr = frameOf(wall, side);
      const backed = candidates(p, wall, side).filter((it) => {
        const front = rotate({ x: 0, y: 1 }, it.rotation);
        return dot(front, fr.n) > 0.7 && itemDepth(fr, it).min < 8;
      });
      if (backed.length >= 3) {
        const v = elevationView(p, wall.id, side);
        if (v && v.items.length >= 3) out.push(v);
      }
    }
  }
  return out;
}

// ───────────────────────── SVG painter (paper mm) ─────────────────────────

const PEN = { heavy: 0.5, mid: 0.35, thin: 0.18, hair: 0.1 };
const TEXT = 2.5;

class Sheet {
  parts: string[] = [];
  constructor(
    /** paper mm per model cm */
    public k: number,
    /** paper position of model (0, 0) */
    public ox: number,
    public oy: number,
  ) {}
  px(x: number) {
    return this.ox + x * this.k;
  }
  py(y: number) {
    return this.oy - y * this.k;
  }
  line(x1: number, y1: number, x2: number, y2: number, w = PEN.thin, extra = '') {
    this.parts.push(`<line x1="${f(this.px(x1))}" y1="${f(this.py(y1))}" x2="${f(this.px(x2))}" y2="${f(this.py(y2))}" stroke-width="${w}"${extra}/>`);
  }
  rect(x0: number, y0: number, x1: number, y1: number, w = PEN.thin, fill = '#fff', extra = '') {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    this.parts.push(`<rect x="${f(this.px(ax))}" y="${f(this.py(by))}" width="${f((bx - ax) * this.k)}" height="${f((by - ay) * this.k)}" stroke-width="${w}" fill="${fill}"${extra}/>`);
  }
  poly(pts: [number, number][], w = PEN.thin, fill = '#fff', close = true) {
    const d = pts.map(([x, y]) => `${f(this.px(x))},${f(this.py(y))}`).join(' ');
    this.parts.push(`<${close ? 'polygon' : 'polyline'} points="${d}" stroke-width="${w}" fill="${close ? fill : 'none'}"/>`);
  }
  circle(x: number, y: number, r: number, w = PEN.thin, fill = '#fff') {
    this.parts.push(`<circle cx="${f(this.px(x))}" cy="${f(this.py(y))}" r="${f(r * this.k)}" stroke-width="${w}" fill="${fill}"/>`);
  }
  path(d: string, w = PEN.thin, fill = 'none') {
    this.parts.push(`<path d="${d}" stroke-width="${w}" fill="${fill}"/>`);
  }
  /** Text at a model position, size in paper mm. */
  text(x: number, y: number, s: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; rotate?: boolean; weight?: number } = {}) {
    const [tx, ty] = [this.px(x), this.py(y)];
    const rot = o.rotate ? ` transform="rotate(-90 ${f(tx)} ${f(ty)})"` : '';
    this.parts.push(
      `<text x="${f(tx)}" y="${f(ty)}" font-size="${o.size ?? TEXT}" text-anchor="${o.anchor ?? 'middle'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${rot} stroke="none" fill="#111">${esc(s)}</text>`,
    );
  }
}

const f = (n: number) => String(Math.round(n * 100) / 100);
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const mm = (cm: number) => String(Math.round(cm * 10));

// ───────────────────────── furniture in front view ─────────────────────────

/** Draws in an item's local frame: x across its width (centre 0), y up from the floor. */
interface Local {
  rect(x0: number, y0: number, x1: number, y1: number, w?: number, fill?: string): void;
  line(x0: number, y0: number, x1: number, y1: number, w?: number): void;
  circle(x: number, y: number, r: number, w?: number): void;
  poly(pts: [number, number][], w?: number, fill?: string, close?: boolean): void;
}

function localPainter(sh: Sheet, cx: number, sign: number, elev: number): Local {
  const X = (x: number) => cx + sign * x;
  return {
    rect: (x0, y0, x1, y1, w, fill) => sh.rect(X(x0), elev + y0, X(x1), elev + y1, w, fill),
    line: (x0, y0, x1, y1, w) => sh.line(X(x0), elev + y0, X(x1), elev + y1, w),
    circle: (x, y, r, w) => sh.circle(X(x), elev + y, r, w),
    poly: (pts, w, fill, close) => sh.poly(pts.map(([x, y]) => [X(x), elev + y]), w, fill, close),
  };
}

interface FrontOpts {
  cols?: number;
  rows?: number[];
  drawers?: boolean;
  handleTop?: boolean;
  shaker: boolean;
  wallHung?: boolean;
}

/** Door and drawer fronts with gaps, shaker frames and handles. */
function fronts(L: Local, x0: number, x1: number, y0: number, y1: number, o: FrontOpts) {
  const rows = o.rows ?? [1];
  const cols = o.cols ?? 1;
  const h = y1 - y0;
  const w = x1 - x0;
  const gap = 0.3;
  let top = y1;
  rows.forEach((fr) => {
    const rh = h * fr;
    const cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const a = x0 + cw * c + gap;
      const b = x0 + cw * (c + 1) - gap;
      const lo = top - rh + gap;
      const hi = top - gap;
      L.rect(a, lo, b, hi, PEN.thin);
      if (o.shaker) {
        const rail = Math.min(6.5, Math.min(b - a, hi - lo) * 0.2);
        L.rect(a + rail, lo + rail, b - rail, hi - rail, PEN.hair);
      }
      const drawer = o.drawers ?? rows.length > 1;
      const mid = (a + b) / 2;
      if (drawer || o.handleTop) {
        const hy = o.handleTop ? hi - 5 : (lo + hi) / 2 + Math.min(3, (hi - lo) * 0.15);
        if (o.shaker) L.poly([[mid - 4.5, hy + 0.6], [mid - 4.5, hy - 0.6], [mid - 3, hy - 1.6], [mid + 3, hy - 1.6], [mid + 4.5, hy - 0.6], [mid + 4.5, hy + 0.6]], PEN.thin, '#fff');
        else L.line(mid - Math.min(15, (b - a) / 4), hy, mid + Math.min(15, (b - a) / 4), hy, PEN.mid);
      } else {
        const hx = cols > 1 ? (c % 2 === 0 ? b - 5 : a + 5) : b - 5;
        const hy = o.wallHung ? lo + 7 : hi - 7;
        if (o.shaker) L.circle(hx, hy, 1.3);
        else L.line(hx, hy - 8, hx, hy + 8, PEN.mid);
      }
    }
    top -= rh;
  });
}

function baseUnit(L: Local, W: number, H: number, shaker: boolean, o: Omit<FrontOpts, 'shaker'> = {}) {
  L.rect(-W / 2 + 1.5, 0, W / 2 - 1.5, PLINTH, PEN.thin);
  L.rect(-W / 2, PLINTH, W / 2, H - TOP, PEN.mid);
  fronts(L, -W / 2, W / 2, PLINTH, H - TOP, { shaker, ...o });
  L.rect(-W / 2, H - TOP, W / 2, H, PEN.mid);
}

function crown(L: Local, W: number, y: number, shaker: boolean) {
  if (!shaker) return;
  L.rect(-W / 2 - 1, y, W / 2 + 1, y + 3, PEN.thin);
  L.rect(-W / 2 - 2.5, y + 3, W / 2 + 2.5, y + 6, PEN.thin);
}

function faucet(L: Local, x: number, y: number) {
  L.poly([[x - 0.8, y], [x - 0.8, y + 24], [x + 6, y + 30], [x + 12, y + 26], [x + 12, y + 22]], PEN.mid, 'none', false);
  L.rect(x - 2.5, y, x + 2.5, y + 2, PEN.thin);
}

function drawFront(sh: Sheet, it: Item, cx: number, sign: number) {
  const W = it.width;
  const H = it.height;
  const shaker = it.frontStyle === 'shaker';
  const L = localPainter(sh, cx, sign, it.elevation);
  const wide = W > 65 ? 2 : 1;
  switch (it.kind) {
    case 'baseCabinet':
    case 'sinkCabinet':
      baseUnit(L, W, H, shaker, { cols: wide });
      if (it.kind === 'sinkCabinet') faucet(L, 0, H);
      return;
    case 'cornerCabinet':
      return baseUnit(L, W, H, shaker, { cols: 1 });
    case 'drawerCabinet':
      return baseUnit(L, W, H, shaker, { rows: [0.25, 0.35, 0.4], cols: 1 });
    case 'cooktopCabinet':
      baseUnit(L, W, H, shaker, { rows: [0.3, 0.7], cols: 1 });
      return L.rect(-Math.min(W - 8, 78) / 2, H, Math.min(W - 8, 78) / 2, H + 0.6, PEN.mid, '#333');
    case 'dishwasher':
      return baseUnit(L, W, H, shaker, { handleTop: true, drawers: false });
    case 'farmhouseSink': {
      const sw = Math.min(W - 8, 76);
      const apron = 24;
      L.rect(-W / 2 + 1.5, 0, W / 2 - 1.5, PLINTH);
      L.rect(-W / 2, PLINTH, W / 2, H - apron, PEN.mid);
      fronts(L, -W / 2, W / 2, PLINTH, H - apron - 1, { shaker, cols: 2 });
      L.rect(-W / 2, H - TOP, W / 2, H, PEN.mid);
      L.rect(-sw / 2, H - apron - 0.5, sw / 2, H + 0.2, PEN.mid);
      faucet(L, 0, H);
      return;
    }
    case 'tallCabinet':
      L.rect(-W / 2 + 1.5, 0, W / 2 - 1.5, PLINTH);
      L.rect(-W / 2, PLINTH, W / 2, H, PEN.mid);
      fronts(L, -W / 2, W / 2, PLINTH, H, { shaker, rows: [0.35, 0.65], cols: wide, drawers: false });
      return crown(L, W, H, shaker);
    case 'ovenTower': {
      const body = H - PLINTH;
      L.rect(-W / 2 + 1.5, 0, W / 2 - 1.5, PLINTH);
      L.rect(-W / 2, PLINTH, W / 2, H, PEN.mid);
      fronts(L, -W / 2, W / 2, H - body * 0.35, H, { shaker });
      const oy = PLINTH + body * 0.5;
      L.rect(-W / 2 + 2, oy - 29, W / 2 - 2, oy + 29, PEN.mid);
      L.rect(-W / 2 + 7, oy - 20, W / 2 - 7, oy + 18, PEN.hair);
      L.line(-W / 2 + 8, oy + 24, W / 2 - 8, oy + 24, PEN.mid);
      L.rect(-W / 2 + 2, oy - 54, W / 2 - 2, oy - 31, PEN.thin);
      fronts(L, -W / 2, W / 2, PLINTH, PLINTH + body * 0.12, { shaker, rows: [0.5, 0.5] });
      return crown(L, W, H, shaker);
    }
    case 'fridge':
      L.rect(-W / 2, 2, W / 2, H, PEN.mid);
      L.line(-W / 2, H * 0.36, W / 2, H * 0.36, PEN.thin);
      L.line(W / 2 - 5, H * 0.45, W / 2 - 5, H * 0.75, PEN.mid);
      return L.line(W / 2 - 5, H * 0.2, W / 2 - 5, H * 0.32, PEN.mid);
    case 'wallCabinet':
      L.rect(-W / 2, 0, W / 2, H, PEN.mid);
      fronts(L, -W / 2, W / 2, 0, H, { shaker, cols: wide, wallHung: true });
      return crown(L, W, H, shaker);
    case 'range':
    case 'classicRange': {
      const feet = it.kind === 'classicRange' ? 6 : 0;
      L.rect(-W / 2, feet, W / 2, H - 2, PEN.mid);
      L.rect(-W / 2 - 0.5, H - 2, W / 2 + 0.5, H, PEN.mid, '#333');
      if (feet) {
        L.rect(-W / 2 + 3, 0, -W / 2 + 6, feet);
        L.rect(W / 2 - 6, 0, W / 2 - 3, feet);
      }
      const band = 13;
      L.line(-W / 2, H - 2 - band, W / 2, H - 2 - band, PEN.thin);
      const n = Math.max(3, Math.round(W / 14));
      for (let i = 0; i < n; i++) L.circle(-W / 2 + (W * (i + 0.5)) / n, H - 2 - band / 2, 1.7);
      L.line(-W / 2 + 4, H - band - 6, W / 2 - 4, H - band - 6, PEN.mid);
      const doorTop = H - band - 10;
      const split = W > 80 ? [0.6, 0.4] : [1];
      let x = -W / 2;
      for (const fr of split) {
        const dw = W * fr;
        L.rect(x + 1, feet + 10, x + dw - 1, doorTop, PEN.thin);
        L.rect(x + 5, feet + 14, x + dw - 5, doorTop - 9, PEN.hair);
        L.line(x + dw * 0.2, doorTop - 5, x + dw * 0.8, doorTop - 5, PEN.mid);
        x += dw;
      }
      return L.rect(-W / 2 + 1, feet + 1, W / 2 - 1, feet + 9, PEN.thin);
    }
    case 'rangeHood': {
      const hoodH = Math.min(12, H * 0.25);
      L.rect(-W / 2, 0, W / 2, hoodH, PEN.mid);
      L.poly([[-W * 0.45, hoodH], [W * 0.45, hoodH], [W * 0.2, hoodH + 16], [-W * 0.2, hoodH + 16]], PEN.thin);
      return L.rect(-Math.min(15, W * 0.2), hoodH + 16, Math.min(15, W * 0.2), H, PEN.thin);
    }
    case 'mantelHood': {
      const mantel = Math.min(14, H * 0.2);
      L.rect(-W / 2, 0, W / 2, mantel, PEN.mid);
      L.rect(-W / 2 - 2, mantel, W / 2 + 2, mantel + 3.5, PEN.mid);
      L.poly([[-W / 2, mantel + 3.5], [W / 2, mantel + 3.5], [W * 0.41, mantel + 27.5], [-W * 0.41, mantel + 27.5]], PEN.mid);
      return L.rect(-W * 0.41, mantel + 27.5, W * 0.41, H, PEN.mid);
    }
    case 'island':
      return baseUnit(L, W, H, shaker, { rows: [0.3, 0.7], cols: Math.max(1, Math.round(W / 60)) });
    case 'hutch': {
      baseUnit(L, W, 90, shaker, { cols: 1 });
      L.rect(-W / 2, 90, W / 2, H, PEN.mid);
      L.rect(-W / 2 + 2, 90, W / 2 - 2, H - 6, PEN.thin);
      for (let x = -W / 2 + 2 + 9; x < W / 2 - 4; x += 9) L.line(x, 90, x, H - 6, PEN.hair);
      for (const t of [0.28, 0.54, 0.8]) L.rect(-W / 2 + 2, 90 + (H - 90) * t, W / 2 - 2, 90 + (H - 90) * t + 2.5, PEN.thin);
      return L.rect(-W / 2 - 2, H - 6, W / 2 + 2, H, PEN.mid);
    }
    case 'windowSeat': {
      const seat = H - 7;
      L.rect(-W / 2 + 1.5, 0, W / 2 - 1.5, 8);
      L.rect(-W / 2, 8, W / 2, seat - 3, PEN.mid);
      fronts(L, -W / 2, W / 2, 8.5, seat - 3.5, { shaker, cols: Math.max(1, Math.round(W / 80)), drawers: true });
      L.rect(-W / 2, seat - 3, W / 2, seat, PEN.mid);
      L.rect(-W / 2 + 1, seat, W / 2 - 1, H, PEN.thin);
      L.poly([[-W / 2 + 7, H], [-W / 2 + 49, H], [-W / 2 + 51, H + 40], [-W / 2 + 9, H + 42]], PEN.thin);
      return L.poly([[-W / 2 + 46, H], [-W / 2 + 91, H], [-W / 2 + 92, H + 38], [-W / 2 + 48, H + 39]], PEN.thin);
    }
    case 'potRail': {
      L.line(-W / 2, H - 2, W / 2, H - 2, PEN.mid);
      const n = Math.max(2, Math.round(W / 22));
      for (let i = 0; i < n; i++) {
        const x = -W / 2 + (W * (i + 0.5)) / n;
        const r = 7 + ((i * 37) % 3) * 1.8;
        L.line(x, H - 2, x, H - 19, PEN.thin);
        L.circle(x, H - 19 - r, r);
      }
      return;
    }
    case 'coffeeMachine':
      L.rect(-W / 2, 0, -W / 2 + 31, H * 0.85, PEN.mid);
      L.rect(-W / 2 + 10, H * 0.38, -W / 2 + 21, H * 0.45, PEN.thin);
      L.rect(W / 2 - 11.5, 0, W / 2 - 0.5, H * 0.6, PEN.thin);
      return L.poly([[W / 2 - 9.5, H * 0.6], [W / 2 - 2.5, H * 0.6], [W / 2 - 2.5, H], [W / 2 - 9.5, H]], PEN.thin);
    case 'framedPicture':
      L.rect(-W / 2, 0, W / 2, H, PEN.mid);
      return L.rect(-W / 2 + 4, 4, W / 2 - 4, H - 4, PEN.hair);
    case 'pendantLamp':
    case 'schoolhousePendant':
      L.line(0, H, 0, 25, PEN.thin);
      return L.poly([[-3.5, 25], [3.5, 25], [W / 2, 8], [W / 2 - 2, 0], [-W / 2 + 2, 0], [-W / 2, 8]], PEN.thin);
    case 'wallPanel': {
      L.rect(-W / 2, 0, W / 2, H, PEN.thin);
      const def = getMaterialDef(it.finish);
      const tile = def.pattern === 'tiles' || def.pattern === 'subway' ? (def.size ?? 20) : 0;
      if (tile >= 5) {
        const th = def.pattern === 'subway' ? tile / 2 : tile;
        for (let y = th; y < H - 0.5; y += th) L.line(-W / 2, y, W / 2, y, PEN.hair);
        for (let x = -W / 2 + tile; x < W / 2 - 0.5; x += tile) L.line(x, 0, x, H, PEN.hair);
      }
      return;
    }
    default:
      L.rect(-W / 2, 0, W / 2, H, PEN.mid);
      return;
  }
}

/** An object seen from its end: its outline, with worktop and plinth recess for kitchen units. */
function drawSide(sh: Sheet, it: Item, x0: number, x1: number, frontRight: boolean) {
  const e = it.elevation;
  const H = it.height;
  if (BASE_KINDS.has(it.kind) || it.kind === 'island') {
    const [fx, bx] = frontRight ? [x1, x0] : [x0, x1];
    const inset = frontRight ? -6 : 6;
    sh.poly([[bx, e], [fx + inset, e], [fx + inset, e + PLINTH], [fx, e + PLINTH], [fx, e + H - TOP], [bx, e + H - TOP]], PEN.mid);
    sh.rect(x0 - (frontRight ? 0 : 1), e + H - TOP, x1 + (frontRight ? 1 : 0), e + H, PEN.mid);
    return;
  }
  sh.rect(x0, e, x1, e + H, PEN.mid);
}

// ───────────────────────── openings ─────────────────────────

function drawOpening(sh: Sheet, o: Opening, xa: number, xb: number) {
  const [x0, x1] = [Math.min(xa, xb), Math.max(xa, xb)];
  const y0 = o.sill;
  const y1 = o.sill + o.height;
  const fw = 5;
  sh.rect(x0, y0, x1, y1, PEN.mid);
  if (isDoorKind(o.kind)) {
    if (o.kind === 'archway') return;
    sh.rect(x0 + fw, y0, x1 - fw, y1 - fw, PEN.thin);
    const leaves = o.kind === 'doubleDoor' || o.kind === 'garageDoor' || o.kind === 'slidingDoor' ? 2 : 1;
    const lw = (x1 - x0 - 2 * fw) / leaves;
    for (let i = 1; i < leaves; i++) sh.line(x0 + fw + lw * i, y0, x0 + fw + lw * i, y1 - fw, PEN.thin);
    if (leaves === 1) {
      // Hinge side on the a-end unless flipped; dashed lines meet at the hinge side
      const hingeLeft = (xa < xb) !== o.flipHinge;
      const [hx, kx] = hingeLeft ? [x0 + fw, x1 - fw] : [x1 - fw, x0 + fw];
      sh.line(kx, y0, hx, (y0 + y1 - fw) / 2, PEN.hair, ' stroke-dasharray="2 1.2"');
      sh.line(kx, y1 - fw, hx, (y0 + y1 - fw) / 2, PEN.hair, ' stroke-dasharray="2 1.2"');
      sh.circle(kx + (hingeLeft ? -6 : 6), y0 + 105, 1.5);
    }
    return;
  }
  // Window board below the window
  sh.rect(x0 - 3, y0 - 2.5, x1 + 3, y0, PEN.thin);
  sh.rect(x0 + fw, y0 + fw, x1 - fw, y1 - fw, PEN.thin);
  const sashes = o.kind === 'fixedWindow' ? 1 : o.kind === 'doubleWindow' || x1 - x0 > 110 ? 2 : 1;
  const sw = (x1 - x0 - 2 * fw) / sashes;
  for (let i = 0; i < sashes; i++) {
    const a = x0 + fw + sw * i;
    sh.rect(a + 1, y0 + fw + 1, a + sw - 1, y1 - fw - 1, PEN.thin);
    sh.rect(a + 5, y0 + fw + 5, a + sw - 5, y1 - fw - 5, PEN.hair);
  }
}

// ───────────────────────── dimensions ─────────────────────────

function dimChain(sh: Sheet, xs: number[], y: number, refY: number) {
  const pts = dedupe(xs);
  if (pts.length < 2) return;
  sh.line(pts[0] - 4, y, pts[pts.length - 1] + 4, y, PEN.hair);
  for (const x of pts) {
    sh.line(x, refY, x, y + (refY > y ? -2 : 2), PEN.hair);
    sh.parts.push(tick(sh.px(x), sh.py(y)));
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = pts[i + 1] - pts[i];
    if (len < 0.5) continue;
    // Labels that don't fit between the ticks go just past the right one
    const tight = len * sh.k < 7;
    sh.text(tight ? pts[i + 1] + 1.5 / sh.k : (pts[i] + pts[i + 1]) / 2, y + 1.2 / sh.k, mm(len), { size: tight ? 1.8 : TEXT, anchor: tight ? 'start' : 'middle' });
  }
}

function dimChainV(sh: Sheet, ys: number[], x: number, refX: number) {
  const pts = dedupe(ys);
  if (pts.length < 2) return;
  sh.line(x, pts[0] - 4, x, pts[pts.length - 1] + 4, PEN.hair);
  for (const y of pts) {
    sh.line(refX, y, x + (refX > x ? -2 : 2), y, PEN.hair);
    sh.parts.push(tick(sh.px(x), sh.py(y)));
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    const len = pts[i + 1] - pts[i];
    if (len < 0.5) continue;
    const tight = len * sh.k < 7;
    sh.text(x - 1.2 / sh.k, tight ? pts[i + 1] + 1.5 / sh.k : (pts[i] + pts[i + 1]) / 2, mm(len), { rotate: true, size: tight ? 1.8 : TEXT, anchor: tight ? 'start' : 'middle' });
  }
}

/** Architectural 45° tick, 2.4 mm long. */
const tick = (x: number, y: number) => `<line x1="${f(x - 1.2)}" y1="${f(y + 1.2)}" x2="${f(x + 1.2)}" y2="${f(y - 1.2)}" stroke-width="${PEN.mid}"/>`;

function dedupe(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  return s.filter((x, i) => i === 0 || x - s[i - 1] > 0.4);
}

// ───────────────────────── sheet ─────────────────────────

export const A3 = { w: 420, h: 297 };
const SCALES = [10, 20, 25, 50, 100, 200];

export interface SheetInfo {
  project: string;
  title: string;
  /** e.g. "A1" — the sheet number in a set. */
  number?: string;
  date?: string;
}

/** Title block in the bottom-right corner of an A3 sheet. */
export function titleBlock(info: SheetInfo & { scale: string }) {
  const x = A3.w - 10 - 130;
  const y = A3.h - 10 - 26;
  const t = (tx: number, ty: number, s: string, size = 2.5, weight = 400) =>
    `<text x="${tx}" y="${ty}" font-size="${size}" font-weight="${weight}" stroke="none" fill="#111">${esc(s)}</text>`;
  return (
    `<g stroke="#111" fill="none">` +
    `<rect x="10" y="10" width="${A3.w - 20}" height="${A3.h - 20}" stroke-width="0.5"/>` +
    `<rect x="${x}" y="${y}" width="130" height="26" stroke-width="0.35" fill="#fff"/>` +
    `<line x1="${x}" y1="${y + 9}" x2="${x + 130}" y2="${y + 9}" stroke-width="0.18"/>` +
    `<line x1="${x}" y1="${y + 18}" x2="${x + 130}" y2="${y + 18}" stroke-width="0.18"/>` +
    `<line x1="${x + 90}" y1="${y + 9}" x2="${x + 90}" y2="${y + 26}" stroke-width="0.18"/>` +
    t(x + 3, y + 6.3, info.project, 4, 600) +
    t(x + 3, y + 15, info.title, 3.2, 500) +
    t(x + 3, y + 23.5, `Scale ${info.scale} (A3)  ·  All dimensions in mm`, 2.3) +
    t(x + 93, y + 15, info.number ?? '', 3.2, 600) +
    t(x + 93, y + 23.5, info.date ?? new Date().toISOString().slice(0, 10), 2.3) +
    `</g>`
  );
}

/** Smallest standard scale (1:n) at which a model extent in cm fits a paper box in mm. */
export function fitScale(wCm: number, hCm: number, boxW: number, boxH: number) {
  return SCALES.find((s) => (wCm * 10) / s <= boxW && (hCm * 10) / s <= boxH) ?? SCALES[SCALES.length - 1];
}

/** One elevation as a complete A3 sheet (SVG, sizes in mm). */
export function elevationSheet(p: Project, view: ElevationView, info: Partial<SheetInfo> = {}): string {
  const { wall, side, t0, t1 } = view;
  const fr = frameOf(wall, side);
  const level = p.levels.find((l) => l.id === wall.levelId);
  const xa = X(fr, pointAlong(wall, t0));
  const xb = X(fr, pointAlong(wall, t1));
  const [x0, x1] = [Math.min(xa, xb), Math.max(xa, xb)];
  const topAt = (x: number) => {
    const t = t0 + ((x - xa) / (xb - xa)) * (t1 - t0);
    return wallHeightAt(wall, pointAlong(wall, t));
  };
  const top = Math.max(topAt(x0), topAt(x1), ...view.items.map((i) => i.elevation + i.height));

  // Fit the drawing plus its dimension chains (≈ 70 cm around it) into the sheet above the title block
  const margin = { l: 75, r: 75, b: 70, t: 45 };
  const scale = fitScale(x1 - x0 + margin.l + margin.r, top + margin.b + margin.t, A3.w - 30, A3.h - 30 - 30);
  const k = 10 / scale;
  const drawW = (x1 - x0 + margin.l + margin.r) * k;
  const drawH = (top + margin.b + margin.t) * k;
  const ox = 15 + (A3.w - 30 - drawW) / 2 + (margin.l - x0) * k;
  const oy = 15 + (A3.h - 30 - 30 - drawH) / 2 + (top + margin.t) * k;
  const sh = new Sheet(k, ox, oy);

  // Wall surface, ceiling line and floor
  const steps = 24;
  const outline: [number, number][] = [[x0, 0]];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    outline.push([x, topAt(x)]);
  }
  outline.push([x1, 0]);
  sh.poly(outline, PEN.heavy, '#fff');
  sh.line(x0 - 25, 0, x1 + 25, 0, PEN.heavy);
  // Walls meeting this one are drawn cut (grey); a free wall end is just its outline
  const cutAt0 = xa < xb ? view.cutStart : view.cutEnd;
  const cutAt1 = xa < xb ? view.cutEnd : view.cutStart;
  if (cutAt0) sh.rect(x0 - 3, 0, x0, topAt(x0), PEN.heavy, '#bbb');
  if (cutAt1) sh.rect(x1, 0, x1 + 3, topAt(x1), PEN.heavy, '#bbb');

  // Doors and windows in this wall
  const u = wallDir(wall);
  const dX = dot(u, fr.r);
  const openings = p.openings.filter((o) => o.wallId === wall.id && o.offset + o.width / 2 > t0 && o.offset - o.width / 2 < t1);
  for (const o of openings) drawOpening(sh, o, xa + (o.offset - o.width / 2 - t0) * dX, xa + (o.offset + o.width / 2 - t0) * dX);

  // Furniture
  // Objects close to the wall first, so nearer objects cover what is behind them
  const items = [...view.items].sort((a, b) => itemDepth(fr, a).min - itemDepth(fr, b).min);
  const front: Item[] = [];
  for (const it of items) {
    const facing = dot(rotate({ x: 0, y: 1 }, it.rotation), fr.n);
    const span = itemSpan(fr, it);
    if (facing > 0.7 || ROUND.has(it.kind)) {
      const sign = dot(rotate({ x: 1, y: 0 }, it.rotation), fr.r) * (it.mirrored ? -1 : 1) >= 0 ? 1 : -1;
      drawFront(sh, it, span.cx, sign);
      front.push(it);
    } else if (facing < -0.7) sh.rect(span.x0, it.elevation, span.x1, it.elevation + it.height, PEN.mid);
    else drawSide(sh, it, span.x0, span.x1, dot(rotate({ x: 0, y: 1 }, it.rotation), fr.r) > 0);
  }

  // Dimensions: units along the floor, the overall length, openings along the top, heights at the sides
  const floorItems = items.filter((i) => i.elevation < 5 && i.kind !== 'wallPanel');
  const edges = floorItems.filter((i) => front.includes(i)).flatMap((i) => {
    const s = itemSpan(fr, i);
    return [s.x0, s.x1];
  });
  const sideSpans = floorItems.filter((i) => !front.includes(i)).map((i) => itemSpan(fr, i));
  if (sideSpans.length) edges.push(Math.min(...sideSpans.map((s) => s.x0)), Math.max(...sideSpans.map((s) => s.x1)));
  const clamp = (x: number) => Math.max(x0, Math.min(x1, x));
  dimChain(sh, [x0, x1, ...edges.map(clamp)], -18, 0);
  dimChain(sh, [x0, x1], -32, 0);
  if (openings.length) {
    const ox = openings.flatMap((o) => [xa + (o.offset - o.width / 2 - t0) * dX, xa + (o.offset + o.width / 2 - t0) * dX]).map(clamp);
    dimChain(sh, [x0, x1, ...ox], top + 18, top);
  }
  const mounted = items.filter((i) => i.elevation >= 100 && !i.kind.toLowerCase().includes('pendant') && i.kind !== 'framedPicture');
  const worktop = floorItems.filter((i) => i.height <= 100 && BASE_KINDS.has(i.kind)).map((i) => i.height);
  const hs = [0, topAt(x1), ...worktop, ...mounted.flatMap((i) => [i.elevation, Math.min(topAt(x1), i.elevation + i.height)])];
  dimChainV(sh, hs, x1 + 22, x1);
  const win = openings.filter((o) => !isDoorKind(o.kind));
  if (win.length) dimChainV(sh, [0, topAt(x0), ...win.flatMap((o) => [o.sill, o.sill + o.height])], x0 - 22, x0);
  else if (openings.length) dimChainV(sh, [0, topAt(x0), ...openings.map((o) => o.sill + o.height)], x0 - 22, x0);

  // Labels under the drawing
  sh.text((x0 + x1) / 2, -32 - 18 / k, `${view.title}${level ? ` (${level.name})` : ''}`, { size: 4, weight: 600 });
  sh.text((x0 + x1) / 2, -32 - 25 / k, `Scale 1:${scale}`, { size: 2.8 });

  return sheetSVG(sh.parts.join(''), {
    project: info.project ?? p.name,
    title: info.title ?? `Elevation – ${view.title}`,
    number: info.number,
    date: info.date,
    scale: `1:${scale}`,
  });
}

/** Wraps paper-mm content in an A3 SVG with its frame and title block. */
export function sheetSVG(content: string, info: SheetInfo & { scale: string }) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${A3.w}mm" height="${A3.h}mm" viewBox="0 0 ${A3.w} ${A3.h}" font-family="Helvetica, Arial, sans-serif">` +
    `<rect width="${A3.w}" height="${A3.h}" fill="#fff"/>` +
    `<g stroke="#111" stroke-linecap="round" stroke-linejoin="round" fill="none">${content}</g>` +
    titleBlock(info) +
    `</svg>`
  );
}
