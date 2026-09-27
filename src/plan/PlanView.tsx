import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore, translateEntities } from '../store/store';
import type { Dimension, Item, Opening, Project, Roof, SelectionRef, Vec2, Wall } from '../model/types';
import { add, angleOf, bbox, dist, dot, normalize, perp, pointInPolygon, polygonArea, polygonCentroid, projectOnSegment, rotate, scale, snapTo, sub } from '../geometry/math';
import { clampOpeningOffset, footprintPolygon, sideOfWall, wallDir, wallFootprint, wallLength } from '../geometry/walls';
import { itemCorners, nearestWall, snapItem, snapPoint, type Guide } from './snapping';
import { ItemSymbol, OpeningSymbol } from './PlanSymbols';
import { getMaterialDef } from '../model/materials';
import { formatArea, formatLength, parseLength } from '../geometry/units';
import { createDimension, createItem, createLabel, createOpening, createRoof, createRoom, createWall, wallLoop } from '../model/factory';
import { roofPlanLines } from '../geometry/roof';
import { detectRoomAt } from '../geometry/roomDetect';

interface ViewT {
  s: number;
  ox: number;
  oy: number;
}

type Drag =
  | { type: 'pan'; sx: number; sy: number; ox: number; oy: number }
  | { type: 'move'; start: Vec2; applied: Vec2; sel: SelectionRef[]; moved: boolean }
  | { type: 'moveItem'; id: string; grab: Vec2; moved: boolean }
  | { type: 'moveOpening'; id: string; moved: boolean }
  | { type: 'wallEnd'; points: Vec2[]; wallId: string; end: 'a' | 'b'; orig: Vec2 }
  | { type: 'rotate'; id: string }
  | { type: 'resize'; id: string; axis: 'w' | 'd' }
  | { type: 'roomVertex'; id: string; index: number }
  | { type: 'dimEnd'; id: string; end: 'a' | 'b' }
  | { type: 'dimOffset'; id: string }
  | { type: 'roofCorner'; id: string; sx: number; sy: number }
  | { type: 'marquee'; start: Vec2; end: Vec2; additive: boolean }
  | { type: 'rect'; start: Vec2; end: Vec2 };

