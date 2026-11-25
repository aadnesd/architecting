import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Project } from '../model/types';
import { useStore } from '../store/store';
import { PlanContent } from '../plan/PlanView';
import { add, bbox, perp, scale } from '../geometry/math';
import { pointAlong, wallDir } from '../geometry/walls';
import { A3, elevationSheet, elevationView, elevationWalls, fitScale, sheetSVG, type ElevationView } from './elevation';

/**
 * A drawing set for one level: a plan sheet with elevation markers, followed by one sheet per
 * wall elevation. Every sheet is an A3 SVG at a true scale.
 */
export function drawingSet(p: Project, levelId: string, views = elevationWalls(p, levelId)): string[] {
  const level = p.levels.find((l) => l.id === levelId);
  const sheets = [planSheet(p, levelId, views, { number: 'A1', title: `Plan – ${level?.name ?? ''}` })];
  views.forEach((v, i) => sheets.push(elevationSheet(p, v, { number: `A${i + 2}` })));
  return sheets;
}

/** Plan of a level, cropped to the walls being drawn, with a marker pointing at each elevation. */
export function planSheet(p: Project, levelId: string, views: ElevationView[], info: { number: string; title: string }) {
  const pts = views.length
    ? views.flatMap((v) => [v.wall.a, v.wall.b, ...v.items.map((i) => ({ x: i.x, y: i.y }))])
    : [...p.walls.filter((w) => w.levelId === levelId).flatMap((w) => [w.a, w.b]), ...p.rooms.filter((r) => r.levelId === levelId).flatMap((r) => r.points)];
  const b = pts.length ? bbox(pts) : { minX: -100, minY: -100, maxX: 100, maxY: 100 };
  const pad = 120;
  const w = b.maxX - b.minX + pad * 2;
  const h = b.maxY - b.minY + pad * 2;
  const boxW = A3.w - 30;
  const boxH = A3.h - 30 - 32;
  const s = fitScale(w, h, boxW, boxH);
  const k = 10 / s;
  const ox = 15 + (boxW - w * k) / 2 - (b.minX - pad) * k;
  const oy = 15 + (boxH - h * k) / 2 - (b.minY - pad) * k;
  const px = 0.2 / k;
  const options = { ...useStore.getState().options, showGrid: false };
  const plan = renderToStaticMarkup(createElement(PlanContent, { project: p, levelId, px, selIds: new Set<string>(), options, unit: 'mm' }));

  // Elevation markers: a numbered circle in the room with a pointer towards the wall
  const markers = views
    .map((v, i) => {
      const n = scale(perp(wallDir(v.wall)), v.side);
      const face = add(pointAlong(v.wall, (v.t0 + v.t1) / 2), scale(n, v.wall.thickness / 2));
      const c = add(face, scale(n, 18 / k));
      const r = 4 / k;
      const tip = add(c, scale(n, -r * 1.9));
      const side = scale(perp(n), r * 0.95);
      const base = add(c, scale(n, -r * 0.3));
      const tri = [tip, add(base, side), add(base, scale(side, -1))].map((q) => `${q.x},${q.y}`).join(' ');
      return (
        `<polygon points="${tri}" fill="#111" stroke="none"/>` +
        `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="#fff" stroke="#111" stroke-width="${0.35 / k}"/>` +
        `<text x="${c.x}" y="${c.y}" font-size="${3 / k}" text-anchor="middle" dominant-baseline="central" font-weight="600" fill="#111" stroke="none">A${i + 2}</text>`
      );
    })
    .join('');

  // Clipped to the sheet frame; the title block (drawn on top) names the sheet and its scale
  const content =
    `<defs><clipPath id="sheet-frame"><rect x="10" y="10" width="${A3.w - 20}" height="${A3.h - 20}"/></clipPath></defs>` +
    `<g clip-path="url(#sheet-frame)"><g transform="translate(${ox} ${oy}) scale(${k})">${plan}${markers}</g></g>`;
  return sheetSVG(content, { project: p.name, title: info.title, number: info.number, scale: `1:${s}` });
}

function escapeXml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}

/** Opens the sheets in a print window (A3 landscape, one sheet per page) for printing or saving as PDF. */
export function printSheets(title: string, sheets: string[]) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Allow pop-ups to print');
  w.document.write(`<!doctype html><html><head><title>${escapeXml(title)}</title><style>
  @page { size: A3 landscape; margin: 0; }
  html, body { margin: 0; background: #888; }
  svg { display: block; width: 420mm; height: 297mm; background: #fff; margin: 0 auto; page-break-after: always; break-after: page; }
  @media screen { svg { margin: 12px auto; box-shadow: 0 2px 12px rgba(0,0,0,.3); } }
  </style></head><body>${sheets.join('\n')}<script>window.onload = () => { window.print(); }</script></body></html>`);
  w.document.close();
}

export function printDrawingSet(p: Project, levelId: string) {
  const level = p.levels.find((l) => l.id === levelId);
  printSheets(`${p.name} – ${level?.name ?? 'drawings'}`, drawingSet(p, levelId));
}

/** Elevation of one wall (the side with the most furniture) as a single sheet. */
export function wallElevationSheet(p: Project, wallId: string, side?: 1 | -1) {
  const v = elevationView(p, wallId, side);
  if (!v) throw new Error('Wall not found');
  return elevationSheet(p, v);
}
