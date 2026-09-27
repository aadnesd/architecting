import type { MaterialRef } from './types';

export type TexturePattern =
  | 'none'
  | 'planks'
  | 'herringbone'
  | 'tiles'
  | 'subway'
  | 'brick'
  | 'marble'
  | 'noise'
  | 'grass'
  | 'roofTiles'
  | 'seam'
  | 'cladding'
  | 'verticalCladding'
  | 'lattice'
  | 'woodgrain'
  | 'terrazzo'
  | 'stone'
  | 'shingles'
  | 'hex';

export interface MaterialDef {
  id: string;
  name: string;
  group: 'Paint' | 'Floor' | 'Wall tiles' | 'Surfaces' | 'Metal & glass' | 'Exterior' | 'Roof';
  /** Base colour; also used for the plan view fill. */
  color: string;
  /** Secondary colour used by the procedural texture (grout, veins, grain…). */
  color2?: string;
  pattern: TexturePattern;
  /** Real-world size of one texture repeat, in cm. */
  size?: number;
  roughness: number;
  metalness?: number;
  opacity?: number;
  /** Emissive glow (light panels). */
  emissive?: string;
}

export const MATERIALS: MaterialDef[] = [
  // Paint
  { id: 'paint-white', name: 'White', group: 'Paint', color: '#f4f3ef', pattern: 'none', roughness: 0.9 },
  { id: 'paint-offwhite', name: 'Warm white', group: 'Paint', color: '#ece6da', pattern: 'none', roughness: 0.9 },
  { id: 'paint-lightgrey', name: 'Light grey', group: 'Paint', color: '#d6d6d3', pattern: 'none', roughness: 0.9 },
  { id: 'paint-greige', name: 'Greige', group: 'Paint', color: '#cbbfae', pattern: 'none', roughness: 0.9 },
  { id: 'paint-sage', name: 'Sage green', group: 'Paint', color: '#a9b59c', pattern: 'none', roughness: 0.9 },
  { id: 'paint-blue', name: 'Dusty blue', group: 'Paint', color: '#8fa3b5', pattern: 'none', roughness: 0.9 },
  { id: 'paint-navy', name: 'Navy', group: 'Paint', color: '#2e3b52', pattern: 'none', roughness: 0.9 },
  { id: 'paint-terracotta', name: 'Terracotta', group: 'Paint', color: '#c0714f', pattern: 'none', roughness: 0.9 },
  { id: 'paint-charcoal', name: 'Charcoal', group: 'Paint', color: '#3b3d40', pattern: 'none', roughness: 0.9 },
  { id: 'paint-black', name: 'Matte black', group: 'Paint', color: '#1d1e20', pattern: 'none', roughness: 0.8 },

  // Floors
  { id: 'oak-planks', name: 'Oak planks', group: 'Floor', color: '#c49a6c', color2: '#a57a4d', pattern: 'planks', size: 170, roughness: 0.6 },
  { id: 'light-oak-planks', name: 'Light oak planks', group: 'Floor', color: '#dcc3a0', color2: '#c3a57f', pattern: 'planks', size: 170, roughness: 0.6 },
  { id: 'walnut-planks', name: 'Walnut planks', group: 'Floor', color: '#6e4a31', color2: '#583723', pattern: 'planks', size: 170, roughness: 0.55 },
  { id: 'grey-planks', name: 'Grey washed planks', group: 'Floor', color: '#a9a39a', color2: '#8e877c', pattern: 'planks', size: 170, roughness: 0.65 },
  { id: 'herringbone-oak', name: 'Herringbone oak', group: 'Floor', color: '#c8a070', color2: '#a87f52', pattern: 'herringbone', size: 240, roughness: 0.6 },
  { id: 'tile-60-light', name: 'Tile 60×60 light', group: 'Floor', color: '#e3e0da', color2: '#bdb8ae', pattern: 'tiles', size: 60, roughness: 0.35 },
  { id: 'tile-60-dark', name: 'Tile 60×60 anthracite', group: 'Floor', color: '#4a4b4d', color2: '#303133', pattern: 'tiles', size: 60, roughness: 0.4 },
  { id: 'tile-30-sand', name: 'Tile 30×30 sand', group: 'Floor', color: '#d3c4a8', color2: '#b0a084', pattern: 'tiles', size: 30, roughness: 0.4 },
  { id: 'tile-checker', name: 'Checkerboard', group: 'Floor', color: '#f0eee9', color2: '#2a2a2c', pattern: 'tiles', size: 60, roughness: 0.3 },
  { id: 'hex-tile', name: 'Hexagon tiles', group: 'Floor', color: '#eceae5', color2: '#9a978f', pattern: 'hex', size: 30, roughness: 0.35 },
  { id: 'terrazzo', name: 'Terrazzo', group: 'Floor', color: '#e6e1d8', color2: '#8c8579', pattern: 'terrazzo', size: 80, roughness: 0.3 },
  { id: 'concrete', name: 'Polished concrete', group: 'Floor', color: '#a6a5a1', color2: '#8f8e8a', pattern: 'noise', size: 200, roughness: 0.5 },
  { id: 'marble-floor', name: 'Marble', group: 'Floor', color: '#efede8', color2: '#9c9a96', pattern: 'marble', size: 120, roughness: 0.2 },
  { id: 'carpet-grey', name: 'Carpet grey', group: 'Floor', color: '#8c8b88', color2: '#7c7b78', pattern: 'noise', size: 40, roughness: 1 },

  // Wall tiles
  { id: 'subway-white', name: 'Subway white', group: 'Wall tiles', color: '#f4f3ef', color2: '#c9c6bf', pattern: 'subway', size: 30, roughness: 0.2 },
  { id: 'subway-green', name: 'Subway green', group: 'Wall tiles', color: '#5f8a6d', color2: '#e8e6df', pattern: 'subway', size: 30, roughness: 0.2 },
  { id: 'subway-navy', name: 'Subway navy', group: 'Wall tiles', color: '#2f3d5a', color2: '#d9d7d0', pattern: 'subway', size: 30, roughness: 0.2 },
  { id: 'wall-tile-20', name: 'Square tile 20×20', group: 'Wall tiles', color: '#eeeeea', color2: '#bbbab4', pattern: 'tiles', size: 20, roughness: 0.2 },
  { id: 'wall-tile-large', name: 'Large tile 30×60', group: 'Wall tiles', color: '#dedad3', color2: '#b8b3aa', pattern: 'subway', size: 60, roughness: 0.25 },
  { id: 'wall-marble', name: 'Marble slab', group: 'Wall tiles', color: '#f1efea', color2: '#8f8d88', pattern: 'marble', size: 150, roughness: 0.15 },
  { id: 'wood-panel', name: 'Wood panelling', group: 'Wall tiles', color: '#b98e62', color2: '#9a7148', pattern: 'cladding', size: 60, roughness: 0.6 },

  // Surfaces
  { id: 'white-gloss', name: 'White gloss', group: 'Surfaces', color: '#f7f7f5', pattern: 'none', roughness: 0.15 },
  { id: 'white-matte', name: 'White matte', group: 'Surfaces', color: '#efefec', pattern: 'none', roughness: 0.7 },
  { id: 'cashmere', name: 'Cashmere', group: 'Surfaces', color: '#d9cfc1', pattern: 'none', roughness: 0.6 },
  { id: 'sage-front', name: 'Sage front', group: 'Surfaces', color: '#8f9e86', pattern: 'none', roughness: 0.6 },
  { id: 'navy-front', name: 'Navy front', group: 'Surfaces', color: '#27344a', pattern: 'none', roughness: 0.5 },
  { id: 'anthracite', name: 'Anthracite', group: 'Surfaces', color: '#38393c', pattern: 'none', roughness: 0.55 },
  { id: 'oak', name: 'Oak', group: 'Surfaces', color: '#c79d6e', color2: '#a97f52', pattern: 'woodgrain', size: 80, roughness: 0.55 },
  { id: 'walnut', name: 'Walnut', group: 'Surfaces', color: '#6b4630', color2: '#4f3120', pattern: 'woodgrain', size: 80, roughness: 0.5 },
  { id: 'birch', name: 'Birch plywood', group: 'Surfaces', color: '#e2cda7', color2: '#cdb48a', pattern: 'woodgrain', size: 80, roughness: 0.6 },
  { id: 'marble', name: 'Carrara marble', group: 'Surfaces', color: '#f2f1ee', color2: '#8e8c88', pattern: 'marble', size: 120, roughness: 0.15 },
  { id: 'granite-black', name: 'Black granite', group: 'Surfaces', color: '#262628', color2: '#5a5a5d', pattern: 'terrazzo', size: 40, roughness: 0.2 },
  { id: 'quartz-grey', name: 'Grey quartz', group: 'Surfaces', color: '#b9b8b4', color2: '#d8d7d2', pattern: 'terrazzo', size: 50, roughness: 0.2 },
  { id: 'butcher-block', name: 'Butcher block', group: 'Surfaces', color: '#c08f5c', color2: '#9e6f40', pattern: 'planks', size: 60, roughness: 0.5 },
  { id: 'fabric-grey', name: 'Grey fabric', group: 'Surfaces', color: '#8a8c8f', color2: '#7a7c7f', pattern: 'noise', size: 20, roughness: 1 },
  { id: 'fabric-beige', name: 'Beige fabric', group: 'Surfaces', color: '#cfc3ae', color2: '#bfb39e', pattern: 'noise', size: 20, roughness: 1 },
  { id: 'fabric-green', name: 'Green velvet', group: 'Surfaces', color: '#48664f', color2: '#3b5641', pattern: 'noise', size: 20, roughness: 0.9 },
  { id: 'leather-cognac', name: 'Cognac leather', group: 'Surfaces', color: '#9a5a2e', pattern: 'none', roughness: 0.5 },
  { id: 'ceramic-white', name: 'White ceramic', group: 'Surfaces', color: '#fbfbfa', pattern: 'none', roughness: 0.1 },
  { id: 'plant-green', name: 'Foliage', group: 'Surfaces', color: '#4f7a3a', pattern: 'none', roughness: 0.8 },

  // Metal & glass
  { id: 'steel', name: 'Stainless steel', group: 'Metal & glass', color: '#c5c8cb', pattern: 'none', roughness: 0.3, metalness: 0.9 },
  { id: 'chrome', name: 'Chrome', group: 'Metal & glass', color: '#e3e6ea', pattern: 'none', roughness: 0.08, metalness: 1 },
  { id: 'brass', name: 'Brushed brass', group: 'Metal & glass', color: '#c8a45a', pattern: 'none', roughness: 0.3, metalness: 1 },
  { id: 'black-metal', name: 'Black metal', group: 'Metal & glass', color: '#232427', pattern: 'none', roughness: 0.45, metalness: 0.6 },
  { id: 'aluminium', name: 'Aluminium', group: 'Metal & glass', color: '#a9adb1', pattern: 'none', roughness: 0.35, metalness: 0.8 },
  { id: 'glass', name: 'Clear glass', group: 'Metal & glass', color: '#cfe3ea', pattern: 'none', roughness: 0.05, opacity: 0.25 },
  { id: 'glass-frosted', name: 'Frosted glass', group: 'Metal & glass', color: '#e8f0f2', pattern: 'none', roughness: 0.4, opacity: 0.6 },
  { id: 'mirror', name: 'Mirror', group: 'Metal & glass', color: '#dfe6ea', pattern: 'none', roughness: 0.02, metalness: 1 },
  { id: 'black-glass', name: 'Black glass', group: 'Metal & glass', color: '#111214', pattern: 'none', roughness: 0.1, metalness: 0.3 },
  { id: 'light-panel', name: 'Light (emissive)', group: 'Metal & glass', color: '#fff6e0', pattern: 'none', roughness: 1, emissive: '#fff1cc' },

  // Exterior
  { id: 'grass', name: 'Grass', group: 'Exterior', color: '#6d8f45', color2: '#57763a', pattern: 'grass', size: 100, roughness: 1 },
  { id: 'gravel', name: 'Gravel', group: 'Exterior', color: '#b3aca0', color2: '#8a8378', pattern: 'terrazzo', size: 40, roughness: 1 },
  { id: 'paving', name: 'Paving stones', group: 'Exterior', color: '#a19c94', color2: '#77736c', pattern: 'tiles', size: 40, roughness: 0.9 },
  { id: 'decking', name: 'Decking', group: 'Exterior', color: '#9b7453', color2: '#7a5738', pattern: 'planks', size: 150, roughness: 0.8 },
  { id: 'render-white', name: 'White render', group: 'Exterior', color: '#eeebe4', color2: '#e0ddd5', pattern: 'noise', size: 100, roughness: 0.95 },
  { id: 'render-grey', name: 'Grey render', group: 'Exterior', color: '#9d9d9a', color2: '#8e8e8b', pattern: 'noise', size: 100, roughness: 0.95 },
  { id: 'brick-red', name: 'Red brick', group: 'Exterior', color: '#9c4f36', color2: '#d8d0c4', pattern: 'brick', size: 45, roughness: 0.9 },
  { id: 'brick-white', name: 'White brick', group: 'Exterior', color: '#e8e4dc', color2: '#b8b2a6', pattern: 'brick', size: 45, roughness: 0.9 },
  { id: 'brick-dark', name: 'Dark brick', group: 'Exterior', color: '#4a3e39', color2: '#8d857c', pattern: 'brick', size: 45, roughness: 0.9 },
  { id: 'stone', name: 'Natural stone', group: 'Exterior', color: '#9a948a', color2: '#6f6a62', pattern: 'stone', size: 80, roughness: 0.95 },
  { id: 'cladding-white', name: 'White wood cladding', group: 'Exterior', color: '#f0eee8', color2: '#c9c6bf', pattern: 'cladding', size: 80, roughness: 0.7 },
  { id: 'cladding-red', name: 'Falu red cladding', group: 'Exterior', color: '#8e2b22', color2: '#6a1f19', pattern: 'cladding', size: 80, roughness: 0.8 },
  { id: 'cladding-black', name: 'Black wood cladding', group: 'Exterior', color: '#2a2a2a', color2: '#141414', pattern: 'cladding', size: 80, roughness: 0.8 },
  { id: 'cladding-yellow', name: 'Yellow vertical cladding', group: 'Exterior', color: '#dcb553', color2: '#b8902f', pattern: 'verticalCladding', size: 60, roughness: 0.75 },
  { id: 'cladding-white-vertical', name: 'White vertical cladding', group: 'Exterior', color: '#f1efe9', color2: '#c9c5bb', pattern: 'verticalCladding', size: 60, roughness: 0.75 },
  { id: 'cladding-red-vertical', name: 'Red vertical cladding', group: 'Exterior', color: '#8e2b22', color2: '#5e1a14', pattern: 'verticalCladding', size: 60, roughness: 0.8 },
  { id: 'lattice-white', name: 'White lattice', group: 'Exterior', color: '#f3f1eb', color2: '#2d2f2a', pattern: 'lattice', size: 60, roughness: 0.8 },
  { id: 'cladding-larch', name: 'Larch cladding', group: 'Exterior', color: '#b0875e', color2: '#8a653f', pattern: 'cladding', size: 80, roughness: 0.8 },
  { id: 'water', name: 'Water', group: 'Exterior', color: '#4f8fb3', pattern: 'none', roughness: 0.05, opacity: 0.8 },

  // Roof
  { id: 'roof-tiles-red', name: 'Clay tiles red', group: 'Roof', color: '#a2482f', color2: '#7a321e', pattern: 'roofTiles', size: 60, roughness: 0.8 },
  { id: 'roof-tiles-dark', name: 'Concrete tiles dark', group: 'Roof', color: '#3e3f42', color2: '#26272a', pattern: 'roofTiles', size: 60, roughness: 0.8 },
  { id: 'roof-slate', name: 'Slate', group: 'Roof', color: '#4a4f57', color2: '#343840', pattern: 'shingles', size: 60, roughness: 0.7 },
  { id: 'roof-shingles', name: 'Asphalt shingles', group: 'Roof', color: '#5a5550', color2: '#3f3b37', pattern: 'shingles', size: 60, roughness: 0.95 },
  { id: 'roof-metal-black', name: 'Standing seam black', group: 'Roof', color: '#2b2d30', color2: '#1a1b1d', pattern: 'seam', size: 50, roughness: 0.4, metalness: 0.5 },
  { id: 'roof-metal-zinc', name: 'Standing seam zinc', group: 'Roof', color: '#8e9499', color2: '#6f757a', pattern: 'seam', size: 50, roughness: 0.4, metalness: 0.6 },
  { id: 'roof-sedum', name: 'Green roof (sedum)', group: 'Roof', color: '#7c8a46', color2: '#9a6a4a', pattern: 'grass', size: 80, roughness: 1 },
  { id: 'roof-membrane', name: 'Roof membrane', group: 'Roof', color: '#3a3b3d', color2: '#333436', pattern: 'noise', size: 100, roughness: 0.9 },
];

const byId = new Map(MATERIALS.map((m) => [m.id, m]));

export function getMaterialDef(ref: MaterialRef): MaterialDef {
  const def = byId.get(ref);
  if (def) return def;
  const color = /^#[0-9a-f]{6}$/i.test(ref) ? ref : '#cccccc';
  return { id: ref, name: color, group: 'Paint', color, pattern: 'none', roughness: 0.7 };
}

export function materialName(ref: MaterialRef) {
  return byId.get(ref)?.name ?? ref;
}

export const MATERIAL_GROUPS = Array.from(new Set(MATERIALS.map((m) => m.group)));
