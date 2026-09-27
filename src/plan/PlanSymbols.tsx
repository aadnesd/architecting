import type { ReactNode } from 'react';
import type { Item, Opening, Wall } from '../model/types';
import { getMaterialDef } from '../model/materials';
import { wallDir } from '../geometry/walls';
import { isDoorKind } from '../model/catalog';

const INK = '#2b2f36';

/** Top-view symbol of an item, drawn in its local frame (centre at 0,0; front towards +y). */
export function ItemSymbol({ item, px, selected }: { item: Item; px: number; selected: boolean }) {
  const w = item.width;
  const d = item.depth;
  const hw = w / 2;
  const hd = d / 2;
  const sw = px * 1.2;
  const stroke = selected ? '#2f6fed' : INK;
  const fill = getMaterialDef(item.finish).color;
  const light = '#ffffff';
  const common = { stroke, strokeWidth: sw, fill: 'none' as const, vectorEffect: 'none' as const };
  const base = <rect x={-hw} y={-hd} width={w} height={d} fill={fill} fillOpacity={0.35} {...{ stroke, strokeWidth: sw }} />;
  let detail: ReactNode = null;
  let outline: ReactNode = base;

  switch (item.kind) {
    case 'sinkCabinet':
    case 'farmhouseSink':
      detail = (
        <>
          <rect x={-Math.min(hw - 8, 30)} y={-hd + 10} width={Math.min(w - 16, 60)} height={d - 22} rx={6} {...common} />
          <circle cx={0} cy={-hd + 6} r={2.5} {...common} />
        </>
      );
      break;
    case 'cooktopCabinet':
    case 'range':
    case 'classicRange':
      detail = (
        <>
          {[
            [-0.25, -0.2, 9],
            [0.25, -0.2, 7],
            [-0.25, 0.22, 7],
            [0.25, 0.22, 9],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x * w} cy={y * d} r={r} {...common} />
          ))}
        </>
      );
      break;
    case 'fridge':
    case 'ovenTower':
    case 'dishwasher':
    case 'washingMachine':
      detail = (
        <>
          <line x1={-hw} y1={-hd} x2={hw} y2={hd} {...common} strokeOpacity={0.4} />
          <line x1={hw} y1={-hd} x2={-hw} y2={hd} {...common} strokeOpacity={0.4} />
          <text x={0} y={0} fontSize={Math.min(w, d) * 0.22} textAnchor="middle" dominantBaseline="central" fill={INK}>
            {item.kind === 'fridge' ? 'REF' : item.kind === 'ovenTower' ? 'OV' : item.kind === 'dishwasher' ? 'DW' : 'WM'}
          </text>
        </>
      );
      break;
    case 'wallCabinet':
    case 'rangeHood':
    case 'mantelHood':
    case 'potRail':
    case 'openShelf':
    case 'mirrorCabinet':
    case 'beam':
      outline = <rect x={-hw} y={-hd} width={w} height={d} fill={fill} fillOpacity={0.15} stroke={stroke} strokeWidth={sw} strokeDasharray={`${px * 5} ${px * 3}`} />;
      if (item.kind === 'rangeHood')
        detail = (
          <>
            <line x1={-hw} y1={-hd} x2={hw} y2={hd} {...common} strokeDasharray={`${px * 5} ${px * 3}`} />
            <line x1={hw} y1={-hd} x2={-hw} y2={hd} {...common} strokeDasharray={`${px * 5} ${px * 3}`} />
          </>
        );
      break;
    case 'toilet':
    case 'wallToilet':
      outline = (
        <>
          <rect x={-hw} y={-hd} width={w} height={Math.min(18, d * 0.3)} rx={3} fill={light} stroke={stroke} strokeWidth={sw} />
          <ellipse cx={0} cy={-hd + d * 0.6} rx={hw * 0.9} ry={d * 0.38} fill={light} stroke={stroke} strokeWidth={sw} />
          <ellipse cx={0} cy={-hd + d * 0.62} rx={hw * 0.55} ry={d * 0.26} {...common} />
        </>
      );
      break;
    case 'vanity':
    case 'doubleVanity':
    case 'pedestalSink': {
      const n = item.kind === 'doubleVanity' ? 2 : 1;
      detail = (
        <>
          {Array.from({ length: n }, (_, i) => (
            <ellipse key={i} cx={n === 1 ? 0 : (i - 0.5) * hw} cy={2} rx={Math.min(hw / n - 6, 25)} ry={hd * 0.6} {...common} />
          ))}
        </>
      );
      if (item.kind === 'pedestalSink') outline = <ellipse cx={0} cy={0} rx={hw} ry={hd} fill={light} stroke={stroke} strokeWidth={sw} />;
      break;
    }
    case 'bathtub':
      detail = (
        <>
          <rect x={-hw + 7} y={-hd + 7} width={w - 14} height={d - 14} rx={Math.min(d, w) * 0.3} {...common} />
          <circle cx={-hw + 20} cy={0} r={2.5} {...common} />
        </>
      );
      break;
    case 'freestandingTub':
      outline = (
        <>
          <ellipse cx={0} cy={0} rx={hw} ry={hd} fill={light} stroke={stroke} strokeWidth={sw} />
          <ellipse cx={0} cy={0} rx={hw - 6} ry={hd - 6} {...common} />
        </>
      );
      break;
    case 'shower':
    case 'walkInShower':
      detail = (
        <>
          <line x1={-hw} y1={-hd} x2={hw} y2={hd} {...common} strokeOpacity={0.5} />
          <line x1={hw} y1={-hd} x2={-hw} y2={hd} {...common} strokeOpacity={0.5} />
          <circle cx={0} cy={0} r={3} {...common} />
          <line x1={hw - 1} y1={-hd} x2={hw - 1} y2={hd} stroke="#5aa0d8" strokeWidth={px * 2.5} />
          {item.kind === 'shower' && <line x1={-hw} y1={hd - 1} x2={hw} y2={hd - 1} stroke="#5aa0d8" strokeWidth={px * 2.5} />}
        </>
      );
      break;
    case 'bed':
    case 'singleBed': {
      const pillows = item.kind === 'bed' ? 2 : 1;
      detail = (
        <>
          <rect x={-hw} y={-hd} width={w} height={8} fill={INK} fillOpacity={0.2} />
          {Array.from({ length: pillows }, (_, i) => {
            const pw = w / pillows - 16;
            return <rect key={i} x={-hw + 8 + i * (w / pillows)} y={-hd + 14} width={pw} height={Math.min(40, d * 0.18)} rx={6} {...common} />;
          })}
          <line x1={-hw} y1={-hd + d * 0.35} x2={hw} y2={-hd + d * 0.35} {...common} />
          <line x1={-hw} y1={-hd + d * 0.35} x2={hw * 0.3} y2={-hd + d * 0.48} {...common} strokeOpacity={0.5} />
        </>
      );
      break;
    }
    case 'sofa':
    case 'armchair': {
      const arm = Math.min(20, w * 0.15);
      detail = (
        <>
          <rect x={-hw} y={-hd} width={w} height={20} {...common} />
          <rect x={-hw} y={-hd} width={arm} height={d} {...common} />
          <rect x={hw - arm} y={-hd} width={arm} height={d} {...common} />
          {item.kind === 'sofa' &&
            Array.from({ length: Math.max(1, Math.round((w - arm * 2) / 65)) - 1 }, (_, i) => {
              const seats = Math.max(1, Math.round((w - arm * 2) / 65));
              const x = -hw + arm + ((w - arm * 2) / seats) * (i + 1);
              return <line key={i} x1={x} y1={-hd + 20} x2={x} y2={hd} {...common} />;
            })}
        </>
      );
      break;
    }
    case 'chair':
    case 'barStool':
    case 'officeChair':
      if (item.kind === 'barStool') outline = <circle cx={0} cy={0} r={Math.min(hw, hd)} fill={fill} fillOpacity={0.35} stroke={stroke} strokeWidth={sw} />;
      else detail = <rect x={-hw} y={-hd} width={w} height={Math.max(4, d * 0.12)} fill={INK} fillOpacity={0.3} />;
      break;
    case 'roundTable':
    case 'plant':
    case 'cylinder':
    case 'shrub':
      outline = <ellipse cx={0} cy={0} rx={hw} ry={hd} fill={fill} fillOpacity={item.kind === 'shrub' ? 0.6 : 0.35} stroke={stroke} strokeWidth={sw} />;
      break;
    case 'tree':
    case 'conifer': {
      const n = 14;
      const pts = Array.from({ length: n * 2 }, (_, i) => {
        const a = (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 ? 0.86 : 1;
        return `${Math.cos(a) * hw * r},${Math.sin(a) * hd * r}`;
      }).join(' ');
      outline = (
        <>
          <polygon points={pts} fill={getMaterialDef(item.accent).color} fillOpacity={0.45} stroke={stroke} strokeWidth={sw} />
          <circle cx={0} cy={0} r={Math.max(5, w * 0.04)} fill={getMaterialDef(item.finish).color} />
        </>
      );
      break;
    }
    case 'pendantLamp':
    case 'ceilingLight':
    case 'floorLamp':
    case 'wallLight':
      outline = (
        <>
          <circle cx={0} cy={0} r={Math.min(hw, hd)} fill="#fff6d6" stroke={stroke} strokeWidth={sw} />
          <line x1={-hw} y1={0} x2={hw} y2={0} {...common} />
          <line x1={0} y1={-hd} x2={0} y2={hd} {...common} />
        </>
      );
      break;
    case 'stairs': {
      const steps = Math.max(2, Math.round(item.height / 18));
      const run = d / steps;
      detail = (
        <>
          {Array.from({ length: steps - 1 }, (_, i) => (
            <line key={i} x1={-hw} y1={hd - run * (i + 1)} x2={hw} y2={hd - run * (i + 1)} {...common} />
          ))}
          <line x1={0} y1={hd - run / 2} x2={0} y2={-hd + run} {...common} />
          <polyline points={`${-6},${-hd + run + 8} 0,${-hd + run} 6,${-hd + run + 8}`} {...common} />
          <text x={0} y={hd - 4} fontSize={Math.min(12, w * 0.15)} textAnchor="middle" fill={INK}>
            UP
          </text>
        </>
      );
      break;
    }
    case 'column':
      detail = (
        <>
          <line x1={-hw} y1={-hd} x2={hw} y2={hd} {...common} />
          <line x1={hw} y1={-hd} x2={-hw} y2={hd} {...common} />
        </>
      );
      break;
    case 'rug':
      outline = <rect x={-hw} y={-hd} width={w} height={d} fill={fill} fillOpacity={0.3} stroke={stroke} strokeWidth={sw} strokeDasharray={`${px * 2} ${px * 2}`} />;
      break;
    case 'diningTable':
    case 'desk':
    case 'coffeeTable':
      detail = <rect x={-hw + 4} y={-hd + 4} width={w - 8} height={d - 8} {...common} strokeOpacity={0.3} />;
      break;
    case 'car':
      outline = (
        <>
          <rect x={-hw} y={-hd} width={w} height={d} rx={Math.min(w, d) * 0.2} fill={fill} fillOpacity={0.4} stroke={stroke} strokeWidth={sw} />
          <rect x={-hw + 18} y={-hd + d * 0.22} width={w - 36} height={d * 0.5} rx={12} {...common} />
        </>
      );
      break;
    case 'island':
    case 'baseCabinet':
    case 'drawerCabinet':
    case 'cornerCabinet':
    case 'tallCabinet':
      detail = <line x1={-hw} y1={hd - 2} x2={hw} y2={hd - 2} {...common} strokeOpacity={0.5} />;
      break;
  }

  return (
    <>
      {outline}
      {detail}
    </>
  );
}

