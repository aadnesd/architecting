import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Edges, Environment, Lightformer, OrbitControls, PointerLockControls, Sky, TransformControls } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer, N8AO, Bloom, ToneMapping, SMAA } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useStore } from '../store/store';
import type { Item, Level, Project, Roof, Room, Wall } from '../model/types';
import { buildCeilingGeometry, buildFloorGeometry, buildInfill, buildRoofSurface, buildWallGeometry } from './buildGeometry';
import { buildRoofGeometry } from '../geometry/roof';
import { getMaterial } from './textures';
import { ItemModel } from './ItemModel';
import { OpeningModel } from './OpeningModel';
import { registry } from './registry';
import { bbox, polygonArea, polygonCentroid } from '../geometry/math';

const M = 0.01;
const EDGE = '#2f6fed';

function useSelectHandler(type: 'wall' | 'item' | 'room' | 'roof' | 'opening', id: string) {
  const select = useStore((s) => s.select);
  return (e: ThreeEvent<MouseEvent>) => {
    if (useStore.getState().options.walkMode) return;
    if (e.delta > 4) return;
    e.stopPropagation();
    select(type, id, e.shiftKey);
  };
}

const isSelected = (id: string) => (s: ReturnType<typeof useStore.getState>) => s.selection.some((x) => x.id === id);

function WallMesh({ wall, walls, project, cutaway, base }: { wall: Wall; walls: Wall[]; project: Project; cutaway: boolean; base: number }) {
  const openings = useMemo(() => project.openings.filter((o) => o.wallId === wall.id), [project.openings, wall.id]);
  // Upper-level walls extend down through the floor slab (`base`) so storeys join without a gap.
  const effective = useMemo(() => {
    const h = cutaway ? Math.min(wall.height, 110) : wall.height;
    const he = wall.heightEnd === undefined ? undefined : cutaway ? Math.min(wall.heightEnd, 110) : wall.heightEnd;
    return { ...wall, height: h + base, heightEnd: he === undefined ? undefined : he + base };
  }, [wall, cutaway, base]);
  const shifted = useMemo(() => (base ? openings.map((o) => ({ ...o, sill: o.sill + base })) : openings), [openings, base]);
  const geometry = useMemo(() => buildWallGeometry(effective, walls, shifted), [effective, walls, shifted]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const materials = useMemo(() => [getMaterial(wall.leftMaterial), getMaterial(wall.rightMaterial), getMaterial('paint-white')], [wall.leftMaterial, wall.rightMaterial]);
  const onClick = useSelectHandler('wall', wall.id);
  const selected = useStore(isSelected(wall.id));
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    // Outward = the side facing away from the middle of this level's walls.
    const c = walls.reduce((acc, w) => ({ x: acc.x + (w.a.x + w.b.x) / 2, y: acc.y + (w.a.y + w.b.y) / 2 }), { x: 0, y: 0 });
    c.x /= walls.length;
    c.y /= walls.length;
    const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 };
    const L = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
    let n = { x: (wall.b.y - wall.a.y) / L, y: -(wall.b.x - wall.a.x) / L };
    if ((mid.x - c.x) * n.x + (mid.y - c.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    wallRegistry.set(wall.id, { group: g, mid: new THREE.Vector2(mid.x * M, mid.y * M), outward: new THREE.Vector2(n.x, n.y), center: new THREE.Vector2(c.x * M, c.y * M) });
    return () => {
      wallRegistry.delete(wall.id);
    };
  }, [wall, walls]);
  return (
    <group ref={groupRef}>
      <mesh geometry={geometry} material={materials} castShadow receiveShadow onClick={onClick} name={`wall:${wall.id}`} position-y={-base * M}>
        {selected && <Edges color={EDGE} threshold={20} />}
      </mesh>
      {openings.map((o) => (cutaway && o.sill > 110 ? null : <OpeningModel key={o.id} wall={wall} opening={o} />))}
    </group>
  );
}

const wallRegistry = new Map<string, { group: THREE.Group; mid: THREE.Vector2; outward: THREE.Vector2; center: THREE.Vector2 }>();

