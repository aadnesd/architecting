import type { Draft } from 'immer';
import { useStore } from '../store/store';
import type { Dimension, Item, Label, Opening, OpeningKind, Project, Roof, RoofType, Room, Wall } from '../model/types';
import { Field, LengthInput, MaterialPicker, NumberInput, Section, Select, TextInput, Toggle } from './inputs';
import { add, angleOf, dist, normalize, polygonArea, polygonPerimeter, rad, scale, sub } from '../geometry/math';
import { clampOpeningOffset, splitWallAt, wallLength } from '../geometry/walls';
import { formatArea, formatLength } from '../geometry/units';
import { OPENING_PRESETS, isDoorKind } from '../model/catalog';
import { uid } from '../model/factory';
import { buildRoofGeometry } from '../geometry/roof';
import { Copy, FlipHorizontal, Lock, RotateCw, Scissors, Trash2, Unlock } from 'lucide-react';

/** Items with doors or drawers, whose front style and hardware can be chosen. */
const FRONTED = new Set(['baseCabinet', 'drawerCabinet', 'cornerCabinet', 'sinkCabinet', 'farmhouseSink', 'cooktopCabinet', 'dishwasher', 'wallCabinet', 'tallCabinet', 'ovenTower', 'hutch', 'windowSeat', 'vanity', 'doubleVanity', 'nightstand', 'dresser', 'wardrobe', 'tvUnit']);

type Coll = 'walls' | 'openings' | 'rooms' | 'items' | 'roofs' | 'dimensions' | 'labels';

function useUpdater<T extends { id: string }>(coll: Coll, id: string) {
  const mutate = useStore((s) => s.mutate);
  return (patch: Partial<T> | ((x: Draft<T>, d: Draft<Project>) => void)) =>
    mutate((d) => {
      const list = d[coll] as unknown as Draft<T>[];
      const x = list.find((e) => e.id === id);
      if (!x) return;
      if (typeof patch === 'function') patch(x, d);
      else Object.assign(x, patch);
    });
}

function DeleteButton() {
  const del = useStore((s) => s.deleteSelection);
  return (
    <button className="btn danger" onClick={del} title="Delete (Del)">
      <Trash2 size={14} /> Delete
    </button>
  );
}

function WallProps({ wall }: { wall: Wall }) {
  const up = useUpdater<Wall>('walls', wall.id);
  const mutate = useStore((s) => s.mutate);
  const L = wallLength(wall);
  const ang = angleOf(wall.a, wall.b);
  const sloped = wall.heightEnd !== undefined;
  return (
    <>
      <Section title="Wall">
        <Field label="Length" hint="Moves the end point along the wall direction">
          <LengthInput
            value={L}
            min={1}
            onChange={(v) =>
              up((w, d) => {
                const old = { ...w.b };
                const nb = add(w.a, scale(normalize(sub(w.b, w.a)), v));
                // Drag connected walls along with the moved end point
                for (const o of d.walls) {
                  if (o.levelId !== w.levelId) continue;
                  if (dist(o.a, old) < 0.5) o.a = { ...nb };
                  if (dist(o.b, old) < 0.5) o.b = { ...nb };
                }
              })
            }
          />
        </Field>
        <Field label="Angle">
          <NumberInput
            value={+(((-ang % 360) + 360) % 360).toFixed(1)}
            suffix="°"
            onChange={(deg) =>
              up((w) => {
                const r = rad(-deg);
                w.b = add(w.a, { x: Math.cos(r) * L, y: Math.sin(r) * L });
              })
            }
          />
        </Field>
        <Field label="Thickness">
          <LengthInput value={wall.thickness} min={1} onChange={(v) => up({ thickness: v })} />
        </Field>
        <Field label={sloped ? 'Height at start' : 'Height'}>
          <LengthInput value={wall.height} min={1} onChange={(v) => up({ height: v })} />
        </Field>
        <Toggle checked={sloped} onChange={(v) => up((w) => void (w.heightEnd = v ? w.height : undefined))} label="Sloped top (e.g. under a slanted roof)" />
        {sloped && (
          <Field label="Height at end">
            <LengthInput value={wall.heightEnd!} min={1} onChange={(v) => up({ heightEnd: v })} />
          </Field>
        )}
      </Section>
      <Section title="Finishes">
        <Field label="Left side" hint="Looking from the start point towards the end point">
          <MaterialPicker value={wall.leftMaterial} onChange={(v) => up({ leftMaterial: v })} />
        </Field>
        <Field label="Right side">
          <MaterialPicker value={wall.rightMaterial} onChange={(v) => up({ rightMaterial: v })} />
        </Field>
        <button className="btn" onClick={() => up({ leftMaterial: wall.rightMaterial, rightMaterial: wall.leftMaterial })}>
          Swap sides
        </button>
      </Section>
      <div className="actions">
        <button
          className="btn"
          title="Split the wall in two at its midpoint"
          onClick={() =>
            mutate((d) => {
              const idx = d.walls.findIndex((w) => w.id === wall.id);
              const [w1, w2] = splitWallAt(wall, L / 2, uid('wall'));
              d.walls.splice(idx, 1, w1, w2);
              for (const o of d.openings)
                if (o.wallId === wall.id && o.offset > L / 2) {
                  o.wallId = w2.id;
                  o.offset -= L / 2;
                }
            })
          }
        >
          <Scissors size={14} /> Split
        </button>
        <DeleteButton />
      </div>
    </>
  );
}