/** Plan symbol of a door or window, drawn in the wall's frame: x along the wall from a, y towards the wall's right. */
export function OpeningSymbol({ wall, opening, px, selected }: { wall: Wall; opening: Opening; px: number; selected: boolean }) {
  const d = wallDir(wall);
  const angle = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  const t = wall.thickness;
  const w = opening.width;
  const hw = w / 2;
  const ink = selected ? '#2f6fed' : INK;
  const sw = px * 1.2;
  const side = opening.flipSide ? 1 : -1; // +1 = right side (local +y)
  const hinge = opening.flipHinge ? 1 : -1;
  const door = isDoorKind(opening.kind);
  let sym: ReactNode = null;
  const jambs = (
    <>
      <line x1={-hw} y1={-t / 2} x2={-hw} y2={t / 2} stroke={ink} strokeWidth={sw * 1.5} />
      <line x1={hw} y1={-t / 2} x2={hw} y2={t / 2} stroke={ink} strokeWidth={sw * 1.5} />
    </>
  );

  if (door) {
    switch (opening.kind) {
      case 'door': {
        const hx = hinge * hw;
        const leafEnd = { x: hx, y: side * (t / 2 + w) };
        const other = { x: -hx, y: side * (t / 2) };
        const sweep = (hinge === -1) === (side === 1) ? 1 : 0;
        sym = (
          <>
            <line x1={hx} y1={side * (t / 2)} x2={leafEnd.x} y2={leafEnd.y} stroke={ink} strokeWidth={sw * 2} />
            <path d={`M ${leafEnd.x} ${leafEnd.y} A ${w} ${w} 0 0 ${sweep} ${other.x} ${other.y}`} fill="none" stroke={ink} strokeWidth={sw} strokeDasharray={`${px * 4} ${px * 3}`} />
          </>
        );
        break;
      }
      case 'doubleDoor': {
        const leaf = w / 2;
        sym = (
          <>
            {[-1, 1].map((h) => {
              const hx = h * hw;
              const end = { x: hx, y: side * (t / 2 + leaf) };
              const mid = { x: 0, y: side * (t / 2) };
              const sweep = (h === -1) === (side === 1) ? 1 : 0;
              return (
                <g key={h}>
                  <line x1={hx} y1={side * (t / 2)} x2={end.x} y2={end.y} stroke={ink} strokeWidth={sw * 2} />
                  <path d={`M ${end.x} ${end.y} A ${leaf} ${leaf} 0 0 ${sweep} ${mid.x} ${mid.y}`} fill="none" stroke={ink} strokeWidth={sw} strokeDasharray={`${px * 4} ${px * 3}`} />
                </g>
              );
            })}
          </>
        );
        break;
      }
      case 'slidingDoor':
        sym = (
          <>
            <rect x={-hw} y={-4} width={w * 0.55} height={3} fill="#fff" stroke={ink} strokeWidth={sw} />
            <rect x={hw - w * 0.55} y={1} width={w * 0.55} height={3} fill="#fff" stroke={ink} strokeWidth={sw} />
          </>
        );
        break;
      case 'pocketDoor':
        sym = <line x1={-hw} y1={0} x2={hw} y2={0} stroke={ink} strokeWidth={sw * 2} strokeDasharray={`${px * 6} ${px * 3}`} />;
        break;
      case 'garageDoor':
        sym = <line x1={-hw} y1={side * (t / 2 + 20)} x2={hw} y2={side * (t / 2 + 20)} stroke={ink} strokeWidth={sw} strokeDasharray={`${px * 8} ${px * 4}`} />;
        break;
      case 'archway':
        break;
    }
  } else {
    sym = (
      <>
        <line x1={-hw} y1={-t / 2 + 1} x2={hw} y2={-t / 2 + 1} stroke={ink} strokeWidth={sw} />
        <line x1={-hw} y1={0} x2={hw} y2={0} stroke={ink} strokeWidth={sw * 1.6} />
        <line x1={-hw} y1={t / 2 - 1} x2={hw} y2={t / 2 - 1} stroke={ink} strokeWidth={sw} />
        {opening.kind === 'doubleWindow' && <line x1={0} y1={-t / 2} x2={0} y2={t / 2} stroke={ink} strokeWidth={sw} />}
      </>
    );
  }

  return (
    <g transform={`translate(${wall.a.x} ${wall.a.y}) rotate(${angle}) translate(${opening.offset} 0)`}>
      <rect x={-hw} y={-t / 2 - 0.5} width={w} height={t + 1} fill={selected ? '#dce7ff' : '#ffffff'} />
      {jambs}
      {sym}
    </g>
  );
}
