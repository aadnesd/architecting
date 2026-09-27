import { useStore } from '../store/store';
import { Section } from './inputs';
import { formatArea, formatLength } from '../geometry/units';
import { polygonArea, polygonPerimeter } from '../geometry/math';
import { wallLength } from '../geometry/walls';
import { materialName } from '../model/materials';
import { getOpeningPreset } from '../model/catalog';
import { scheduleRows } from '../io/files';
import { Download } from 'lucide-react';
import { downloadCSV } from '../io/files';

export default function SchedulePanel() {
  const project = useStore((s) => s.project);
  const setSelection = useStore((s) => s.setSelection);
  const setActiveLevel = useStore((s) => s.setActiveLevel);
  const unit = project.settings.unit;

  const totalFloor = project.rooms.reduce((s, r) => s + Math.abs(polygonArea(r.points)), 0);
  const wallLen = project.walls.reduce((s, w) => s + wallLength(w), 0);
  // Net wall surface per side (gross minus openings)
  const wallArea = project.walls.reduce((s, w) => s + wallLength(w) * ((w.height + (w.heightEnd ?? w.height)) / 2), 0);
  const openArea = project.openings.reduce((s, o) => s + o.width * o.height, 0);
  const groups = new Map<string, { name: string; count: number; w: number; d: number; h: number; finish: string; ids: string[]; levelId: string }>();
  for (const i of project.items) {
    const k = `${i.kind}|${i.name}|${Math.round(i.width)}|${Math.round(i.depth)}|${Math.round(i.height)}|${i.finish}`;
    const g = groups.get(k);
    if (g) {
      g.count++;
      g.ids.push(i.id);
    } else groups.set(k, { name: i.name, count: 1, w: i.width, d: i.depth, h: i.height, finish: i.finish, ids: [i.id], levelId: i.levelId });
  }
  const pick = (levelId: string, sel: { type: 'item' | 'room' | 'opening'; id: string }[]) => {
    setActiveLevel(levelId);
    setSelection(sel);
  };

  return (
    <div className="schedule">
      <div className="stat-row">
        <div className="stat">
          <span>Floor area</span>
          <strong>{formatArea(totalFloor, unit)}</strong>
        </div>
        <div className="stat">
          <span>Wall length</span>
          <strong>{formatLength(wallLen, unit)}</strong>
        </div>
        <div className="stat">
          <span>Wall surface (net, one side)</span>
          <strong>{formatArea(Math.max(0, wallArea - openArea), unit)}</strong>
        </div>
      </div>
      <button className="btn" onClick={() => downloadCSV(`${project.name || 'project'}-schedule.csv`, scheduleRows(project))}>
        <Download size={14} /> Export schedule (CSV)
      </button>

      <Section title={`Rooms (${project.rooms.length})`}>
        <table>
          <thead>
            <tr>
              <th>Room</th>
              <th>Area</th>
              <th>Perimeter</th>
              <th>Floor</th>
            </tr>
          </thead>
          <tbody>
            {project.rooms.map((r) => (
              <tr key={r.id} onClick={() => pick(r.levelId, [{ type: 'room', id: r.id }])}>
                <td>{r.name}</td>
                <td>{formatArea(Math.abs(polygonArea(r.points)), unit)}</td>
                <td>{formatLength(polygonPerimeter(r.points), unit)}</td>
                <td>{materialName(r.floorMaterial)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Doors & windows (${project.openings.length})`}>
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>W × H</th>
              <th>Sill</th>
            </tr>
          </thead>
          <tbody>
            {project.openings.map((o) => {
              const w = project.walls.find((x) => x.id === o.wallId);
              return (
                <tr key={o.id} onClick={() => w && pick(w.levelId, [{ type: 'opening', id: o.id }])}>
                  <td>{getOpeningPreset(o.kind).name}</td>
                  <td>
                    {formatLength(o.width, unit)} × {formatLength(o.height, unit)}
                  </td>
                  <td>{formatLength(o.sill, unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title={`Furniture & fixtures (${project.items.length})`}>
        <table>
          <thead>
            <tr>
              <th>Qty</th>
              <th>Item</th>
              <th>W × D × H</th>
              <th>Finish</th>
            </tr>
          </thead>
          <tbody>
            {[...groups.values()].map((g, i) => (
              <tr key={i} onClick={() => pick(g.levelId, g.ids.map((id) => ({ type: 'item' as const, id })))}>
                <td>{g.count}</td>
                <td>{g.name}</td>
                <td>
                  {formatLength(g.w, unit, false)}×{formatLength(g.d, unit, false)}×{formatLength(g.h, unit, false)}
                </td>
                <td>{materialName(g.finish)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
