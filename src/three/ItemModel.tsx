import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Item, MaterialRef } from '../model/types';
import { getMaterial } from './textures';
import { planarUV } from './buildGeometry';

// Procedural furniture. Local frame: origin at the footprint centre on the floor, x = width,
// y = up, z = depth with the front of the object facing +z. All sizes in metres.

const geoCache = new Map<string, THREE.BufferGeometry>();

function boxGeo(w: number, h: number, d: number) {
  const key = `b${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = planarUV(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)).toNonIndexed());
    geoCache.set(key, g);
  }
  return g;
}

function cylGeo(rt: number, rb: number, h: number, seg = 32) {
  const key = `c${rt.toFixed(3)}|${rb.toFixed(3)}|${h.toFixed(3)}|${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(Math.max(rt, 0.001), Math.max(rb, 0.001), Math.max(h, 0.001), seg);
    geoCache.set(key, g);
  }
  return g;
}

const sphereGeo = new THREE.SphereGeometry(0.5, 32, 20);
const coneGeo = new THREE.ConeGeometry(0.5, 1, 24);

interface BoxProps {
  p: [number, number, number];
  s: [number, number, number];
  m: MaterialRef;
  r?: [number, number, number];
}

/** Box by centre position and size. */
function B({ p, s, m, r }: BoxProps) {
  return <mesh position={p} rotation={r} geometry={boxGeo(...s)} material={getMaterial(m)} castShadow receiveShadow />;
}

/** Box resting on y0 (bottom), centred in x/z. */
function Bb({ x = 0, y0 = 0, z = 0, w, h, d, m }: { x?: number; y0?: number; z?: number; w: number; h: number; d: number; m: MaterialRef }) {
  return <B p={[x, y0 + h / 2, z]} s={[w, h, d]} m={m} />;
}

function Cyl({ p, r, rb, h, m, rot, seg }: { p: [number, number, number]; r: number; rb?: number; h: number; m: MaterialRef; rot?: [number, number, number]; seg?: number }) {
  return <mesh position={p} rotation={rot} geometry={cylGeo(r, rb ?? r, h, seg)} material={getMaterial(m)} castShadow receiveShadow />;
}

function Sph({ p, s, m }: { p: [number, number, number]; s: [number, number, number]; m: MaterialRef }) {
  return <mesh position={p} scale={s} geometry={sphereGeo} material={getMaterial(m)} castShadow receiveShadow />;
}

function Cone({ p, s, m }: { p: [number, number, number]; s: [number, number, number]; m: MaterialRef }) {
  return <mesh position={p} scale={s} geometry={coneGeo} material={getMaterial(m)} castShadow receiveShadow />;
}

const HANDLE = 'steel';
const PLINTH = 0.1;
const TOP = 0.04;

/** Front doors/drawers with small gaps and handles. `rows` are fractions of the front height from the top. */
function Fronts({ w, h, y0, z, m, handle, cols = 1, rows = [1], handleTop = false }: { w: number; h: number; y0: number; z: number; m: MaterialRef; handle: MaterialRef; cols?: number; rows?: number[]; handleTop?: boolean }) {
  const gap = 0.004;
  const out: ReactNode[] = [];
  let yTop = y0 + h;
  rows.forEach((fr, ri) => {
    const rh = h * fr;
    const cw = w / cols;
    for (let c = 0; c < cols; c++) {
      const cx = -w / 2 + cw * (c + 0.5);
      const cy = yTop - rh / 2;
      out.push(<B key={`f${ri}-${c}`} p={[cx, cy, z + 0.01]} s={[cw - gap * 2, rh - gap * 2, 0.018]} m={m} />);
      const drawer = rows.length > 1;
      const hw = Math.min(cw * 0.5, 0.3);
      if (drawer || handleTop) out.push(<B key={`h${ri}-${c}`} p={[cx, yTop - Math.min(0.05, rh * 0.2), z + 0.03]} s={[hw, 0.012, 0.02]} m={handle} />);
      else {
        const hx = cols > 1 ? (c % 2 === 0 ? cx + cw / 2 - 0.04 : cx - cw / 2 + 0.04) : cx + cw / 2 - 0.04;
        out.push(<B key={`h${ri}-${c}`} p={[hx, cy + rh * 0.3, z + 0.03]} s={[0.012, Math.min(0.2, rh * 0.4), 0.02]} m={handle} />);
      }
    }
    yTop -= rh;
  });
  return <>{out}</>;
}

/** Standard kitchen base unit: plinth, carcass, worktop. */
function BaseUnit({ W, D, H, finish, top, children, fronts = true, rows = [1], cols }: { W: number; D: number; H: number; finish: MaterialRef; top: MaterialRef; children?: ReactNode; fronts?: boolean; rows?: number[]; cols?: number }) {
  const body = H - PLINTH - TOP;
  return (
    <>
      <Bb y0={0} z={-0.03} w={W - 0.01} h={PLINTH} d={D - 0.08} m="anthracite" />
      <Bb y0={PLINTH} z={-0.01} w={W - 0.004} h={body} d={D - 0.04} m={finish} />
      {fronts && <Fronts w={W} h={body} y0={PLINTH} z={D / 2 - 0.03} m={finish} handle={HANDLE} rows={rows} cols={cols ?? (W > 0.65 ? 2 : 1)} />}
      <Bb y0={H - TOP} z={0.005} w={W} h={TOP} d={D + 0.01} m={top} />
      {children}
    </>
  );
}

function Legs({ W, D, h, m, inset = 0.04, r = 0.02, y0 = 0 }: { W: number; D: number; h: number; m: MaterialRef; inset?: number; r?: number; y0?: number }) {
  const xs = [-W / 2 + inset, W / 2 - inset];
  const zs = [-D / 2 + inset, D / 2 - inset];
  return (
    <>
      {xs.flatMap((x) => zs.map((z) => <Cyl key={`${x}${z}`} p={[x, y0 + h / 2, z]} r={r} h={h} m={m} seg={12} />))}
    </>
  );
}