/** Dollhouse view: hide walls whose outside faces the camera so the rooms behind them are visible. */
function DollhouseController() {
  const enabled = useStore((s) => s.options.dollhouse && !s.options.walkMode);
  const camera = useThree((s) => s.camera);
  const toCam = useMemo(() => new THREE.Vector2(), []);
  useEffect(() => {
    if (!enabled) for (const w of wallRegistry.values()) w.group.visible = true;
  }, [enabled]);
  useFrame(() => {
    if (!enabled) return;
    for (const w of wallRegistry.values()) {
      toCam.set(camera.position.x - w.center.x, camera.position.z - w.center.y).normalize();
      const facing = toCam.dot(w.outward) > 0.3;
      const inFront = (camera.position.x - w.mid.x) * w.outward.x + (camera.position.z - w.mid.y) * w.outward.y > 0;
      w.group.visible = !(facing && inFront);
    }
  });
  return null;
}

function RoomMesh({ room, level, ceilings }: { room: Room; level: Level; ceilings: boolean }) {
  const floor = useMemo(() => buildFloorGeometry(room, level.floorThickness), [room, level.floorThickness]);
  const ceiling = useMemo(() => (ceilings && room.showCeiling ? buildCeilingGeometry(room) : null), [room, ceilings]);
  useEffect(() => () => floor.dispose(), [floor]);
  useEffect(() => () => ceiling?.dispose(), [ceiling]);
  const onClick = useSelectHandler('room', room.id);
  const selected = useStore(isSelected(room.id));
  return (
    <>
      <mesh geometry={floor} material={getMaterial(room.floorMaterial)} receiveShadow castShadow onClick={onClick} name={`room:${room.id}`}>
        {selected && <Edges color={EDGE} threshold={20} />}
      </mesh>
      {ceiling && <mesh geometry={ceiling} material={getMaterial(room.ceilingMaterial)} position={[0, level.height * M, 0]} receiveShadow />}
    </>
  );
}

function ItemMesh({ item, lights }: { item: Item; lights: boolean }) {
  const onClick = useSelectHandler('item', item.id);
  const selected = useStore(isSelected(item.id));
  return (
    <group
      name={`item:${item.id}`}
      position={[item.x * M, item.elevation * M, item.y * M]}
      rotation={[((item.tilt ?? 0) * Math.PI) / 180, (-item.rotation * Math.PI) / 180, 0, 'YXZ']}
      scale={[item.mirrored ? -1 : 1, 1, 1]}
      onClick={onClick}
    >
      <ItemModel item={item} lights={lights} />
      {selected && (
        <lineSegments position={[0, (item.height * M) / 2, 0]}>
          <edgesGeometry args={[new THREE.BoxGeometry(item.width * M + 0.01, item.height * M + 0.01, item.depth * M + 0.01)]} />
          <lineBasicMaterial color={EDGE} />
        </lineSegments>
      )}
    </group>
  );
}

function RoofMesh({ roof }: { roof: Roof }) {
  const { surface, infill } = useMemo(() => {
    const g = buildRoofGeometry(roof);
    return { surface: buildRoofSurface(g.faces, roof.thickness), infill: g.infill.length ? buildInfill(g.infill, 20) : null };
  }, [roof]);
  useEffect(
    () => () => {
      surface.dispose();
      infill?.dispose();
    },
    [surface, infill],
  );
  const onClick = useSelectHandler('roof', roof.id);
  const selected = useStore(isSelected(roof.id));
  return (
    <group onClick={onClick} name={`roof:${roof.id}`}>
      <mesh geometry={surface} material={[getMaterial(roof.material, 'double'), getMaterial(roof.fasciaMaterial ?? roof.material, 'double'), getMaterial(roof.fasciaMaterial ?? roof.material, 'double')]} castShadow receiveShadow>
        {selected && <Edges color={EDGE} threshold={20} />}
      </mesh>
      {infill && <mesh geometry={infill} material={getMaterial(roof.gableMaterial, 'double')} castShadow receiveShadow />}
    </group>
  );
}

function projectBounds(p: Project) {
  const pts = [
    ...p.walls.flatMap((w) => [w.a, w.b]),
    ...p.rooms.flatMap((r) => r.points),
    ...p.items.filter((i) => !['tree', 'conifer', 'car', 'hedge', 'shrub', 'fence', 'terrainPlatform', 'shed', 'greenhouse', 'deck'].includes(i.kind)).map((i) => ({ x: i.x, y: i.y })),
  ];
  if (!pts.length) return { cx: 0, cy: 0, size: 600 };
  const b = bbox(pts);
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, size: Math.max(300, b.maxX - b.minX, b.maxY - b.minY) };
}

