import * as THREE from 'three';
import { getMaterialDef } from '../model/materials';

/**
 * FreeCAD export as a Python macro. Run it in FreeCAD (Macro → Macros… → Execute) and it builds
 * the model as native objects in a new document:
 *  - furniture from boxes, cylinders, cones, ellipsoids and wedges (Part primitives whose sizes
 *    stay editable), one App::Part per piece of furniture so it can be moved as a whole;
 *  - walls, floors, roofs and other shaped parts as solids converted from their meshes;
 *  - everything grouped by level and kind, named after the project, coloured by finish.
 * Millimetres, Z up (FreeCAD's convention); plan x is east, plan north is +Y.
 */

export interface FreeCADExport {
  py: string;
  /** World bounding box (mm, FreeCAD axes) of every primitive, in macro order; for tests. */
  refs: { min: number[]; max: number[] }[];
  counts: { primitives: number; meshes: number; parts: number };
}

export interface ExportNaming {
  /** Group path for an object, e.g. ["1. etasje", "Furniture"]; undefined to use "Other". */
  groupOf: (o: THREE.Object3D) => string[] | undefined;
  /** Label of an object that becomes its own App::Part (furniture) or solid (walls, roofs…). */
  labelOf: (o: THREE.Object3D) => string | undefined;
  /** Whether this object's subtree is one piece of furniture (becomes an App::Part). */
  isItem: (o: THREE.Object3D) => boolean;
}

/** Three.js world (x, y up, z = plan y) → FreeCAD (X, Y = -z, Z = y): a +90° turn about X. */
const Q_C = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
/** Part::Cylinder and Part::Cone grow along their local Z; ours along local Y. */
const Q_ZY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const MM = 1000;

const toFC = (v: THREE.Vector3) => new THREE.Vector3(v.x * MM, -v.z * MM, v.y * MM);

