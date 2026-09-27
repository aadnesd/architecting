import { createDimension, createEmptyProject, createItem, createOpening, createRoof, createRoom, wallLoop, createWall } from './factory';
import type { Item, Project, Vec2 } from './types';

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Place an item with its left edge at x0 (for rotation 0, i.e. back against a wall on the top). */
function run(levelId: string, y: number, x0: number, specs: [string, number?, Partial<Item>?][]) {
  const out: Item[] = [];
  let x = x0;
  for (const [kind, width, extra] of specs) {
    const it = createItem(levelId, kind, 0, 0, extra);
    if (width) it.width = width;
    it.x = x + it.width / 2;
    it.y = y + it.depth / 2;
    x += it.width;
    out.push(it);
  }
  return out;
}

export function kitchenTemplate(): Project {
  const p = createEmptyProject('Kitchen');
  const L = p.levels[0].id;
  const t = 15;
  const h = t / 2;
  const walls = wallLoop(L, rect(0, 0, 440, 380), { thickness: t, leftMaterial: 'render-white', rightMaterial: 'paint-offwhite' });
  p.walls = walls;
  const [top, right, bottom, left] = walls;
  p.openings = [
    createOpening(top.id, 'window', 227.5, { width: 100, height: 110, sill: 105 }),
    createOpening(bottom.id, 'door', 80, { flipSide: true }),
    createOpening(left.id, 'doubleWindow', 190, { sill: 90 }),
  ];
  void right;
  p.rooms = [createRoom(L, rect(h, h, 440 - h, 380 - h), { name: 'Kitchen', floorMaterial: 'herringbone-oak' })];
  const y = h;
  p.items = [
    ...run(L, y, h, [['fridge'], ['ovenTower'], ['drawerCabinet'], ['sinkCabinet', 80], ['dishwasher'], ['cooktopCabinet', 80], ['baseCabinet', 25]]),
    ...run(L, y, h + 120, [['wallCabinet']]),
    ...run(L, y, h + 280, [['wallCabinet', 40]]),
    ...run(L, y, h + 400, [['wallCabinet', 25]]),
    createItem(L, 'rangeHood', h + 360, h + 25, { width: 80 }),
    createItem(L, 'wallPanel', h + 145, h + 0.5, { width: 50, height: 55 }),
    createItem(L, 'wallPanel', h + 347.5, h + 0.5, { width: 155, height: 55 }),
    createItem(L, 'island', 250, 235, { width: 220, depth: 100 }),
    createItem(L, 'barStool', 190, 305),
    createItem(L, 'barStool', 250, 305),
    createItem(L, 'barStool', 310, 305),
    createItem(L, 'pendantLamp', 200, 235, { elevation: 160 }),
    createItem(L, 'pendantLamp', 300, 235, { elevation: 160 }),
    createItem(L, 'plant', 45, 335),
  ];
  p.dimensions = [createDimension(L, { x: -h, y: -h }, { x: 440 + h, y: -h }, 40), createDimension(L, { x: -h, y: -h }, { x: -h, y: 380 + h }, -40)];
  p.settings.showGround = false;
  return p;
}

export function bathroomTemplate(): Project {
  const p = createEmptyProject('Bathroom');
  const L = p.levels[0].id;
  const t = 15;
  const h = t / 2;
  const walls = wallLoop(L, rect(0, 0, 300, 260), { thickness: t, leftMaterial: 'render-white', rightMaterial: 'wall-tile-large' });
  p.walls = walls;
  const [top, right, bottom] = walls;
  p.openings = [createOpening(bottom.id, 'door', 190, { width: 80, flipSide: true }), createOpening(right.id, 'window', 70, { width: 60, height: 80, sill: 140 })];
  void top;
  p.rooms = [createRoom(L, rect(h, h, 300 - h, 260 - h), { name: 'Bathroom', floorMaterial: 'hex-tile' })];
  const tub = createItem(L, 'bathtub', h + 85, h + 37.5);
  const vanity = createItem(L, 'vanity', h + 170 + 55, h + 23, { width: 90 });
  const mirror = createItem(L, 'mirror', vanity.x, h + 1.5, { width: 70 });
  const toilet = createItem(L, 'wallToilet', h + 27, 175, { rotation: 270 });
  const shower = createItem(L, 'walkInShower', 300 - h - 60, 260 - h - 45, { width: 100, depth: 90, rotation: 180 });
  const radiator = createItem(L, 'towelRadiator', 300 - h - 5, 70, { rotation: 270 });
  const light = createItem(L, 'ceilingLight', 150, 130);
  p.items = [tub, vanity, mirror, toilet, shower, radiator, light];
  // Put the radiator on the wall below the window instead of on top of it.
  radiator.y = 120;
  p.dimensions = [createDimension(L, { x: -h, y: -h }, { x: 300 + h, y: -h }, 40), createDimension(L, { x: 300 + h, y: -h }, { x: 300 + h, y: 260 + h }, 40)];
  p.settings.showGround = false;
  return p;
}

