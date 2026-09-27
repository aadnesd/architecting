import { getCatalogItem, getOpeningPreset } from './catalog';
import type { Dimension, Item, Label, Level, Opening, OpeningKind, Project, Roof, Room, Vec2, Wall } from './types';

let counter = 0;
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

export function createLevel(partial: Partial<Level> = {}): Level {
  return { id: uid('lvl'), name: 'Ground floor', elevation: 0, height: 250, floorThickness: 20, ...partial };
}

export function createWall(levelId: string, a: Vec2, b: Vec2, partial: Partial<Wall> = {}): Wall {
  return {
    id: uid('wall'),
    levelId,
    a: { ...a },
    b: { ...b },
    thickness: 15,
    height: 250,
    leftMaterial: 'paint-white',
    rightMaterial: 'paint-white',
    ...partial,
  };
}

export function createOpening(wallId: string, kind: OpeningKind, offset: number, partial: Partial<Opening> = {}): Opening {
  const p = getOpeningPreset(kind);
  return {
    id: uid('open'),
    wallId,
    kind,
    offset,
    width: p.width,
    height: p.height,
    sill: p.sill,
    flipHinge: false,
    flipSide: false,
    frameColor: 'paint-white',
    panelColor: kind === 'garageDoor' ? 'paint-lightgrey' : 'white-matte',
    ...partial,
  };
}

export function createRoom(levelId: string, points: Vec2[], partial: Partial<Room> = {}): Room {
  return {
    id: uid('room'),
    levelId,
    name: 'Room',
    points: points.map((p) => ({ ...p })),
    floorMaterial: 'oak-planks',
    ceilingMaterial: 'paint-white',
    showCeiling: true,
    ...partial,
  };
}

export function createItem(levelId: string, kind: string, x: number, y: number, partial: Partial<Item> = {}): Item {
  const c = getCatalogItem(kind);
  return {
    id: uid('item'),
    levelId,
    kind,
    name: c?.name ?? kind,
    x,
    y,
    elevation: c?.elevation ?? 0,
    rotation: 0,
    width: c?.width ?? 100,
    depth: c?.depth ?? 100,
    height: c?.height ?? 100,
    finish: c?.finish ?? 'paint-lightgrey',
    accent: c?.accent ?? 'paint-lightgrey',
    ...partial,
  };
}

export function createRoof(levelId: string, x: number, y: number, width: number, depth: number, partial: Partial<Roof> = {}): Roof {
  return {
    id: uid('roof'),
    levelId,
    type: 'gable',
    x,
    y,
    width,
    depth,
    rotation: 0,
    pitch: 35,
    overhang: 40,
    baseHeight: 250,
    thickness: 25,
    ridgeAlong: 'width',
    material: 'roof-tiles-dark',
    gableWalls: true,
    gableMaterial: 'cladding-white',
    fasciaMaterial: 'paint-white',
    ...partial,
  };
}

export function createDimension(levelId: string, a: Vec2, b: Vec2, offset = 40): Dimension {
  return { id: uid('dim'), levelId, a: { ...a }, b: { ...b }, offset };
}

export function createLabel(levelId: string, x: number, y: number, text = 'Label'): Label {
  return { id: uid('lbl'), levelId, x, y, text, size: 18 };
}

export function createEmptyProject(name = 'Untitled project'): Project {
  return {
    version: 1,
    name,
    settings: {
      unit: 'cm',
      gridSize: 10,
      defaultWallThickness: 15,
      defaultWallHeight: 250,
      showGround: true,
      groundMaterial: 'grass',
    },
    levels: [createLevel()],
    walls: [],
    openings: [],
    rooms: [],
    items: [],
    roofs: [],
    dimensions: [],
    labels: [],
  };
}

/** Closed chain of walls through the given corner points. */
export function wallLoop(levelId: string, pts: Vec2[], partial: Partial<Wall> = {}): Wall[] {
  return pts.map((p, i) => createWall(levelId, p, pts[(i + 1) % pts.length], partial));
}

/** Normalise a project loaded from JSON so older/partial files still open. */
export function normalizeProject(raw: unknown): Project {
  const base = createEmptyProject();
  if (!raw || typeof raw !== 'object') throw new Error('Not a project file');
  const p = raw as Partial<Project>;
  if (!Array.isArray(p.levels) || !Array.isArray(p.walls)) throw new Error('Not a project file');
  return {
    ...base,
    ...p,
    version: 1,
    settings: { ...base.settings, ...(p.settings ?? {}) },
    levels: p.levels.length ? p.levels : base.levels,
    walls: p.walls,
    openings: p.openings ?? [],
    rooms: p.rooms ?? [],
    items: p.items ?? [],
    roofs: p.roofs ?? [],
    dimensions: p.dimensions ?? [],
    labels: p.labels ?? [],
  };
}
