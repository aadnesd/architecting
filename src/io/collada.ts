import * as THREE from 'three';
import { getMaterialDef } from '../model/materials';

/**
 * COLLADA 1.4.1 (.dae) writer for SketchUp, which imports DAE natively but not glTF.
 * Keeps the object hierarchy (each piece of furniture becomes its own group), shares geometry
 * between identical meshes, welds duplicate vertices so SketchUp gets connected faces, and
 * writes one flat-colour material per finish (procedural textures are not included).
 * Units are metres, Y up, as in the 3D view.
 */
export function toCollada(root: THREE.Object3D, opts: { title?: string; nameOf?: (o: THREE.Object3D) => string | undefined } = {}): string {
  root.updateMatrixWorld(true);
  const effects: string[] = [];
  const materials: string[] = [];
  const geometries: string[] = [];
  const matIds = new Map<THREE.Material, string>();
  const geoIds = new Map<string, string>();
  let nodeCount = 0;

  const materialId = (m: THREE.Material) => {
    let id = matIds.get(m);
    if (id) return id;
    id = `mat${matIds.size}`;
    matIds.set(m, id);
    const { name, color, opacity, emissive } = materialLook(m);
    const c = (col: THREE.Color, a = 1) => {
      const { r, g, b } = col.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
      return `${num(r, 4)} ${num(g, 4)} ${num(b, 4)} ${a}`;
    };
    effects.push(
      `<effect id="${id}-fx"><profile_COMMON><technique sid="common"><lambert>` +
        (emissive ? `<emission><color>${c(emissive)}</color></emission>` : '') +
        `<diffuse><color>${c(color)}</color></diffuse>` +
        (opacity < 1 ? `<transparent opaque="A_ONE"><color>1 1 1 ${num(opacity)}</color></transparent><transparency><float>1</float></transparency>` : '') +
        `</lambert></technique></profile_COMMON></effect>`,
    );
    materials.push(`<material id="${id}" name="${ncname(name)}"><instance_effect url="#${id}-fx"/></material>`);
    return id;
  };

  /** `slots[i]` is the material slot of geometry group i; groups sharing a slot become one triangle list. */
  const geometryId = (g: THREE.BufferGeometry, slots: number[]) => {
    const cacheKey = `${g.uuid}|${slots.join(',')}`;
    let id = geoIds.get(cacheKey);
    if (id) return id;
    id = `geo${geoIds.size}`;
    geoIds.set(cacheKey, id);
    const pos = g.getAttribute('position');
    // Weld vertices at 0.01 mm so faces share edges
    const key = new Map<string, number>();
    const verts: number[] = [];
    const remap = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = num(pos.getX(i)),
        y = num(pos.getY(i)),
        z = num(pos.getZ(i));
      const k = `${x} ${y} ${z}`;
      let v = key.get(k);
      if (v === undefined) {
        v = key.size;
        key.set(k, v);
        verts.push(+x, +y, +z);
      }
      remap[i] = v;
    }
    const index = g.getIndex();
    const vtx = (i: number) => remap[index ? index.getX(i) : i];
    const total = index ? index.count : pos.count;
    const groups = g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const lists: number[][] = [];
    groups.forEach((gr, gi) => {
      const p = (lists[slots[gi] ?? 0] ??= []);
      const end = Math.min(total, gr.start + gr.count);
      for (let i = gr.start; i + 2 < end; i += 3) {
        const a = vtx(i),
          b = vtx(i + 1),
          c = vtx(i + 2);
        if (a !== b && b !== c && a !== c) p.push(a, b, c);
      }
    });
    const tris = lists.map(
      (p, si) => `<triangles material="s${si}" count="${p.length / 3}"><input semantic="VERTEX" source="#${id}-vtx" offset="0"/><p>${p.join(' ')}</p></triangles>`,
    );
    const n = verts.length / 3;
    geometries.push(
      `<geometry id="${id}"><mesh>` +
        `<source id="${id}-pos"><float_array id="${id}-pos-arr" count="${verts.length}">${verts.map((v) => num(v)).join(' ')}</float_array>` +
        `<technique_common><accessor source="#${id}-pos-arr" count="${n}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>` +
        `<vertices id="${id}-vtx"><input semantic="POSITION" source="#${id}-pos"/></vertices>` +
        tris.join('') +
        `</mesh></geometry>`,
    );
    return id;
  };

  const visible = (o: THREE.Object3D) => o.visible;

  const node = (o: THREE.Object3D, isRoot: boolean): string => {
    if (!visible(o)) return '';
    const children = o.children.map((c) => node(c, false)).join('');
    let own = '';
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && mesh.geometry?.getAttribute('position')) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ materialIndex: 0 }];
      // One slot per distinct material this mesh actually uses
      const used: THREE.Material[] = [];
      const slots = groups.map((gr) => {
        const m = Array.isArray(mesh.material) ? (mats[gr.materialIndex ?? 0] ?? mats[0]) : mats[0];
        let si = used.indexOf(m);
        if (si < 0) si = used.push(m) - 1;
        return si;
      });
      const gid = geometryId(mesh.geometry, slots);
      const binds = used.map((m, si) => `<instance_material symbol="s${si}" target="#${materialId(m)}"/>`).join('');
      own = `<instance_geometry url="#${gid}"><bind_material><technique_common>${binds}</technique_common></bind_material></instance_geometry>`;
    }
    if (!own && !children) return '';
    const m = isRoot ? new THREE.Matrix4() : o.matrix;
    const rowMajor = m.clone().transpose().elements.map((v) => num(v)).join(' ');
    const name = opts.nameOf?.(o) ?? o.name ?? '';
    return `<node id="node${nodeCount++}"${name ? ` name="${ncname(name)}"` : ''}><matrix>${rowMajor}</matrix>${own}${children}</node>`;
  };

  const scene = node(root, true);
  const now = new Date().toISOString();
  return (
    `<?xml version="1.0" encoding="utf-8"?>\n` +
    `<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">\n` +
    `<asset><contributor><authoring_tool>Home Designer</authoring_tool></contributor><created>${now}</created><modified>${now}</modified>` +
    `${opts.title ? `<title>${xml(opts.title)}</title>` : ''}<unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>\n` +
    `<library_effects>\n${effects.join('\n')}\n</library_effects>\n` +
    `<library_materials>\n${materials.join('\n')}\n</library_materials>\n` +
    `<library_geometries>\n${geometries.join('\n')}\n</library_geometries>\n` +
    `<library_visual_scenes><visual_scene id="scene" name="${ncname(opts.title ?? 'Scene')}">\n${scene}\n</visual_scene></library_visual_scenes>\n` +
    `<scene><instance_visual_scene url="#scene"/></scene>\n` +
    `</COLLADA>\n`
  );
}

/** Colour of a material as SketchUp should show it: the finish's base colour for textured finishes. */
function materialLook(m: THREE.Material) {
  const ref = m.userData?.ref as string | undefined;
  const std = m as THREE.MeshStandardMaterial;
  const color = std.color ? std.color.clone() : new THREE.Color(0.8, 0.8, 0.8);
  let name = m.name || 'Material';
  if (ref) {
    const def = getMaterialDef(ref);
    name = def.name;
    if (std.map) color.set(def.color);
  }
  const emissive = std.emissive && std.emissiveIntensity > 0 && std.emissive.getHex() !== 0 ? std.emissive : undefined;
  return { name, color, opacity: m.transparent ? m.opacity : 1, emissive };
}

function num(v: number, digits = 5) {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? '0' : String(r);
}

/** COLLADA names must be XML NCNames: letters, digits, '.', '-', '_' and no leading digit. */
function ncname(s: string) {
  const n = s.trim().replace(/[^\p{L}\p{N}._-]+/gu, '_');
  return /^[\p{L}_]/u.test(n) ? n : `_${n}`;
}

function xml(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
}
