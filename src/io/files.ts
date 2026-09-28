import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Project } from '../model/types';
import { normalizeProject } from '../model/factory';
import { registry } from '../three/registry';
import { polygonArea, polygonPerimeter, bbox } from '../geometry/math';
import { wallLength } from '../geometry/walls';
import { materialName } from '../model/materials';
import { getOpeningPreset } from '../model/catalog';
import { PlanContent } from '../plan/PlanView';
import { itemCorners } from '../plan/snapping';
import { useStore } from '../store/store';

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safe = (s: string) => (s || 'project').replace(/[^\w\-. ]+/g, '_');

export function saveProjectFile(p: Project) {
  download(`${safe(p.name)}.home.json`, new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
}

export function openProjectFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return reject(new Error('No file'));
      try {
        resolve(normalizeProject(JSON.parse(await f.text())));
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
}

export function exportRenderPNG(name: string) {
  const gl = registry.gl;
  if (!gl) throw new Error('Open the 3D view first');
  gl.domElement.toBlob((b) => b && download(`${safe(name)}-3d.png`, b), 'image/png');
}

/**
 * Runs an export with every level shown and no dollhouse or cutaway, so the file holds the whole
 * building rather than the current view, then puts the view back.
 */
async function withWholeModel<T>(fn: (root: THREE.Object3D) => T | Promise<T>): Promise<T> {
  if (!registry.content) throw new Error('Open the 3D view first');
  const st = useStore.getState();
  const saved = { ...st.options };
  // Selection outlines use shader materials that exporters can't store.
  st.clearSelection();
  st.setOption('allLevels3D', true);
  st.setOption('dollhouse', false);
  st.setOption('cutaway', false);
  await new Promise((r) => setTimeout(r, 300));
  try {
    const root = registry.content;
    if (!root) throw new Error('Open the 3D view first');
    return await fn(root);
  } finally {
    useStore.setState({ options: { ...useStore.getState().options, allLevels3D: saved.allLevels3D, dollhouse: saved.dollhouse, cutaway: saved.cutaway } });
  }
}

/** Readable names for exported objects: items by their name, other parts by their type. */
function exportName(o: THREE.Object3D): string | undefined {
  const m = /^(\w+):(.+)$/.exec(o.name);
  if (!m) return o.name || undefined;
  const p = useStore.getState().project;
  if (m[1] === 'item') return p.items.find((i) => i.id === m[2])?.name ?? 'Item';
  if (m[1] === 'room') return p.rooms.find((r) => r.id === m[2])?.name || 'Floor';
  return m[1][0].toUpperCase() + m[1].slice(1);
}

export async function exportGLB(name: string) {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const result = await withWholeModel((root) => new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true }));
  download(`${safe(name)}.glb`, new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }));
}

/** COLLADA for SketchUp (File → Import → COLLADA), which can't read GLB. */
export async function exportDAE(name: string) {
  const { toCollada } = await import('./collada');
  const dae = await withWholeModel((root) => toCollada(root, { title: name, nameOf: exportName }));
  download(`${safe(name)}.dae`, new Blob([dae], { type: 'model/vnd.collada+xml' }));
}

