import type { MaterialRef, OpeningKind } from './types';

export type CatalogCategory =
  | 'Kitchen'
  | 'Bathroom'
  | 'Living'
  | 'Dining'
  | 'Bedroom'
  | 'Office'
  | 'Lighting'
  | 'Structure'
  | 'Exterior';

export interface CatalogItem {
  kind: string;
  name: string;
  category: CatalogCategory;
  width: number;
  depth: number;
  height: number;
  elevation?: number;
  finish: MaterialRef;
  accent: MaterialRef;
  /** Snap the back of this item against walls when dragged near one. */
  wallSnap?: boolean;
  tags?: string;
}

export const CATALOG: CatalogItem[] = [
  // Kitchen — standard 60 cm deep base units, 90 cm worktop height
  { kind: 'baseCabinet', name: 'Base cabinet', category: 'Kitchen', width: 60, depth: 60, height: 90, finish: 'white-matte', accent: 'oak', wallSnap: true },
  { kind: 'drawerCabinet', name: 'Drawer cabinet', category: 'Kitchen', width: 60, depth: 60, height: 90, finish: 'white-matte', accent: 'oak', wallSnap: true },
  { kind: 'sinkCabinet', name: 'Sink cabinet', category: 'Kitchen', width: 80, depth: 60, height: 90, finish: 'white-matte', accent: 'oak', wallSnap: true },
  { kind: 'cooktopCabinet', name: 'Cooktop cabinet', category: 'Kitchen', width: 80, depth: 60, height: 90, finish: 'white-matte', accent: 'oak', wallSnap: true },
  { kind: 'cornerCabinet', name: 'Corner cabinet', category: 'Kitchen', width: 100, depth: 60, height: 90, finish: 'white-matte', accent: 'oak', wallSnap: true },
  { kind: 'dishwasher', name: 'Dishwasher (integrated)', category: 'Kitchen', width: 60, depth: 60, height: 90, finish: 'white-matte', accent: 'oak', wallSnap: true },
  { kind: 'wallCabinet', name: 'Wall cabinet', category: 'Kitchen', width: 60, depth: 35, height: 70, elevation: 145, finish: 'white-matte', accent: 'steel', wallSnap: true },
  { kind: 'openShelf', name: 'Open shelf', category: 'Kitchen', width: 80, depth: 25, height: 4, elevation: 150, finish: 'oak', accent: 'black-metal', wallSnap: true },
  { kind: 'tallCabinet', name: 'Tall pantry cabinet', category: 'Kitchen', width: 60, depth: 60, height: 215, finish: 'white-matte', accent: 'steel', wallSnap: true },
  { kind: 'ovenTower', name: 'Oven tower', category: 'Kitchen', width: 60, depth: 60, height: 215, finish: 'white-matte', accent: 'black-glass', wallSnap: true },
  { kind: 'fridge', name: 'Fridge-freezer', category: 'Kitchen', width: 60, depth: 65, height: 200, finish: 'steel', accent: 'steel', wallSnap: true },
  { kind: 'range', name: 'Freestanding range', category: 'Kitchen', width: 90, depth: 60, height: 90, finish: 'steel', accent: 'black-glass', wallSnap: true },
  { kind: 'rangeHood', name: 'Chimney hood', category: 'Kitchen', width: 90, depth: 50, height: 90, elevation: 155, finish: 'steel', accent: 'steel', wallSnap: true },
  { kind: 'island', name: 'Kitchen island', category: 'Kitchen', width: 200, depth: 100, height: 92, finish: 'navy-front', accent: 'marble' },
  { kind: 'countertop', name: 'Worktop', category: 'Kitchen', width: 120, depth: 62, height: 4, elevation: 86, finish: 'oak', accent: 'oak', wallSnap: true },
  { kind: 'wallPanel', name: 'Backsplash / wall panel', category: 'Kitchen', width: 120, depth: 1, height: 60, elevation: 90, finish: 'subway-white', accent: 'subway-white', wallSnap: true, tags: 'tiles splashback' },
  { kind: 'barStool', name: 'Bar stool', category: 'Kitchen', width: 40, depth: 40, height: 75, finish: 'oak', accent: 'black-metal' },

  // Bathroom
  { kind: 'toilet', name: 'Toilet', category: 'Bathroom', width: 38, depth: 68, height: 78, finish: 'ceramic-white', accent: 'chrome', wallSnap: true, tags: 'wc' },
  { kind: 'wallToilet', name: 'Wall-hung toilet', category: 'Bathroom', width: 36, depth: 54, height: 40, elevation: 0, finish: 'ceramic-white', accent: 'chrome', wallSnap: true, tags: 'wc' },
  { kind: 'vanity', name: 'Vanity with basin', category: 'Bathroom', width: 80, depth: 46, height: 85, finish: 'oak', accent: 'ceramic-white', wallSnap: true, tags: 'sink washbasin' },
  { kind: 'doubleVanity', name: 'Double vanity', category: 'Bathroom', width: 140, depth: 48, height: 85, finish: 'white-matte', accent: 'ceramic-white', wallSnap: true, tags: 'sink washbasin' },
  { kind: 'pedestalSink', name: 'Pedestal basin', category: 'Bathroom', width: 55, depth: 45, height: 85, finish: 'ceramic-white', accent: 'chrome', wallSnap: true, tags: 'sink washbasin' },
  { kind: 'bathtub', name: 'Built-in bathtub', category: 'Bathroom', width: 170, depth: 75, height: 56, finish: 'ceramic-white', accent: 'chrome', wallSnap: true, tags: 'bath' },
  { kind: 'freestandingTub', name: 'Freestanding bathtub', category: 'Bathroom', width: 170, depth: 80, height: 60, finish: 'ceramic-white', accent: 'brass', tags: 'bath' },
  { kind: 'shower', name: 'Shower enclosure', category: 'Bathroom', width: 90, depth: 90, height: 200, finish: 'ceramic-white', accent: 'glass', wallSnap: true },
  { kind: 'walkInShower', name: 'Walk-in shower screen', category: 'Bathroom', width: 120, depth: 90, height: 200, finish: 'tile-60-light', accent: 'glass', wallSnap: true },
  { kind: 'mirror', name: 'Mirror', category: 'Bathroom', width: 70, depth: 3, height: 90, elevation: 105, finish: 'mirror', accent: 'black-metal', wallSnap: true },
  { kind: 'mirrorCabinet', name: 'Mirror cabinet', category: 'Bathroom', width: 80, depth: 15, height: 70, elevation: 120, finish: 'white-matte', accent: 'mirror', wallSnap: true },
  { kind: 'towelRadiator', name: 'Towel radiator', category: 'Bathroom', width: 50, depth: 10, height: 120, elevation: 20, finish: 'chrome', accent: 'chrome', wallSnap: true },
  { kind: 'washingMachine', name: 'Washing machine', category: 'Bathroom', width: 60, depth: 60, height: 85, finish: 'white-gloss', accent: 'chrome', wallSnap: true, tags: 'laundry dryer' },

  // Living
  { kind: 'sofa', name: 'Sofa, 3-seat', category: 'Living', width: 220, depth: 95, height: 82, finish: 'fabric-grey', accent: 'oak' },
  { kind: 'armchair', name: 'Armchair', category: 'Living', width: 85, depth: 85, height: 80, finish: 'fabric-green', accent: 'oak' },
  { kind: 'coffeeTable', name: 'Coffee table', category: 'Living', width: 120, depth: 60, height: 42, finish: 'oak', accent: 'black-metal' },
  { kind: 'tvUnit', name: 'TV bench', category: 'Living', width: 180, depth: 42, height: 50, finish: 'walnut', accent: 'black-metal', wallSnap: true },
  { kind: 'tv', name: 'TV 65"', category: 'Living', width: 145, depth: 6, height: 84, elevation: 90, finish: 'black-glass', accent: 'black-metal', wallSnap: true },
  { kind: 'bookshelf', name: 'Bookshelf', category: 'Living', width: 100, depth: 35, height: 200, finish: 'oak', accent: 'oak', wallSnap: true },
  { kind: 'rug', name: 'Rug', category: 'Living', width: 240, depth: 170, height: 1, finish: 'fabric-beige', accent: 'fabric-beige' },
  { kind: 'plant', name: 'Potted plant', category: 'Living', width: 45, depth: 45, height: 120, finish: 'ceramic-white', accent: 'plant-green' },
  { kind: 'fireplace', name: 'Fireplace', category: 'Living', width: 120, depth: 45, height: 110, finish: 'render-white', accent: 'black-metal', wallSnap: true },

  // Dining
  { kind: 'diningTable', name: 'Dining table', category: 'Dining', width: 180, depth: 90, height: 75, finish: 'oak', accent: 'oak' },
  { kind: 'roundTable', name: 'Round table', category: 'Dining', width: 110, depth: 110, height: 75, finish: 'white-matte', accent: 'oak' },
  { kind: 'chair', name: 'Chair', category: 'Dining', width: 45, depth: 50, height: 82, finish: 'oak', accent: 'fabric-beige' },

  // Bedroom
  { kind: 'bed', name: 'Double bed', category: 'Bedroom', width: 160, depth: 210, height: 100, finish: 'fabric-beige', accent: 'white-matte', wallSnap: true },
  { kind: 'singleBed', name: 'Single bed', category: 'Bedroom', width: 90, depth: 205, height: 90, finish: 'oak', accent: 'white-matte', wallSnap: true },
  { kind: 'nightstand', name: 'Nightstand', category: 'Bedroom', width: 45, depth: 40, height: 50, finish: 'oak', accent: 'brass', wallSnap: true },
  { kind: 'wardrobe', name: 'Wardrobe', category: 'Bedroom', width: 150, depth: 60, height: 220, finish: 'white-matte', accent: 'black-metal', wallSnap: true, tags: 'closet' },
  { kind: 'dresser', name: 'Chest of drawers', category: 'Bedroom', width: 100, depth: 48, height: 80, finish: 'walnut', accent: 'brass', wallSnap: true },

  // Office
  { kind: 'desk', name: 'Desk', category: 'Office', width: 140, depth: 70, height: 74, finish: 'birch', accent: 'black-metal', wallSnap: true },
  { kind: 'officeChair', name: 'Office chair', category: 'Office', width: 60, depth: 60, height: 110, finish: 'fabric-grey', accent: 'black-metal' },

  // Lighting
  { kind: 'pendantLamp', name: 'Pendant lamp', category: 'Lighting', width: 40, depth: 40, height: 80, elevation: 170, finish: 'black-metal', accent: 'light-panel' },
  { kind: 'ceilingLight', name: 'Ceiling light', category: 'Lighting', width: 40, depth: 40, height: 8, elevation: 242, finish: 'white-matte', accent: 'light-panel' },
  { kind: 'floorLamp', name: 'Floor lamp', category: 'Lighting', width: 40, depth: 40, height: 160, finish: 'black-metal', accent: 'fabric-beige' },
  { kind: 'wallLight', name: 'Wall light', category: 'Lighting', width: 20, depth: 12, height: 20, elevation: 180, finish: 'brass', accent: 'light-panel', wallSnap: true },

  // Structure
  { kind: 'stairs', name: 'Straight stairs', category: 'Structure', width: 90, depth: 300, height: 270, finish: 'oak', accent: 'black-metal', tags: 'staircase steps' },
  { kind: 'column', name: 'Column', category: 'Structure', width: 30, depth: 30, height: 250, finish: 'paint-white', accent: 'paint-white', tags: 'pillar post' },
  { kind: 'beam', name: 'Beam', category: 'Structure', width: 400, depth: 20, height: 25, elevation: 225, finish: 'oak', accent: 'oak' },
  { kind: 'box', name: 'Box (generic)', category: 'Structure', width: 100, depth: 100, height: 100, finish: 'paint-lightgrey', accent: 'paint-lightgrey', tags: 'cube block custom' },
  { kind: 'cylinder', name: 'Cylinder (generic)', category: 'Structure', width: 60, depth: 60, height: 100, finish: 'paint-lightgrey', accent: 'paint-lightgrey', tags: 'round custom' },
  { kind: 'slab', name: 'Floor slab / platform', category: 'Structure', width: 300, depth: 300, height: 20, finish: 'concrete', accent: 'concrete', tags: 'plinth foundation' },
  { kind: 'radiator', name: 'Radiator', category: 'Structure', width: 100, depth: 10, height: 60, elevation: 15, finish: 'paint-white', accent: 'paint-white', wallSnap: true },
  { kind: 'skylight', name: 'Roof window frame', category: 'Structure', width: 78, depth: 118, height: 10, elevation: 300, finish: 'black-metal', accent: 'glass', tags: 'velux' },

  // Exterior
  { kind: 'tree', name: 'Deciduous tree', category: 'Exterior', width: 400, depth: 400, height: 700, finish: 'walnut', accent: 'plant-green' },
  { kind: 'conifer', name: 'Conifer', category: 'Exterior', width: 250, depth: 250, height: 600, finish: 'walnut', accent: 'plant-green' },
  { kind: 'shrub', name: 'Shrub', category: 'Exterior', width: 120, depth: 120, height: 100, finish: 'plant-green', accent: 'plant-green' },
  { kind: 'hedge', name: 'Hedge', category: 'Exterior', width: 300, depth: 60, height: 150, finish: 'plant-green', accent: 'plant-green' },
  { kind: 'fence', name: 'Fence', category: 'Exterior', width: 300, depth: 5, height: 120, finish: 'cladding-white', accent: 'paint-white' },
  { kind: 'deck', name: 'Terrace deck', category: 'Exterior', width: 400, depth: 300, height: 15, finish: 'decking', accent: 'decking', tags: 'patio' },
  { kind: 'pergola', name: 'Pergola', category: 'Exterior', width: 400, depth: 300, height: 250, finish: 'cladding-larch', accent: 'cladding-larch' },
  { kind: 'sunLounger', name: 'Sun lounger', category: 'Exterior', width: 70, depth: 195, height: 35, finish: 'oak', accent: 'fabric-beige' },
  { kind: 'pool', name: 'Pool', category: 'Exterior', width: 800, depth: 400, height: 10, finish: 'tile-60-light', accent: 'water' },
  { kind: 'greenhouse', name: 'Greenhouse', category: 'Exterior', width: 300, depth: 250, height: 250, finish: 'black-metal', accent: 'glass', tags: 'drivhus glasshouse' },
  { kind: 'shed', name: 'Garden shed', category: 'Exterior', width: 300, depth: 250, height: 240, finish: 'cladding-yellow', accent: 'roof-shingles', tags: 'bod uthus outbuilding' },
  { kind: 'terrainPlatform', name: 'Terrain / lawn level', category: 'Exterior', width: 600, depth: 600, height: 100, finish: 'stone', accent: 'grass', tags: 'slope ground hill retaining terrace' },
  { kind: 'car', name: 'Car', category: 'Exterior', width: 190, depth: 460, height: 150, finish: '#3a5f8a', accent: 'black-glass' },
];