function CameraRig() {
  const frameRequest = useStore((s) => s.frameRequest);
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    const p = useStore.getState().project;
    const { cx, cy, size } = projectBounds(p);
    const d = (size * M * 1.35) / Math.min(1, aspect * 0.9);
    camera.position.set(cx * M + d * 0.55, d * 0.95, cy * M + d * 0.8);
    if (controls) {
      controls.target.set(cx * M, 0.8, cy * M);
      controls.update();
    } else camera.lookAt(cx * M, 0.8, cy * M);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameRequest, controls, aspect > 1]);
  return null;
}

function WalkControls({ eyeY, onLockChange }: { eyeY: number; onLockChange: (locked: boolean) => void }) {
  const camera = useThree((s) => s.camera);
  const keys = useRef<Record<string, boolean>>({});
  // Start in the middle of the largest room on the current level, looking horizontally.
  useEffect(() => {
    const st = useStore.getState();
    const rooms = st.project.rooms.filter((r) => r.levelId === st.activeLevelId && r.points.length >= 3);
    let start = { x: 0, y: 0 };
    if (rooms.length) {
      const big = rooms.reduce((a, b) => (Math.abs(polygonArea(b.points)) > Math.abs(polygonArea(a.points)) ? b : a));
      start = polygonCentroid(big.points);
    } else {
      const b = projectBounds(st.project);
      start = { x: b.cx, y: b.cy };
    }
    camera.position.set(start.x * M, eyeY, start.y * M);
    camera.rotation.set(0, 0, 0, 'YXZ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    camera.position.y = eyeY;
    const down = (e: KeyboardEvent) => (keys.current[e.code] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [camera, eyeY]);
  useFrame((_, dt) => {
    const k = keys.current;
    const speed = (k.ShiftLeft || k.ShiftRight ? 4 : 1.8) * dt;
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    if (k.KeyW || k.ArrowUp) camera.position.addScaledVector(fwd, speed);
    if (k.KeyS || k.ArrowDown) camera.position.addScaledVector(fwd, -speed);
    if (k.KeyD || k.ArrowRight) camera.position.addScaledVector(right, speed);
    if (k.KeyA || k.ArrowLeft) camera.position.addScaledVector(right, -speed);
    if (k.KeyE) camera.position.y += speed;
    if (k.KeyQ) camera.position.y -= speed;
  });
  return <PointerLockControls selector="#walk-start" onLock={() => onLockChange(true)} onUnlock={() => onLockChange(false)} />;
}

function ItemGizmo({ mode }: { mode: 'translate' | 'rotate' }) {
  const selection = useStore((s) => s.selection);
  const scene = useThree((s) => s.scene);
  const project = useStore((s) => s.project);
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const single = selection.length === 1 && selection[0].type === 'item' ? project.items.find((i) => i.id === selection[0].id) : undefined;
  const id = single && !single.locked ? single.id : null;
  useEffect(() => {
    setObj(id ? (scene.getObjectByName(`item:${id}`) ?? null) : null);
  }, [id, scene, project]);
  if (!obj || !id) return null;
  const sync = () => {
    const s = useStore.getState();
    s.mutateLive((d) => {
      const it = d.items.find((i) => i.id === id);
      if (!it) return;
      it.x = Math.round(obj.position.x / M);
      it.y = Math.round(obj.position.z / M);
      it.elevation = Math.max(0, Math.round(obj.position.y / M));
      let deg = Math.round((-obj.rotation.y * 180) / Math.PI);
      deg = ((deg % 360) + 360) % 360;
      it.rotation = deg;
    });
  };
  return (
    <TransformControls
      object={obj}
      mode={mode}
      showX={mode === 'translate'}
      showZ={mode === 'translate'}
      showY
      size={0.8}
      translationSnap={0.01}
      rotationSnap={Math.PI / 24}
      onMouseDown={() => useStore.getState().beginLive()}
      onMouseUp={() => useStore.getState().endLive()}
      onObjectChange={sync}
    />
  );
}

function SceneContent() {
  const project = useStore((s) => s.project);
  const options = useStore((s) => s.options);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const groupRef = useRef<THREE.Group>(null);
  const { gl, scene, camera, controls } = useThree();
  useEffect(() => {
    registry.controls = controls;
    registry.gl = gl;
    registry.scene = scene;
    registry.camera = camera;
    registry.content = groupRef.current;
  });

  const active = project.levels.find((l) => l.id === activeLevelId) ?? project.levels[0];
  const levels = options.allLevels3D ? project.levels : project.levels.filter((l) => l.elevation <= active.elevation);
  const ceilings = options.ceilings || options.walkMode;
  const lights = options.lampLights;

  return (
    <group ref={groupRef}>
      {levels.map((level) => {
        const walls = project.walls.filter((w) => w.levelId === level.id);
        const lowest = Math.min(...project.levels.map((l) => l.elevation));
        const base = level.elevation > lowest ? level.floorThickness : 0;
        const cut = options.cutaway && level.id === active.id;
        return (
          <group key={level.id} position={[0, level.elevation * M, 0]}>
            {walls.map((w) => (
              <WallMesh key={w.id} wall={w} walls={walls} project={project} cutaway={cut} base={base} />
            ))}
            {project.rooms
              .filter((r) => r.levelId === level.id && r.points.length >= 3)
              .map((r) => (
                <RoomMesh key={r.id} room={r} level={level} ceilings={ceilings && !cut} />
              ))}
            {project.items
              .filter((i) => i.levelId === level.id)
              .map((i) => (
                <ItemMesh key={i.id} item={i} lights={lights} />
              ))}
            {options.show3DRoofs &&
              !((options.cutaway || options.dollhouse) && !options.walkMode && level.elevation >= active.elevation) &&
              project.roofs.filter((r) => r.levelId === level.id).map((r) => <RoofMesh key={r.id} roof={r} />)}
          </group>
        );
      })}
    </group>
  );
}

function Lights() {
  const options = useStore((s) => s.options);
  const project = useStore((s) => s.project);
  const { cx, cy, size } = useMemo(() => projectBounds(project), [project]);
  const light = useRef<THREE.DirectionalLight>(null);
  const az = (options.sunAzimuth * Math.PI) / 180;
  const el = (Math.max(2, options.sunElevation) * Math.PI) / 180;
  const R = Math.max(20, size * M * 1.5);
  const dir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const pos: [number, number, number] = [cx * M + dir[0] * R, dir[1] * R, cy * M + dir[2] * R];
  useEffect(() => {
    if (!light.current) return;
    light.current.target.position.set(cx * M, 0, cy * M);
    light.current.target.updateMatrixWorld();
    const cam = light.current.shadow.camera;
    const half = Math.max(8, size * M * 0.9);
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.5;
    cam.far = R * 3;
    cam.updateProjectionMatrix();
  }, [cx, cy, size, R]);
  const dayFactor = Math.min(1, Math.max(0.15, Math.sin(el) * 1.6));
  return (
    <>
      <Sky sunPosition={dir} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} distance={4500} />
      <hemisphereLight args={['#dfe9ff', '#9a8f7e', 0.55 * dayFactor + 0.15]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        ref={light}
        position={pos}
        intensity={2.6 * dayFactor}
        color={options.sunElevation < 15 ? '#ffc58a' : '#fff4e2'}
        castShadow={options.shadows}
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -9]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[20, 2, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[6, 2, 1]} rotation-y={-Math.PI / 2} scale={[20, 2, 1]} />
        <Lightformer form="ring" color="#fff3dd" intensity={3} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={4} />
      </Environment>
    </>
  );
}

function Ground() {
  const settings = useStore((s) => s.project.settings);
  const mat = useMemo(() => getMaterial(settings.groundMaterial), [settings.groundMaterial]);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(400, 400);
    g.rotateX(-Math.PI / 2);
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 400, uv.getY(i) * 400);
    return g;
  }, []);
  const clear = useStore((s) => s.clearSelection);
  // Looking at a level below ground (basement): hide the terrain so the rooms are visible.
  const groundY = (settings.groundLevel ?? 0) * M;
  const belowGround = useStore((s) => (s.project.levels.find((l) => l.id === s.activeLevelId)?.elevation ?? 0) < (s.project.settings.groundLevel ?? 0));
  if (belowGround) return null;
  if (!settings.showGround) {
    return (
      <mesh ref={(m) => void (registry.ground = m)} geometry={geo} position={[0, groundY - 0.25, 0]} receiveShadow onClick={(e) => e.delta < 4 && clear()}>
        <meshStandardMaterial color="#d9d6cf" roughness={1} />
      </mesh>
    );
  }
  return <mesh ref={(m) => void (registry.ground = m)} geometry={geo} material={mat} position={[0, groundY - 0.03, 0]} receiveShadow onClick={(e) => e.delta < 4 && clear()} />;
}