function OpeningProps({ opening, wall }: { opening: Opening; wall: Wall }) {
  const up = useUpdater<Opening>('openings', opening.id);
  const L = wallLength(wall);
  const door = isDoorKind(opening.kind);
  return (
    <>
      <Section title={door ? 'Door' : 'Window'}>
        <Field label="Type">
          <Select<OpeningKind> value={opening.kind} options={OPENING_PRESETS.map((o) => ({ value: o.kind, label: o.name }))} onChange={(v) => up({ kind: v })} />
        </Field>
        <Field label="Width">
          <LengthInput value={opening.width} min={10} onChange={(v) => up((o) => void ((o.width = Math.min(v, L)), (o.offset = clampOpeningOffset(wall, o.width, o.offset))))} />
        </Field>
        <Field label="Height">
          <LengthInput value={opening.height} min={10} onChange={(v) => up({ height: v })} />
        </Field>
        <Field label={door ? 'Threshold' : 'Sill height'}>
          <LengthInput value={opening.sill} min={0} onChange={(v) => up({ sill: v })} />
        </Field>
        <Field label="From wall start" hint="Distance from the wall's start point to the near edge of the opening">
          <LengthInput value={opening.offset - opening.width / 2} min={0} onChange={(v) => up({ offset: clampOpeningOffset(wall, opening.width, v + opening.width / 2) })} />
        </Field>
        <Field label="From wall end">
          <LengthInput value={L - opening.offset - opening.width / 2} min={0} onChange={(v) => up({ offset: clampOpeningOffset(wall, opening.width, L - v - opening.width / 2) })} />
        </Field>
        {door && (
          <>
            <Toggle checked={opening.flipHinge} onChange={(v) => up({ flipHinge: v })} label="Hinge on the other side" />
            <Toggle checked={opening.flipSide} onChange={(v) => up({ flipSide: v })} label="Open to the other side" />
          </>
        )}
      </Section>
      <Section title="Finishes">
        <Field label="Frame">
          <MaterialPicker value={opening.frameColor} onChange={(v) => up({ frameColor: v })} />
        </Field>
        {door && (
          <Field label="Door leaf">
            <MaterialPicker value={opening.panelColor} onChange={(v) => up({ panelColor: v })} />
          </Field>
        )}
      </Section>
      <div className="actions">
        <DeleteButton />
      </div>
    </>
  );
}

