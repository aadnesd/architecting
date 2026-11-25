import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { toFreeCADMacro } from './freecad';

const naming = {
  isItem: (o: THREE.Object3D) => o.name.startsWith('item:'),
  labelOf: (o: THREE.Object3D) => (o.name.startsWith('item:') ? 'Base cabinet' : undefined),
  groupOf: () => ['1. etasje', 'Furniture'],
};

function box(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.userData.prim = { type: 'box', w, h, d };
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#c6bdad' }));
}

describe('FreeCAD macro export', () => {
  it('turns a box into a Part::Box in mm, Z up, north = +Y', () => {
    const root = new THREE.Group();
    const m = box(0.6, 0.9, 0.6);
    m.position.set(1, 0.45, 2); // 1 m east, 2 m south of the origin, standing on the floor
    root.add(m);
    const out = toFreeCADMacro(root, 'Test', { ...naming, isItem: () => false });
    expect(out.counts.primitives).toBe(1);
    // Corner at 0.7 m east, 1.7 m south (Y = -1700), floor level; turned +90° about X
    expect(out.py).toContain("('box', 0, \"Object 1\", 0, (600, 900, 600), (700, -1700, 0), (0.7071068, 0, 0, 0.7071068))");
    const want = { min: [700, -2300, 0], max: [1300, -1700, 900] };
    for (const k of ['min', 'max'] as const) out.refs[0][k].forEach((v, i) => expect(v).toBeCloseTo(want[k][i], 3));
  });

  it('makes each piece of furniture an App::Part with its parts placed relative to it', () => {
    const root = new THREE.Group();
    const item = new THREE.Group();
    item.name = 'item:1';
    item.position.set(2, 0, 1);
    item.rotation.y = -Math.PI / 2;
    const carcass = box(0.6, 0.8, 0.56);
    carcass.position.y = 0.4;
    item.add(carcass);
    root.add(item);
    const out = toFreeCADMacro(root, 'Test', naming);
    expect(out.counts.parts).toBe(1);
    expect(out.py).toMatch(/\('part', "Base cabinet", 1, \(2000, -1000, 0\), /);
    // Relative to the part: centred on it, from the floor up
    expect(out.py).toContain('(600, 800, 560), (-300, 0, -280)');
  });

  it('writes valid Python string literals for any name', () => {
    const root = new THREE.Group();
    const item = new THREE.Group();
    item.name = 'item:2';
    item.add(box(0.1, 0.1, 0.1));
    root.add(item);
    const out = toFreeCADMacro(root, 'Kjøkken "nord" $& \\', { ...naming, labelOf: () => 'Vindusbenk – ø' });
    expect(out.py).toContain('TITLE = "Kj\\u00f8kken \\"nord\\" $& \\\\"');
    expect(out.py).toContain('"Vindusbenk \\u2013 \\u00f8"');
    expect(out.py).not.toMatch(/__(TITLE|DOC|COLORS|CONTAINERS|PRIMS|MESHES)__/);
  });
});
