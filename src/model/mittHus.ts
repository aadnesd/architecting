import { createEmptyProject, createItem, createLevel, createOpening, createRoof, createRoom, createWall } from './factory';
import type { Item, Opening, OpeningKind, Project, Vec2, Wall } from './types';

/**
 * "Mitt hus": a 1½-storey house with basement, traced from the owner's current
 * floor plans (1. etasje, 2. etasje, kjeller) and sized from the original 1947 drawings
 * (M 1:50): the main body is 8.50 m (east–west) × 7.50 m (north–south) with a 0.75 m stair bay.
 * The entrance/WC wing on the north-east is a later addition and not in the 1947 drawings.
 *
 * Coordinates below are written in "trace units" taken from the current plans (outer faces at
 * 0..890 × 0..790) and scaled to real centimetres by SX/SY when the project is built.
 * Origin at the outer north-west corner of the main body, x east, y south.
 * Exterior walls are 20 cm (centre lines 10 cm inside the outer faces), interior walls 10–12 cm.
 *
 * Exterior after the photos: yellow vertical cladding, white trim and windows with glazing bars,
 * black tiled 40° roof with white fascias, dark chimney and a roof window, a raised covered terrace
 * with its own small tiled roof, white plinth. The plot slopes: the north-west lawn is at the
 * zero level, the south and east lawn 1.5 m lower, where the basement door opens onto the garden.
 */

/** Trace units → real cm, from the 1947 drawings: 8.50 m × 7.50 m main body. */
const SX = 850 / 890;
const SY = 750 / 790;

/** Rise of the entrance-wing shed roof (25°) per cm. */
const WING_SLOPE = Math.tan((25 * Math.PI) / 180);

const EXT = 'cladding-yellow';
const INT = 'paint-white';
const BASE_EXT = 'render-white';
const KITCHEN_WALL = 'paint-linen';

type P = [number, number];
const pt = ([x, y]: P): Vec2 => ({ x, y });

/** Built-ins follow the building's scale along the wall; site elements in both directions. */
const ALONG_WALL = new Set(['baseCabinet', 'drawerCabinet', 'sinkCabinet', 'cooktopCabinet', 'dishwasher', 'wallCabinet']);
const BOTH_AXES = new Set(['slab', 'terrainPlatform', 'beam', 'hedge', 'fence', 'stairs']);

function scaleItem(it: Item): Item {
  it.x *= SX;
  it.y *= SY;
  const sideways = Math.round(it.rotation / 90) % 2 === 1;
  const [fw, fd] = sideways ? [SY, SX] : [SX, SY];
  if (ALONG_WALL.has(it.kind) || BOTH_AXES.has(it.kind)) it.width *= fw;
  if (BOTH_AXES.has(it.kind)) it.depth *= fd;
  return it;
}

