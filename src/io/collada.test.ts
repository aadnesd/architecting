import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { toCollada } from './collada';

/** Like getMaterial, without drawing the procedural texture (no canvas in tests). */
function getMaterial(ref: string, textured = false) {
  const m = new THREE.MeshStandardMaterial({ color: textured ? '#ffffff' : '#c6bdad' });
  m.userData.ref = ref;
  if (textured) m.map = new THREE.Texture();
  return m;
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('COLLADA export', () => {
  const box = new THREE.BoxGeometry(1, 2, 3);
  const root = new THREE.Group();
  const cabinet = new THREE.Group();
  cabinet.name = 'Sink & drawers';
  cabinet.position.set(2, 0, 1);
  cabinet.rotation.y = Math.PI / 2;
  const putty = getMaterial('putty-front');
  cabinet.add(new THREE.Mesh(box, putty), new THREE.Mesh(box, putty));
  const hidden = new THREE.Mesh(box, getMaterial('marble'));
  hidden.visible = false;
  root.add(cabinet, hidden, new THREE.Mesh(new THREE.PlaneGeometry(4, 4), getMaterial('oak-planks', true)));
  const dae = toCollada(root, { title: 'Test' });

  it('writes a COLLADA 1.4.1 document in metres, Y up', () => {
    expect(dae).toMatch(/^<\?xml/);
    expect(dae).toContain('version="1.4.1"');
    expect(dae).toContain('<unit name="meter" meter="1"/>');
    expect(dae).toContain('<up_axis>Y_UP</up_axis>');
    expect(count(dae, /<COLLADA/g)).toBe(1);
    expect(count(dae, /<\/COLLADA>/g)).toBe(1);
  });

  it('shares geometry, welds vertices and skips hidden objects', () => {
    expect(count(dae, /<geometry /g)).toBe(2);
    expect(count(dae, /<instance_geometry /g)).toBe(3);
    // A box has 24 vertices in three.js (split normals) but only 8 corners
    expect(dae).toMatch(/<accessor source="#geo0-pos-arr" count="8"/);
    expect(dae).toMatch(/<triangles material="s0" count="12">/);
    expect(dae).not.toContain('Carrara marble');
  });

  it('names materials after the finish, with the base colour of textured finishes', () => {
    expect(dae).toContain('name="Putty_painted_"');
    expect(dae).toContain('name="Oak_planks"');
    expect(count(dae, /<material /g)).toBe(2);
    // Oak planks #c49a6c instead of the white under the texture
    expect(dae).toContain('<diffuse><color>0.7686 0.6039 0.4235 1</color></diffuse>');
  });

  it('keeps groups with their transform, with names valid in COLLADA', () => {
    expect(dae).toContain('name="Sink_drawers"');
    // Row-major matrix: rotated 90° about Y, translated to (2, 0, 1)
    expect(dae).toMatch(/<matrix>0 0 1 2 0 1 0 0 -1 0 0 1 0 0 0 1<\/matrix>/);
  });

  it('writes every coordinate as a finite number at 0.01 mm precision', () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.123456789, 2, 3), getMaterial('marble'));
    m.position.set(1.23456789, 0, 0);
    g.add(m);
    const out = toCollada(g);
    const floats = [...out.matchAll(/<(float_array|matrix)[^>]*>([^<]*)</g)].flatMap((x) => x[2].trim().split(/\s+/));
    expect(floats.length).toBeGreaterThan(40);
    for (const f of floats) expect(Number.isFinite(+f) && !/e/i.test(f) && (f.split('.')[1]?.length ?? 0) <= 5).toBe(true);
    expect(out).toContain('0.06173 1 1.5');
    expect(out).toMatch(/<matrix>1 0 0 1.23457 /);
  });
});
