import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { DenoiseMaterial, GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { registry } from './registry';
import { useStore } from '../store/store';
import { getMaterialDef } from '../model/materials';

export interface RenderSettings {
  width: number;
  height: number;
  samples: number;
  bounces: number;
  denoise: boolean;
  /** Exposure multiplier (1 = neutral). */
  exposure: number;
}

export interface RenderJob {
  canvas: HTMLCanvasElement;
  /** Resolves when all samples are done (or the job was stopped). */
  done: Promise<void>;
  stop: () => void;
  dispose: () => void;
}

/** Converts rasterizer-friendly materials to physically meaningful ones for the path tracer. */
function physicalize(mat: THREE.Material, cache: Map<THREE.Material, THREE.Material>): THREE.Material {
  const hit = cache.get(mat);
  if (hit) return hit;
  let out: THREE.Material = mat;
  const m = mat as THREE.MeshStandardMaterial;
  if (m.isMeshStandardMaterial && m.transparent && m.opacity < 1) {
    // Glass, water: real transmission instead of alpha blending.
    const p = new THREE.MeshPhysicalMaterial({
      color: m.color,
      roughness: Math.min(m.roughness, 0.4),
      metalness: 0,
      transmission: 1,
      ior: 1.5,
      thickness: 0.01,
      side: m.side,
      map: m.map,
    });
    p.name = m.name;
    out = p;
  }
  cache.set(mat, out);
  return out;
}

/**
 * three-gpu-pathtracer assigns one material per mesh, so meshes with material arrays (walls: left
 * side / right side / edges) are split into one single-material mesh per geometry group.
 */
function splitMultiMaterial(mesh: THREE.Mesh): THREE.Mesh[] {
  const mats = mesh.material as THREE.Material[];
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const out: THREE.Mesh[] = [];
  for (const g of src.groups) {
    if (g.count <= 0 || !mats[g.materialIndex ?? 0]) continue;
    const geo = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(src.attributes)) {
      const a = attr as THREE.BufferAttribute;
      const arr = a.array.slice(g.start * a.itemSize, (g.start + g.count) * a.itemSize);
      geo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    }
    const m = new THREE.Mesh(geo, mats[g.materialIndex ?? 0]);
    m.name = mesh.name;
    mesh.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    out.push(m);
  }
  return out;
}