export function mittHusTemplate(): Project {
  const p = createEmptyProject('Mitt hus');
  const kjeller = createLevel({ name: 'Kjeller', elevation: -190, height: 230, floorThickness: 20 });
  const et1 = createLevel({ name: '1. etasje', elevation: 60, height: 240, floorThickness: 20 });
  const et2 = createLevel({ name: '2. etasje', elevation: 320, height: 240, floorThickness: 20 });
  p.levels = [kjeller, et1, et2];

  const walls: Wall[] = [];
  const openings: Opening[] = [];
  const items: Item[] = [];

  const S = ([x, y]: P): Vec2 => ({ x: x * SX, y: y * SY });
  /** Ratio real/trace length for each wall, to scale opening offsets along it. */
  const wallScale = new Map<string, number>();
  const wall = (levelId: string, a: P, b: P, o: Partial<Wall> = {}) => {
    const w = createWall(levelId, S(a), S(b), { thickness: 10, height: 240, leftMaterial: INT, rightMaterial: INT, ...o });
    wallScale.set(w.id, Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) / Math.hypot(b[0] - a[0], b[1] - a[1]));
    walls.push(w);
    return w;
  };
  /** Exterior wall: segments are listed clockwise, so the outside is on the left. */
  const ext = (levelId: string, a: P, b: P, o: Partial<Wall> = {}) => wall(levelId, a, b, { thickness: 20, leftMaterial: EXT, rightMaterial: INT, ...o });
  const open = (w: Wall, kind: OpeningKind, offset: number, o: Partial<Opening> = {}) => openings.push(createOpening(w.id, kind, offset * (wallScale.get(w.id) ?? 1), o));
  const item = (levelId: string, kind: string, x: number, y: number, o: Partial<Item> = {}) => {
    const it = scaleItem(createItem(levelId, kind, x, y, o));
    items.push(it);
    return it;
  };

  // ───────────────────────── Kjeller (basement) ─────────────────────────
  {
    const L = kjeller.id;
    const o = { height: 230, leftMaterial: BASE_EXT };
    const west = ext(L, [10, 780], [10, 10], o);
    const north = ext(L, [10, 10], [586, 10], o);
    ext(L, [586, 10], [586, -250], o);
    ext(L, [586, -250], [880, -250], o);
    const east = ext(L, [880, -250], [880, 780], o);
    const south = ext(L, [880, 780], [10, 780], o);
    const i = { height: 230 };
    const mid = wall(L, [10, 338], [880, 338], i);
    const bodWall = wall(L, [288, 10], [288, 780], i);
    const gangWall = wall(L, [586, 10], [586, 338], i);
    const wingBod = wall(L, [586, -54], [880, -54], i);

    open(north, 'window', 424, { width: 90, height: 40, sill: 190 });
    open(west, 'window', 368, { width: 90, height: 40, sill: 190 });
    open(south, 'window', 439, { width: 90, height: 50, sill: 170 });
    open(east, 'window', 793, { width: 80, height: 50, sill: 170 });
    open(east, 'door', 435, { width: 80, height: 190, sill: 40, panelColor: 'paint-lightgrey' });
    open(mid, 'door', 501, { width: 80, flipSide: true });
    open(bodWall, 'door', 170, { width: 80, flipSide: true });
    open(bodWall, 'door', 538, { width: 80, flipSide: true });
    open(gangWall, 'door', 215, { width: 80, flipSide: true });
    open(wingBod, 'door', 78, { width: 80, flipSide: true });

    const room = (name: string, pts: P[], floor = 'concrete') => p.rooms.push(createRoom(L, pts.map(pt), { name, floorMaterial: floor }));
    room('Bod', [[20, 20], [283, 20], [283, 333], [20, 333]]);
    room('Vaskerom', [[293, 20], [581, 20], [581, 333], [293, 333]], 'tile-30-sand');
    room('Gang', [[591, -49], [870, -49], [870, 333], [591, 333]], 'tile-60-dark');
    room('Bod', [[596, -240], [870, -240], [870, -59], [596, -59]]);
    room('Bod', [[20, 343], [283, 343], [283, 770], [20, 770]]);
    room('Innredet rom', [[293, 343], [870, 343], [870, 770], [293, 770]], 'carpet-grey');

    item(L, 'column', 390, 360, { name: 'Pipe', width: 60, depth: 38, height: 230, finish: 'brick-dark' });
    item(L, 'stairs', 815, 142, { name: 'Trapp til 1. etasje', width: 105, depth: 380, height: 250 });
    item(L, 'sofa', 830, 588, { name: 'Hjørnesofa (del 1)', rotation: 90, width: 177, depth: 80 });
    item(L, 'sofa', 772, 730, { name: 'Hjørnesofa (del 2)', rotation: 180, width: 195, depth: 80 });
    item(L, 'coffeeTable', 724, 594, { rotation: 90, width: 75, depth: 50 });
  }

  // ───────────────────────── 1. etasje (main floor) ─────────────────────────
  {
    const L = et1.id;
    const west = ext(L, [10, 779], [10, 10], { rightMaterial: KITCHEN_WALL });
    const north = ext(L, [10, 10], [583, 10], { rightMaterial: KITCHEN_WALL });
    // The entrance wing has a 25° lean-to roof rising from its north wall towards the main house.
    const wingH = (y: number) => Math.round(240 + (y + 259) * SY * WING_SLOPE);
    const wingWest = ext(L, [583, 10], [583, -249], { height: wingH(10), heightEnd: wingH(-249) });
    const wingNorth = ext(L, [583, -249], [880, -249]);
    const east = ext(L, [880, -249], [880, 0], { height: wingH(-249), heightEnd: wingH(0) });
    ext(L, [880, 0], [880, 779]);
    const south = ext(L, [880, 779], [10, 779]);

    const kitchenGang = wall(L, [583, 10], [583, 337], { thickness: 12, rightMaterial: KITCHEN_WALL });
    const wcWall = wall(L, [758, -249], [758, -48]);
    wall(L, [758, -48], [880, -48], { leftMaterial: 'wall-tile-20' });
    wall(L, [758, -48], [758, 58]);
    const underStairs = wall(L, [758, 170], [758, 337]);
    wall(L, [300, 337], [880, 337], { thickness: 12, leftMaterial: KITCHEN_WALL });

    open(north, 'window', 432, { width: 90, height: 110, sill: 105 });
    open(west, 'doubleWindow', 611, { width: 150, height: 130, sill: 80 });
    open(west, 'door', 165, { width: 90, panelColor: 'white-matte' });
    open(south, 'window', 799, { width: 90, height: 130, sill: 70 });
    open(south, 'window', 704, { width: 55, height: 130, sill: 70 });
    open(south, 'fixedWindow', 237, { width: 200, height: 160, sill: 50 });
    open(wingWest, 'door', 161, { width: 90, panelColor: 'paint-charcoal' });
    open(wingNorth, 'window', 88, { width: 55, height: 60, sill: 140 });
    open(east, 'window', 144, { width: 50, height: 60, sill: 140 });
    open(wcWall, 'door', 89, { width: 70, flipSide: true });
    open(kitchenGang, 'door', 161, { width: 80 });
    open(underStairs, 'door', 120, { width: 60, flipSide: true });

    const room = (name: string, pts: P[], floor: string) => p.rooms.push(createRoom(L, pts.map(pt), { name, floorMaterial: floor }));
    // The kitchen now runs west to the north-west window; one oak floor through kitchen and living room
    room('Kjøkken', [[20, 20], [577, 20], [577, 331], [20, 331]], 'oak-planks');
    room('Stue / spisestue', [[20, 331], [306, 331], [306, 343], [870, 343], [870, 769], [20, 769]], 'oak-planks');
    room('Entré / gang', [[589, -239], [752, -239], [752, 331], [589, 331]], 'tile-60-dark');
    room('WC', [[764, -239], [870, -239], [870, -54], [764, -54]], 'hex-tile');

    addKitchen(items, L);

    // Dining
    item(L, 'diningTable', 226, 652, { width: 186, depth: 80 });
    for (const cx of [165, 226, 289]) {
      item(L, 'chair', cx, 598);
      item(L, 'chair', cx, 706, { rotation: 180 });
    }
    item(L, 'pendantLamp', 226, 652, { elevation: 155 });
    // Living: corner sofa, coffee table, armchair, wood stove chimney
    item(L, 'sofa', 736, 385, { name: 'Hjørnesofa (del 1)', width: 270, depth: 80 });
    item(L, 'sofa', 831, 477, { name: 'Hjørnesofa (del 2)', rotation: 90, width: 110, depth: 80 });
    item(L, 'coffeeTable', 695, 491, { width: 77, depth: 50 });
    item(L, 'armchair', 604, 575, { rotation: 135 });
    item(L, 'column', 389, 362, { name: 'Pipe / peis', width: 58, depth: 42, height: 240, finish: 'brick-dark' });
    item(L, 'rug', 690, 520, { width: 240, depth: 170 });
    // WC
    item(L, 'toilet', 823, -88, { rotation: 180 });
    item(L, 'pedestalSink', 848, -190, { rotation: 90 });
    // Stairs up to 2. etasje
    item(L, 'stairs', 818, 145, { name: 'Trapp til 2. etasje', width: 105, depth: 384, height: 260 });

    // Lean-to roof over the single-storey entrance wing (the terrace is added in real cm below)
    p.roofs.push(
      createRoof(L, 731.5, -129.5, 317, 259, { type: 'shed', pitch: 25, baseHeight: 240, overhang: 30, thickness: 20, ridgeAlong: 'width', material: 'roof-tiles-dark', gableWalls: false }),
    );
    item(L, 'stairs', 528, -151, { name: 'Inngangstrapp', width: 120, depth: 90, height: 60, elevation: -60, rotation: 90, finish: 'concrete', accent: 'black-metal' });
    // White corner boards
    for (const [cx, cy, hh] of [
      [0, 0, 280],
      [0, 789, 280],
      [890, 789, 280],
      [890, -259, 258],
      [573, -259, 258],
    ])
      item(L, 'column', cx, cy, { name: 'Hjørnebord', width: 14, depth: 14, height: hh, elevation: -20, finish: 'paint-white', locked: true });
  }

  // ───────────────────────── 2. etasje (attic floor under a 40° gable roof) ─────────────────────────
  {
    const L = et2.id;
    // Roof: eaves 60 cm above this floor at the outer wall line, 40° pitch, ridge running east–west.
    const slope = Math.tan((40 * Math.PI) / 180);
    const h = (fromEdge: number) => Math.round(60 + fromEdge * SY * slope); // roof underside height (trace units in)
    const west1 = ext(L, [10, 779], [10, 395], { height: h(11), heightEnd: h(395) });
    const west2 = ext(L, [10, 395], [10, 10], { height: h(395), heightEnd: h(10) });
    ext(L, [10, 10], [585, 10], { height: h(10) });
    // Stair bay on the north-east, under the entrance wing's lean-to roof (floor1 +260 = this floor)
    const bay = (y: number) => Math.round(240 + (y + 259) * SY * WING_SLOPE - 260);
    ext(L, [585, 10], [585, -69], { height: bay(10), heightEnd: bay(-69) });
    ext(L, [585, -69], [880, -69], { height: bay(-69) });
    ext(L, [880, -69], [880, 60], { height: bay(-69), heightEnd: h(60) });
    const east1 = ext(L, [880, 60], [880, 395], { height: h(60), heightEnd: h(395) });
    const east2 = ext(L, [880, 395], [880, 779], { height: h(395), heightEnd: h(11) });
    ext(L, [880, 779], [10, 779], { height: h(11) });

    // Knee walls (kneloft storage behind them)
    wall(L, [10, 61], [736, 61], { height: h(61) });
    wall(L, [10, 733], [880, 733], { height: h(57) });
    // Kne-loft closet and stair wall
    const kneDoorWall = wall(L, [623, 61], [623, 224], { height: h(61), heightEnd: 240 });
    wall(L, [623, 224], [736, 224]);
    wall(L, [736, -69], [736, 65], { height: bay(-69), heightEnd: h(65) });
    wall(L, [736, 65], [736, 224], { height: h(65), heightEnd: 240 });
    // Bedrooms / bathroom
    const gangSouth = wall(L, [362, 338], [880, 338]);
    const stueSouth = wall(L, [10, 374], [362, 374]);
    wall(L, [366, 338], [366, 575], { leftMaterial: 'wall-tile-large' });
    wall(L, [366, 575], [366, 733], { height: 240, heightEnd: h(57), leftMaterial: 'wall-tile-large' });
    wall(L, [563, 338], [563, 575], { rightMaterial: 'wall-tile-large' });
    wall(L, [563, 575], [563, 733], { height: 240, heightEnd: h(57), rightMaterial: 'wall-tile-large' });

    // Offsets run from each wall's start point: west walls are drawn northwards.
    open(west2, 'window', 93, { width: 90, height: 110, sill: 90 }); // centre y ≈ 302
    open(west1, 'window', 332, { width: 90, height: 110, sill: 90 }); // centre y ≈ 447
    open(east1, 'window', 203, { width: 90, height: 110, sill: 90 });
    open(east2, 'window', 81, { width: 90, height: 110, sill: 90 });
    open(kneDoorWall, 'door', 80, { width: 60, height: 100, flipSide: true });
    open(gangSouth, 'door', 150, { width: 70 });
    open(gangSouth, 'door', 321, { width: 70, flipSide: true });
    open(stueSouth, 'door', 294, { width: 70, flipSide: true });

    // The roof slopes form the ceilings up here.
    const room = (name: string, pts: P[], floor: string) => p.rooms.push(createRoom(L, pts.map(pt), { name, floorMaterial: floor, showCeiling: false }));
    room('Stue / gang', [[20, 66], [618, 66], [618, 229], [731, 229], [731, 333], [357, 333], [357, 369], [20, 369]], 'light-oak-planks');
    room('Kne-loft', [[628, 66], [731, 66], [731, 219], [628, 219]], 'birch');
    room('Soverom', [[20, 379], [361, 379], [361, 728], [20, 728]], 'light-oak-planks');
    room('Bad', [[371, 343], [558, 343], [558, 728], [371, 728]], 'tile-60-dark');
    room('Soverom', [[568, 343], [870, 343], [870, 728], [568, 728]], 'light-oak-planks');

    item(L, 'column', 414, 353, { name: 'Pipe', width: 60, depth: 41, height: 470, finish: 'anthracite' });
    // Roof window in the bathroom, on the south slope (roof top ≈ 233 cm above this floor there)
    item(L, 'skylight', 437, 614, { name: 'Takvindu', width: 78, depth: 118, height: 8, elevation: 226, tilt: 40 });
    // Stue
    item(L, 'sofa', 143, 318, { rotation: 180, width: 221, depth: 70 });
    item(L, 'coffeeTable', 139, 229, { width: 122, depth: 62 });
    item(L, 'tvUnit', 141, 92, { width: 136, depth: 44 });
    item(L, 'tv', 141, 76, { width: 120, height: 70, elevation: 55 });
    // Soverom 1
    item(L, 'bed', 165, 626, { rotation: 180, width: 150, depth: 205, height: 90 });
    item(L, 'nightstand', 63, 700, { rotation: 180 });
    item(L, 'nightstand', 265, 700, { rotation: 180 });
    item(L, 'wardrobe', 333, 542, { rotation: 90, width: 90, depth: 55, height: 200 });
    // Bad
    item(L, 'shower', 419, 391, { width: 95, depth: 95, rotation: 0 });
    item(L, 'vanity', 394, 553, { rotation: 270, width: 60, depth: 45 });
    item(L, 'toilet', 524, 548, { rotation: 90 });
    item(L, 'bathtub', 466, 691, { rotation: 180, width: 170, depth: 75 });
    // Soverom 2
    item(L, 'bed', 668, 668, { rotation: 270, width: 120, depth: 200, height: 90 });
    item(L, 'nightstand', 590, 582, { rotation: 270 });
    item(L, 'wardrobe', 593, 402, { rotation: 270, width: 115, depth: 50, height: 200 });
    item(L, 'wardrobe', 808, 373, { width: 117, depth: 55, height: 200 });

    p.roofs.push(
      createRoof(L, 445, 395, 890, 790, { type: 'gable', pitch: 40, baseHeight: 60, overhang: 40, thickness: 25, ridgeAlong: 'width', material: 'roof-tiles-dark', gableWalls: false }),
    );
  }

  p.walls = walls;
  p.openings = openings;
  p.items = items;
  // Garden. Terrain is 1.5 m below the zero level; raised lawns form the higher north-west part.
  p.settings.groundLevel = -150;
  const G = et1.id; // garden items live on 1. etasje (elevation +60): upper lawn = -60, lower lawn = -210
  const up = -60;
  const low = -210;
  const g = (kind: string, x: number, y: number, o: Partial<Item> = {}) => p.items.push(scaleItem(createItem(G, kind, x, y, { locked: true, ...o })));
  const lawn = { finish: 'grass', accent: 'grass', elevation: low, height: 150, name: 'Plen (øvre)' };
  g('terrainPlatform', -402.5, -125.5, { ...lawn, width: 795, depth: 1349 });
  g('terrainPlatform', 279, -402.5, { ...lawn, width: 568, depth: 795 });
  g('terrainPlatform', 731.5, -534.5, { ...lawn, width: 337, depth: 531 });
  g('slab', -160, 225, { name: 'Belegningsstein', width: 310, depth: 440, height: 3, elevation: up, finish: 'paving' });
  // Outbuilding, greenhouse on a deck, hedges, picket fence along the streets, trees
  g('shed', -520, -560, { elevation: up, locked: false });
  g('deck', 950, 1200, { width: 420, depth: 320, height: 15, elevation: low, locked: false });
  g('greenhouse', 1010, 1200, { elevation: low + 15, locked: false });
  g('chair', 820, 1150, { elevation: low + 15, rotation: 90, finish: 'black-metal', accent: 'fabric-beige', locked: false });
  g('chair', 820, 1250, { elevation: low + 15, rotation: 90, finish: 'black-metal', accent: 'fabric-beige', locked: false });
  g('hedge', -780, -125, { width: 1350, depth: 70, height: 200, rotation: 90, elevation: up });
  g('hedge', 50, -780, { width: 1700, depth: 70, height: 200, elevation: up });
  g('hedge', -780, 1030, { width: 950, depth: 70, height: 200, rotation: 90, elevation: low });
  g('fence', 250, 1520, { width: 2100, height: 110, finish: 'cladding-white', accent: 'paint-white', elevation: low });
  g('fence', 1300, 360, { width: 2320, height: 110, rotation: 90, finish: 'cladding-white', accent: 'paint-white', elevation: low });
  g('conifer', -620, -620, { width: 400, depth: 400, height: 1400, elevation: up });
  g('conifer', 1150, -650, { width: 350, depth: 350, height: 1200, elevation: low });
  g('tree', -450, 1250, { width: 450, depth: 450, height: 550, elevation: low, name: 'Frukttre' });
  g('tree', 350, 1300, { width: 380, depth: 380, height: 480, elevation: low, name: 'Frukttre' });
  g('tree', 1150, 700, { width: 420, depth: 420, height: 520, elevation: low, name: 'Frukttre' });
  g('shrub', -420, 700, { width: 200, depth: 160, height: 180, elevation: low });
  g('shrub', 700, 1000, { width: 180, depth: 160, height: 160, elevation: low });
  g('shrub', 1050, 150, { width: 220, depth: 180, height: 180, elevation: low });
  // Rooms and roofs are written in trace units too.
  for (const r of p.rooms) r.points = r.points.map((q) => S([q.x, q.y]));
  for (const r of p.roofs) {
    r.x *= SX;
    r.y *= SY;
    r.width *= SX;
    r.depth *= SY;
  }
  addTerrace(p, et1.id);
  p.settings.defaultWallThickness = 10;
  return p;
}

