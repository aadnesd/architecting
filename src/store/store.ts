import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type { EntityType, Item, OpeningKind, Project, SelectionRef, Vec2 } from '../model/types';
import { createEmptyProject, normalizeProject, uid } from '../model/factory';
import { add } from '../geometry/math';

export type ToolId = 'select' | 'wall' | 'room' | 'roomRect' | 'dimension' | 'roof' | 'label' | 'pan';

export type Placing = { type: 'item'; kind: string } | { type: 'opening'; kind: OpeningKind } | null;

export type ViewMode = '2d' | '3d' | 'split';

export interface ViewOptions {
  showGrid: boolean;
  showDimensions: boolean;
  showWallLengths: boolean;
  showFurniture: boolean;
  showRoofsInPlan: boolean;
  showRoomLabels: boolean;
  snapGrid: boolean;
  snapObjects: boolean;
  show3DRoofs: boolean;
  allLevels3D: boolean;
  ceilings: boolean;
  cutaway: boolean;
  shadows: boolean;
  sunAzimuth: number;
  sunElevation: number;
  walkMode: boolean;
  lampLights: boolean;
  /** Hide walls between the camera and the rooms, and roofs, for looking into interiors. */
  dollhouse: boolean;
  /** Post-processing (ambient occlusion, bloom, SMAA) in the live 3D view. */
  enhanced: boolean;
}

interface Clipboard {
  items: Item[];
}

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  pending: Project | null;
  selection: SelectionRef[];
  activeLevelId: string;
  tool: ToolId;
  placing: Placing;
  view: ViewMode;
  options: ViewOptions;
  clipboard: Clipboard | null;
  /** Bumped to ask the 3D view to frame the scene. */
  frameRequest: number;
  panel: 'catalog' | 'schedule' | 'project';
  renderOpen: boolean;
  setRenderOpen: (v: boolean) => void;

  mutate: (recipe: (draft: Draft<Project>) => void) => void;
  /** Start a continuous edit (drag). The first `mutateLive` call records a single undo step. */
  beginLive: () => void;
  mutateLive: (recipe: (draft: Draft<Project>) => void) => void;
  endLive: () => void;
  undo: () => void;
  redo: () => void;

  setSelection: (sel: SelectionRef[]) => void;
  select: (type: EntityType, id: string, additive?: boolean) => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: () => void;
  moveSelection: (delta: Vec2) => void;

  setTool: (tool: ToolId) => void;
  setPlacing: (p: Placing) => void;
  setView: (v: ViewMode) => void;
  setOption: <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) => void;
  setActiveLevel: (id: string) => void;
  setPanel: (p: State['panel']) => void;
  requestFrame: () => void;
  loadProject: (p: Project) => void;
}

const STORAGE_KEY = 'home-designer:project';
const MAX_HISTORY = 200;

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeProject(JSON.parse(raw));
  } catch {
    /* ignore corrupt storage */
  }
  return createEmptyProject();
}

const initialProject = loadInitial();
const initialDollhouse = (initialProject.roofs.length === 0 || initialProject.levels.length > 1) && initialProject.walls.length > 0;

