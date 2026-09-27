import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { Opening, Room, Vec2, Wall } from '../model/types';
import { wallFootprint, wallHeightAt, wallDir, wallLength } from '../geometry/walls';
import { perp } from '../geometry/math';
import type { P3, Poly3 } from '../geometry/roof';

const M = 0.01; // cm -> m

export const toWorld = (p: Vec2, h = 0) => new THREE.Vector3(p.x * M, h * M, p.y * M);

/** World-space planar UVs (in metres) per triangle, aligned with each face. Works on non-indexed geometry. */
export function planarUV(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const e = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    if (Math.abs(n.y) > 0.999) e.set(1, 0, 0);
    else e.crossVectors(up, n).normalize();
    s.crossVectors(n, e).normalize();
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      uv[(i + k) * 2] = p.dot(e);
      uv[(i + k) * 2 + 1] = p.dot(s);
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * Triangles of a closed convex solid from polygon faces (world coordinates), sorted into buckets by
 * `groupOf(faceIndex)`; triangle winding is fixed so every face points away from the solid's centroid.
 */
function convexSolidTris(faces: THREE.Vector3[][], groupOf: (face: number) => number = () => 0, buckets: number[][] = [[]]) {
  const centroid = new THREE.Vector3();
  let count = 0;
  for (const f of faces)
    for (const p of f) {
      centroid.add(p);
      count++;
    }
  centroid.divideScalar(Math.max(1, count));
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const tc = new THREE.Vector3();
  faces.forEach((f, fi) => {
    const out = (buckets[groupOf(fi)] ??= []);
    for (let i = 1; i + 1 < f.length; i++) {
      const a = f[0];
      let b = f[i];
      let c = f[i + 1];
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      const n = ab.clone().cross(ac);
      if (n.lengthSq() < 1e-12) continue;
      tc.copy(a).add(b).add(c).divideScalar(3).sub(centroid);
      if (n.dot(tc) < 0) [b, c] = [c, b];
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
  });
  return buckets;
}

function geometryFromBuckets(buckets: number[][]) {
  const all: number[] = [];
  const geo = new THREE.BufferGeometry();
  let start = 0;
  buckets.forEach((b, i) => {
    for (const v of b) all.push(v);
    if (buckets.length > 1) geo.addGroup(start, b.length / 3, i);
    start += b.length / 3;
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  geo.computeVertexNormals();
  return planarUV(geo);
}

/** Closed convex solid from polygon faces (world coordinates). */
export function convexSolid(faces: THREE.Vector3[][]): THREE.BufferGeometry {
  return geometryFromBuckets(convexSolidTris(faces));
}

/** Prism between polygon `poly` and the same polygon translated by `offset` (world units). */
export function prism(poly: THREE.Vector3[], offset: THREE.Vector3) {
  const top = poly.map((p) => p.clone().add(offset));
  const faces: THREE.Vector3[][] = [poly, top];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    faces.push([poly[i], poly[j], top[j], top[i]]);
  }
  return convexSolid(faces);
}

const evaluator = new Evaluator();
evaluator.useGroups = false;

/**
 * Wall solid with mitred corners, optional slope and openings cut out.
 * Output groups: 0 = left face, 1 = right face, 2 = top / ends / reveals.
 */
export function buildWallGeometry(wall: Wall, walls: Wall[], openings: Opening[]): THREE.BufferGeometry {
  const f = wallFootprint(wall, walls);
  const corners = [f.startLeft, f.endLeft, f.endRight, f.startRight];
  const bottom = corners.map((p) => toWorld(p, 0));
  const top = corners.map((p) => toWorld(p, wallHeightAt(wall, p)));
  const faces: THREE.Vector3[][] = [bottom, top];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    faces.push([bottom[i], bottom[j], top[j], top[i]]);
  }
  let geo = convexSolid(faces);

  const L = wallLength(wall);
  const dir = wallDir(wall);
  const angle = Math.atan2(dir.y, dir.x);
  const valid = openings.filter((o) => o.width > 1 && o.height > 1 && o.offset > 0 && o.offset < L);
  if (valid.length) {
    let brush = new Brush(geo);
    brush.updateMatrixWorld();
    for (const o of valid) {
      const cut = new Brush(new THREE.BoxGeometry(o.width * M, o.height * M, (wall.thickness + 40) * M));
      const c = { x: wall.a.x + dir.x * o.offset, y: wall.a.y + dir.y * o.offset };
      cut.position.set(c.x * M, (o.sill + o.height / 2) * M, c.y * M);
      cut.rotation.y = -angle;
      cut.updateMatrixWorld();
      brush = evaluator.evaluate(brush, cut, SUBTRACTION);
    }
    geo = brush.geometry.index ? brush.geometry.toNonIndexed() : brush.geometry;
  }
  return groupWallFaces(geo, wall);
}

function groupWallFaces(src: THREE.BufferGeometry, wall: Wall) {
  const pos = src.getAttribute('position');
  const left = perp(wallDir(wall));
  const ln = new THREE.Vector3(left.x, 0, left.y);
  const buckets: number[][] = [[], [], []];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const d = n.dot(ln);
    const k = d > 0.95 ? 0 : d < -0.95 ? 1 : 2;
    buckets[k].push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const all = [...buckets[0], ...buckets[1], ...buckets[2]];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  let start = 0;
  buckets.forEach((bk, i) => {
    geo.addGroup(start, bk.length / 3, i);
    start += bk.length / 3;
  });
  geo.computeVertexNormals();
  planarUV(geo);
  src.dispose();
  return geo;
}

const p3 = (p: P3, lift = 0) => new THREE.Vector3(p.x * M, (p.h + lift) * M, p.y * M);

/**
 * Roof surface faces thickened upwards into slabs.
 * Groups: 0 = roofing (top), 1 = fascia / barge boards (edges), 2 = soffit (underside).
 */
export function buildRoofSurface(faces: Poly3[], thickness: number) {
  const buckets: number[][] = [[], [], []];
  const up = new THREE.Vector3(0, thickness * M, 0);
  for (const f of faces) {
    const bottom = f.map((p) => p3(p));
    const top = bottom.map((q) => q.clone().add(up));
    const sides: THREE.Vector3[][] = bottom.map((q, i) => {
      const j = (i + 1) % bottom.length;
      return [q, bottom[j], top[j], top[i]];
    });
    convexSolidTris([bottom, top, ...sides], (i) => (i === 0 ? 2 : i === 1 ? 0 : 1), buckets);
  }
  return geometryFromBuckets(buckets);
}

export function buildInfill(infill: { poly: Poly3; inward: Vec2 }[], thickness: number) {
  const geos = infill.map(({ poly, inward }) => prism(poly.map((p) => p3(p)), new THREE.Vector3(inward.x * thickness * M, 0, inward.y * thickness * M)));
  return mergeGeometries(geos);
}

export function mergeGeometries(geos: THREE.BufferGeometry[]) {
  let total = 0;
  for (const g of geos) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position');
    pos.set(p.array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, o * 2);
    o += p.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function roomShape(room: Room) {
  return new THREE.Shape(room.points.map((p) => new THREE.Vector2(p.x * M, p.y * M)));
}

/** Floor slab: top surface at y = 0, extending `thickness` downwards. */
export function buildFloorGeometry(room: Room, thickness: number) {
  const geo = new THREE.ExtrudeGeometry(roomShape(room), { depth: Math.max(1, thickness) * M, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  const ni = geo.index ? geo.toNonIndexed() : geo;
  return planarUV(ni);
}

/** Ceiling surface facing downwards at y = 0. */
export function buildCeilingGeometry(room: Room) {
  const geo = new THREE.ShapeGeometry(roomShape(room));
  geo.rotateX(Math.PI / 2);
  const ni = geo.index ? geo.toNonIndexed() : geo;
  return planarUV(ni);
}