/**
 * Kitchen after the owner's mood board: putty-painted shaker cabinets with brass knobs and cup pulls,
 * marble worktops, cream zellige, a cream range cooker under a painted mantel hood, a farmhouse sink
 * under the north window, and a window seat between a side cupboard and a coffee hutch at the
 * north-west window. Seen from the hall door, the ranges run west towards the window seat.
 * Positions are real cm, measured from the finished wall faces.
 */
function addKitchen(items: Item[], L: string) {
  const k: Partial<Item> = { finish: 'putty-front', accent: 'marble', frontStyle: 'shaker', hardware: 'brass' };
  const add = (kind: string, x: number, y: number, o: Partial<Item> = {}) => items.push(createItem(L, kind, x, y, { ...k, ...o }));
  const nFace = 10 * SY + 10; // inside of the north wall
  const wFace = 10 * SX + 10; // inside of the west wall
  const eFace = 583 * SX - 6; // kitchen side of the hall wall
  const sFace = 337 * SY - 6; // kitchen side of the wall towards the living room
  const sEnd = 300 * SX; // where that wall ends in the west
  const winN = 442 * SX; // centre of the north window (90 wide)
  const winW = (779 - 611) * SY; // centre of the north-west window (150 wide)

  // North run, west to east: blind corner, cupboard, farmhouse sink centred under the window, dishwasher, spice pull-out
  let x = winN - 40 - 60 - 60;
  const x0 = x;
  const north = (kind: string, w: number, o: Partial<Item> = {}) => {
    add(kind, x + w / 2, nFace + 30, { width: w, ...o });
    x += w;
  };
  north('cornerCabinet', 60, { name: 'Hjørneskap' });
  north('baseCabinet', 60);
  north('farmhouseSink', 80, { name: 'Oppvaskbenk (keramisk kum)' });
  north('dishwasher', 60, { name: 'Oppvaskmaskin (integrert)' });
  north('drawerCabinet', eFace - x, { name: 'Krydderuttrekk' });
  // Peninsula of drawers facing the working aisle, with painted end panels
  add('drawerCabinet', x0 + 30, nFace + 100, { name: 'Halvøy (skuffer)', width: 80, rotation: 270 });
  add('box', x0 - 1, nFace + 70, { name: 'Sidepanel', width: 2, depth: 140, height: 86 });
  add('box', x0 + 30, nFace + 141, { name: 'Endepanel', width: 62, depth: 2, height: 86 });
  // Zellige behind the north run, kept below the window
  const tile = { finish: 'zellige-cream', accent: 'zellige-cream', depth: 1.5, elevation: 90 };
  add('wallPanel', (x0 + winN - 45) / 2, nFace + 0.75, { ...tile, width: winN - 45 - x0, height: 60 });
  add('wallPanel', winN, nFace + 0.75, { ...tile, width: 90, height: 15 });
  add('wallPanel', (winN + 45 + eFace) / 2, nFace + 0.75, { ...tile, width: eFace - winN - 45, height: 60 });
  add('potRail', (winN + 45 + eFace) / 2, nFace + 6, { width: 70, depth: 12, height: 45, elevation: 152, finish: 'brass', accent: 'copper' });

  // South run, west to east: integrated fridge, oven tower, range cooker under the mantel hood, drawers
  x = sEnd;
  const south = (kind: string, w: number, d: number, o: Partial<Item> = {}) => {
    add(kind, x + w / 2, sFace - d / 2, { width: w, depth: d, rotation: 180, ...o });
    x += w;
  };
  south('tallCabinet', 60, 60, { name: 'Integrert kjøleskap', height: 230 });
  south('ovenTower', 60, 60, { name: 'Stekeovn / mikro', height: 230, accent: 'black-glass' });
  const rangeX = x + 50;
  south('classicRange', 100, 65, { finish: 'enamel-cream', accent: 'brass' });
  const drawersX = x;
  south('drawerCabinet', eFace - x, 60);
  add('mantelHood', rangeX, sFace - 27.5, { width: 100, depth: 55, height: 90, elevation: 150, rotation: 180, accent: 'anthracite' });
  add('wallCabinet', (drawersX + eFace) / 2, sFace - 17.5, { width: eFace - drawersX, depth: 35, height: 88, elevation: 145, rotation: 180 });
  add('wallPanel', (rangeX - 50 + eFace) / 2, sFace - 0.75, { ...tile, width: eFace - rangeX + 50, height: 60, rotation: 180 });

  // North-west window: coffee hutch in the corner, window seat under the window, side cupboard
  const hutchW = winW - 75 - nFace - 2;
  add('hutch', wFace + 27.5, nFace + hutchW / 2, { name: 'Kaffeskap', width: hutchW, depth: 55, height: 230, rotation: 270 });
  add('coffeeMachine', wFace + 22, nFace + hutchW / 2, { elevation: 90, rotation: 270, finish: 'steel', accent: 'black-metal', frontStyle: undefined });
  const seatA = nFace + hutchW;
  const seatW = 2 * (winW - seatA);
  add('windowSeat', wFace + 25, winW, { name: 'Vindusbenk', width: seatW, depth: 50, height: 50, rotation: 270, accent: 'fabric-beige' });
  add('baseCabinet', wFace + 25, seatA + seatW + 30, { name: 'Sideskap', width: 60, depth: 50, rotation: 270 });
  add('framedPicture', wFace + 1.5, seatA + seatW + 30, { width: 40, depth: 3, height: 52, elevation: 125, rotation: 270, finish: 'oak', accent: 'paint-offwhite', frontStyle: undefined });

  // Schoolhouse pendants over the aisle and the window seat
  const lamp = { finish: 'brass', accent: 'light-panel', frontStyle: undefined, hardware: undefined };
  add('schoolhousePendant', winN, (nFace + sFace) / 2, { ...lamp, height: 55, elevation: 185 });
  add('schoolhousePendant', wFace + 110, winW, { ...lamp, height: 65, elevation: 175 });
}