function RoomProps({ room }: { room: Room }) {
  const up = useUpdater<Room>('rooms', room.id);
  const unit = useStore((s) => s.project.settings.unit);
  return (
    <>
      <Section title="Room">
        <Field label="Name">
          <TextInput value={room.name} onChange={(v) => up({ name: v })} />
        </Field>
        <div className="readout">
          <span>Floor area</span>
          <strong>{formatArea(Math.abs(polygonArea(room.points)), unit)}</strong>
        </div>
        <div className="readout">
          <span>Perimeter</span>
          <strong>{formatLength(polygonPerimeter(room.points), unit)}</strong>
        </div>
        <Field label="Floor">
          <MaterialPicker value={room.floorMaterial} onChange={(v) => up({ floorMaterial: v })} />
        </Field>
        <Toggle checked={room.showCeiling} onChange={(v) => up({ showCeiling: v })} label="Ceiling" />
        {room.showCeiling && (
          <Field label="Ceiling finish">
            <MaterialPicker value={room.ceilingMaterial} onChange={(v) => up({ ceilingMaterial: v })} />
          </Field>
        )}
      </Section>
      <div className="actions">
        <DeleteButton />
      </div>
    </>
  );
}

function ItemProps({ item }: { item: Item }) {
  const up = useUpdater<Item>('items', item.id);
  const dup = useStore((s) => s.duplicateSelection);
  const dis = !!item.locked;
  return (
    <>
      <Section title="Object">
        <Field label="Name">
          <TextInput value={item.name} onChange={(v) => up({ name: v })} />
        </Field>
        <div className="grid2">
          <Field label="X">
            <LengthInput value={item.x} onChange={(v) => up({ x: v })} disabled={dis} />
          </Field>
          <Field label="Y">
            <LengthInput value={item.y} onChange={(v) => up({ y: v })} disabled={dis} />
          </Field>
          <Field label="Width">
            <LengthInput value={item.width} min={1} onChange={(v) => up({ width: v })} disabled={dis} />
          </Field>
          <Field label="Depth">
            <LengthInput value={item.depth} min={0.5} onChange={(v) => up({ depth: v })} disabled={dis} />
          </Field>
          <Field label="Height">
            <LengthInput value={item.height} min={0.5} onChange={(v) => up({ height: v })} disabled={dis} />
          </Field>
          <Field label="Elevation" hint="Height of the underside above the floor">
            <LengthInput value={item.elevation} onChange={(v) => up({ elevation: v })} disabled={dis} />
          </Field>
        </div>
        <Field label="Rotation">
          <NumberInput value={item.rotation} suffix="°" onChange={(v) => up({ rotation: ((v % 360) + 360) % 360 })} />
        </Field>
        {(item.kind === 'skylight' || item.tilt) && (
          <Field label="Tilt" hint="Tilt around the width axis, e.g. the roof pitch for a roof window">
            <NumberInput value={item.tilt ?? 0} min={-90} max={90} suffix="°" onChange={(v) => up({ tilt: v })} />
          </Field>
        )}
      </Section>
      <Section title="Finishes">
        <Field label="Main">
          <MaterialPicker value={item.finish} onChange={(v) => up({ finish: v })} />
        </Field>
        <Field label="Accent" hint="Worktop, handles, frame, cushions… depending on the object">
          <MaterialPicker value={item.accent} onChange={(v) => up({ accent: v })} />
        </Field>
        {FRONTED.has(item.kind) && (
          <>
            <Field label="Front style">
              <Select<'flat' | 'shaker'>
                value={item.frontStyle ?? 'flat'}
                options={[
                  { value: 'flat', label: 'Flat (slab)' },
                  { value: 'shaker', label: 'Shaker (frame and panel)' },
                ]}
                onChange={(v) => up({ frontStyle: v })}
              />
            </Field>
            <Field label="Handles and taps">
              <MaterialPicker value={item.hardware ?? 'steel'} onChange={(v) => up({ hardware: v })} groups={['Metal & glass']} />
            </Field>
          </>
        )}
      </Section>
      <div className="actions">
        <button className="btn" onClick={() => up({ rotation: (item.rotation + 90) % 360 })} disabled={dis} title="Rotate 90° (R)">
          <RotateCw size={14} /> 90°
        </button>
        <button className="btn" onClick={() => up({ mirrored: !item.mirrored })} disabled={dis} title="Mirror">
          <FlipHorizontal size={14} />
        </button>
        <button className="btn" onClick={dup} title="Duplicate (Ctrl+D)">
          <Copy size={14} />
        </button>
        <button className="btn" onClick={() => up({ locked: !item.locked })} title={item.locked ? 'Unlock' : 'Lock position'}>
          {item.locked ? <Unlock size={14} /> : <Lock size={14} />}
        </button>
        <DeleteButton />
      </div>
    </>
  );
}