export const useStore = create<State>()((set, get) => ({
  project: initialProject,
  past: [],
  future: [],
  pending: null,
  selection: [],
  activeLevelId: (initialProject.levels.find((l) => l.elevation >= 0) ?? initialProject.levels[0]).id,
  tool: 'select',
  placing: null,
  view: 'split',
  options: {
    showGrid: true,
    showDimensions: true,
    showWallLengths: true,
    showFurniture: true,
    showRoofsInPlan: true,
    showRoomLabels: true,
    snapGrid: true,
    snapObjects: true,
    show3DRoofs: true,
    allLevels3D: false,
    ceilings: false,
    cutaway: false,
    shadows: true,
    sunAzimuth: 145,
    sunElevation: 45,
    walkMode: false,
    lampLights: true,
    dollhouse: initialDollhouse,
    enhanced: true,
  },
  clipboard: null,
  frameRequest: 0,
  panel: 'catalog',
  renderOpen: false,
  setRenderOpen: (renderOpen) => set({ renderOpen }),

  mutate: (recipe) => {
    const { project, past } = get();
    const next = produce(project, recipe);
    if (next === project) return;
    set({ project: next, past: [...past, project].slice(-MAX_HISTORY), future: [], pending: null });
  },
  beginLive: () => set({ pending: get().project }),
  mutateLive: (recipe) => {
    const { project, pending, past } = get();
    const next = produce(project, recipe);
    if (next === project) return;
    if (pending) set({ project: next, past: [...past, pending].slice(-MAX_HISTORY), future: [], pending: null });
    else set({ project: next });
  },
  endLive: () => set({ pending: null }),
  undo: () => {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future], selection: validSelection(prev, get().selection) });
    fixActiveLevel();
  },
  redo: () => {
    const { past, project, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ project: next, past: [...past, project], future: future.slice(1), selection: validSelection(next, get().selection) });
    fixActiveLevel();
  },

  setSelection: (selection) => set({ selection }),
  select: (type, id, additive) => {
    const sel = get().selection;
    if (additive) {
      const exists = sel.some((s) => s.id === id);
      set({ selection: exists ? sel.filter((s) => s.id !== id) : [...sel, { type, id }] });
    } else set({ selection: [{ type, id }] });
  },
  clearSelection: () => set({ selection: [] }),
  deleteSelection: () => {
    const sel = get().selection;
    if (!sel.length) return;
    const ids = new Set(sel.map((s) => s.id));
    const levelIds = sel.filter((s) => s.type === 'level').map((s) => s.id);
    get().mutate((d) => {
      d.walls = d.walls.filter((w) => !ids.has(w.id));
      const wallIds = new Set(d.walls.map((w) => w.id));
      d.openings = d.openings.filter((o) => !ids.has(o.id) && wallIds.has(o.wallId));
      d.rooms = d.rooms.filter((r) => !ids.has(r.id));
      d.items = d.items.filter((i) => !ids.has(i.id) || i.locked);
      d.roofs = d.roofs.filter((r) => !ids.has(r.id));
      d.dimensions = d.dimensions.filter((r) => !ids.has(r.id));
      d.labels = d.labels.filter((r) => !ids.has(r.id));
      if (levelIds.length && d.levels.length > levelIds.length) {
        const lv = new Set(levelIds);
        d.levels = d.levels.filter((l) => !lv.has(l.id));
        d.walls = d.walls.filter((w) => !lv.has(w.levelId));
        const remainingWalls = new Set(d.walls.map((w) => w.id));
        d.openings = d.openings.filter((o) => remainingWalls.has(o.wallId));
        d.rooms = d.rooms.filter((r) => !lv.has(r.levelId));
        d.items = d.items.filter((r) => !lv.has(r.levelId));
        d.roofs = d.roofs.filter((r) => !lv.has(r.levelId));
        d.dimensions = d.dimensions.filter((r) => !lv.has(r.levelId));
        d.labels = d.labels.filter((r) => !lv.has(r.levelId));
      }
    });
    set({ selection: [] });
    fixActiveLevel();
  },
  duplicateSelection: () => {
    get().copySelection();
    get().paste();
  },
  copySelection: () => {
    const { selection, project } = get();
    const ids = new Set(selection.filter((s) => s.type === 'item').map((s) => s.id));
    const items = project.items.filter((i) => ids.has(i.id));
    if (items.length) set({ clipboard: { items: structuredClone(items) } });
  },
  paste: () => {
    const { clipboard, activeLevelId } = get();
    if (!clipboard) return;
    const copies = clipboard.items.map((i) => ({ ...structuredClone(i), id: uid('item'), levelId: activeLevelId, x: i.x + 20, y: i.y + 20, locked: false }));
    get().mutate((d) => {
      d.items.push(...copies);
    });
    // Offset the clipboard so repeated pastes cascade.
    set({
      clipboard: { items: clipboard.items.map((i) => ({ ...i, x: i.x + 20, y: i.y + 20 })) },
      selection: copies.map((c) => ({ type: 'item' as const, id: c.id })),
    });
  },
  moveSelection: (delta) => {
    const sel = get().selection;
    if (!sel.length) return;
    get().mutate((d) => translateEntities(d, sel, delta));
  },

  setTool: (tool) => set({ tool, placing: null }),
  setPlacing: (placing) => set({ placing, tool: 'select' }),
  setView: (view) => set({ view }),
  setOption: (key, value) => set({ options: { ...get().options, [key]: value } }),
  setActiveLevel: (activeLevelId) => set({ activeLevelId, selection: [] }),
  setPanel: (panel) => set({ panel }),
  requestFrame: () => set({ frameRequest: get().frameRequest + 1 }),
  loadProject: (p) => {
    set({
      project: p,
      past: [],
      future: [],
      pending: null,
      selection: [],
      activeLevelId: (p.levels.find((l) => l.elevation >= 0) ?? p.levels[0]).id,
      frameRequest: get().frameRequest + 1,
      // Interiors without a roof are easier to inspect with the front walls hidden.
      options: { ...get().options, dollhouse: (p.roofs.length === 0 || p.levels.length > 1) && p.walls.length > 0 },
    });
  },
}));