/**
 * Terrace as extended in 2000 ("Utvidelse av terrasse m/takoverbygg",
 * 1:100), in real cm: 6.95 m (1200 + 4250 + 1500) along the south, 5.85 m (1500 + 4350)
 * along the west, wrapping the south-west corner of the house. The roofed part stands on four
 * posts; under the deck is a white lattice skirting down to the lower garden.
 */
function addTerrace(p: Project, L: string) {
  const EXTM = 'cladding-yellow';
  p.rooms.push(
    createRoom(L, [[-354, 490], [0, 490], [0, 750], [339, 750], [339, 1104], [-354, 1104]].map((q) => pt(q as P)), {
      name: 'Overbygd terrasse',
      floorMaterial: 'decking',
      showCeiling: false,
    }),
  );
  const add = (kind: string, x: number, y: number, o: Partial<Item>) => p.items.push(createItem(L, kind, x, y, o));
  // Lattice skirting from the lower lawn (-150) up to the deck
  add('slab', -177, 797, { name: 'Terrasse (spileverk)', width: 354, depth: 614, height: 208, elevation: -210, finish: 'lattice-white', locked: true });
  add('slab', 169.5, 927, { name: 'Terrasse (spileverk)', width: 339, depth: 354, height: 208, elevation: -210, finish: 'lattice-white', locked: true });
  // Railing: yellow panel with a white cap; gaps for the two stairs
  const rail = { thickness: 8, height: 100, leftMaterial: EXTM, rightMaterial: EXTM };
  for (const [a, b] of [
    [[-5, 494], [-205, 494]],
    [[-284, 494], [-350, 494]],
    [[-350, 494], [-350, 1100]],
    [[-350, 1100], [335, 1100]],
    [[335, 1000], [335, 754]],
  ] as [P, P][]) {
    p.walls.push(createWall(L, pt(a), pt(b), rail));
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    add('beam', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { name: 'Rekkverk (topp)', width: len + 8, depth: 14, height: 5, elevation: 100, rotation: a[0] === b[0] ? 90 : 0, finish: 'paint-white', locked: true });
  }
  // Posts of the roofed part (the four marked posts in the 2000 plan)
  for (const [x, y] of [
    [-181, 506],
    [-181, 616],
    [-181, 939],
    [212, 939],
  ] as P[])
    add('column', x, y, { name: 'Stolpe', width: 14, depth: 14, height: 240, finish: 'paint-white' });
  const roof = { type: 'hip' as const, pitch: 25, baseHeight: 240, overhang: 30, thickness: 20, material: 'roof-tiles-dark', gableWalls: false };
  p.roofs.push(createRoof(L, -97.5, 722.5, 195, 455, roof), createRoof(L, 112.5, 850, 225, 200, roof));
  // Steps up from the upper lawn (north-west) and down to the lower garden (south-east)
  add('stairs', -244.5, 441.5, { name: 'Trapp til terrasse', width: 79, depth: 97, height: 60, elevation: -60, rotation: 180, finish: 'decking', accent: 'paint-white' });
  add('stairs', 489, 1045, { name: 'Trapp til hagen', width: 90, depth: 300, height: 210, elevation: -210, rotation: 270, finish: 'decking', accent: 'paint-white' });
}