function sunDirection() {
  const o = useStore.getState().options;
  const az = (o.sunAzimuth * Math.PI) / 180;
  const el = (Math.max(2, o.sunElevation) * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * Build a standalone copy of the current 3D scene and progressively path-trace it from the current
 * camera. Global illumination, soft light from the sky through windows, reflections and glass
 * transmission come from the path tracer; emissive lamp shades light the room too.
 */
export async function startPathTrace(settings: RenderSettings, onProgress: (samples: number, phase: 'building' | 'rendering' | 'done') => void): Promise<RenderJob> {
  const content = registry.content;
  const liveCamera = registry.camera as THREE.PerspectiveCamera | null;
  if (!content || !liveCamera) throw new Error('Open the 3D view first');
  onProgress(0, 'building');

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(settings.width, settings.height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = settings.exposure * 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Scene copy: shares geometries/textures with the live view, but never touches it.
  const scene = new THREE.Scene();
  content.updateMatrixWorld(true);
  const copy = content.clone(true);
  const remove: THREE.Object3D[] = [];
  const cache = new Map<THREE.Material, THREE.Material>();
  const lampScale = useStore.getState().options.lampLights ? 1 : 0;
  copy.traverse((o) => {
    const anyO = o as THREE.Object3D & { isLine?: boolean; isLineSegments2?: boolean; isLine2?: boolean; material?: THREE.Material | THREE.Material[] };
    if (anyO.isLine || anyO.isLineSegments2 || anyO.isLine2 || (anyO.material && !Array.isArray(anyO.material) && (anyO.material as THREE.ShaderMaterial).isShaderMaterial)) {
      remove.push(o);
      return;
    }
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => physicalize(m, cache)) : physicalize(mesh.material, cache);
    }
    if ((o as THREE.PointLight).isPointLight) {
      const l = o as THREE.PointLight;
      l.intensity *= 4 * lampScale;
      l.distance = 0;
    }
  });
  // Hidden subtrees (dollhouse walls, hidden levels) must not be traced.
  copy.traverse((o) => {
    if (!o.visible && o !== copy) remove.push(o);
  });
  for (const o of remove) o.removeFromParent();
  scene.add(copy);
  scene.updateMatrixWorld(true);
  // Split multi-material meshes (see splitMultiMaterial) and add the parts at scene level.
  const multi: THREE.Mesh[] = [];
  copy.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && Array.isArray((o as THREE.Mesh).material) && o.visible) multi.push(o as THREE.Mesh);
  });
  const splitGeometries: THREE.BufferGeometry[] = [];
  for (const mesh of multi) {
    // Only split meshes whose whole ancestor chain is visible (dollhouse hides wall groups).
    let vis = true;
    for (let p: THREE.Object3D | null = mesh; p; p = p.parent) vis &&= p.visible;
    if (vis) {
      for (const part of splitMultiMaterial(mesh)) {
        splitGeometries.push(part.geometry);
        scene.add(part);
      }
    }
    mesh.removeFromParent();
  }

  if (registry.ground?.visible) {
    const g = registry.ground.clone();
    g.material = physicalize(g.material as THREE.Material, cache);
    scene.add(g);
  }

  // Sky: a simple gradient environment that also lights the scene (skylight through windows).
  const settingsGround = useStore.getState().project.settings;
  const env = new GradientEquirectTexture(512);
  env.topColor.set('#a9c4e2');
  env.bottomColor.set(settingsGround.showGround ? getMaterialDef(settingsGround.groundMaterial).color : '#d8d4cc');
  env.exponent = 1.2;
  env.update();
  scene.background = env;
  scene.environment = env;
  scene.environmentIntensity = 0.85;

  const o = useStore.getState().options;
  const dir = sunDirection();
  const sun = new THREE.DirectionalLight(o.sunElevation < 15 ? '#ffc58a' : '#fff4e2', 1.6 * Math.min(1, Math.max(0.15, Math.sin((o.sunElevation * Math.PI) / 180) * 1.6)));
  sun.position.copy(dir.multiplyScalar(100));
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(liveCamera.fov, settings.width / settings.height, liveCamera.near, liveCamera.far);
  camera.position.copy(liveCamera.position);
  camera.quaternion.copy(liveCamera.quaternion);
  camera.updateMatrixWorld();

  const pt = new WebGLPathTracer(renderer);
  pt.bounces = settings.bounces;
  pt.transmissiveBounces = 6;
  pt.filterGlossyFactor = 0.5;
  pt.renderDelay = 0;
  pt.fadeDuration = 0;
  pt.minSamples = 0;
  pt.dynamicLowRes = false;
  pt.rasterizeScene = false;
  pt.renderToCanvas = false;
  pt.textureSize.set(1024, 1024);
  pt.tiles.set(2, 2);

  // Let the UI show 'Preparing' before the (synchronous) BVH build.
  await new Promise((r) => setTimeout(r, 30));
  pt.setScene(scene, camera);

  const denoise = new DenoiseMaterial({ map: pt.target.texture, blending: THREE.NoBlending });
  denoise.sigma = settings.denoise ? 2.5 : 0.001;
  denoise.threshold = settings.denoise ? 0.08 : 0;
  denoise.kSigma = 1;
  const quad = new FullScreenQuad(denoise);
  const present = () => {
    denoise.map = pt.target.texture;
    renderer.setRenderTarget(null);
    quad.render(renderer);
  };

  let stopped = false;
  const done = (async () => {
    onProgress(0, 'rendering');
    let lastShown = 0;
    const probe = new Float32Array(4);
    while (!stopped && pt.samples < settings.samples) {
      pt.renderSample();
      // Wait for the GPU to finish this sample so work doesn't pile up and freeze the page,
      // and so the progress shown is real.
      renderer.readRenderTargetPixels(pt.target, 0, 0, 1, 1, probe);
      const now = performance.now();
      if (now - lastShown > 250) {
        present();
        onProgress(Math.floor(pt.samples), 'rendering');
        lastShown = now;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    present();
    onProgress(Math.floor(pt.samples), 'done');
  })();

  return {
    canvas,
    done,
    stop: () => {
      stopped = true;
    },
    dispose: () => {
      stopped = true;
      quad.dispose();
      denoise.dispose();
      env.dispose();
      pt.dispose();
      renderer.dispose();
      for (const [src, m] of cache) if (m !== src) m.dispose();
      for (const g of splitGeometries) g.dispose();
    },
  };
}