function Faucet({ x = 0, y, z, m = 'chrome', scale = 1 }: { x?: number; y: number; z: number; m?: MaterialRef; scale?: number }) {
  return (
    <group position={[x, y, z]} scale={scale}>
      <Cyl p={[0, 0.12, 0]} r={0.012} h={0.24} m={m} />
      <Cyl p={[0, 0.235, 0.07]} r={0.011} h={0.15} m={m} rot={[Math.PI / 2, 0, 0]} />
      <Cyl p={[0, 0.22, 0.14]} r={0.011} h={0.04} m={m} />
    </group>
  );
}

function Mattress({ W, D, y, m }: { W: number; D: number; y: number; m: MaterialRef }) {
  return <B p={[0, y, 0]} s={[W, 0.2, D]} m={m} />;
}

export function ItemModel({ item, lights }: { item: Item; lights: boolean }) {
  const W = item.width / 100;
  const D = item.depth / 100;
  const H = item.height / 100;
  const f = item.finish;
  const a = item.accent;

  const content = useMemo(() => {
    switch (item.kind) {
      case 'baseCabinet':
        return <BaseUnit W={W} D={D} H={H} finish={f} top={a} />;
      case 'drawerCabinet':
        return <BaseUnit W={W} D={D} H={H} finish={f} top={a} rows={[0.25, 0.35, 0.4]} cols={1} />;
      case 'cornerCabinet':
        return <BaseUnit W={W} D={D} H={H} finish={f} top={a} cols={1} />;
      case 'sinkCabinet': {
        const sw = Math.min(W - 0.2, 0.6);
        return (
          <BaseUnit W={W} D={D} H={H} finish={f} top={a}>
            <B p={[0, H + 0.001, 0.02]} s={[sw, 0.004, 0.42]} m="steel" />
            <B p={[0, H - 0.08, 0.02]} s={[sw - 0.04, 0.16, 0.38]} m="black-metal" />
            <Faucet y={H} z={-D / 2 + 0.08} m="steel" />
          </BaseUnit>
        );
      }
      case 'cooktopCabinet':
        return (
          <BaseUnit W={W} D={D} H={H} finish={f} top={a} rows={[0.3, 0.7]} cols={1}>
            <B p={[0, H + 0.003, 0.01]} s={[Math.min(W - 0.08, 0.78), 0.006, 0.5]} m="black-glass" />
            {[
              [-0.18, -0.1],
              [0.18, -0.1],
              [-0.18, 0.12],
              [0.18, 0.12],
            ].map(([x, z], i) => (
              <Cyl key={i} p={[x * Math.min(1, W / 0.8), H + 0.0075, z]} r={i % 2 ? 0.08 : 0.1} h={0.001} m="anthracite" />
            ))}
          </BaseUnit>
        );
      case 'dishwasher':
        return (
          <BaseUnit W={W} D={D} H={H} finish={f} top={a} fronts={false}>
            <Fronts w={W} h={H - PLINTH - TOP} y0={PLINTH} z={D / 2 - 0.03} m={f} handle={HANDLE} handleTop />
          </BaseUnit>
        );
      case 'wallCabinet':
        return (
          <>
            <Bb y0={0} z={-0.01} w={W - 0.004} h={H} d={D - 0.02} m={f} />
            <Fronts w={W} h={H} y0={0} z={D / 2 - 0.02} m={f} handle={a} cols={W > 0.65 ? 2 : 1} />
          </>
        );
      case 'openShelf':
        return (
          <>
            <Bb y0={0} w={W} h={H} d={D} m={f} />
            <B p={[-W / 2 + 0.1, -0.06, -D / 2 + 0.01]} s={[0.02, 0.12, 0.02]} m={a} />
            <B p={[W / 2 - 0.1, -0.06, -D / 2 + 0.01]} s={[0.02, 0.12, 0.02]} m={a} />
          </>
        );
      case 'tallCabinet':
        return (
          <>
            <Bb y0={0} z={-0.03} w={W - 0.01} h={PLINTH} d={D - 0.08} m="anthracite" />
            <Bb y0={PLINTH} z={-0.01} w={W - 0.004} h={H - PLINTH} d={D - 0.04} m={f} />
            <Fronts w={W} h={H - PLINTH} y0={PLINTH} z={D / 2 - 0.03} m={f} handle={a} rows={[0.35, 0.65]} cols={W > 0.65 ? 2 : 1} handleTop={false} />
          </>
        );
      case 'ovenTower': {
        const body = H - PLINTH;
        return (
          <>
            <Bb y0={0} z={-0.03} w={W - 0.01} h={PLINTH} d={D - 0.08} m="anthracite" />
            <Bb y0={PLINTH} z={-0.01} w={W - 0.004} h={body} d={D - 0.04} m={f} />
            <Fronts w={W} h={body * 0.35} y0={H - body * 0.35} z={D / 2 - 0.03} m={f} handle={HANDLE} />
            <B p={[0, PLINTH + body * 0.5, D / 2 - 0.015]} s={[W - 0.04, 0.58, 0.02]} m={a} />
            <B p={[0, PLINTH + body * 0.5 + 0.24, D / 2 + 0.01]} s={[W - 0.16, 0.015, 0.02]} m="steel" />
            <B p={[0, PLINTH + body * 0.5 - 0.35, D / 2 - 0.015]} s={[W - 0.04, 0.38, 0.02]} m={a} />
            <Fronts w={W} h={body * 0.12} y0={PLINTH} z={D / 2 - 0.03} m={f} handle={HANDLE} rows={[0.5, 0.5]} />
          </>
        );
      }
      case 'fridge':
        return (
          <>
            <Bb y0={0.02} w={W - 0.01} h={H - 0.02} d={D - 0.05} z={-0.02} m={f} />
            <B p={[0, 0.02 + (H - 0.02) * 0.68, D / 2 - 0.02]} s={[W - 0.01, (H - 0.02) * 0.64 - 0.006, 0.04]} m={f} />
            <B p={[0, 0.02 + (H - 0.02) * 0.18, D / 2 - 0.02]} s={[W - 0.01, (H - 0.02) * 0.36 - 0.006, 0.04]} m={f} />
            <B p={[W / 2 - 0.05, H * 0.55, D / 2 + 0.02]} s={[0.02, 0.35, 0.025]} m={a} />
            <B p={[W / 2 - 0.05, H * 0.28, D / 2 + 0.02]} s={[0.02, 0.2, 0.025]} m={a} />
          </>
        );
      case 'range':
        return (
          <>
            <Bb y0={0} w={W} h={H - 0.02} d={D} m={f} />
            <B p={[0, H - 0.01, 0]} s={[W, 0.02, D]} m={a} />
            <B p={[0, H * 0.45, D / 2 + 0.005]} s={[W * 0.8, H * 0.5, 0.01]} m="black-glass" />
            <B p={[0, H * 0.75, D / 2 + 0.02]} s={[W * 0.7, 0.015, 0.02]} m="steel" />
            {[-0.25, -0.08, 0.08, 0.25].map((x) => (
              <Cyl key={x} p={[x * W, H * 0.88, D / 2 + 0.01]} r={0.018} h={0.02} m="black-metal" rot={[Math.PI / 2, 0, 0]} />
            ))}
            {[
              [-0.25, -0.12],
              [0.25, -0.12],
              [-0.25, 0.12],
              [0.25, 0.12],
              [0, 0],
            ].map(([x, z], i) => (
              <Cyl key={i} p={[x * W, H + 0.005, z]} r={0.07} h={0.01} m="black-metal" />
            ))}
          </>
        );
      case 'rangeHood': {
        const hoodH = Math.min(0.12, H * 0.25);
        return (
          <>
            <Bb y0={0} w={W} h={hoodH} d={D} m={f} />
            <mesh position={[0, hoodH + 0.08, -D / 2 + D * 0.3]} geometry={boxGeo(W * 0.9, 0.16, D * 0.6)} material={getMaterial(f)} castShadow />
            <Bb y0={hoodH} z={-D / 2 + 0.14} w={Math.min(0.3, W * 0.4)} h={H - hoodH} d={0.25} m={f} />
          </>
        );
      }
      case 'island': {
        const over = Math.min(0.3, D * 0.3);
        const body = D - over;
        return (
          <>
            <Bb y0={0} z={-over / 2 - 0.03} w={W - 0.08} h={PLINTH} d={body - 0.08} m="anthracite" />
            <Bb y0={PLINTH} z={-over / 2} w={W - 0.02} h={H - PLINTH - TOP} d={body - 0.02} m={f} />
            <group position={[0, 0, -over / 2 - (body - 0.02) / 2]} rotation={[0, Math.PI, 0]}>
              <Fronts w={W - 0.02} h={H - PLINTH - TOP} y0={PLINTH} z={-0.012} m={f} handle={HANDLE} cols={Math.max(1, Math.round(W / 0.6))} rows={[0.3, 0.7]} />
            </group>
            <Bb y0={H - TOP} w={W + 0.02} h={TOP} d={D} m={a} />
            <Bb y0={0} x={-W / 2 + 0.02} w={0.04} h={H - TOP} d={D} m={a} />
            <Bb y0={0} x={W / 2 - 0.02} w={0.04} h={H - TOP} d={D} m={a} />
          </>
        );
      }
      case 'countertop':
      case 'wallPanel':
      case 'slab':
      case 'box':
        return <Bb y0={0} w={W} h={H} d={D} m={f} />;
      case 'cylinder':
        return <Cyl p={[0, H / 2, 0]} r={W / 2} h={H} m={f} />;
      case 'column':
        return (
          <>
            <Bb y0={0} w={W} h={H} d={D} m={f} />
          </>
        );
      case 'beam':
        return <Bb y0={0} w={W} h={H} d={D} m={f} />;
      case 'barStool':
        return (
          <>
            <Cyl p={[0, H - 0.03, 0]} r={W / 2} h={0.05} m={f} />
            <Cyl p={[0, (H - 0.05) / 2, 0]} r={0.025} h={H - 0.05} m={a} />
            <Cyl p={[0, 0.01, 0]} r={W / 2 - 0.02} h={0.02} m={a} />
            <mesh position={[0, 0.25, 0]} rotation={[Math.PI / 2, 0, 0]} material={getMaterial(a)}>
              <torusGeometry args={[W / 2 - 0.06, 0.01, 8, 32]} />
            </mesh>
          </>
        );

      // Bathroom
      case 'toilet':
        return (
          <>
            <mesh position={[0, 0.2, D * 0.08]} scale={[W * 0.9, 0.4, D * 0.62]} material={getMaterial(f)} castShadow receiveShadow>
              <cylinderGeometry args={[0.5, 0.36, 1, 32]} />
            </mesh>
            <mesh position={[0, 0.41, D * 0.08]} scale={[W * 0.95, 0.03, D * 0.64]} material={getMaterial(f)} castShadow>
              <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
            </mesh>
            <Bb y0={0.38} z={-D / 2 + 0.1} w={W * 0.95} h={Math.max(0.1, H - 0.38)} d={0.18} m={f} />
            <Cyl p={[0, H + 0.005, -D / 2 + 0.1]} r={0.025} h={0.01} m={a} />
          </>
        );
      case 'wallToilet': {
        const seat = 0.42;
        return (
          <>
            <mesh position={[0, seat - 0.15, D * 0.05]} scale={[W * 0.95, 0.3, D * 0.85]} material={getMaterial(f)} castShadow receiveShadow>
              <cylinderGeometry args={[0.5, 0.4, 1, 32]} />
            </mesh>
            <mesh position={[0, seat, D * 0.05]} scale={[W, 0.03, D * 0.88]} material={getMaterial(f)} castShadow>
              <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
            </mesh>
            <B p={[0, 1.0, -D / 2 + 0.005]} s={[0.24, 0.16, 0.01]} m={a} />
          </>
        );
      }
      case 'vanity':
      case 'doubleVanity': {
        const n = item.kind === 'doubleVanity' ? 2 : 1;
        const bodyH = 0.5;
        const y0 = H - bodyH - 0.02;
        return (
          <>
            <Bb y0={y0} z={0} w={W} h={bodyH} d={D} m={f} />
            <Fronts w={W} h={bodyH - 0.02} y0={y0} z={D / 2 - 0.005} m={f} handle="chrome" rows={[0.5, 0.5]} cols={n} />
            <Bb y0={H - 0.02} w={W + 0.01} h={0.03} d={D + 0.01} m={a} />
            {Array.from({ length: n }, (_, i) => {
              const x = n === 1 ? 0 : (i - 0.5) * (W / 2);
              return (
                <group key={i}>
                  <mesh position={[x, H + 0.06, 0.02]} scale={[Math.min(0.5, W / n - 0.1), 0.12, D * 0.7]} material={getMaterial(a)} castShadow>
                    <cylinderGeometry args={[0.5, 0.42, 1, 32]} />
                  </mesh>
                  <Faucet x={x} y={H + 0.01} z={-D / 2 + 0.06} scale={0.9} />
                </group>
              );
            })}
          </>
        );
      }
      case 'pedestalSink':
        return (
          <>
            <Cyl p={[0, (H - 0.15) / 2, -D * 0.15]} r={0.08} rb={0.1} h={H - 0.15} m={f} />
            <mesh position={[0, H - 0.08, 0]} scale={[W, 0.16, D]} material={getMaterial(f)} castShadow>
              <cylinderGeometry args={[0.5, 0.4, 1, 32]} />
            </mesh>
            <Faucet y={H} z={-D / 2 + 0.06} m={a} />
          </>
        );
      case 'bathtub': {
        const rim = 0.07;
        return (
          <>
            <Bb y0={0} w={W} h={H - 0.02} d={D} m={f} />
            <Bb y0={H - 0.02} x={0} z={-D / 2 + rim / 2} w={W} h={0.02} d={rim} m={f} />
            <Bb y0={H - 0.02} x={0} z={D / 2 - rim / 2} w={W} h={0.02} d={rim} m={f} />
            <Bb y0={H - 0.02} x={-W / 2 + rim / 2} w={rim} h={0.02} d={D} m={f} />
            <Bb y0={H - 0.02} x={W / 2 - rim / 2} w={rim} h={0.02} d={D} m={f} />
            <mesh position={[0, H - 0.015, 0]} scale={[W - rim * 2, 0.01, D - rim * 2]} material={getMaterial('#dfe8ee')}>
              <boxGeometry />
            </mesh>
            <Faucet x={-W / 2 + 0.12} y={H} z={-D / 2 + 0.035} m={a} />
          </>
        );
      }
      case 'freestandingTub':
        return (
          <>
            <mesh position={[0, H / 2, 0]} scale={[W, H, D]} material={getMaterial(f)} castShadow receiveShadow>
              <cylinderGeometry args={[0.5, 0.42, 1, 48]} />
            </mesh>
            <mesh position={[0, H - 0.005, 0]} scale={[W - 0.1, 0.012, D - 0.1]} material={getMaterial('#dfe8ee')}>
              <cylinderGeometry args={[0.5, 0.5, 1, 48]} />
            </mesh>
            <Cyl p={[W / 2 + 0.12, 0.5, 0]} r={0.015} h={1} m={a} />
            <Cyl p={[W / 2 + 0.05, 0.98, 0]} r={0.012} h={0.14} m={a} rot={[0, 0, Math.PI / 2]} />
          </>
        );
      case 'shower': {
        const t = 0.008;
        return (
          <>
            <Bb y0={0} w={W} h={0.04} d={D} m={f} />
            <B p={[0, H / 2 + 0.02, D / 2 - t]} s={[W, H - 0.04, t]} m={a} />
            <B p={[W / 2 - t, H / 2 + 0.02, 0]} s={[t, H - 0.04, D]} m={a} />
            <B p={[0, H, D / 2 - t]} s={[W, 0.02, 0.02]} m="chrome" />
            <Cyl p={[-W / 2 + 0.1, H * 0.6, -D / 2 + 0.03]} r={0.012} h={H * 0.8} m="chrome" />
            <Cyl p={[-W / 2 + 0.1, H * 0.95, -D / 2 + 0.12]} r={0.1} h={0.01} m="chrome" />
          </>
        );
      }
      case 'walkInShower': {
        const t = 0.008;
        return (
          <>
            <Bb y0={0} w={W} h={0.01} d={D} m={f} />
            <B p={[W / 2 - t, H / 2, 0]} s={[t, H, D]} m={a} />
            <B p={[W / 2 - t, H, 0]} s={[0.02, 0.02, D]} m="black-metal" />
            <Cyl p={[-W / 2 + 0.3, H * 0.95, -D / 2 + 0.15]} r={0.13} h={0.01} m="black-metal" />
            <Cyl p={[-W / 2 + 0.3, H * 0.97, -D / 2 + 0.07]} r={0.01} h={0.16} m="black-metal" rot={[Math.PI / 2, 0, 0]} />
            <B p={[0, 0.012, 0]} s={[0.3, 0.004, 0.06]} m="steel" />
          </>
        );
      }
      case 'mirror':
        return (
          <>
            <B p={[0, H / 2, -D / 2 + 0.01]} s={[W, H, 0.02]} m={a} />
            <B p={[0, H / 2, -D / 2 + 0.021]} s={[W - 0.03, H - 0.03, 0.005]} m={f} />
          </>
        );
      case 'mirrorCabinet':
        return (
          <>
            <Bb y0={0} w={W} h={H} d={D - 0.02} z={-0.01} m={f} />
            <Fronts w={W} h={H} y0={0} z={D / 2 - 0.01} m={a} handle={a} cols={W > 0.6 ? 2 : 1} />
          </>
        );
      case 'towelRadiator':
      case 'radiator': {
        const bars = Math.max(3, Math.round(H / 0.06));
        const isTowel = item.kind === 'towelRadiator';
        return (
          <>
            <B p={[-W / 2 + 0.015, H / 2, 0]} s={[0.03, H, 0.03]} m={f} />
            <B p={[W / 2 - 0.015, H / 2, 0]} s={[0.03, H, 0.03]} m={f} />
            {isTowel
              ? Array.from({ length: bars }, (_, i) => <Cyl key={i} p={[0, 0.03 + (i * (H - 0.06)) / (bars - 1), 0]} r={0.011} h={W - 0.03} m={f} rot={[0, 0, Math.PI / 2]} seg={10} />)
              : Array.from({ length: Math.max(4, Math.round(W / 0.05)) }, (_, i) => (
                  <B key={i} p={[-W / 2 + 0.03 + (i * (W - 0.06)) / (Math.max(4, Math.round(W / 0.05)) - 1), H / 2, 0]} s={[0.025, H, D * 0.8]} m={f} />
                ))}
          </>
        );
      }
      case 'washingMachine':
        return (
          <>
            <Bb y0={0.01} w={W - 0.01} h={H - 0.01} d={D - 0.01} m={f} />
            <B p={[0, H - 0.07, D / 2]} s={[W - 0.02, 0.1, 0.01]} m="white-matte" />
            <Cyl p={[0, H * 0.45, D / 2]} r={0.2} h={0.03} m={a} rot={[Math.PI / 2, 0, 0]} />
            <Cyl p={[0, H * 0.45, D / 2 + 0.01]} r={0.16} h={0.03} m="glass" rot={[Math.PI / 2, 0, 0]} />
            <Cyl p={[W / 2 - 0.1, H - 0.07, D / 2 + 0.01]} r={0.03} h={0.02} m={a} rot={[Math.PI / 2, 0, 0]} />
          </>
        );

      // Living
      case 'sofa':
      case 'armchair': {
        const arm = Math.min(0.2, W * 0.15);
        const seatH = 0.42;
        const back = 0.2;
        const seats = item.kind === 'sofa' ? Math.max(1, Math.round((W - arm * 2) / 0.65)) : 1;
        const sw = (W - arm * 2) / seats;
        return (
          <>
            <Legs W={W} D={D} h={0.08} m={a} inset={0.05} r={0.015} />
            <Bb y0={0.08} w={W} h={seatH - 0.08 - 0.12} d={D} m={f} />
            <Bb y0={0.08} z={-D / 2 + back / 2} w={W} h={H - 0.08} d={back} m={f} />
            <Bb y0={0.08} x={-W / 2 + arm / 2} w={arm} h={0.62 - 0.08} d={D} m={f} />
            <Bb y0={0.08} x={W / 2 - arm / 2} w={arm} h={0.62 - 0.08} d={D} m={f} />
            {Array.from({ length: seats }, (_, i) => (
              <group key={i}>
                <Bb y0={seatH - 0.12} x={-W / 2 + arm + sw * (i + 0.5)} z={back / 2} w={sw - 0.01} h={0.13} d={D - back - 0.01} m={f} />
                <B p={[-W / 2 + arm + sw * (i + 0.5), seatH + 0.2, -D / 2 + back + 0.07]} s={[sw - 0.03, 0.4, 0.14]} m={f} r={[-0.15, 0, 0]} />
              </group>
            ))}
          </>
        );
      }
      case 'coffeeTable':
        return (
          <>
            <Bb y0={H - 0.04} w={W} h={0.04} d={D} m={f} />
            <Bb y0={0.1} w={W - 0.08} h={0.02} d={D - 0.08} m={f} />
            <Legs W={W} D={D} h={H - 0.04} m={a} r={0.015} />
          </>
        );
      case 'tvUnit':
        return (
          <>
            <Legs W={W} D={D} h={0.12} m={a} r={0.012} inset={0.06} />
            <Bb y0={0.12} w={W} h={H - 0.12} d={D} m={f} />
            <Fronts w={W} h={H - 0.14} y0={0.13} z={D / 2 + 0.001} m={f} handle={a} cols={Math.max(2, Math.round(W / 0.6))} handleTop />
          </>
        );
      case 'tv':
        return (
          <>
            <B p={[0, H / 2, -D / 2 + 0.03]} s={[W, H, 0.03]} m={a} />
            <B p={[0, H / 2, -D / 2 + 0.046]} s={[W - 0.01, H - 0.01, 0.002]} m={f} />
          </>
        );
      case 'bookshelf': {
        const shelves = Math.max(2, Math.round(H / 0.38));
        const t = 0.02;
        const colors = ['#8a3b2e', '#2f4b6e', '#d9c7a3', '#4d6b4a', '#a3702c', '#333'];
        return (
          <>
            <B p={[-W / 2 + t / 2, H / 2, 0]} s={[t, H, D]} m={f} />
            <B p={[W / 2 - t / 2, H / 2, 0]} s={[t, H, D]} m={f} />
            <B p={[0, H / 2, -D / 2 + 0.005]} s={[W, H, 0.01]} m={f} />
            {Array.from({ length: shelves + 1 }, (_, i) => (
              <B key={i} p={[0, t / 2 + (i * (H - t)) / shelves, 0]} s={[W - t * 2, t, D]} m={f} />
            ))}
            {Array.from({ length: shelves }, (_, i) =>
              Array.from({ length: Math.floor((W - 0.1) / 0.05) }, (_, k) =>
                (k * 7 + i * 3) % 9 < 6 ? (
                  <B
                    key={`${i}-${k}`}
                    p={[-W / 2 + 0.05 + k * 0.05, t + (i * (H - t)) / shelves + 0.12 + ((k + i) % 3) * 0.01, 0.02]}
                    s={[0.035, 0.24 + ((k + i) % 3) * 0.02, D * 0.75]}
                    m={colors[(k + i * 2) % colors.length]}
                  />
                ) : null,
              ),
            )}
          </>
        );
      }
      case 'rug':
        return <Bb y0={0} w={W} h={Math.max(0.005, H)} d={D} m={f} />;
      case 'plant':
        return (
          <>
            <Cyl p={[0, 0.16, 0]} r={W * 0.35} rb={W * 0.28} h={0.32} m={f} />
            <Cyl p={[0, 0.32 + (H - 0.32) * 0.3, 0]} r={0.015} h={(H - 0.32) * 0.6} m="walnut" />
            <Sph p={[0, 0.32 + (H - 0.32) * 0.62, 0]} s={[W, (H - 0.32) * 0.75, D]} m={a} />
            <Sph p={[W * 0.2, 0.32 + (H - 0.32) * 0.45, W * 0.1]} s={[W * 0.6, (H - 0.32) * 0.45, D * 0.6]} m={a} />
          </>
        );
      case 'fireplace':
        return (
          <>
            <Bb y0={0} w={W} h={H} d={D} m={f} />
            <B p={[0, H * 0.38, D / 2 - 0.1]} s={[W * 0.55, H * 0.45, 0.2]} m="#1a1a1a" />
            <Bb y0={0} z={D / 2 + 0.1} w={W + 0.1} h={0.05} d={0.3} m="stone" />
            <pointLight position={[0, H * 0.25, D / 2]} color="#ff8a3c" intensity={lights ? 2 : 0} distance={3} />
          </>
        );

      // Dining
      case 'diningTable':
      case 'desk':
        return (
          <>
            <Bb y0={H - 0.035} w={W} h={0.035} d={D} m={f} />
            <Legs W={W} D={D} h={H - 0.035} m={a} r={0.022} inset={0.06} />
          </>
        );
      case 'roundTable':
        return (
          <>
            <Cyl p={[0, H - 0.018, 0]} r={W / 2} h={0.035} m={f} seg={48} />
            <Cyl p={[0, (H - 0.035) / 2, 0]} r={0.05} h={H - 0.035} m={a} />
            <Cyl p={[0, 0.015, 0]} r={W * 0.25} h={0.03} m={a} />
          </>
        );
      case 'chair': {
        const seat = 0.46;
        return (
          <>
            <Legs W={W} D={D} h={seat - 0.03} m={f} r={0.015} />
            <Bb y0={seat - 0.03} w={W} h={0.03} d={D} m={f} />
            <Bb y0={seat} z={0.01} w={W - 0.04} h={0.03} d={D - 0.06} m={a} />
            <B p={[0, (seat + H) / 2, -D / 2 + 0.015]} s={[W, H - seat, 0.025]} m={f} r={[-0.08, 0, 0]} />
          </>
        );
      }
      case 'officeChair':
        return (
          <>
            {Array.from({ length: 5 }, (_, i) => (
              <B key={i} p={[Math.cos((i * Math.PI * 2) / 5) * 0.15, 0.04, Math.sin((i * Math.PI * 2) / 5) * 0.15]} s={[0.3, 0.03, 0.04]} r={[0, (-i * Math.PI * 2) / 5, 0]} m={a} />
            ))}
            <Cyl p={[0, 0.25, 0]} r={0.025} h={0.4} m={a} />
            <Bb y0={0.45} w={W * 0.8} h={0.07} d={D * 0.8} m={f} />
            <B p={[0, 0.8, -D * 0.38]} s={[W * 0.75, 0.55, 0.06]} m={f} r={[-0.1, 0, 0]} />
          </>
        );

      // Bedroom
      case 'bed':
      case 'singleBed': {
        const frameH = 0.3;
        const head = item.kind === 'bed' ? a : f;
        return (
          <>
            <Legs W={W} D={D} h={0.1} m="walnut" r={0.02} />
            <Bb y0={0.1} w={W} h={frameH - 0.1} d={D} m={f} />
            <Mattress W={W - 0.04} D={D - 0.1} y={frameH + 0.1} m="white-matte" />
            <B p={[0, frameH + 0.21, D * 0.12]} s={[W - 0.02, 0.04, D * 0.72]} m={item.kind === 'bed' ? 'fabric-grey' : 'fabric-beige'} />
            <Bb y0={0.1} z={-D / 2 + 0.04} w={W} h={H - 0.1} d={0.08} m={head} />
            {(item.kind === 'bed' ? [-W / 4, W / 4] : [0]).map((x) => (
              <B key={x} p={[x, frameH + 0.26, -D / 2 + 0.25]} s={[Math.min(0.6, W / 2 - 0.1), 0.12, 0.35]} m="white-matte" />
            ))}
          </>
        );
      }
      case 'nightstand':
      case 'dresser':
        return (
          <>
            <Legs W={W} D={D} h={0.1} m={f} r={0.015} />
            <Bb y0={0.1} w={W} h={H - 0.1} d={D} m={f} />
            <Fronts w={W} h={H - 0.12} y0={0.11} z={D / 2} m={f} handle={a} rows={item.kind === 'dresser' ? [0.33, 0.33, 0.34] : [0.5, 0.5]} />
          </>
        );
      case 'wardrobe':
        return (
          <>
            <Bb y0={0} w={W} h={0.08} d={D - 0.04} z={-0.02} m="anthracite" />
            <Bb y0={0.08} w={W} h={H - 0.08} d={D - 0.02} z={-0.01} m={f} />
            <Fronts w={W} h={H - 0.08} y0={0.08} z={D / 2 - 0.02} m={f} handle={a} cols={Math.max(2, Math.round(W / 0.5))} />
          </>
        );

      // Lighting
      case 'pendantLamp':
        return (
          <>
            <Cyl p={[0, H - 0.15, 0]} r={0.004} h={0.3} m="black-metal" seg={6} />
            <mesh position={[0, H - 0.3 - 0.1, 0]} material={getMaterial(f, 'double')} castShadow>
              <cylinderGeometry args={[0.04, W / 2, 0.2, 32, 1, true]} />
            </mesh>
            <Sph p={[0, H - 0.42, 0]} s={[0.08, 0.08, 0.08]} m={a} />
            <Cyl p={[0, H + 0.01, 0]} r={0.05} h={0.02} m="black-metal" />
            {lights && <pointLight position={[0, H - 0.45, 0]} intensity={1.5} distance={5} decay={2} color="#ffe2b8" />}
          </>
        );
      case 'ceilingLight':
        return (
          <>
            <Cyl p={[0, H / 2, 0]} r={W / 2} h={H} m={f} />
            <Cyl p={[0, 0.002, 0]} r={W / 2 - 0.02} h={0.004} m={a} />
            {lights && <pointLight position={[0, -0.1, 0]} intensity={1.8} distance={6} decay={2} color="#fff0d8" />}
          </>
        );
      case 'floorLamp':
        return (
          <>
            <Cyl p={[0, 0.01, 0]} r={W * 0.4} h={0.02} m={f} />
            <Cyl p={[0, H / 2, 0]} r={0.012} h={H - 0.2} m={f} />
            <mesh position={[0, H - 0.13, 0]} material={getMaterial(a, 'double')} castShadow>
              <cylinderGeometry args={[W * 0.35, W / 2, 0.26, 32, 1, true]} />
            </mesh>
            {lights && <pointLight position={[0, H - 0.15, 0]} intensity={1.2} distance={4} decay={2} color="#ffd9a8" />}
          </>
        );
      case 'wallLight':
        return (
          <>
            <B p={[0, H / 2, -D / 2 + 0.01]} s={[W * 0.4, H * 0.6, 0.02]} m={f} />
            <Cyl p={[0, H / 2, 0]} r={W / 2} rb={W / 3} h={H} m={a} />
            {lights && <pointLight position={[0, H / 2, D / 2 + 0.05]} intensity={0.8} distance={3} decay={2} color="#ffe2b8" />}
          </>
        );

      // Structure
      case 'stairs': {
        const steps = Math.max(2, Math.round(H / 0.18));
        const rise = H / steps;
        const run = D / steps;
        return (
          <>
            {Array.from({ length: steps }, (_, i) => (
              <Bb key={i} y0={0} z={D / 2 - run * (i + 0.5)} w={W} h={rise * (i + 1)} d={run} m={f} />
            ))}
            {[-W / 2 - 0.02, W / 2 + 0.02].map((x) => (
              <group key={x}>
                {Array.from({ length: Math.ceil(steps / 3) }, (_, i) => {
                  const k = i * 3 + 1;
                  const z = D / 2 - run * (k + 0.5);
                  const y = rise * (k + 1);
                  return <B key={i} p={[x, y + 0.45, z]} s={[0.02, 0.9, 0.02]} m={a} />;
                })}
                <B p={[x, H / 2 + 0.9 + rise, 0]} s={[0.04, 0.04, Math.hypot(D, H) + 0.1]} r={[Math.atan2(H, D), 0, 0]} m={a} />
              </group>
            ))}
          </>
        );
      }
      case 'skylight':
        return (
          <>
            <Bb y0={0} w={W} h={H} d={D} m={f} />
            <Bb y0={H * 0.5} w={W - 0.1} h={H * 0.6} d={D - 0.1} m={a} />
          </>
        );

      // Exterior
      case 'tree': {
        const trunkH = H * 0.4;
        return (
          <>
            <Cyl p={[0, trunkH / 2, 0]} r={Math.max(0.08, W * 0.035)} rb={Math.max(0.1, W * 0.05)} h={trunkH} m={f} seg={12} />
            <Sph p={[0, trunkH + (H - trunkH) * 0.45, 0]} s={[W, (H - trunkH) * 0.9, D]} m={a} />
            <Sph p={[W * 0.2, trunkH + (H - trunkH) * 0.3, D * 0.15]} s={[W * 0.65, (H - trunkH) * 0.6, D * 0.65]} m={a} />
            <Sph p={[-W * 0.2, trunkH + (H - trunkH) * 0.6, -D * 0.1]} s={[W * 0.6, (H - trunkH) * 0.55, D * 0.6]} m={a} />
          </>
        );
      }
      case 'conifer':
        return (
          <>
            <Cyl p={[0, H * 0.1, 0]} r={W * 0.05} h={H * 0.2} m={f} seg={10} />
            <Cone p={[0, H * 0.15 + H * 0.35, 0]} s={[W, H * 0.7, D]} m={a} />
            <Cone p={[0, H * 0.45 + H * 0.25, 0]} s={[W * 0.75, H * 0.5, D * 0.75]} m={a} />
          </>
        );
      case 'shrub':
        return (
          <>
            <Sph p={[0, H * 0.5, 0]} s={[W, H, D]} m={f} />
            <Sph p={[W * 0.2, H * 0.4, D * 0.1]} s={[W * 0.7, H * 0.8, D * 0.7]} m={f} />
          </>
        );
      case 'hedge':
        return <Bb y0={0} w={W} h={H} d={D} m={f} />;
      case 'fence': {
        const posts = Math.max(2, Math.round(W / 1.5) + 1);
        const boards = Math.max(3, Math.round(W / 0.12));
        return (
          <>
            {Array.from({ length: posts }, (_, i) => (
              <Bb key={`p${i}`} y0={0} x={-W / 2 + (i * W) / (posts - 1)} z={-0.04} w={0.09} h={H} d={0.09} m={a} />
            ))}
            <Bb y0={H * 0.2} z={-0.02} w={W} h={0.07} d={0.03} m={a} />
            <Bb y0={H * 0.75} z={-0.02} w={W} h={0.07} d={0.03} m={a} />
            {Array.from({ length: boards }, (_, i) => (
              <Bb key={`b${i}`} y0={0.05} x={-W / 2 + ((i + 0.5) * W) / boards} z={0.01} w={W / boards - 0.02} h={H - 0.05} d={0.02} m={f} />
            ))}
          </>
        );
      }
      case 'deck':
        return <Bb y0={0} w={W} h={H} d={D} m={f} />;
      case 'pergola': {
        const post = 0.12;
        const n = Math.max(3, Math.round(W / 0.4));
        return (
          <>
            {[
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(([sx, sz], i) => (
              <Bb key={i} y0={0} x={sx * (W / 2 - post / 2)} z={sz * (D / 2 - post / 2)} w={post} h={H} d={post} m={f} />
            ))}
            <Bb y0={H - 0.2} z={-D / 2 + post / 2} w={W + 0.3} h={0.2} d={0.06} m={f} />
            <Bb y0={H - 0.2} z={D / 2 - post / 2} w={W + 0.3} h={0.2} d={0.06} m={f} />
            {Array.from({ length: n }, (_, i) => (
              <Bb key={`r${i}`} y0={H} x={-W / 2 + (i * W) / (n - 1)} w={0.05} h={0.15} d={D + 0.3} m={a} />
            ))}
          </>
        );
      }
      case 'sunLounger':
        return (
          <>
            <Legs W={W} D={D} h={0.2} m={f} r={0.02} />
            <Bb y0={0.2} w={W} h={0.05} d={D} m={f} />
            <Bb y0={0.25} z={0.2} w={W - 0.04} h={0.06} d={D - 0.5} m={a} />
            <B p={[0, 0.45, -D / 2 + 0.3]} s={[W - 0.04, 0.06, 0.6]} r={[0.9, 0, 0]} m={a} />
          </>
        );
      case 'pool':
        return (
          <>
            <Bb y0={0} w={W} h={H} d={D} m={f} />
            <Bb y0={H} w={W - 0.3} h={0.005} d={D - 0.3} m={a} />
          </>
        );
      case 'terrainPlatform':
        // Raised ground: retaining sides in the main finish, top surface in the accent (lawn, gravel…).
        return (
          <>
            <Bb y0={0} w={W} h={Math.max(0.01, H - 0.02)} d={D} m={f} />
            <Bb y0={Math.max(0, H - 0.02)} w={W} h={0.02} d={D} m={a} />
          </>
        );
      case 'greenhouse': {
        const wallH = H * 0.72;
        const post = 0.05;
        const nx = Math.max(2, Math.round(W / 0.75));
        const nz = Math.max(2, Math.round(D / 0.75));
        const slope = Math.atan2(H - wallH, D / 2);
        const rafter = Math.hypot(H - wallH, D / 2);
        return (
          <>
            <Bb y0={0} w={W} h={0.25} d={D} m="concrete" />
            {/* glazing */}
            <B p={[0, 0.25 + (wallH - 0.25) / 2, D / 2 - 0.01]} s={[W - 0.02, wallH - 0.25, 0.006]} m={a} />
            <B p={[0, 0.25 + (wallH - 0.25) / 2, -D / 2 + 0.01]} s={[W - 0.02, wallH - 0.25, 0.006]} m={a} />
            <B p={[W / 2 - 0.01, 0.25 + (wallH - 0.25) / 2, 0]} s={[0.006, wallH - 0.25, D - 0.02]} m={a} />
            <B p={[-W / 2 + 0.01, 0.25 + (wallH - 0.25) / 2, 0]} s={[0.006, wallH - 0.25, D - 0.02]} m={a} />
            {[1, -1].map((sg) => (
              <group key={sg}>
                <B p={[0, (wallH + H) / 2, (sg * D) / 4]} s={[W, 0.006, rafter]} r={[sg * slope, 0, 0]} m={a} />
                {Array.from({ length: nx + 1 }, (_, i) => (
                  <B key={i} p={[-W / 2 + (i * W) / nx, (wallH + H) / 2, (sg * D) / 4]} s={[post * 0.6, post * 0.6, rafter]} r={[sg * slope, 0, 0]} m={f} />
                ))}
              </group>
            ))}
            {/* gable glass triangles approximated by two panes each */}
            {[1, -1].map((sg) => (
              <B key={`g${sg}`} p={[(sg * W) / 2 - sg * 0.01, wallH + (H - wallH) / 3, 0]} s={[0.006, (H - wallH) * 0.66, D * 0.5]} m={a} />
            ))}
            {/* frame */}
            {Array.from({ length: nx + 1 }, (_, i) =>
              [1, -1].map((sg) => <Bb key={`x${i}${sg}`} y0={0.25} x={-W / 2 + (i * W) / nx} z={(sg * D) / 2} w={post} h={wallH - 0.25} d={post} m={f} />),
            )}
            {Array.from({ length: nz + 1 }, (_, i) =>
              [1, -1].map((sg) => <Bb key={`z${i}${sg}`} y0={0.25} x={(sg * W) / 2} z={-D / 2 + (i * D) / nz} w={post} h={wallH - 0.25} d={post} m={f} />),
            )}
            <B p={[0, wallH, D / 2]} s={[W, post, post]} m={f} />
            <B p={[0, wallH, -D / 2]} s={[W, post, post]} m={f} />
            <B p={[0, H, 0]} s={[W, post, post]} m={f} />
            <B p={[0, 0.25 + 0.6, D / 2 - 0.3]} s={[W * 0.8, 0.04, 0.5]} m="oak" />
          </>
        );
      }
      case 'shed': {
        const wallH = H * 0.72;
        const slope = Math.atan2(H - wallH, D / 2);
        const rafter = Math.hypot(H - wallH, D / 2) + 0.25;
        return (
          <>
            <Bb y0={0} w={W} h={wallH} d={D} m={f} />
            {/* gable ends: stacked boxes stepping up to the ridge */}
            {Array.from({ length: 6 }, (_, i) => {
              const hh = ((H - wallH) * (6 - i)) / 6;
              return <Bb key={i} y0={wallH + ((H - wallH) * i) / 6} w={W} h={(H - wallH) / 6} d={Math.max(0.05, (D * hh) / (H - wallH))} m={f} />;
            })}
            {[1, -1].map((sg) => (
              <B key={sg} p={[0, (wallH + H) / 2 + 0.03, (sg * D) / 4 + sg * 0.1]} s={[W + 0.3, 0.05, rafter]} r={[sg * slope, 0, 0]} m={a} />
            ))}
            <B p={[0, 0.95, D / 2 + 0.01]} s={[0.9, 1.9, 0.03]} m="paint-lightgrey" />
            {[
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(([sx, sz], i) => (
              <Bb key={`c${i}`} y0={0} x={sx * (W / 2)} z={sz * (D / 2)} w={0.1} h={wallH} d={0.1} m="paint-white" />
            ))}
          </>
        );
      }
      case 'car': {
        const wheelR = 0.33;
        return (
          <>
            <Bb y0={wheelR * 0.6} w={W} h={H * 0.4} d={D} m={f} />
            <B p={[0, H * 0.4 + wheelR * 0.6 + H * 0.17, -D * 0.05]} s={[W * 0.86, H * 0.36, D * 0.52]} m={a} />
            {[
              [-1, -1],
              [1, -1],
              [-1, 1],
              [1, 1],
            ].map(([sx, sz], i) => (
              <Cyl key={i} p={[sx * (W / 2 - 0.12), wheelR, sz * (D / 2 - 0.75)]} r={wheelR} h={0.22} m="black-metal" rot={[0, 0, Math.PI / 2]} />
            ))}
          </>
        );
      }
      default:
        return <Bb y0={0} w={W} h={H} d={D} m={f} />;
    }
  }, [item.kind, W, D, H, f, a, lights]);

  return <>{content}</>;
}