/** Plan of one level as a standalone SVG string (1 unit = 1 cm). */
export function planSVG(p: Project, levelId: string) {
  const pts = [
    ...p.walls.filter((w) => w.levelId === levelId).flatMap((w) => [w.a, w.b]),
    ...p.rooms.filter((r) => r.levelId === levelId).flatMap((r) => r.points),
    ...p.items.filter((i) => i.levelId === levelId).flatMap((i) => itemCorners(i)),
    ...p.dimensions.filter((d) => d.levelId === levelId).flatMap((d) => [d.a, d.b]),
  ];
  const b = pts.length ? bbox(pts) : { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const pad = 120;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const options = { ...useStore.getState().options, showGrid: false };
  const px = Math.max(w, h) / 1400;
  const content = renderToStaticMarkup(createElement(PlanContent, { project: p, levelId, px, selIds: new Set<string>(), options, unit: p.settings.unit }));
  const level = p.levels.find((l) => l.id === levelId);
  const title = `${p.name} — ${level?.name ?? ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.minX - pad} ${b.minY - pad} ${w} ${h}" width="${Math.round(w * 2)}" height="${Math.round(h * 2)}" font-family="Inter, system-ui, sans-serif">
<rect x="${b.minX - pad}" y="${b.minY - pad}" width="${w}" height="${h}" fill="#ffffff"/>
<text x="${b.minX - pad + 20 * px}" y="${b.minY - pad + 30 * px}" font-size="${16 * px}" font-weight="600" fill="#111">${escapeXml(title)}</text>
${content}
</svg>`;
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

export function exportPlanSVG(p: Project, levelId: string) {
  download(`${safe(p.name)}-plan.svg`, new Blob([planSVG(p, levelId)], { type: 'image/svg+xml' }));
}

export function printPlan(p: Project, levelId: string) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups to print');
  w.document.write(`<!doctype html><html><head><title>${escapeXml(p.name)}</title><style>
  @page { size: landscape; margin: 12mm; } body { margin: 0; } svg { width: 100%; height: auto; max-height: 100vh; }
  </style></head><body>${planSVG(p, levelId)}<script>window.onload = () => { window.print(); }</script></body></html>`);
  w.document.close();
}

export function scheduleRows(p: Project): string[][] {
  const unitNote = 'cm';
  const rows: string[][] = [['Section', 'Level', 'Name', 'Qty', `Width (${unitNote})`, `Depth (${unitNote})`, `Height (${unitNote})`, 'Area (m²)', 'Finish']];
  const lvl = (id: string) => p.levels.find((l) => l.id === id)?.name ?? '';
  for (const r of p.rooms)
    rows.push(['Room', lvl(r.levelId), r.name, '1', '', '', '', (Math.abs(polygonArea(r.points)) / 10000).toFixed(2), materialName(r.floorMaterial)]);
  for (const w of p.walls)
    rows.push(['Wall', lvl(w.levelId), `Wall ${formatNum(wallLength(w))} cm`, '1', formatNum(wallLength(w)), formatNum(w.thickness), formatNum(w.height), ((wallLength(w) * w.height) / 10000).toFixed(2), `${materialName(w.leftMaterial)} / ${materialName(w.rightMaterial)}`]);
  for (const o of p.openings) {
    const w = p.walls.find((x) => x.id === o.wallId);
    rows.push(['Opening', w ? lvl(w.levelId) : '', getOpeningPreset(o.kind).name, '1', formatNum(o.width), w ? formatNum(w.thickness) : '', formatNum(o.height), ((o.width * o.height) / 10000).toFixed(2), materialName(o.frameColor)]);
  }
  for (const i of p.items) rows.push(['Item', lvl(i.levelId), i.name, '1', formatNum(i.width), formatNum(i.depth), formatNum(i.height), '', materialName(i.finish)]);
  for (const r of p.roofs) rows.push(['Roof', lvl(r.levelId), `${r.type} roof ${r.pitch}°`, '1', formatNum(r.width), formatNum(r.depth), '', '', materialName(r.material)]);
  rows.push(['Total', '', 'Floor area', '', '', '', '', (p.rooms.reduce((s, r) => s + Math.abs(polygonArea(r.points)), 0) / 10000).toFixed(2), '']);
  rows.push(['Total', '', 'Room perimeters', '', formatNum(p.rooms.reduce((s, r) => s + polygonPerimeter(r.points), 0)), '', '', '', '']);
  return rows;
}

const formatNum = (n: number) => String(Math.round(n * 10) / 10);

export function downloadCSV(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => (/[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
  download(safe(name), new Blob([csv], { type: 'text/csv' }));
}
