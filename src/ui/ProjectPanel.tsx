import { useState } from 'react';
import { useStore } from '../store/store';
import { Field, LengthInput, MaterialPicker, Section, Select, TextInput, Toggle } from './inputs';
import { UNIT_LABELS } from '../geometry/units';
import type { Level, LengthUnit } from '../model/types';
import { createLevel, uid } from '../model/factory';
import { Plus, Copy, Trash2 } from 'lucide-react';
import { formatLength } from '../geometry/units';
import { findFaces } from '../geometry/roomDetect';
import { pointInPolygon, polygonCentroid } from '../geometry/math';

export default function ProjectPanel() {
  const project = useStore((s) => s.project);
  const options = useStore((s) => s.options);
  const setOption = useStore((s) => s.setOption);
  const mutate = useStore((s) => s.mutate);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const setActiveLevel = useStore((s) => s.setActiveLevel);
  const settings = project.settings;
  const unit = settings.unit;

  const setSetting = <K extends keyof typeof settings>(k: K, v: (typeof settings)[K]) =>
    mutate((d) => {
      d.settings[k] = v;
    });

  const addLevel = (copyWalls: boolean) => {
    const sorted = [...project.levels].sort((a, b) => a.elevation - b.elevation);
    const top = sorted[sorted.length - 1];
    const lvl = createLevel({ name: `Level ${project.levels.length}`, elevation: top.elevation + top.height + 20, height: top.height, floorThickness: 20 });
    // Copy from the (frozen, plain) current project; immer drafts can't be structured-cloned.
    const idMap = new Map<string, string>();
    const walls = copyWalls
      ? project.walls
          .filter((w) => w.levelId === top.id)
          .map((w) => {
            const nid = uid('wall');
            idMap.set(w.id, nid);
            return { ...structuredClone(w), id: nid, levelId: lvl.id, height: lvl.height, heightEnd: undefined };
          })
      : [];
    // Only rooms enclosed by walls (not terraces or gardens) are copied upstairs.
    const faces = findFaces(project.walls.filter((w) => w.levelId === top.id));
    const rooms = copyWalls
      ? project.rooms
          .filter((r) => r.levelId === top.id && r.points.length >= 3 && faces.some((f) => pointInPolygon(polygonCentroid(r.points), f.points)))
          .map((r) => ({ ...structuredClone(r), id: uid('room'), levelId: lvl.id }))
      : [];
    // Copy windows but not exterior doors
    const openings = project.openings
      .filter((o) => idMap.has(o.wallId) && !['door', 'doubleDoor', 'slidingDoor', 'garageDoor'].includes(o.kind))
      .map((o) => ({ ...structuredClone(o), id: uid('open'), wallId: idMap.get(o.wallId)! }));
    mutate((d) => {
      d.levels.push(lvl);
      d.walls.push(...walls);
      d.rooms.push(...rooms);
      d.openings.push(...openings);
      // The roof moves up to the new top level
      if (copyWalls) for (const r of d.roofs) if (r.levelId === top.id) r.levelId = lvl.id;
    });
    setActiveLevel(lvl.id);
  };

  const upLevel = (id: string, patch: Partial<Level>) =>
    mutate((d) => {
      const l = d.levels.find((x) => x.id === id);
      if (l) Object.assign(l, patch);
    });

  const active = project.levels.find((l) => l.id === activeLevelId);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  return (
    <div className="project-panel">
      <Section title="Project">
        <Field label="Name">
          <TextInput value={project.name} onChange={(v) => mutate((d) => void (d.name = v))} />
        </Field>
        <Field label="Units">
          <Select<LengthUnit> value={unit} options={(Object.keys(UNIT_LABELS) as LengthUnit[]).map((u) => ({ value: u, label: UNIT_LABELS[u] }))} onChange={(v) => setSetting('unit', v)} />
        </Field>
        <Field label="Grid size">
          <LengthInput value={settings.gridSize} min={1} onChange={(v) => setSetting('gridSize', v)} />
        </Field>
        <Field label="New wall thickness">
          <LengthInput value={settings.defaultWallThickness} min={1} onChange={(v) => setSetting('defaultWallThickness', v)} />
        </Field>
        <Toggle checked={settings.showGround} onChange={(v) => setSetting('showGround', v)} label="Show terrain in 3D" />
        <Field label="Terrain height" hint="Ground level relative to the zero level; use terrain platforms for slopes and raised lawns">
          <LengthInput value={settings.groundLevel ?? 0} onChange={(v) => setSetting('groundLevel', v)} />
        </Field>
        {settings.showGround && (
          <Field label="Terrain">
            <MaterialPicker value={settings.groundMaterial} onChange={(v) => setSetting('groundMaterial', v)} groups={['Exterior', 'Floor']} />
          </Field>
        )}
      </Section>

      <Section
        title="Levels"
        actions={
          <span className="section-actions">
            <button className="icon-btn" title="Add an empty level on top" onClick={() => addLevel(false)}>
              <Plus size={14} />
            </button>
            <button className="icon-btn" title="Add a level on top, copying walls, rooms and windows" onClick={() => addLevel(true)}>
              <Copy size={14} />
            </button>
          </span>
        }
      >
        <div className="level-list">
          {[...project.levels]
            .sort((a, b) => b.elevation - a.elevation)
            .map((l) => (
              <button key={l.id} className={`level-row ${l.id === activeLevelId ? 'active' : ''}`} onClick={() => setActiveLevel(l.id)}>
                <span>{l.name}</span>
                <em>{formatLength(l.elevation, unit)}</em>
              </button>
            ))}
        </div>
        {active && (
          <>
            <Field label="Name">
              <TextInput value={active.name} onChange={(v) => upLevel(active.id, { name: v })} />
            </Field>
            <div className="grid2">
              <Field label="Elevation">
                <LengthInput value={active.elevation} onChange={(v) => upLevel(active.id, { elevation: v })} />
              </Field>
              <Field label="Ceiling height">
                <LengthInput value={active.height} min={50} onChange={(v) => upLevel(active.id, { height: v })} />
              </Field>
              <Field label="Floor thickness">
                <LengthInput value={active.floorThickness} min={1} onChange={(v) => upLevel(active.id, { floorThickness: v })} />
              </Field>
            </div>
            <button
              className="btn"
              onClick={() =>
                mutate((d) => {
                  for (const w of d.walls) if (w.levelId === active.id && w.heightEnd === undefined) w.height = active.height;
                })
              }
            >
              Set all wall heights to ceiling height
            </button>
            {project.levels.length > 1 && (
              <button
                className="btn danger"
                onClick={() => {
                  if (armedDelete === active.id) {
                    setArmedDelete(null);
                    useStore.getState().setSelection([{ type: 'level', id: active.id }]);
                    useStore.getState().deleteSelection();
                  } else setArmedDelete(active.id);
                }}
                onBlur={() => setArmedDelete(null)}
              >
                <Trash2 size={14} /> {armedDelete === active.id ? `Delete "${active.name}" and everything on it? Click again` : 'Delete level'}
              </button>
            )}
          </>
        )}
      </Section>

      <Section title="Plan display">
        <Toggle checked={options.showGrid} onChange={(v) => setOption('showGrid', v)} label="Grid" />
        <Toggle checked={options.snapGrid} onChange={(v) => setOption('snapGrid', v)} label="Snap to grid" />
        <Toggle checked={options.snapObjects} onChange={(v) => setOption('snapObjects', v)} label="Magnetism (walls, corners, objects)" />
        <Toggle checked={options.showWallLengths} onChange={(v) => setOption('showWallLengths', v)} label="Wall lengths" />
        <Toggle checked={options.showDimensions} onChange={(v) => setOption('showDimensions', v)} label="Dimension lines" />
        <Toggle checked={options.showRoomLabels} onChange={(v) => setOption('showRoomLabels', v)} label="Room names & areas" />
        <Toggle checked={options.showFurniture} onChange={(v) => setOption('showFurniture', v)} label="Furniture" />
        <Toggle checked={options.showRoofsInPlan} onChange={(v) => setOption('showRoofsInPlan', v)} label="Roof outlines" />
      </Section>

      <Section title="3D view">
        <Toggle checked={options.show3DRoofs} onChange={(v) => setOption('show3DRoofs', v)} label="Roofs" />
        <Toggle checked={options.allLevels3D} onChange={(v) => setOption('allLevels3D', v)} label="Show levels above the current one" />
        <Toggle checked={options.cutaway} onChange={(v) => setOption('cutaway', v)} label="Cutaway (low walls on current level)" />
        <Toggle checked={options.ceilings} onChange={(v) => setOption('ceilings', v)} label="Ceilings (always on in walk mode)" />
        <Toggle checked={options.shadows} onChange={(v) => setOption('shadows', v)} label="Shadows" />
        <Toggle checked={options.lampLights} onChange={(v) => setOption('lampLights', v)} label="Lamps emit light" />
        <Field label="Sun direction">
          <input type="range" min={0} max={360} value={options.sunAzimuth} onChange={(e) => setOption('sunAzimuth', +e.target.value)} />
        </Field>
        <Field label="Sun height">
          <input type="range" min={2} max={90} value={options.sunElevation} onChange={(e) => setOption('sunElevation', +e.target.value)} />
        </Field>
      </Section>
    </div>
  );
}