/** Screen-space ambient occlusion, soft glow on lamps and filmic tone mapping for the live view. */
function Effects() {
  const gl = useThree((s) => s.gl);
  // The composer's ToneMapping effect replaces the renderer's own tone mapping.
  useEffect(() => {
    gl.toneMapping = THREE.NoToneMapping;
    return () => {
      gl.toneMapping = THREE.ACESFilmicToneMapping;
    };
  }, [gl]);
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.6} distanceFalloff={0.6} intensity={2.2} quality="medium" halfRes />
      <Bloom luminanceThreshold={0.95} luminanceSmoothing={0.2} intensity={0.35} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}

export default function Scene3D() {
  const walkMode = useStore((s) => s.options.walkMode);
  const setOption = useStore((s) => s.setOption);
  const project = useStore((s) => s.project);
  const activeLevelId = useStore((s) => s.activeLevelId);
  const level = project.levels.find((l) => l.id === activeLevelId) ?? project.levels[0];
  const [gizmo, setGizmo] = useState<'translate' | 'rotate'>('translate');
  const [locked, setLocked] = useState(false);
  const shadows = useStore((s) => s.options.shadows);
  const requestFrame = useStore((s) => s.requestFrame);
  const dollhouse = useStore((s) => s.options.dollhouse);
  const enhanced = useStore((s) => s.options.enhanced);
  const setRenderOpen = useStore((s) => s.setRenderOpen);

  return (
    <div className="view3d">
      <Canvas
        shadows={shadows ? 'soft' : false}
        dpr={[1, 2]}
        camera={{ fov: 50, near: 0.05, far: 5000, position: [8, 8, 12] }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <Lights />
        <Ground />
        <SceneContent />
        {walkMode ? <WalkControls eyeY={(level.elevation + 165) * M} onLockChange={setLocked} /> : <OrbitControls makeDefault maxPolarAngle={Math.PI / 2 - 0.02} enableDamping dampingFactor={0.12} />}
        {!walkMode && <CameraRig />}
        {!walkMode && <ItemGizmo mode={gizmo} />}
        <DollhouseController />
        {enhanced && <Effects />}
      </Canvas>
      <div className="view3d-toolbar">
        {!walkMode && (
          <>
            <button className={gizmo === 'translate' ? 'active' : ''} onClick={() => setGizmo('translate')} title="Move selected object (gizmo)">
              Move
            </button>
            <button className={gizmo === 'rotate' ? 'active' : ''} onClick={() => setGizmo('rotate')} title="Rotate selected object (gizmo)">
              Rotate
            </button>
            <button className={dollhouse ? 'active' : ''} onClick={() => setOption('dollhouse', !dollhouse)} title="Hide walls facing the camera and the roof, to look into the rooms">
              Dollhouse
            </button>
            <button className={enhanced ? 'active' : ''} onClick={() => setOption('enhanced', !enhanced)} title="Ambient occlusion, glow and anti-aliasing in the live view">
              Enhanced
            </button>
            <button onClick={requestFrame} title="Fit the whole project in view">
              Fit view
            </button>
          </>
        )}
        <button className="primary" onClick={() => setRenderOpen(true)} title="Photorealistic path-traced render of the current view">
          Render
        </button>
        <button className={walkMode ? 'active' : ''} onClick={() => setOption('walkMode', !walkMode)} title="First-person walkthrough">
          {walkMode ? 'Exit walk' : 'Walk through'}
        </button>
      </div>
      {walkMode && (
        <div id="walk-start" className="walk-overlay" style={locked ? { opacity: 0 } : undefined}>
          <div>
            <strong>Click to look around</strong>
            <span>W A S D to walk · Shift to run · Q / E down / up · Esc to release the mouse</span>
          </div>
        </div>
      )}
    </div>
  );
}