const byKind = new Map(CATALOG.map((c) => [c.kind, c]));
export const getCatalogItem = (kind: string) => byKind.get(kind);

export const CATEGORIES: CatalogCategory[] = ['Kitchen', 'Bathroom', 'Living', 'Dining', 'Bedroom', 'Office', 'Lighting', 'Structure', 'Exterior'];

export interface OpeningPreset {
  kind: OpeningKind;
  name: string;
  width: number;
  height: number;
  sill: number;
  isDoor: boolean;
}

export const OPENING_PRESETS: OpeningPreset[] = [
  { kind: 'door', name: 'Door', width: 90, height: 210, sill: 0, isDoor: true },
  { kind: 'doubleDoor', name: 'Double door', width: 150, height: 210, sill: 0, isDoor: true },
  { kind: 'slidingDoor', name: 'Sliding glass door', width: 240, height: 215, sill: 0, isDoor: true },
  { kind: 'pocketDoor', name: 'Pocket door', width: 80, height: 210, sill: 0, isDoor: true },
  { kind: 'garageDoor', name: 'Garage door', width: 250, height: 215, sill: 0, isDoor: true },
  { kind: 'archway', name: 'Opening / archway', width: 100, height: 210, sill: 0, isDoor: true },
  { kind: 'window', name: 'Window', width: 100, height: 120, sill: 90, isDoor: false },
  { kind: 'doubleWindow', name: 'Double casement window', width: 160, height: 130, sill: 85, isDoor: false },
  { kind: 'fixedWindow', name: 'Picture window', width: 200, height: 160, sill: 50, isDoor: false },
  { kind: 'tallWindow', name: 'Floor-to-ceiling window', width: 100, height: 230, sill: 0, isDoor: false },
];

export const getOpeningPreset = (kind: OpeningKind) => OPENING_PRESETS.find((o) => o.kind === kind)!;
export const isDoorKind = (kind: OpeningKind) => getOpeningPreset(kind).isDoor;