const ROOF_TYPES: { value: RoofType; label: string }[] = [
  { value: 'gable', label: 'Gable (saddle)' },
  { value: 'hip', label: 'Hip' },
  { value: 'shed', label: 'Shed / mono-pitch (slanted)' },
  { value: 'flat', label: 'Flat' },
  { value: 'gambrel', label: 'Gambrel (barn)' },
  { value: 'mansard', label: 'Mansard' },
];

function RoofProps({ roof }: { roof: Roof }) {
  const up = useUpdater<Roof>('roofs', roof.id);
  const unit = useStore((s) => s.project.settings.unit);
  const g = buildRoofGeometry(roof);
  // Sloped surface area from the face polygons (Newell's method).
  let area = 0;
  for (const f of g.faces) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < f.length; i++) {
      const a = f[i];
      const b = f[(i + 1) % f.length];
      nx += (a.y - b.y) * (a.h + b.h);
      ny += (a.h - b.h) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    }
    area += Math.hypot(nx, ny, nz) / 2;
  }
  return (
    <>
      <Section title="Roof">
        <Field label="Type">
          <Select<RoofType> value={roof.type} options={ROOF_TYPES} onChange={(v) => up({ type: v })} />
        </Field>
        {roof.type !== 'flat' && (
          <Field label="Pitch">
            <NumberInput value={roof.pitch} min={0} max={80} suffix="°" onChange={(v) => up({ pitch: v })} />
          </Field>
        )}
        {roof.type !== 'flat' && (
          <Field label="Ridge direction">
            <Select value={roof.ridgeAlong} options={[{ value: 'width', label: 'Along width' }, { value: 'depth', label: 'Along depth' }]} onChange={(v) => up({ ridgeAlong: v })} />
          </Field>
        )}
        <div className="grid2">
          <Field label="Centre X">
            <LengthInput value={roof.x} onChange={(v) => up({ x: v })} />
          </Field>
          <Field label="Centre Y">
            <LengthInput value={roof.y} onChange={(v) => up({ y: v })} />
          </Field>
          <Field label="Width">
            <LengthInput value={roof.width} min={20} onChange={(v) => up({ width: v })} />
          </Field>
          <Field label="Depth">
            <LengthInput value={roof.depth} min={20} onChange={(v) => up({ depth: v })} />
          </Field>
          <Field label="Eave height" hint="Height of the roof underside at the outer wall line, above this level's floor">
            <LengthInput value={roof.baseHeight} onChange={(v) => up({ baseHeight: v })} />
          </Field>
          <Field label="Overhang">
            <LengthInput value={roof.overhang} min={0} onChange={(v) => up({ overhang: v })} />
          </Field>
          <Field label="Thickness">
            <LengthInput value={roof.thickness} min={1} onChange={(v) => up({ thickness: v })} />
          </Field>
          <Field label="Rotation">
            <NumberInput value={roof.rotation} suffix="°" onChange={(v) => up({ rotation: v })} />
          </Field>
        </div>
        <div className="readout">
          <span>Ridge height</span>
          <strong>{formatLength(g.ridgeHeight + roof.thickness, unit)}</strong>
        </div>
        <div className="readout">
          <span>Roof area</span>
          <strong>{formatArea(area, unit)}</strong>
        </div>
      </Section>
      <Section title="Finishes">
        <Field label="Roofing">
          <MaterialPicker value={roof.material} onChange={(v) => up({ material: v })} />
        </Field>
        <Field label="Fascia & soffit" hint="Edge boards and the underside of the overhang">
          <MaterialPicker value={roof.fasciaMaterial ?? roof.material} onChange={(v) => up({ fasciaMaterial: v })} />
        </Field>
        {['gable', 'shed', 'gambrel'].includes(roof.type) && (
          <>
            <Toggle checked={roof.gableWalls} onChange={(v) => up({ gableWalls: v })} label="Close gable ends with walls" />
            {roof.gableWalls && (
              <Field label="Gable walls">
                <MaterialPicker value={roof.gableMaterial} onChange={(v) => up({ gableMaterial: v })} />
              </Field>
            )}
          </>
        )}
      </Section>
      <div className="actions">
        <DeleteButton />
      </div>
    </>
  );
}