export function toFreeCADMacro(root: THREE.Object3D, title: string, naming: ExportNaming): FreeCADExport {
  root.updateMatrixWorld(true);
  const colors: string[] = [];
  const colorIdx = new Map<string, number>();
  const containers: string[] = []; // python tuples: (kind, label, parent, pos, quat)
  const containerIdx = new Map<string, number>();
  const prims: string[] = [];
  const meshes: string[] = [];
  const refs: FreeCADExport['refs'] = [];
  let parts = 0;

  const colorOf = (m: THREE.Material | undefined) => {
    const std = m as THREE.MeshStandardMaterial | undefined;
    const ref = m?.userData?.ref as string | undefined;
    const c = new THREE.Color(0.8, 0.8, 0.8);
    if (std?.color) c.copy(std.color);
    let name = m?.name || 'Material';
    if (ref) {
      const def = getMaterialDef(ref);
      name = def.name;
      if (std?.map) c.set(def.color);
    }
    const { r, g, b } = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    const transparency = m?.transparent ? Math.round((1 - m.opacity) * 100) : 0;
    const key = `(${n3(r)}, ${n3(g)}, ${n3(b)}, ${transparency}, ${py(name)})`;
    let i = colorIdx.get(key);
    if (i === undefined) {
      i = colors.length;
      colors.push(key);
      colorIdx.set(key, i);
    }
    return i;
  };

  const group = (path: string[]): number => {
    let parent = -1;
    for (let d = 0; d < path.length; d++) {
      const key = path.slice(0, d + 1).join('\u0000');
      let i = containerIdx.get(key);
      if (i === undefined) {
        i = containers.length;
        containers.push(`('group', ${py(path[d])}, ${parent}, None, None)`);
        containerIdx.set(key, i);
      }
      parent = i;
    }
    return parent;
  };

  /** Placement of a three.js world (or item-relative) matrix in FreeCAD axes, split from its scale. */
  const decompose = (m: THREE.Matrix4) => {
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    m.decompose(pos, q, s);
    return { pos, q, s: new THREE.Vector3(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) };
  };

  const placement = (pos: THREE.Vector3, q: THREE.Quaternion, relative: boolean) => {
    // A child of an App::Part is placed in the Part's frame, which is already in FreeCAD axes
    const p = relative ? new THREE.Vector3(pos.x * MM, pos.y * MM, pos.z * MM) : toFC(pos);
    const qq = relative ? q.clone() : Q_C.clone().multiply(q);
    return { p, q: qq };
  };

  /** Emits a primitive; returns false when the mesh isn't one (or is distorted). */
  const primitive = (mesh: THREE.Mesh, local: THREE.Matrix4, parent: number, label: string, ci: number, relative: boolean, world: THREE.Matrix4) => {
    const g = mesh.geometry;
    const prim = g.userData?.prim as { type: string; w: number; h: number; d: number; w0: number; w1: number } | undefined;
    const params = (g as unknown as { parameters?: Record<string, number> }).parameters;
    const { pos, q, s } = decompose(local);
    const { p, q: fq } = placement(pos, q, relative);
    let line: string | null = null;
    const at = (off: THREE.Vector3) => p.clone().add(off.multiplyScalar(MM).applyQuaternion(fq));
    const box = prim?.type === 'box' ? prim : g.type === 'BoxGeometry' && params ? { w: params.width, h: params.height, d: params.depth } : null;
    if (box) {
      const [w, h, d] = [box.w * s.x, box.h * s.y, box.d * s.z];
      line = `('box', ${parent}, ${py(label)}, ${ci}, (${n(w * MM)}, ${n(h * MM)}, ${n(d * MM)}), ${vec(at(new THREE.Vector3(-w / 2, -h / 2, -d / 2)))}, ${quat(fq)})`;
    } else if (prim?.type === 'taper' && near(s.x, 1) && near(s.y, 1) && near(s.z, 1)) {
      line = `('wedge', ${parent}, ${py(label)}, ${ci}, (${n(prim.w0 * MM)}, ${n(prim.w1 * MM)}, ${n(prim.h * MM)}, ${n(prim.d * MM)}), ${vec(p)}, ${quat(fq)})`;
    } else if ((g.type === 'CylinderGeometry' || g.type === 'ConeGeometry') && params && near(params.thetaLength ?? Math.PI * 2, Math.PI * 2) && near(s.x, s.z) && (params.radialSegments ?? 32) >= 12) {
      // (few-sided "cylinders" are prisms by design, e.g. square legs, and stay exact as solids)
      const rt = (g.type === 'ConeGeometry' ? 0 : params.radiusTop) * s.x;
      const rb = (g.type === 'ConeGeometry' ? params.radius : params.radiusBottom) * s.x;
      const h = params.height * s.y;
      const cq = fq.clone().multiply(Q_ZY);
      line = `('cyl', ${parent}, ${py(label)}, ${ci}, (${n(rb * MM)}, ${n(rt * MM)}, ${n(h * MM)}), ${vec(at(new THREE.Vector3(0, -h / 2, 0)))}, ${quat(cq)})`;
    } else if (g.type === 'SphereGeometry' && params && near(params.phiLength, Math.PI * 2) && near(params.thetaLength, Math.PI)) {
      const r = params.radius;
      line = `('ellipsoid', ${parent}, ${py(label)}, ${ci}, (${n(r * s.z * MM)}, ${n(r * s.x * MM)}, ${n(r * s.y * MM)}), ${vec(p)}, ${quat(fq)})`;
    }
    if (!line) return false;
    prims.push(line);
    // Exact world bounds from the transformed vertices (a rotated bounding box would overstate round parts)
    const b = new THREE.Box3();
    const pa = g.getAttribute('position') as THREE.BufferAttribute;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) b.expandByPoint(tmp.fromBufferAttribute(pa, i).applyMatrix4(world));
    const c = [toFC(b.min), toFC(b.max)];
    refs.push({ min: [Math.min(c[0].x, c[1].x), Math.min(c[0].y, c[1].y), Math.min(c[0].z, c[1].z)], max: [Math.max(c[0].x, c[1].x), Math.max(c[0].y, c[1].y), Math.max(c[0].z, c[1].z)] });
    return true;
  };

  /** Any other mesh: triangles in mm (in its App::Part's frame, or the world), turned into a solid by the macro. */
  const meshSolid = (mesh: THREE.Mesh, m: THREE.Matrix4, relative: boolean, parent: number, label: string) => {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const idx = g.getIndex();
    const total = idx ? idx.count : pos.count;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Colour of the material covering most triangles
    const share = new Map<number, number>();
    const grs = Array.isArray(mesh.material) && g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    for (const gr of grs) share.set(gr.materialIndex ?? 0, (share.get(gr.materialIndex ?? 0) ?? 0) + gr.count);
    const main = [...share.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
    const ci = colorOf(mats[main] ?? mats[0]);
    const verts: string[] = [];
    const vmap = new Map<string, number>();
    const tris: number[] = [];
    const v = new THREE.Vector3();
    const vid = (i: number) => {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m);
      const f = relative ? v.clone().multiplyScalar(MM) : toFC(v);
      const key = `(${n(f.x)}, ${n(f.y)}, ${n(f.z)})`;
      let k = vmap.get(key);
      if (k === undefined) {
        k = verts.length;
        verts.push(key);
        vmap.set(key, k);
      }
      return k;
    };
    for (let i = 0; i + 2 < total; i += 3) {
      const a = vid(idx ? idx.getX(i) : i);
      const b = vid(idx ? idx.getX(i + 1) : i + 1);
      const c = vid(idx ? idx.getX(i + 2) : i + 2);
      if (a !== b && b !== c && a !== c) tris.push(a, b, c);
    }
    if (!tris.length) return;
    meshes.push(`(${parent}, ${py(label)}, ${ci}, [${verts.join(', ')}], [${tris.join(', ')}])`);
  };

  const visit = (o: THREE.Object3D, ctx: { parent: number; item: THREE.Object3D | null; label: string; seq: { n: number } }) => {
    if (!o.visible) return;
    let next = ctx;
    if (o !== root && naming.isItem(o)) {
      // A piece of furniture: an App::Part placed like the item, its parts relative to it
      const label = naming.labelOf(o) ?? 'Item';
      const g = group(naming.groupOf(o) ?? ['Other']);
      const mirrored = o.matrixWorld.determinant() < 0;
      if (!mirrored) {
        const { pos, q } = decompose(o.matrixWorld);
        const { p, q: fq } = placement(pos, q, false);
        const idx = containers.length;
        containers.push(`('part', ${py(label)}, ${g}, ${vec(p)}, ${quat(fq)})`);
        parts++;
        next = { parent: idx, item: o, label, seq: { n: 0 } };
      } else next = { parent: group([...(naming.groupOf(o) ?? ['Other']), label]), item: null, label, seq: { n: 0 } };
    } else if (o !== root && !ctx.item && naming.labelOf(o)) {
      next = { parent: group(naming.groupOf(o) ?? ['Other']), item: null, label: naming.labelOf(o)!, seq: { n: 0 } };
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && mesh.geometry?.getAttribute('position')) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const label = `${next.label} ${++next.seq.n}`;
      const parent = next.parent >= 0 ? next.parent : group(['Other']);
      const local = next.item ? next.item.matrixWorld.clone().invert().multiply(mesh.matrixWorld) : mesh.matrixWorld;
      // Geometry groups only matter with a material array (three.js boxes always carry six face groups)
      const multi = Array.isArray(mesh.material) && new Set(mesh.geometry.groups.map((gr) => gr.materialIndex ?? 0)).size > 1;
      const single = !multi;
      const ci = colorOf(Array.isArray(mesh.material) ? (mats[mesh.geometry.groups[0]?.materialIndex ?? 0] ?? mats[0]) : mats[0]);
      if (!(single && primitive(mesh, local, parent, label, ci, !!next.item, mesh.matrixWorld))) meshSolid(mesh, local, !!next.item, parent, label);
    }
    for (const c of o.children) visit(c, next);
  };
  visit(root, { parent: -1, item: null, label: 'Object', seq: { n: 0 } });

  const docName = title.replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '') || 'Home';
  // Function replacers: the data may contain '$' patterns that string replacements would expand
  const fill: Record<string, string> = {
    __TITLE__: py(title),
    __DOC__: py(docName),
    __COLORS__: colors.join(',\n  '),
    __CONTAINERS__: containers.join(',\n  '),
    __PRIMS__: prims.join(',\n  '),
    __MESHES__: meshes.join(',\n  '),
  };
  const py_ = MACRO.replace(/__(TITLE|DOC|COLORS|CONTAINERS|PRIMS|MESHES)__/g, (k) => fill[k]);
  return { py: py_, refs, counts: { primitives: prims.length, meshes: meshes.length, parts } };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-4 * Math.max(1, Math.abs(b));
