import type { ReactNode } from 'react';
import type { Opening, Wall } from '../model/types';
import { wallDir } from '../geometry/walls';
import { getMaterial } from './textures';

const M = 0.01;

function Box({ p, s, m }: { p: [number, number, number]; s: [number, number, number]; m: string }) {
  return (
    <mesh position={p} material={getMaterial(m)} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** Rectangular frame of bars around (w x h), centred on x = 0, bottom at y = 0. */
function Frame({ w, h, t, depth, m, bottom = true }: { w: number; h: number; t: number; depth: number; m: string; bottom?: boolean }) {
  return (
    <>
      <Box p={[-w / 2 + t / 2, h / 2, 0]} s={[t, h, depth]} m={m} />
      <Box p={[w / 2 - t / 2, h / 2, 0]} s={[t, h, depth]} m={m} />
      <Box p={[0, h - t / 2, 0]} s={[w, t, depth]} m={m} />
      {bottom && <Box p={[0, t / 2, 0]} s={[w, t, depth]} m={m} />}
    </>
  );
}

/** Glazed sash: frame + glass, centred at x, bottom at y0; optional glazing bars (muntins). */
function Sash({ x = 0, y0 = 0, w, h, z = 0, frame, bars = 0.05, muntins = false }: { x?: number; y0?: number; w: number; h: number; z?: number; frame: string; bars?: number; muntins?: boolean }) {
  return (
    <group position={[x, y0, z]}>
      <Frame w={w} h={h} t={bars} depth={0.06} m={frame} />
      <Box p={[0, h / 2, 0]} s={[w - bars * 2, h - bars * 2, 0.008]} m="glass" />
      {muntins && (
        <>
          <Box p={[0, h * 0.62, 0]} s={[w - bars * 2, 0.025, 0.04]} m={frame} />
          {w > 0.7 && <Box p={[0, h / 2, 0]} s={[0.025, h - bars * 2, 0.04]} m={frame} />}
        </>
      )}
    </group>
  );
}

/** Flat trim boards (architrave) around an opening on both faces of the wall. */
function Trim({ w, h, T, m, bottom }: { w: number; h: number; T: number; m: string; bottom: boolean }) {
  const b = 0.09;
  const d = 0.022;
  return (
    <>
      {[1, -1].map((side) => (
        <group key={side} position={[0, 0, side * (T / 2 + d / 2)]}>
          <Box p={[-w / 2 - b / 2, (h + b) / 2, 0]} s={[b, h + b, d]} m={m} />
          <Box p={[w / 2 + b / 2, (h + b) / 2, 0]} s={[b, h + b, d]} m={m} />
          <Box p={[0, h + b / 2, 0]} s={[w + b * 2, b, d]} m={m} />
          {bottom && <Box p={[0, -b / 2, 0]} s={[w + b * 2, b, d]} m={m} />}
        </group>
      ))}
    </>
  );
}

export function OpeningModel({ wall, opening }: { wall: Wall; opening: Opening }) {
  const d = wallDir(wall);
  const cx = wall.a.x + d.x * opening.offset;
  const cy = wall.a.y + d.y * opening.offset;
  const angle = Math.atan2(d.y, d.x);
  const W = opening.width * M;
  const H = opening.height * M;
  const T = wall.thickness * M;
  const frame = opening.frameColor;
  const panel = opening.panelColor;
  const ft = 0.05; // frame bar size
  const depth = T + 0.02;
  // Local +z points to the wall's right side; doors swing towards flipSide.
  const side = opening.flipSide ? 1 : -1;
  const hinge = opening.flipHinge ? 1 : -1;

  let body: ReactNode = null;
  switch (opening.kind) {
    case 'door':
    case 'doubleDoor': {
      const leaves = opening.kind === 'doubleDoor' ? 2 : 1;
      const lw = (W - ft * 2) / leaves;
      body = (
        <>
          <Frame w={W} h={H} t={ft} depth={depth} m={frame} bottom={false} />
          {Array.from({ length: leaves }, (_, i) => {
            const hx = leaves === 1 ? hinge * (W / 2 - ft) : (i === 0 ? -1 : 1) * (W / 2 - ft);
            const dirSign = hx < 0 ? 1 : -1;
            return (
              <group key={i} position={[hx, 0, side * (T / 2 - 0.03)]}>
                <Box p={[(dirSign * lw) / 2, (H - ft) / 2, 0]} s={[lw - 0.004, H - ft - 0.01, 0.04]} m={panel} />
                <Box p={[dirSign * (lw - 0.07), H * 0.47, side * 0.04]} s={[0.12, 0.02, 0.02]} m="steel" />
                <Box p={[dirSign * (lw - 0.07), H * 0.47, -side * 0.04]} s={[0.12, 0.02, 0.02]} m="steel" />
              </group>
            );
          })}
        </>
      );
      break;
    }
    case 'slidingDoor': {
      const pw = (W - ft * 2) / 2 + 0.03;
      body = (
        <>
          <Frame w={W} h={H} t={ft} depth={depth} m={frame} />
          <Sash x={-(W - ft * 2) / 4 - 0.015} y0={ft} w={pw} h={H - ft * 2} z={-0.035} frame={frame} bars={0.06} />
          <Sash x={(W - ft * 2) / 4 + 0.015} y0={ft} w={pw} h={H - ft * 2} z={0.035} frame={frame} bars={0.06} />
        </>
      );
      break;
    }
    case 'pocketDoor':
      body = (
        <>
          <Frame w={W} h={H} t={ft * 0.6} depth={depth} m={frame} bottom={false} />
          <Box p={[hinge * W * 0.35, (H - ft) / 2, 0]} s={[W - ft, H - ft - 0.01, 0.04]} m={panel} />
        </>
      );
      break;
    case 'garageDoor': {
      const n = 5;
      body = (
        <>
          <Frame w={W} h={H} t={ft} depth={depth} m={frame} bottom={false} />
          {Array.from({ length: n }, (_, i) => (
            <Box key={i} p={[0, ((H - ft) * (i + 0.5)) / n, 0]} s={[W - ft * 2, (H - ft) / n - 0.01, 0.045]} m={panel} />
          ))}
        </>
      );
      break;
    }
    case 'archway':
      body = <Frame w={W} h={H} t={0.02} depth={depth + 0.01} m={frame} bottom={false} />;
      break;
    case 'window':
    case 'doubleWindow':
    case 'fixedWindow':
    case 'tallWindow': {
      const n = opening.kind === 'doubleWindow' ? 2 : opening.kind === 'fixedWindow' ? 1 : 1;
      const iw = W - ft * 2;
      const ih = H - ft * 2;
      body = (
        <>
          <Frame w={W} h={H} t={ft} depth={0.1} m={frame} />
          {opening.kind === 'fixedWindow' ? (
            <Box p={[0, H / 2, 0]} s={[iw, ih, 0.01]} m="glass" />
          ) : opening.kind === 'tallWindow' ? (
            <>
              <Sash y0={ft} w={iw} h={ih * 0.78} frame={frame} muntins />
              <Sash y0={ft + ih * 0.78} w={iw} h={ih * 0.22} frame={frame} />
            </>
          ) : (
            Array.from({ length: n }, (_, i) => <Sash key={i} x={-iw / 2 + (iw / n) * (i + 0.5)} y0={ft} w={iw / n} h={ih} frame={frame} muntins />)
          )}
          {opening.sill > 20 && (
            <>
              <Box p={[0, -0.015, T / 2]} s={[W + 0.06, 0.03, 0.08]} m="paint-white" />
              <Box p={[0, -0.015, -T / 2 - 0.02]} s={[W + 0.08, 0.03, 0.08]} m="aluminium" />
            </>
          )}
        </>
      );
      break;
    }
  }

  const trimmed = opening.kind !== 'archway' && opening.kind !== 'pocketDoor';
  return (
    <group position={[cx * M, opening.sill * M, cy * M]} rotation={[0, -angle, 0]} userData={{ selectable: { type: 'opening', id: opening.id } }}>
      {body}
      {trimmed && <Trim w={W} h={H} T={T} m={frame} bottom={false} />}
    </group>
  );
}