function DimensionProps({ dim }: { dim: Dimension }) {
  const up = useUpdater<Dimension>('dimensions', dim.id);
  return (
    <>
      <Section title="Dimension">
        <Field label="Length" hint="Editing moves the second point">
          <LengthInput value={dist(dim.a, dim.b)} min={1} onChange={(v) => up((d) => void (d.b = add(d.a, scale(normalize(sub(d.b, d.a)), v))))} />
        </Field>
        <Field label="Offset">
          <LengthInput value={dim.offset} onChange={(v) => up({ offset: v })} />
        </Field>
      </Section>
      <div className="actions">
        <DeleteButton />
      </div>
    </>
  );
}

function LabelProps({ label }: { label: Label }) {
  const up = useUpdater<Label>('labels', label.id);
  return (
    <>
      <Section title="Text">
        <Field label="Text">
          <TextInput value={label.text} onChange={(v) => up({ text: v })} />
        </Field>
        <Field label="Size">
          <LengthInput value={label.size} min={2} onChange={(v) => up({ size: v })} />
        </Field>
      </Section>
      <div className="actions">
        <DeleteButton />
      </div>
    </>
  );
}

export default function PropertiesPanel() {
  const selection = useStore((s) => s.selection);
  const project = useStore((s) => s.project);
  if (!selection.length)
    return (
      <div className="props-empty">
        <p>Select something in the plan or the 3D view to edit its properties.</p>
        <ul>
          <li>
            <b>Measurements</b> accept units and maths: <code>2.4m</code>, <code>8'6"</code>, <code>240+15</code>.
          </li>
          <li>
            While drawing walls, <b>type a length</b> and press Enter.
          </li>
          <li>
            <b>Double-click</b> inside walls to create a room floor automatically.
          </li>
          <li>
            Hold <b>Alt</b> to turn snapping off temporarily.
          </li>
        </ul>
      </div>
    );
  if (selection.length > 1)
    return (
      <div className="props">
        <Section title={`${selection.length} objects selected`}>
          <p className="muted">Drag in the plan to move them together, or use the arrow keys (Shift for 10× steps).</p>
        </Section>
        <div className="actions">
          <DeleteButton />
        </div>
      </div>
    );
  const s = selection[0];
  let body = null;
  switch (s.type) {
    case 'wall': {
      const w = project.walls.find((x) => x.id === s.id);
      if (w) body = <WallProps wall={w} />;
      break;
    }
    case 'opening': {
      const o = project.openings.find((x) => x.id === s.id);
      const w = o && project.walls.find((x) => x.id === o.wallId);
      if (o && w) body = <OpeningProps opening={o} wall={w} />;
      break;
    }
    case 'room': {
      const r = project.rooms.find((x) => x.id === s.id);
      if (r) body = <RoomProps room={r} />;
      break;
    }
    case 'item': {
      const i = project.items.find((x) => x.id === s.id);
      if (i) body = <ItemProps item={i} />;
      break;
    }
    case 'roof': {
      const r = project.roofs.find((x) => x.id === s.id);
      if (r) body = <RoofProps roof={r} />;
      break;
    }
    case 'dimension': {
      const d = project.dimensions.find((x) => x.id === s.id);
      if (d) body = <DimensionProps dim={d} />;
      break;
    }
    case 'label': {
      const l = project.labels.find((x) => x.id === s.id);
      if (l) body = <LabelProps label={l} />;
      break;
    }
  }
  return <div className="props" key={s.id}>{body}</div>;
}