const n = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};
const n3 = (v: number) => String(Math.round(v * 1000) / 1000);
const vec = (v: THREE.Vector3) => `(${n(v.x)}, ${n(v.y)}, ${n(v.z)})`;
const quat = (q: THREE.Quaternion) => {
  const r = (x: number) => String(Math.round(x * 1e7) / 1e7);
  return `(${r(q.x)}, ${r(q.y)}, ${r(q.z)}, ${r(q.w)})`;
};
/** Python string literal (JSON strings are valid Python, with \uXXXX escapes for non-ASCII). */
const py = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

const MACRO = `# -*- coding: utf-8 -*-
# Exported from Home Designer as a FreeCAD macro.
#
# In FreeCAD: Macro > Macros... > choose this file > Execute (or open it and press the green play button).
# It builds a new document: furniture from editable Part primitives (one App::Part per piece, so you can
# move it by its Placement), walls, floors and roofs as solids, grouped by level, coloured by finish.
# Units: millimetres. Z is up, plan north is +Y.
# Run with FreeCADCmd (no GUI) and it saves the document as an .FCStd file next to the macro.

import os
import FreeCAD as App
import Part
import Mesh
from FreeCAD import Placement, Rotation, Vector

TITLE = __TITLE__
DOC_NAME = __DOC__

# (r, g, b, transparency %, finish name)
COLORS = [
  __COLORS__
]

# ('group' | 'part', label, parent index or -1, position, quaternion (x, y, z, w))
CONTAINERS = [
  __CONTAINERS__
]

# (kind, container, label, colour, sizes, position, quaternion)
#   box: (length X, width Y, height Z)    wedge: (bottom width, top width, height Y, depth Z)
#   cyl: (bottom radius, top radius, height)    ellipsoid: (radius Z, radius X, radius Y)
PRIMS = [
  __PRIMS__
]

# (container, label, colour, vertices, triangles) - turned into solids
MESHES = [
  __MESHES__
]


def place(p, q):
    return Placement(Vector(*p), Rotation(*q)) if p is not None else Placement()


def style(obj, ci):
    if not App.GuiUp:
        return
    r, g, b, t, _ = COLORS[ci]
    vo = obj.ViewObject
    vo.ShapeColor = (r, g, b)
    vo.Transparency = t


def build():
    doc = App.newDocument(DOC_NAME)
    doc.Label = TITLE
    made = []
    for kind, label, parent, p, q in CONTAINERS:
        if kind == 'part':
            o = doc.addObject('App::Part', 'Part')
            o.Placement = place(p, q)
        else:
            o = doc.addObject('App::DocumentObjectGroup', 'Group')
        o.Label = label
        if parent >= 0:
            made[parent].addObject(o)
        made.append(o)

    for kind, parent, label, ci, s, p, q in PRIMS:
        if kind == 'box':
            o = doc.addObject('Part::Box', 'Box')
            o.Length, o.Width, o.Height = s
        elif kind == 'wedge':
            w0, w1, h, d = s
            o = doc.addObject('Part::Wedge', 'Wedge')
            o.Xmin, o.Xmax, o.X2min, o.X2max = -w0 / 2, w0 / 2, -w1 / 2, w1 / 2
            o.Ymin, o.Ymax = 0, h
            o.Zmin, o.Zmax, o.Z2min, o.Z2max = 0, d, 0, d
        elif kind == 'cyl':
            rb, rt, h = s
            if abs(rb - rt) < 0.05:
                o = doc.addObject('Part::Cylinder', 'Cylinder')
                o.Radius, o.Height = rb, h
            else:
                o = doc.addObject('Part::Cone', 'Cone')
                o.Radius1, o.Radius2, o.Height = rb, rt, h
        else:
            o = doc.addObject('Part::Ellipsoid', 'Ellipsoid')
            o.Radius1, o.Radius2, o.Radius3 = s
        o.Label = label
        o.Placement = place(p, q)
        made[parent].addObject(o)
        style(o, ci)

    failed = 0
    for parent, label, ci, verts, tris in MESHES:
        facets = [[verts[tris[i]], verts[tris[i + 1]], verts[tris[i + 2]]] for i in range(0, len(tris), 3)]
        shape = Part.Shape()
        shape.makeShapeFromMesh(Mesh.Mesh(facets).Topology, 0.05)
        try:
            shell = Part.Shell(shape.Faces)
            solid = Part.Solid(shell) if shell.isClosed() else shell
            solid = solid.removeSplitter()
        except Exception:
            solid = shape
            failed += 1
        o = doc.addObject('Part::Feature', 'Solid')
        o.Label = label
        o.Shape = solid
        made[parent].addObject(o)
        style(o, ci)

    doc.recompute()
    if App.GuiUp:
        import FreeCADGui as Gui
        Gui.activeDocument().activeView().viewIsometric()
        Gui.SendMsgToActiveView('ViewFit')
    App.Console.PrintMessage('%s: %d parts, %d primitives, %d solids (%d kept as shells)\\n' % (TITLE, sum(1 for c in CONTAINERS if c[0] == 'part'), len(PRIMS), len(MESHES), failed))
    return doc


doc = build()
if not App.GuiUp:
    here = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.getcwd()
    doc.saveAs(os.path.join(here, DOC_NAME + '.FCStd'))
`;