export function houseTemplate(): Project {
  const p = createEmptyProject('Family house');
  const L = p.levels[0].id;
  const t = 25;
  const h = t / 2;
  const it = 12;
  const outer = wallLoop(L, rect(0, 0, 1000, 800), { thickness: t, leftMaterial: 'cladding-red', rightMaterial: 'paint-offwhite' });
  const [top, right, bottom, left] = outer;
  const w1 = createWall(L, { x: 600, y: 0 }, { x: 600, y: 800 }, { thickness: it });
  const w2 = createWall(L, { x: 600, y: 420 }, { x: 1000, y: 420 }, { thickness: it, leftMaterial: 'wall-tile-large' });
  p.walls = [...outer, w1, w2];
  void right;
  p.openings = [
    createOpening(bottom.id, 'door', 700, { width: 100, panelColor: 'paint-charcoal', frameColor: 'paint-white', flipSide: true }),
    createOpening(bottom.id, 'doubleWindow', 900),
    createOpening(bottom.id, 'doubleWindow', 200),
    createOpening(top.id, 'window', 292.5, { sill: 105 }),
    createOpening(top.id, 'window', 800, { width: 70, height: 80, sill: 140 }),
    createOpening(left.id, 'slidingDoor', 420),
    createOpening(right.id, 'window', 610),
    createOpening(w1.id, 'door', 620, { flipSide: true }),
    createOpening(w1.id, 'door', 300, { width: 80, flipSide: true }),
  ];
  p.rooms = [
    createRoom(L, rect(h, h, 600 - it / 2, 800 - h), { name: 'Living & kitchen', floorMaterial: 'oak-planks' }),
    createRoom(L, rect(600 + it / 2, h, 1000 - h, 420 - it / 2), { name: 'Bathroom', floorMaterial: 'tile-60-dark' }),
    createRoom(L, rect(600 + it / 2, 420 + it / 2, 1000 - h, 800 - h), { name: 'Bedroom', floorMaterial: 'light-oak-planks' }),
    createRoom(L, rect(-330, 250, -h, 600), { name: 'Terrace', floorMaterial: 'decking', showCeiling: false }),
  ];
  p.items = [
    ...run(L, h, h + 60, [['fridge'], ['tallCabinet'], ['drawerCabinet'], ['sinkCabinet', 80], ['dishwasher'], ['cooktopCabinet', 80], ['baseCabinet']]),
    createItem(L, 'rangeHood', 432.5, h + 25, { width: 80 }),
    createItem(L, 'diningTable', 300, 330),
    createItem(L, 'chair', 240, 275),
    createItem(L, 'chair', 360, 275),
    createItem(L, 'chair', 240, 385, { rotation: 180 }),
    createItem(L, 'chair', 360, 385, { rotation: 180 }),
    createItem(L, 'pendantLamp', 300, 330, { elevation: 165 }),
    createItem(L, 'sofa', 300, 640, { rotation: 180 }),
    createItem(L, 'coffeeTable', 300, 545),
    createItem(L, 'rug', 300, 560),
    createItem(L, 'plant', 540, 740),
    createItem(L, 'bed', 800, 800 - h - 105, { rotation: 180 }),
    createItem(L, 'nightstand', 800 - 105, 800 - h - 20, { rotation: 180 }),
    createItem(L, 'nightstand', 800 + 105, 800 - h - 20, { rotation: 180 }),
    createItem(L, 'wardrobe', 1000 - h - 30, 530, { rotation: 270, width: 180 }),
    createItem(L, 'freestandingTub', 800, 300),
    createItem(L, 'doubleVanity', 800, h + 24),
    createItem(L, 'mirror', 800, h + 1.5, { width: 120, height: 80 }),
    createItem(L, 'wallToilet', 600 + it / 2 + 27, 120, { rotation: 270 }),
    createItem(L, 'shower', 1000 - h - 45, h + 45, { rotation: 0 }),
    createItem(L, 'tree', -350, -300),
    createItem(L, 'tree', 1300, 900, { width: 500, depth: 500, height: 800 }),
    createItem(L, 'conifer', 1250, -150),
    createItem(L, 'shrub', -100, 900),
    createItem(L, 'shrub', 1100, 300),
    createItem(L, 'hedge', 500, 1150, { width: 900 }),
    createItem(L, 'sunLounger', -250, 330, { rotation: 90 }),
    createItem(L, 'car', 1250, 450, { rotation: 0 }),
  ];
  p.roofs = [createRoof(L, 500, 400, 1000, 800, { type: 'gable', pitch: 30, overhang: 50, baseHeight: 250, material: 'roof-tiles-dark', gableMaterial: 'cladding-red' })];
  p.dimensions = [
    createDimension(L, { x: -h, y: 800 + h }, { x: 1000 + h, y: 800 + h }, -80),
    createDimension(L, { x: 1000 + h, y: -h }, { x: 1000 + h, y: 800 + h }, 80),
  ];
  return p;
}

import { mittHusTemplate } from './mittHus';

export const TEMPLATES = [
  { id: 'mitt-hus', name: 'Mitt hus (kjeller, 1. og 2. etasje)', build: mittHusTemplate },
  { id: 'empty', name: 'Empty project', build: () => createEmptyProject() },
  { id: 'kitchen', name: 'Kitchen with island', build: kitchenTemplate },
  { id: 'bathroom', name: 'Bathroom', build: bathroomTemplate },
  { id: 'house', name: 'House with gable roof', build: houseTemplate },
];