function validSelection(p: Project, sel: SelectionRef[]) {
  const all = new Set<string>([
    ...p.walls.map((x) => x.id),
    ...p.openings.map((x) => x.id),
    ...p.rooms.map((x) => x.id),
    ...p.items.map((x) => x.id),
    ...p.roofs.map((x) => x.id),
    ...p.dimensions.map((x) => x.id),
    ...p.labels.map((x) => x.id),
    ...p.levels.map((x) => x.id),
  ]);
  return sel.filter((s) => all.has(s.id));
}

function fixActiveLevel() {
  const { project, activeLevelId } = useStore.getState();
  if (!project.levels.some((l) => l.id === activeLevelId)) useStore.setState({ activeLevelId: project.levels[0].id });
}

/** Move the selected entities by a delta; walls drag their connected end points along. */
export function translateEntities(d: Draft<Project>, sel: SelectionRef[], delta: Vec2) {
  const ids = new Set(sel.map((s) => s.id));
  const movedPoints: Vec2[] = [];
  for (const w of d.walls) {
    if (ids.has(w.id)) movedPoints.push({ ...w.a }, { ...w.b });
  }
  if (movedPoints.length) {
    for (const w of d.walls) {
      const moveA = ids.has(w.id) || movedPoints.some((p) => Math.abs(p.x - w.a.x) < 0.5 && Math.abs(p.y - w.a.y) < 0.5);
      const moveB = ids.has(w.id) || movedPoints.some((p) => Math.abs(p.x - w.b.x) < 0.5 && Math.abs(p.y - w.b.y) < 0.5);
      if (moveA) w.a = add(w.a, delta);
      if (moveB) w.b = add(w.b, delta);
    }
  }
  for (const i of d.items) if (ids.has(i.id) && !i.locked) Object.assign(i, add(i, delta));
  for (const r of d.rooms) if (ids.has(r.id)) r.points = r.points.map((p) => add(p, delta));
  for (const r of d.roofs) if (ids.has(r.id)) Object.assign(r, add(r, delta));
  for (const r of d.dimensions) if (ids.has(r.id)) {
    r.a = add(r.a, delta);
    r.b = add(r.b, delta);
  }
  for (const r of d.labels) if (ids.has(r.id)) Object.assign(r, add(r, delta));
}

// Autosave (debounced) to localStorage.
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(useStore.getState().project));
    } catch {
      /* storage full or unavailable */
    }
  }, 400);
});

export const useProject = () => useStore((s) => s.project);
export const useActiveLevel = () =>
  useStore((s) => s.project.levels.find((l) => l.id === s.activeLevelId) ?? s.project.levels[0]);
