// All lengths are stored in centimetres. Plan coordinates: +x right, +y down (towards the viewer).
// In 3D, plan x -> world x, plan y -> world z, world y is up, and 1 world unit = 1 metre.

export interface Vec2 {
  x: number;
  y: number;
}

/** A material reference: either an id from the material library or a CSS hex colour ("#rrggbb"). */
export type MaterialRef = string;

export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';

export interface Level {
  id: string;
  name: string;
  /** Height of the finished floor above ground. */
  elevation: number;
  /** Floor-to-ceiling height; default height for new walls. */
  height: number;
  /** Thickness of the floor slab drawn under rooms. */
  floorThickness: number;
}

export interface Wall {
  id: string;
  levelId: string;
  a: Vec2;
  b: Vec2;
  thickness: number;
  /** Height at point a. */
  height: number;
  /** Optional height at point b, for sloped walls (e.g. under a slanted roof). */
  heightEnd?: number;
  /** Finish on the left side, looking from a to b. */
  leftMaterial: MaterialRef;
  /** Finish on the right side, looking from a to b. */
  rightMaterial: MaterialRef;
}

export type OpeningKind =
  | 'door'
  | 'doubleDoor'
  | 'slidingDoor'
  | 'pocketDoor'
  | 'garageDoor'
  | 'archway'
  | 'window'
  | 'doubleWindow'
  | 'fixedWindow'
  | 'tallWindow';

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  /** Distance from wall point a to the centre of the opening. */
  offset: number;
  width: number;
  height: number;
  /** Height of the bottom of the opening above the floor. */
  sill: number;
  /** Doors: hinge at the b-side end instead of the a-side end. */
  flipHinge: boolean;
  /** Doors: swing to the right side of the wall instead of the left. */
  flipSide: boolean;
  frameColor: MaterialRef;
  panelColor: MaterialRef;
}

export interface Room {
  id: string;
  levelId: string;
  name: string;
  points: Vec2[];
  floorMaterial: MaterialRef;
  ceilingMaterial: MaterialRef;
  showCeiling: boolean;
}

export interface Item {
  id: string;
  levelId: string;
  /** Catalog kind; decides the procedural 3D model and plan symbol. */
  kind: string;
  name: string;
  /** Centre of the footprint. */
  x: number;
  y: number;
  /** Height of the bottom of the object above the floor. */
  elevation: number;
  /** Rotation in degrees, clockwise in plan view. */
  rotation: number;
  width: number;
  depth: number;
  height: number;
  /** Main body finish. */
  finish: MaterialRef;
  /** Secondary finish: worktop, frame, handles, cushions… depending on kind. */
  accent: MaterialRef;
  mirrored?: boolean;
  locked?: boolean;
  /** Tilt in degrees around the object's width axis (e.g. roof windows following the roof slope). */
  tilt?: number;
  /** Cabinet fronts: flat slab doors (default) or shaker frame-and-panel with knobs and cup pulls. */
  frontStyle?: 'flat' | 'shaker';
  /** Metal for handles, knobs and taps on cabinets and fixtures (default stainless steel). */
  hardware?: MaterialRef;
}

export type RoofType = 'flat' | 'shed' | 'gable' | 'hip' | 'gambrel' | 'mansard';

export interface Roof {
  id: string;
  levelId: string;
  type: RoofType;
  /** Centre of the footprint (outer wall line, overhang excluded). */
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: number;
  /** Roof slope in degrees. */
  pitch: number;
  overhang: number;
  /** Height of the eave line (at the footprint edge) above the level floor. */
  baseHeight: number;
  thickness: number;
  /** Ridge runs along the width (x) axis, or along the depth (y) axis. */
  ridgeAlong: 'width' | 'depth';
  material: MaterialRef;
  /** Build gable / side infill walls from the eave up to the roof. */
  gableWalls: boolean;
  gableMaterial: MaterialRef;
  /** Fascia / barge boards along the roof edges, and the soffit underneath. */
  fasciaMaterial?: MaterialRef;
}

export interface Dimension {
  id: string;
  levelId: string;
  a: Vec2;
  b: Vec2;
  /** Perpendicular offset of the dimension line from the measured points. */
  offset: number;
}

export interface Label {
  id: string;
  levelId: string;
  x: number;
  y: number;
  text: string;
  size: number;
}

export interface ProjectSettings {
  unit: LengthUnit;
  gridSize: number;
  defaultWallThickness: number;
  defaultWallHeight: number;
  showGround: boolean;
  groundMaterial: MaterialRef;
  /** Height of the terrain above the zero level (negative = lower). */
  groundLevel?: number;
}

export interface Project {
  version: 1;
  name: string;
  settings: ProjectSettings;
  levels: Level[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  items: Item[];
  roofs: Roof[];
  dimensions: Dimension[];
  labels: Label[];
}

export type EntityType = 'wall' | 'opening' | 'room' | 'item' | 'roof' | 'dimension' | 'label' | 'level';

export interface SelectionRef {
  type: EntityType;
  id: string;
}
