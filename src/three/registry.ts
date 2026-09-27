import type * as THREE from 'three';

/** Handles to the live 3D view, used by export functions outside the React tree. */
export const registry: {
  gl: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.Camera | null;
  content: THREE.Group | null;
  ground: THREE.Mesh | null;
  /** OrbitControls instance (when not in walk mode). */
  controls: unknown;
} = { gl: null, scene: null, camera: null, content: null, ground: null, controls: null };