const INK = '#2b2f36';
const BLUE = '#2f6fed';

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export default function PlanView() {
  const project = useStore((s) => s.project);
  const options = useStore((s) => s.options);
  const tool = useStore((s) => s.tool);
  const placing = useStore((s) => s.placing);
  const selection = useStore((s) => s.selection);
  const levelId = useStore((s) => s.activeLevelId);
  const unit = project.settings.unit;

  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<ViewT>({ s: 1, ox: 400, oy: 300 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [snapKind, setSnapKind] = useState<string>('none');
  const [guides, setGuides] = useState<Guide[]>([]);
  const [chain, setChain] = useState<Vec2[]>([]);
  const [roomPts, setRoomPts] = useState<Vec2[]>([]);
  const [dimPts, setDimPts] = useState<Vec2[]>([]);
  const [lengthBuf, setLengthBuf] = useState('');
  const [ghostRot, setGhostRot] = useState(0);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const spaceDown = useRef(false);
  const altDown = useRef(false);

  const px = 1 / view.s;
  const level = project.levels.find((l) => l.id === levelId) ?? project.levels[0];
  const walls = useMemo(() => project.walls.filter((w) => w.levelId === level.id), [project.walls, level.id]);

  // ---------- view helpers ----------
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    let prev: { w: number; h: number } | null = null;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      // Keep the drawing centred when the pane is resized (e.g. switching between 2D and split view).
      if (prev) {
        const dw = (r.width - prev.w) / 2;
        const dh = (r.height - prev.h) / 2;
        setView((v) => ({ ...v, ox: v.ox + dw, oy: v.oy + dh }));
      }
      prev = { w: r.width, h: r.height };
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const p = useStore.getState().project;
    const lv = useStore.getState().activeLevelId;
    const pts = [
      ...p.walls.filter((w) => w.levelId === lv).flatMap((w) => [w.a, w.b]),
      ...p.rooms.filter((r) => r.levelId === lv).flatMap((r) => r.points),
    ];
    // Items only count when there is no building yet (garden trees would zoom the plan out).
    if (!pts.length) pts.push(...p.items.filter((i) => i.levelId === lv).flatMap((i) => itemCorners(i)));
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!pts.length) {
      setView({ s: 1, ox: r.width / 2, oy: r.height / 2 });
      return;
    }
    const b = bbox(pts);
    const w = Math.max(200, b.maxX - b.minX);
    const h = Math.max(200, b.maxY - b.minY);
    const s = Math.min((r.width - 120) / w, (r.height - 120) / h, 4);
    setView({ s, ox: r.width / 2 - ((b.minX + b.maxX) / 2) * s, oy: r.height / 2 - ((b.minY + b.maxY) / 2) * s });
  }, []);

  const frameRequest = useStore((s) => s.frameRequest);
  useEffect(() => {
    const t = setTimeout(fit, 30);
    return () => clearTimeout(t);
  }, [fit, frameRequest, levelId]);

  const toWorld = useCallback((clientX: number, clientY: number): Vec2 => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.ox) / v.s, y: (clientY - r.top - v.oy) / v.s };
  }, []);

  // Reset transient tool state when the tool changes.
  useEffect(() => {
    setChain([]);
    setRoomPts([]);
    setDimPts([]);
    setLengthBuf('');
    setGuides([]);
  }, [tool, levelId]);

  const snapOpts = (from?: Vec2, ignore?: Vec2[]) => ({
    grid: project.settings.gridSize,
    snapGrid: options.snapGrid,
    snapObjects: options.snapObjects,
    pxToWorld: px,
    from,
    ignore,
    disabled: altDown.current,
  });

  // ---------- hit testing ----------
  const hitTest = (p: Vec2): SelectionRef | null => {
    const tol = 6 * px;
    const st = useStore.getState();
    const proj = st.project;
    const lv = level.id;
    for (const l of [...proj.labels].reverse()) {
      if (l.levelId !== lv) continue;
      const w = l.text.length * l.size * 0.3;
      if (Math.abs(p.x - l.x) < w + tol && Math.abs(p.y - l.y) < l.size * 0.6 + tol) return { type: 'label', id: l.id };
    }
    if (options.showDimensions)
      for (const d of proj.dimensions) {
        if (d.levelId !== lv) continue;
        const { a, b } = dimLine(d);
        if (projectOnSegment(p, a, b).distance < tol * 1.5) return { type: 'dimension', id: d.id };
      }
    for (const o of proj.openings) {
      const w = walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const pr = projectOnSegment(p, w.a, w.b);
      const off = pr.t * wallLength(w);
      if (pr.distance < w.thickness / 2 + tol && Math.abs(off - o.offset) < o.width / 2) return { type: 'opening', id: o.id };
    }
    if (options.showFurniture)
      for (const it of [...proj.items].reverse()) {
        if (it.levelId !== lv) continue;
        if (pointInPolygon(p, itemCorners(it))) return { type: 'item', id: it.id };
      }
    for (const w of walls) {
      if (pointInPolygon(p, footprintPolygon(wallFootprint(w, walls))) || projectOnSegment(p, w.a, w.b).distance < w.thickness / 2 + tol * 0.5) return { type: 'wall', id: w.id };
    }
    if (options.showRoofsInPlan)
      for (const r of proj.roofs) {
        if (r.levelId !== lv) continue;
        const { outline } = roofPlanLines(r);
        if (outline.some((e) => projectOnSegment(p, e.a, e.b).distance < tol)) return { type: 'roof', id: r.id };
      }
    for (const r of [...proj.rooms].reverse()) {
      if (r.levelId !== lv) continue;
      if (pointInPolygon(p, r.points)) return { type: 'room', id: r.id };
    }
    if (options.showRoofsInPlan)
      for (const r of proj.roofs) {
        if (r.levelId !== lv) continue;
        const { outline } = roofPlanLines(r);
        if (pointInPolygon(p, outline.map((e) => e.a))) return { type: 'roof', id: r.id };
      }
    return null;
  };

  const single = selection.length === 1 ? selection[0] : null;
  const selItem = single?.type === 'item' ? project.items.find((i) => i.id === single.id) : undefined;
  const selWall = single?.type === 'wall' ? project.walls.find((i) => i.id === single.id) : undefined;
  const selRoom = single?.type === 'room' ? project.rooms.find((i) => i.id === single.id) : undefined;
  const selDim = single?.type === 'dimension' ? project.dimensions.find((i) => i.id === single.id) : undefined;
  const selRoof = single?.type === 'roof' ? project.roofs.find((i) => i.id === single.id) : undefined;

  const rotHandle = (it: Item) => add(rotate({ x: 0, y: it.depth / 2 + 26 * px }, it.rotation), it);
  const wHandle = (it: Item) => add(rotate({ x: it.width / 2, y: 0 }, it.rotation), it);
  const dHandle = (it: Item) => add(rotate({ x: 0, y: it.depth / 2 }, it.rotation), it);
  const roofCorners = (r: Roof) =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sy]) => ({ sx, sy, p: add(rotate({ x: (sx * r.width) / 2, y: (sy * r.depth) / 2 }, r.rotation), r) }));

  const handleHit = (p: Vec2): Drag | null => {
    const tol = 8 * px;
    if (selWall) {
      for (const end of ['a', 'b'] as const) {
        const q = selWall[end];
        if (dist(p, q) < tol) return { type: 'wallEnd', wallId: selWall.id, end, orig: { ...q }, points: [] };
      }
    }
    if (selItem && !selItem.locked) {
      if (dist(p, rotHandle(selItem)) < tol) return { type: 'rotate', id: selItem.id };
      if (dist(p, wHandle(selItem)) < tol) return { type: 'resize', id: selItem.id, axis: 'w' };
      if (dist(p, dHandle(selItem)) < tol) return { type: 'resize', id: selItem.id, axis: 'd' };
    }
    if (selRoom) {
      const i = selRoom.points.findIndex((q) => dist(q, p) < tol);
      if (i >= 0) return { type: 'roomVertex', id: selRoom.id, index: i };
    }
    if (selDim) {
      if (dist(p, selDim.a) < tol) return { type: 'dimEnd', id: selDim.id, end: 'a' };
      if (dist(p, selDim.b) < tol) return { type: 'dimEnd', id: selDim.id, end: 'b' };
      const { a, b } = dimLine(selDim);
      if (dist(p, scale(add(a, b), 0.5)) < tol) return { type: 'dimOffset', id: selDim.id };
    }
    if (selRoof) {
      for (const c of roofCorners(selRoof)) if (dist(p, c.p) < tol) return { type: 'roofCorner', id: selRoof.id, sx: c.sx, sy: c.sy };
    }
    return null;
  };

  // ---------- actions ----------
  const st = () => useStore.getState();

  const addWall = (a: Vec2, b: Vec2) => {
    if (dist(a, b) < 1) return;
    const s = project.settings;
    st().mutate((d) => {
      d.walls.push(createWall(level.id, a, b, { thickness: s.defaultWallThickness, height: level.height ?? s.defaultWallHeight }));
    });
  };

  const finishRoom = (pts: Vec2[]) => {
    if (pts.length < 3 || Math.abs(polygonArea(pts)) < 100) return;
    const n = project.rooms.filter((r) => r.levelId === level.id).length + 1;
    const room = createRoom(level.id, pts, { name: `Room ${n}` });
    st().mutate((d) => {
      d.rooms.push(room);
    });
    st().setSelection([{ type: 'room', id: room.id }]);
  };

  const commitLength = () => {
    const last = chain[chain.length - 1];
    const len = parseLength(lengthBuf, unit);
    if (!last || !len || len <= 0 || !cursor) return;
    let dir = normalize(sub(cursor, last));
    if (dir.x === 0 && dir.y === 0) dir = { x: 1, y: 0 };
    const end = add(last, scale(dir, len));
    addWall(last, end);
    setChain([...chain, end]);
    setLengthBuf('');
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altDown.current = true;
      if (isTyping(e)) return;
      if (e.code === 'Space') {
        spaceDown.current = true;
        return;
      }
      const s = useStore.getState();
      if (s.tool === 'wall' && chain.length) {
        if (/^[0-9.,'"+\-*/()a-z ]$/i.test(e.key) && !e.ctrlKey && !e.metaKey && !(lengthBuf === '' && /[a-z]/i.test(e.key))) {
          setLengthBuf((b) => b + e.key);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.key === 'Backspace' && lengthBuf) {
          setLengthBuf((b) => b.slice(0, -1));
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (e.key === 'Enter') {
          if (lengthBuf) commitLength();
          else setChain([]);
          e.preventDefault();
          return;
        }
      }
      if (e.key === 'Enter' && s.tool === 'room' && roomPts.length >= 3) {
        finishRoom(roomPts);
        setRoomPts([]);
      }
      if (e.key === 'Escape') {
        if (lengthBuf) setLengthBuf('');
        else if (chain.length || roomPts.length || dimPts.length) {
          setChain([]);
          setRoomPts([]);
          setDimPts([]);
        } else if (s.placing) s.setPlacing(null);
        else if (s.tool !== 'select') s.setTool('select');
        else s.clearSelection();
        setDrag(null);
      }
      if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && s.placing?.type === 'item') {
        setGhostRot((r) => (r + (e.shiftKey ? 15 : 90)) % 360);
        e.stopPropagation();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceDown.current = false;
      if (e.key === 'Alt') altDown.current = false;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
    };
  });

  // ---------- pointer ----------
  const ghostItemAt = (p: Vec2 | null) => {
    if (placing?.type !== 'item' || !p) return null;
    const it = createItem(level.id, placing.kind, p.x, p.y, { rotation: ghostRot });
    it.id = '__ghost';
    const sn = snapItem(it, p, project, level.id, snapOpts());
    it.x = sn.x;
    it.y = sn.y;
    it.rotation = sn.rotation;
    return it;
  };

  const ghostOpeningAt = (p: Vec2 | null) => {
    if (placing?.type !== 'opening' || !p) return null;
    const nw = nearestWall(p, walls, 40);
    if (!nw) return null;
    const o = createOpening(nw.wall.id, placing.kind, 0);
    let off = nw.offset;
    if (options.snapGrid && !altDown.current) off = snapTo(off, 5);
    o.offset = clampOpeningOffset(nw.wall, o.width, off);
    // Doors swing towards the side the cursor is on.
    o.flipSide = sideOfWall(nw.wall, p) === -1;
    return { wall: nw.wall, opening: o };
  };

  const ghostItem = ghostItemAt(cursor);
  const ghostOpening = ghostOpeningAt(cursor);

  const onPointerDown = (e: React.PointerEvent) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    altDown.current = e.altKey;
    const raw = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || spaceDown.current || tool === 'pan') {
      setDrag({ type: 'pan', sx: e.clientX, sy: e.clientY, ox: view.ox, oy: view.oy });
      return;
    }
    if (e.button === 2) {
      if (chain.length) setChain([]);
      if (roomPts.length >= 3) finishRoom(roomPts);
      setRoomPts([]);
      setDimPts([]);
      return;
    }
    if (e.button !== 0) return;

    const placedItem = ghostItemAt(raw);
    if (placing?.type === 'item' && placedItem) {
      const it = { ...placedItem, id: createItem(level.id, placing.kind, 0, 0).id };
      st().mutate((d) => {
        d.items.push(it);
      });
      st().setSelection([{ type: 'item', id: it.id }]);
      if (!e.shiftKey) st().setPlacing(null);
      return;
    }
    if (placing?.type === 'opening') {
      const placed = ghostOpeningAt(raw);
      if (placed) {
        const o = { ...placed.opening };
        st().mutate((d) => {
          d.openings.push(o);
        });
        st().setSelection([{ type: 'opening', id: o.id }]);
        if (!e.shiftKey) st().setPlacing(null);
      }
      return;
    }

    switch (tool) {
      case 'wall': {
        const from = chain[chain.length - 1];
        const sn = snapPoint(raw, walls, snapOpts(from));
        const p = sn.point;
        if (!from) {
          setChain([p]);
          return;
        }
        if (dist(p, from) < 1) return;
        addWall(from, p);
        if (chain.length >= 2 && dist(p, chain[0]) < 1) setChain([]);
        else setChain([...chain, p]);
        setLengthBuf('');
        return;
      }
      case 'room': {
        const sn = snapPoint(raw, walls, snapOpts(roomPts[roomPts.length - 1]));
        if (roomPts.length >= 3 && dist(sn.point, roomPts[0]) < 10 * px) {
          finishRoom(roomPts);
          setRoomPts([]);
          return;
        }
        setRoomPts([...roomPts, sn.point]);
        return;
      }
      case 'roomRect':
      case 'roof': {
        const p = snapPoint(raw, walls, snapOpts()).point;
        setDrag({ type: 'rect', start: p, end: p });
        return;
      }
      case 'dimension': {
        const p = snapPoint(raw, walls, snapOpts(dimPts[0])).point;
        if (dimPts.length < 2) setDimPts([...dimPts, p]);
        else {
          const [a, b] = dimPts;
          const n = perp(normalize(sub(b, a)));
          const off = dot(sub(raw, a), n);
          const dm = createDimension(level.id, a, b, off);
          st().mutate((d) => {
            d.dimensions.push(dm);
          });
          setDimPts([]);
        }
        return;
      }
      case 'label': {
        const lb = createLabel(level.id, raw.x, raw.y, 'Text');
        st().mutate((d) => {
          d.labels.push(lb);
        });
        st().setSelection([{ type: 'label', id: lb.id }]);
        st().setTool('select');
        return;
      }
    }

    // Select tool
    const h = handleHit(raw);
    if (h) {
      st().beginLive();
      setDrag(h);
      return;
    }
    const hit = hitTest(raw);
    if (!hit) {
      setDrag({ type: 'marquee', start: raw, end: raw, additive: e.shiftKey });
      return;
    }
    const already = selection.some((s) => s.id === hit.id);
    let sel = selection;
    if (e.shiftKey) {
      st().select(hit.type, hit.id, true);
      return;
    }
    if (!already) {
      sel = [hit];
      st().setSelection(sel);
    }
    st().beginLive();
    if (sel.length === 1 && hit.type === 'item') {
      const it = project.items.find((i) => i.id === hit.id)!;
      setDrag({ type: 'moveItem', id: hit.id, grab: sub(raw, it), moved: false });
    } else if (sel.length === 1 && hit.type === 'opening') setDrag({ type: 'moveOpening', id: hit.id, moved: false });
    else setDrag({ type: 'move', start: raw, applied: { x: 0, y: 0 }, sel, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    altDown.current = e.altKey;
    const raw = toWorld(e.clientX, e.clientY);
    const d = dragRef.current;
    let shown = raw;
    let g: Guide[] = [];
    let kind = 'none';

    if (!d) {
      if (tool === 'wall' || tool === 'room' || tool === 'dimension' || tool === 'roomRect' || tool === 'roof') {
        const from = tool === 'wall' ? chain[chain.length - 1] : tool === 'room' ? roomPts[roomPts.length - 1] : tool === 'dimension' && dimPts.length === 1 ? dimPts[0] : undefined;
        const sn = snapPoint(raw, walls, snapOpts(from));
        shown = tool === 'dimension' && dimPts.length === 2 ? raw : sn.point;
        g = sn.guides;
        kind = sn.kind;
      }
      setCursor(shown);
      setGuides(g);
      setSnapKind(kind);
      return;
    }

    const s = st();
    switch (d.type) {
      case 'pan':
        setView((v) => ({ ...v, ox: d.ox + (e.clientX - d.sx), oy: d.oy + (e.clientY - d.sy) }));
        break;
      case 'marquee':
        setDrag({ ...d, end: raw });
        break;
      case 'rect': {
        const p = snapPoint(raw, walls, snapOpts()).point;
        setDrag({ ...d, end: p });
        break;
      }
      case 'move': {
        let delta = sub(raw, d.start);
        if (!d.moved && Math.hypot(delta.x, delta.y) < 3 * px) break;
        if (options.snapGrid && !e.altKey) delta = { x: snapTo(delta.x, project.settings.gridSize), y: snapTo(delta.y, project.settings.gridSize) };
        const inc = sub(delta, d.applied);
        if (inc.x || inc.y) s.mutateLive((dr) => translateEntities(dr, d.sel, inc));
        dragRef.current = { ...d, applied: delta, moved: true };
        break;
      }
      case 'moveItem': {
        const it = s.project.items.find((i) => i.id === d.id);
        if (!it || it.locked) break;
        const target = sub(raw, d.grab);
        if (!d.moved && dist(target, it) < 3 * px) break;
        const sn = snapItem(it, target, s.project, it.levelId, snapOpts());
        g = sn.guides;
        s.mutateLive((dr) => {
          const x = dr.items.find((i) => i.id === d.id)!;
          x.x = sn.x;
          x.y = sn.y;
          x.rotation = sn.rotation;
        });
        dragRef.current = { ...d, moved: true };
        break;
      }
      case 'moveOpening': {
        const o = s.project.openings.find((x) => x.id === d.id);
        if (!o) break;
        const nw = nearestWall(raw, walls, 60);
        if (!nw) break;
        let off = nw.offset;
        if (options.snapGrid && !e.altKey) off = snapTo(off, 5);
        off = clampOpeningOffset(nw.wall, o.width, off);
        s.mutateLive((dr) => {
          const x = dr.openings.find((q) => q.id === d.id)!;
          x.wallId = nw.wall.id;
          x.offset = off;
        });
        break;
      }
      case 'wallEnd': {
        const w = s.project.walls.find((x) => x.id === d.wallId);
        if (!w) break;
        const other = d.end === 'a' ? w.b : w.a;
        const sn = snapPoint(raw, walls.filter((x) => x.id !== w.id), snapOpts(other, [d.orig]));
        g = sn.guides;
        const cur = w[d.end];
        const np = sn.point;
        s.mutateLive((dr) => {
          for (const x of dr.walls) {
            if (x.levelId !== w.levelId) continue;
            if (x.id === w.id || !e.altKey) {
              if (dist(x.a, cur) < 0.5) x.a = { ...np };
              if (dist(x.b, cur) < 0.5) x.b = { ...np };
            }
          }
          // Keep openings inside the resized wall
          for (const o of dr.openings) {
            const ww = dr.walls.find((x) => x.id === o.wallId);
            if (ww) o.offset = clampOpeningOffset(ww, o.width, o.offset);
          }
        });
        break;
      }
      case 'rotate': {
        const it = s.project.items.find((i) => i.id === d.id);
        if (!it) break;
        let ang = angleOf(it, raw) - 90;
        if (!e.altKey) ang = Math.round(ang / 15) * 15;
        ang = ((ang % 360) + 360) % 360;
        s.mutateLive((dr) => {
          dr.items.find((i) => i.id === d.id)!.rotation = ang;
        });
        break;
      }
      case 'resize': {
        const it = s.project.items.find((i) => i.id === d.id);
        if (!it) break;
        const local = rotate(sub(raw, it), -it.rotation);
        const grid = options.snapGrid && !e.altKey ? 1 : 0;
        s.mutateLive((dr) => {
          const x = dr.items.find((i) => i.id === d.id)!;
          if (d.axis === 'w') {
            const left = -it.width / 2;
            let nw = Math.max(5, local.x - left);
            if (grid) nw = Math.round(nw);
            const shift = rotate({ x: (nw - it.width) / 2, y: 0 }, it.rotation);
            x.width = nw;
            x.x = it.x + shift.x;
            x.y = it.y + shift.y;
          } else {
            const back = -it.depth / 2;
            let nd = Math.max(1, local.y - back);
            if (grid) nd = Math.round(nd);
            const shift = rotate({ x: 0, y: (nd - it.depth) / 2 }, it.rotation);
            x.depth = nd;
            x.x = it.x + shift.x;
            x.y = it.y + shift.y;
          }
        });
        break;
      }
      case 'roomVertex': {
        const r = s.project.rooms.find((x) => x.id === d.id);
        if (!r) break;
        const sn = snapPoint(raw, walls, snapOpts());
        g = sn.guides;
        s.mutateLive((dr) => {
          dr.rooms.find((x) => x.id === d.id)!.points[d.index] = sn.point;
        });
        break;
      }
      case 'dimEnd': {
        const sn = snapPoint(raw, walls, snapOpts());
        s.mutateLive((dr) => {
          const x = dr.dimensions.find((q) => q.id === d.id)!;
          x[d.end] = sn.point;
        });
        break;
      }
      case 'dimOffset': {
        const dm = s.project.dimensions.find((q) => q.id === d.id);
        if (!dm) break;
        const n = perp(normalize(sub(dm.b, dm.a)));
        const off = Math.round(dot(sub(raw, dm.a), n));
        s.mutateLive((dr) => {
          dr.dimensions.find((q) => q.id === d.id)!.offset = off;
        });
        break;
      }
      case 'roofCorner': {
        const r = s.project.roofs.find((q) => q.id === d.id);
        if (!r) break;
        const opp = add(rotate({ x: (-d.sx * r.width) / 2, y: (-d.sy * r.depth) / 2 }, r.rotation), r);
        const p = snapPoint(raw, walls, snapOpts()).point;
        const local = rotate(sub(p, opp), -r.rotation);
        const w = Math.max(50, Math.abs(local.x));
        const dd = Math.max(50, Math.abs(local.y));
        const c = add(opp, rotate({ x: (d.sx * w) / 2, y: (d.sy * dd) / 2 }, r.rotation));
        s.mutateLive((dr) => {
          const x = dr.roofs.find((q) => q.id === d.id)!;
          x.width = Math.round(w);
          x.depth = Math.round(dd);
          x.x = c.x;
          x.y = c.y;
        });
        break;
      }
    }
    setGuides(g);
    setCursor(raw);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    svgRef.current?.releasePointerCapture(e.pointerId);
    const d = dragRef.current;
    setDrag(null);
    st().endLive();
    setGuides([]);
    if (!d) return;
    if (d.type === 'marquee') {
      const b = bbox([d.start, d.end]);
      if (b.maxX - b.minX < 3 * px && b.maxY - b.minY < 3 * px) {
        if (!d.additive) st().clearSelection();
        return;
      }
      const inside = (p: Vec2) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
      const sel: SelectionRef[] = [];
      const lv = level.id;
      for (const w of project.walls) if (w.levelId === lv && inside(w.a) && inside(w.b)) sel.push({ type: 'wall', id: w.id });
      if (options.showFurniture) for (const it of project.items) if (it.levelId === lv && itemCorners(it).every(inside)) sel.push({ type: 'item', id: it.id });
      for (const r of project.rooms) if (r.levelId === lv && r.points.every(inside)) sel.push({ type: 'room', id: r.id });
      for (const r of project.dimensions) if (r.levelId === lv && inside(r.a) && inside(r.b)) sel.push({ type: 'dimension', id: r.id });
      for (const r of project.labels) if (r.levelId === lv && inside(r)) sel.push({ type: 'label', id: r.id });
      st().setSelection(d.additive ? [...selection, ...sel.filter((s) => !selection.some((x) => x.id === s.id))] : sel);
    }
    if (d.type === 'rect') {
      const b = bbox([d.start, d.end]);
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      if (tool === 'roomRect') {
        if (w < 20 || h < 20) return;
        const t = project.settings.defaultWallThickness;
        const ht = t / 2;
        const newWalls = wallLoop(
          level.id,
          [
            { x: b.minX - ht, y: b.minY - ht },
            { x: b.maxX + ht, y: b.minY - ht },
            { x: b.maxX + ht, y: b.maxY + ht },
            { x: b.minX - ht, y: b.maxY + ht },
          ],
          { thickness: t, height: level.height },
        );
        const n = project.rooms.filter((r) => r.levelId === level.id).length + 1;
        const room = createRoom(level.id, [
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.minY },
          { x: b.maxX, y: b.maxY },
          { x: b.minX, y: b.maxY },
        ], { name: `Room ${n}` });
        st().mutate((dr) => {
          dr.walls.push(...newWalls);
          dr.rooms.push(room);
        });
        st().setSelection([{ type: 'room', id: room.id }]);
      } else if (tool === 'roof') {
        let roof;
        if (w < 30 || h < 30) {
          // Click: cover the outer faces of all walls on this level
          if (!walls.length) return;
          const pts = walls.flatMap((x) => footprintPolygon(wallFootprint(x, walls)));
          const bb = bbox(pts);
          const hMax = Math.max(...walls.map((x) => Math.max(x.height, x.heightEnd ?? 0)));
          roof = createRoof(level.id, (bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2, bb.maxX - bb.minX, bb.maxY - bb.minY, { baseHeight: hMax });
        } else roof = createRoof(level.id, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, w, h, { baseHeight: level.height });
        if (roof.depth > roof.width) roof.ridgeAlong = 'depth';
        st().mutate((dr) => {
          dr.roofs.push(roof!);
        });
        st().setSelection([{ type: 'roof', id: roof.id }]);
        st().setTool('select');
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const raw = toWorld(e.clientX, e.clientY);
    if (tool === 'wall') {
      setChain([]);
      return;
    }
    if (tool === 'room') {
      if (roomPts.length >= 3) {
        // The double-click's two clicks added the same point twice; drop duplicates.
        const pts = roomPts.filter((p, i) => i === 0 || dist(p, roomPts[i - 1]) > 1);
        finishRoom(pts);
        setRoomPts([]);
        return;
      }
      const poly = detectRoomAt(raw, walls);
      setRoomPts([]);
      if (poly) finishRoom(poly);
      return;
    }
    if (tool === 'select' && !placing) {
      const hit = hitTest(raw);
      if (!hit) {
        const poly = detectRoomAt(raw, walls);
        if (poly && !project.rooms.some((r) => r.levelId === level.id && pointInPolygon(raw, r.points))) finishRoom(poly);
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    setView((v) => {
      const s = Math.max(0.03, Math.min(25, v.s * f));
      const k = s / v.s;
      return { s, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
    });
  };

  // HTML5 drag-and-drop from the catalog
  const onDrop = (e: React.DragEvent) => {
    const kind = e.dataTransfer.getData('text/x-item-kind');
    const okind = e.dataTransfer.getData('text/x-opening-kind');
    const p = toWorld(e.clientX, e.clientY);
    if (kind) {
      e.preventDefault();
      const it = createItem(level.id, kind, p.x, p.y);
      const sn = snapItem(it, p, project, level.id, snapOpts());
      Object.assign(it, { x: sn.x, y: sn.y, rotation: sn.rotation });
      st().mutate((d) => {
        d.items.push(it);
      });
      st().setSelection([{ type: 'item', id: it.id }]);
    } else if (okind) {
      e.preventDefault();
      const nw = nearestWall(p, walls, 60);
      if (!nw) return;
      const o = createOpening(nw.wall.id, okind as Opening['kind'], 0);
      o.offset = clampOpeningOffset(nw.wall, o.width, snapTo(nw.offset, 5));
      o.flipSide = sideOfWall(nw.wall, p) === -1;
      st().mutate((d) => {
        d.openings.push(o);
      });
      st().setSelection([{ type: 'opening', id: o.id }]);
    }
  };

  // ---------- rendering ----------
  const selIds = useMemo(() => new Set(selection.map((s) => s.id)), [selection]);

  const staticLayer = useMemo(
    () => <PlanContent project={project} levelId={level.id} px={px} selIds={selIds} options={options} unit={unit} />,
    [project, level.id, px, selIds, options, unit],
  );

  const grid = useMemo(() => {
    if (!options.showGrid) return null;
    const minor = project.settings.gridSize;
    const lines = (step: number) => {
      const sp = step * view.s;
      if (sp < 7) return '';
      let d = '';
      const x0 = Math.floor(-view.ox / view.s / step) * step;
      for (let x = x0; x * view.s + view.ox < size.w; x += step) d += `M${(x * view.s + view.ox).toFixed(1)} 0V${size.h}`;
      const y0 = Math.floor(-view.oy / view.s / step) * step;
      for (let y = y0; y * view.s + view.oy < size.h; y += step) d += `M0 ${(y * view.s + view.oy).toFixed(1)}H${size.w}`;
      return d;
    };
    let major = 100;
    while (major * view.s < 30) major *= 10;
    return (
      <g pointerEvents="none">
        <path d={lines(minor)} stroke="#e8eaee" strokeWidth={1} />
        <path d={lines(major)} stroke="#d3d7de" strokeWidth={1} />
        <path d={`M${view.ox} 0V${size.h}M0 ${view.oy}H${size.w}`} stroke="#c3cad6" strokeWidth={1} />
      </g>
    );
  }, [options.showGrid, project.settings.gridSize, view, size]);

  const overlays: ReactNode[] = [];
  const handle = (p: Vec2, key: string, round = false) =>
    round ? (
      <circle key={key} cx={p.x} cy={p.y} r={5 * px} fill="#fff" stroke={BLUE} strokeWidth={1.5 * px} />
    ) : (
      <rect key={key} x={p.x - 4.5 * px} y={p.y - 4.5 * px} width={9 * px} height={9 * px} fill="#fff" stroke={BLUE} strokeWidth={1.5 * px} />
    );

  if (tool === 'select' && !placing) {
    if (selWall) overlays.push(handle(selWall.a, 'wa', true), handle(selWall.b, 'wb', true));
    if (selItem && !selItem.locked) {
      const rh = rotHandle(selItem);
      const front = add(rotate({ x: 0, y: selItem.depth / 2 }, selItem.rotation), selItem);
      overlays.push(<line key="rl" x1={front.x} y1={front.y} x2={rh.x} y2={rh.y} stroke={BLUE} strokeWidth={px} />);
      overlays.push(handle(rh, 'rot', true), handle(wHandle(selItem), 'w'), handle(dHandle(selItem), 'd'));
      overlays.push(<ItemClearances key="clr" item={selItem} walls={walls} px={px} unit={unit} />);
    }
    if (selRoom) selRoom.points.forEach((p, i) => overlays.push(handle(p, `rv${i}`)));
    if (selDim) {
      const { a, b } = dimLine(selDim);
      overlays.push(handle(selDim.a, 'da', true), handle(selDim.b, 'db', true), handle(scale(add(a, b), 0.5), 'dm'));
    }
    if (selRoof) roofCorners(selRoof).forEach((c, i) => overlays.push(handle(c.p, `rc${i}`)));
  }

  // Tool previews
  if (tool === 'wall' && cursor) {
    const last = chain[chain.length - 1];
    if (last) {
      let end = cursor;
      const len = parseLength(lengthBuf, unit);
      if (lengthBuf && len) end = add(last, scale(normalize(sub(cursor, last)), len));
      const tmp = createWall(level.id, last, end, { thickness: project.settings.defaultWallThickness });
      const poly = footprintPolygon(wallFootprint(tmp, [...walls, tmp]));
      overlays.push(<polygon key="wp" points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill={BLUE} fillOpacity={0.25} stroke={BLUE} strokeWidth={px} />);
      const mid = scale(add(last, end), 0.5);
      const ang = angleOf(last, end);
      overlays.push(
        <TextTag key="wl" p={add(mid, scale(perp(normalize(sub(end, last))), 22 * px))} px={px} text={`${formatLength(dist(last, end), unit)}  ${(((-ang % 360) + 360) % 360).toFixed(0)}°`} />,
      );
    }
    overlays.push(<SnapMarker key="sm" p={cursor} px={px} kind={snapKind} />);
  }
  if (tool === 'room' && cursor) {
    const pts = [...roomPts, cursor];
    if (roomPts.length) overlays.push(<polygon key="rp" points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill={BLUE} fillOpacity={0.12} stroke={BLUE} strokeWidth={1.5 * px} strokeDasharray={`${4 * px} ${3 * px}`} />);
    if (pts.length >= 3) overlays.push(<TextTag key="ra" p={polygonCentroid(pts)} px={px} text={formatArea(Math.abs(polygonArea(pts)), unit)} />);
    overlays.push(<SnapMarker key="sm" p={cursor} px={px} kind={snapKind} />);
  }
  if (tool === 'dimension' && cursor) {
    if (dimPts.length === 1) overlays.push(<DimensionLine key="dp" d={{ id: '', levelId: '', a: dimPts[0], b: cursor, offset: 0 }} px={px} unit={unit} selected />);
    if (dimPts.length === 2) {
      const [a, b] = dimPts;
      const off = dot(sub(cursor, a), perp(normalize(sub(b, a))));
      overlays.push(<DimensionLine key="dp" d={{ id: '', levelId: '', a, b, offset: off }} px={px} unit={unit} selected />);
    }
    overlays.push(<SnapMarker key="sm" p={cursor} px={px} kind={snapKind} />);
  }
  if ((tool === 'roomRect' || tool === 'roof') && drag?.type === 'rect') {
    const b = bbox([drag.start, drag.end]);
    overlays.push(<rect key="rr" x={b.minX} y={b.minY} width={b.maxX - b.minX} height={b.maxY - b.minY} fill={BLUE} fillOpacity={0.12} stroke={BLUE} strokeWidth={1.5 * px} />);
    overlays.push(<TextTag key="rt" p={{ x: (b.minX + b.maxX) / 2, y: b.minY - 16 * px }} px={px} text={`${formatLength(b.maxX - b.minX, unit)} × ${formatLength(b.maxY - b.minY, unit)}`} />);
  }
  if (drag?.type === 'marquee') {
    const b = bbox([drag.start, drag.end]);
    overlays.push(<rect key="mq" x={b.minX} y={b.minY} width={b.maxX - b.minX} height={b.maxY - b.minY} fill={BLUE} fillOpacity={0.08} stroke={BLUE} strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />);
  }
  if (ghostItem) {
    overlays.push(
      <g key="ghost" transform={`translate(${ghostItem.x} ${ghostItem.y}) rotate(${ghostItem.rotation})`} opacity={0.7}>
        <ItemSymbol item={ghostItem} px={px} selected />
      </g>,
    );
    overlays.push(<ItemClearances key="gclr" item={ghostItem} walls={walls} px={px} unit={unit} />);
  }
  if (ghostOpening) overlays.push(<OpeningSymbol key="go" wall={ghostOpening.wall} opening={ghostOpening.opening} px={px} selected />);
  for (const [i, gd] of guides.entries()) overlays.push(<line key={`g${i}`} x1={gd.a.x} y1={gd.a.y} x2={gd.b.x} y2={gd.b.y} stroke="#e0457b" strokeWidth={px} strokeDasharray={`${4 * px} ${3 * px}`} />);

  const cursorStyle = drag?.type === 'pan' ? 'grabbing' : tool === 'pan' ? 'grab' : tool === 'select' && !placing ? 'default' : 'crosshair';

  const hint = (() => {
    if (placing?.type === 'item') return 'Click to place · R rotates 90° · Shift+click places several · Esc cancels';
    if (placing?.type === 'opening') return 'Hover a wall and click to insert · Esc cancels';
    switch (tool) {
      case 'wall':
        return chain.length ? 'Click the next corner · type a length + Enter · double-click / right-click / Esc to finish' : 'Click to start a wall · hold Alt to disable snapping';
      case 'room':
        return roomPts.length ? 'Click corners · click the first point, double-click or press Enter to close' : 'Click corners of a floor, or double-click inside walls to detect the room';
      case 'roomRect':
        return 'Drag a rectangle to create a room with four walls';
      case 'roof':
        return 'Drag a rectangle for the roof footprint, or click once to cover all walls';
      case 'dimension':
        return dimPts.length === 0 ? 'Click the first point' : dimPts.length === 1 ? 'Click the second point' : 'Move to set the offset and click';
      case 'label':
        return 'Click to add a text label';
      default:
        return 'Drag to move · Shift+click to multi-select · drag on empty space to box-select · wheel to zoom · middle-drag or Space+drag to pan';
    }
  })();

  return (
    <div className="plan" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <svg
        ref={svgRef}
        className="plan-svg"
        style={{ cursor: cursorStyle }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => !dragRef.current && setCursor(null)}
        onDoubleClick={onDoubleClick}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <rect width={size.w} height={size.h} fill="#fbfbfc" />
        {grid}
        <g transform={`translate(${view.ox} ${view.oy}) scale(${view.s})`}>
          {staticLayer}
          {overlays}
        </g>
      </svg>
      {tool === 'wall' && chain.length > 0 && cursor && (
        <div className="length-input" style={{ left: cursor.x * view.s + view.ox + 18, top: cursor.y * view.s + view.oy + 18 }}>
          <span>Length</span>
          <strong>{lengthBuf || '…'}</strong>
          <em>{unit}</em>
        </div>
      )}
      <div className="plan-hint">{hint}</div>
      <div className="plan-zoom">
        <button onClick={() => setView((v) => zoomAt(v, size, 1.25))} title="Zoom in">
          +
        </button>
        <button onClick={() => setView((v) => zoomAt(v, size, 0.8))} title="Zoom out">
          −
        </button>
        <button onClick={fit} title="Zoom to fit">
          Fit
        </button>
        <span className="plan-scale">{cursor ? `${formatLength(cursor.x, unit)}, ${formatLength(cursor.y, unit)}` : ''}</span>
      </div>
    </div>
  );
}

function zoomAt(v: ViewT, size: { w: number; h: number }, f: number): ViewT {
  const s = Math.max(0.03, Math.min(25, v.s * f));
  const k = s / v.s;
  const mx = size.w / 2;
  const my = size.h / 2;
  return { s, ox: mx - (mx - v.ox) * k, oy: my - (my - v.oy) * k };
}

export function dimLine(d: Dimension) {
  const n = perp(normalize(sub(d.b, d.a)));
  return { a: add(d.a, scale(n, d.offset)), b: add(d.b, scale(n, d.offset)), n };
}

function TextTag({ p, px, text }: { p: Vec2; px: number; text: string }) {
  const w = text.length * 6.4 * px + 10 * px;
  return (
    <g pointerEvents="none">
      <rect x={p.x - w / 2} y={p.y - 9 * px} width={w} height={18 * px} rx={4 * px} fill="#1f2937" opacity={0.88} />
      <text x={p.x} y={p.y} fontSize={11 * px} fill="#fff" textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  );
}

function SnapMarker({ p, px, kind }: { p: Vec2; px: number; kind: string }) {
  const color = kind === 'endpoint' ? '#16a34a' : kind === 'wall' ? '#ea580c' : kind === 'align' || kind === 'angle' ? '#e0457b' : BLUE;
  return (
    <g pointerEvents="none">
      <circle cx={p.x} cy={p.y} r={4 * px} fill="none" stroke={color} strokeWidth={1.5 * px} />
      <line x1={p.x - 9 * px} y1={p.y} x2={p.x + 9 * px} y2={p.y} stroke={color} strokeWidth={px} />
      <line x1={p.x} y1={p.y - 9 * px} x2={p.x} y2={p.y + 9 * px} stroke={color} strokeWidth={px} />
    </g>
  );
}

function DimensionLine({ d, px, unit, selected }: { d: Dimension; px: number; unit: Project['settings']['unit']; selected?: boolean }) {
  const { a, b, n } = dimLine(d);
  const L = dist(d.a, d.b);
  if (L < 0.5) return null;
  const color = selected ? BLUE : '#374151';
  const mid = scale(add(a, b), 0.5);
  let ang = angleOf(a, b);
  if (ang > 90 || ang < -90) ang += 180;
  const tick = 5 * px;
  const u = normalize(sub(b, a));
  const tk = scale(normalize(add(u, n)), tick);
  const ext = Math.sign(d.offset || 1) * 4 * px;
  return (
    <g pointerEvents="none">
      <line x1={d.a.x} y1={d.a.y} x2={a.x + n.x * ext} y2={a.y + n.y * ext} stroke={color} strokeWidth={0.8 * px} />
      <line x1={d.b.x} y1={d.b.y} x2={b.x + n.x * ext} y2={b.y + n.y * ext} stroke={color} strokeWidth={0.8 * px} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={px} />
      <line x1={a.x - tk.x} y1={a.y - tk.y} x2={a.x + tk.x} y2={a.y + tk.y} stroke={color} strokeWidth={1.6 * px} />
      <line x1={b.x - tk.x} y1={b.y - tk.y} x2={b.x + tk.x} y2={b.y + tk.y} stroke={color} strokeWidth={1.6 * px} />
      <g transform={`translate(${mid.x} ${mid.y}) rotate(${ang})`}>
        <rect x={-formatLength(L, unit).length * 3.3 * px - 3 * px} y={-15 * px} width={formatLength(L, unit).length * 6.6 * px + 6 * px} height={13 * px} fill="#fbfbfc" opacity={0.85} />
        <text x={0} y={-5 * px} fontSize={11 * px} fill={color} textAnchor="middle">
          {formatLength(L, unit)}
        </text>
      </g>
    </g>
  );
}

/** Distances from an item's sides to the nearest walls, shown while it is selected or being placed. */
function ItemClearances({ item, walls, px, unit }: { item: Item; walls: Wall[]; px: number; unit: Project['settings']['unit'] }) {
  const out: ReactNode[] = [];
  const dirs = [
    { local: { x: 1, y: 0 }, half: item.width / 2 },
    { local: { x: -1, y: 0 }, half: item.width / 2 },
    { local: { x: 0, y: 1 }, half: item.depth / 2 },
    { local: { x: 0, y: -1 }, half: item.depth / 2 },
  ];
  dirs.forEach(({ local, half }, i) => {
    const d = rotate(local, item.rotation);
    const start = add(item, scale(d, half));
    let best = Infinity;
    for (const w of walls) {
      const wd = wallDir(w);
      const wn = perp(wd);
      const den = dot(d, wn);
      if (Math.abs(den) < 0.2) continue;
      // Intersect the ray with both faces of the wall
      for (const sg of [1, -1]) {
        const face = add(w.a, scale(wn, (sg * w.thickness) / 2));
        const t = dot(sub(face, start), wn) / den;
        if (t < 0.5 || t > 2000) continue;
        const hit = add(start, scale(d, t));
        const pr = projectOnSegment(hit, w.a, w.b);
        if (pr.t <= 0 || pr.t >= 1) continue;
        best = Math.min(best, t);
      }
    }
    if (best < 600) {
      const end = add(start, scale(d, best));
      const mid = scale(add(start, end), 0.5);
      out.push(
        <g key={i} pointerEvents="none">
          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#e0457b" strokeWidth={px} strokeDasharray={`${3 * px} ${2 * px}`} />
          {best > 8 * px && (
            <text x={mid.x} y={mid.y} fontSize={10 * px} fill="#be185d" textAnchor="middle" dominantBaseline="central" stroke="#fff" strokeWidth={3 * px} paintOrder="stroke">
              {formatLength(best, unit)}
            </text>
          )}
        </g>,
      );
    }
  });
  return <>{out}</>;
}

interface ContentProps {
  project: Project;
  levelId: string;
  px: number;
  selIds: Set<string>;
  options: ReturnType<typeof useStore.getState>['options'];
  unit: Project['settings']['unit'];
}

function PlanContent({ project, levelId, px, selIds, options, unit }: ContentProps) {
  const level = project.levels.find((l) => l.id === levelId)!;
  const walls = project.walls.filter((w) => w.levelId === levelId);
  const below = [...project.levels].filter((l) => l.elevation < level.elevation).sort((a, b) => b.elevation - a.elevation)[0];
  const belowWalls = below ? project.walls.filter((w) => w.levelId === below.id) : [];
  const rooms = project.rooms.filter((r) => r.levelId === levelId);
  const items = project.items.filter((i) => i.levelId === levelId);
  const roofs = project.roofs.filter((r) => r.levelId === levelId || (below && r.levelId === below.id && r.baseHeight > below.height));
  const openings = project.openings.filter((o) => walls.some((w) => w.id === o.wallId));
  const sorted = [...items].sort((a, b) => a.elevation - b.elevation);

  return (
    <>
      {/* Level below, for reference */}
      {belowWalls.map((w) => (
        <polygon key={`bw${w.id}`} points={footprintPolygon(wallFootprint(w, belowWalls)).map((p) => `${p.x},${p.y}`).join(' ')} fill="#e5e7eb" stroke="#d1d5db" strokeWidth={px} />
      ))}

      {rooms.map((r) => {
        const sel = selIds.has(r.id);
        return (
          <polygon
            key={r.id}
            points={r.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={getMaterialDef(r.floorMaterial).color}
            fillOpacity={0.32}
            stroke={sel ? BLUE : 'none'}
            strokeWidth={2 * px}
          />
        );
      })}

      {options.showFurniture &&
        sorted.map((it) => (
          <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rotation}) scale(${it.mirrored ? -1 : 1} 1)`}>
            <ItemSymbol item={it} px={px} selected={selIds.has(it.id)} />
            {selIds.has(it.id) && <rect x={-it.width / 2} y={-it.depth / 2} width={it.width} height={it.depth} fill={BLUE} fillOpacity={0.12} stroke={BLUE} strokeWidth={2 * px} />}
          </g>
        ))}

      {walls.map((w) => {
        const poly = footprintPolygon(wallFootprint(w, walls));
        const sel = selIds.has(w.id);
        return <polygon key={w.id} points={poly.map((p) => `${p.x},${p.y}`).join(' ')} fill={sel ? '#4b74d6' : '#3d4148'} stroke={sel ? BLUE : '#23262b'} strokeWidth={px} strokeLinejoin="round" />;
      })}

      {openings.map((o) => {
        const w = walls.find((x) => x.id === o.wallId)!;
        return <OpeningSymbol key={o.id} wall={w} opening={o} px={px} selected={selIds.has(o.id)} />;
      })}

      {options.showRoofsInPlan &&
        roofs.map((r) => {
          const { outline, inner } = roofPlanLines(r);
          const sel = selIds.has(r.id);
          const color = sel ? BLUE : '#8a5a44';
          return (
            <g key={r.id} pointerEvents="none">
              <polygon points={outline.map((e) => `${e.a.x},${e.a.y}`).join(' ')} fill={color} fillOpacity={0.05} stroke="none" />
              {outline.map((e, i) => (
                <line key={`o${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={color} strokeWidth={1.5 * px} strokeDasharray={`${8 * px} ${4 * px}`} />
              ))}
              {inner.map((e, i) => (
                <line key={`i${i}`} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke={color} strokeWidth={px} strokeDasharray={`${3 * px} ${3 * px}`} />
              ))}
            </g>
          );
        })}

      {options.showRoomLabels &&
        rooms.map((r) => {
          if (r.points.length < 3) return null;
          const c = polygonCentroid(r.points);
          return (
            <g key={`rl${r.id}`} pointerEvents="none">
              <text x={c.x} y={c.y - 7 * px} fontSize={13 * px} fontWeight={600} fill={INK} textAnchor="middle" stroke="#fbfbfc" strokeWidth={3 * px} paintOrder="stroke">
                {r.name}
              </text>
              <text x={c.x} y={c.y + 9 * px} fontSize={11 * px} fill="#4b5563" textAnchor="middle" stroke="#fbfbfc" strokeWidth={3 * px} paintOrder="stroke">
                {formatArea(Math.abs(polygonArea(r.points)), unit)}
              </text>
            </g>
          );
        })}

      {options.showWallLengths &&
        walls.map((w) => {
          const L = wallLength(w);
          if (L * (1 / px) < 40) return null;
          const dir = wallDir(w);
          const n = perp(dir);
          const pos = add(scale(add(w.a, w.b), 0.5), scale(n, w.thickness / 2 + 9 * px));
          let ang = angleOf(w.a, w.b);
          if (ang > 90 || ang <= -90) ang += 180;
          return (
            <text key={`wl${w.id}`} transform={`translate(${pos.x} ${pos.y}) rotate(${ang})`} fontSize={10 * px} fill="#6b7280" textAnchor="middle" dominantBaseline="central" pointerEvents="none">
              {formatLength(L, unit)}
            </text>
          );
        })}

      {options.showDimensions && project.dimensions.filter((d) => d.levelId === levelId).map((d) => <DimensionLine key={d.id} d={d} px={px} unit={unit} selected={selIds.has(d.id)} />)}

      {project.labels
        .filter((l) => l.levelId === levelId)
        .map((l) => (
          <text key={l.id} x={l.x} y={l.y} fontSize={l.size} fill={selIds.has(l.id) ? BLUE : INK} textAnchor="middle" dominantBaseline="central" pointerEvents="none" fontWeight={500}>
            {l.text}
          </text>
        ))}
    </>
  );
}

export { PlanContent };
