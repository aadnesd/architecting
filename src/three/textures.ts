import * as THREE from 'three';
import { getMaterialDef, type MaterialDef } from '../model/materials';
import type { MaterialRef } from '../model/types';

const TEX = 512;

// Deterministic pseudo-random numbers so textures look identical on every load.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function noise(ctx: CanvasRenderingContext2D, r: () => number, amount: number, count = 9000, size = 2) {
  for (let i = 0; i < count; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${r() * amount})`;
    ctx.fillRect(r() * TEX, r() * TEX, size, size);
  }
}

function woodGrain(ctx: CanvasRenderingContext2D, r: () => number, x: number, y: number, w: number, h: number, c2: string, vertical = false) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = c2;
  const lines = Math.floor((vertical ? w : h) / 3);
  for (let i = 0; i < lines; i++) {
    ctx.globalAlpha = 0.08 + r() * 0.22;
    ctx.lineWidth = 0.5 + r() * 1.5;
    ctx.beginPath();
    const off = (vertical ? x : y) + r() * (vertical ? w : h);
    const amp = 1 + r() * 3;
    const freq = 0.01 + r() * 0.03;
    const phase = r() * 10;
    for (let t = 0; t <= (vertical ? h : w); t += 8) {
      const d = off + Math.sin(t * freq + phase) * amp;
      if (vertical) ctx.lineTo(d, y + t);
      else ctx.lineTo(x + t, d);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPattern(def: MaterialDef, ctx: CanvasRenderingContext2D) {
  const r = rng(hashStr(def.id));
  const c = def.color;
  const c2 = def.color2 ?? shade(c, -0.1);
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, TEX, TEX);
  switch (def.pattern) {
    case 'planks': {
      const rows = 8;
      const rh = TEX / rows;
      for (let row = 0; row < rows; row++) {
        let x = -r() * TEX;
        while (x < TEX) {
          const w = TEX * (0.45 + r() * 0.5);
          const tone = shade(c, (r() - 0.5) * 0.08);
          for (const dx of [0, TEX]) {
            ctx.fillStyle = tone;
            ctx.fillRect(x + dx, row * rh, w, rh);
            woodGrain(ctx, r, x + dx, row * rh, w, rh, c2);
          }
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(((x % TEX) + TEX) % TEX, row * rh, 2, rh);
          x += w;
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, row * rh, TEX, 2);
      }
      break;
    }
    case 'herringbone': {
      // Axis-aligned herringbone: horizontal plank at (k, k), vertical plank at (k, k + 1),
      // on the lattice spanned by (1, 1) and (2, -2). It repeats every 4 plank widths.
      const w = TEX / 16;
      ctx.lineWidth = 1.5;
      for (let a = -40; a < 40; a++)
        for (let b = -20; b < 20; b++) {
          const bx = (a + 2 * b) * w;
          const by = (a - 2 * b) * w;
          if (bx < -3 * w || by < -3 * w || bx > TEX || by > TEX) continue;
          for (const [x, y, pw, ph, vert] of [
            [bx, by, 2 * w, w, false],
            [bx, by + w, w, 2 * w, true],
          ] as [number, number, number, number, boolean][]) {
            ctx.fillStyle = shade(c, (r() - 0.5) * 0.1);
            ctx.fillRect(x, y, pw, ph);
            woodGrain(ctx, r, x, y, pw, ph, c2, vert);
            ctx.strokeStyle = 'rgba(0,0,0,0.3)';
            ctx.strokeRect(x, y, pw, ph);
          }
        }
      break;
    }
    case 'tiles': {
      const n = 2;
      const s = TEX / n;
      const checker = def.id.includes('checker');
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          ctx.fillStyle = checker ? ((i + j) % 2 ? c2 : c) : shade(c, (r() - 0.5) * 0.05);
          ctx.fillRect(i * s, j * s, s, s);
        }
      noise(ctx, r, 0.05);
      if (!checker) {
        ctx.strokeStyle = c2;
        ctx.lineWidth = 4;
        for (let i = 0; i <= n; i++) {
          ctx.beginPath();
          ctx.moveTo(i * s, 0);
          ctx.lineTo(i * s, TEX);
          ctx.moveTo(0, i * s);
          ctx.lineTo(TEX, i * s);
          ctx.stroke();
        }
      }
      break;
    }
    case 'hex': {
      const R = TEX / 6;
      const w = Math.sqrt(3) * R;
      ctx.strokeStyle = c2;
      ctx.lineWidth = 3;
      for (let row = -1; row < 6; row++)
        for (let col = -1; col < 5; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0);
          const cy = row * R * 1.5;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k + Math.PI / 6;
            ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
          }
          ctx.closePath();
          ctx.fillStyle = shade(c, (r() - 0.5) * 0.05);
          ctx.fill();
          ctx.stroke();
        }
      break;
    }
    case 'subway':
    case 'brick': {
      const rows = def.pattern === 'brick' ? 6 : 4;
      const rh = TEX / rows;
      const bw = TEX / 2;
      ctx.fillStyle = c2;
      ctx.fillRect(0, 0, TEX, TEX);
      const gap = def.pattern === 'brick' ? 6 : 4;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let k = -1; k < 3; k++) {
          ctx.fillStyle = shade(c, (r() - 0.5) * (def.pattern === 'brick' ? 0.12 : 0.03));
          ctx.fillRect(k * bw + off + gap / 2, row * rh + gap / 2, bw - gap, rh - gap);
        }
      }
      noise(ctx, r, def.pattern === 'brick' ? 0.15 : 0.04);
      break;
    }
    case 'marble': {
      noise(ctx, r, 0.04, 6000, 3);
      ctx.strokeStyle = c2;
      for (let i = 0; i < 14; i++) {
        ctx.globalAlpha = 0.1 + r() * 0.35;
        ctx.lineWidth = 0.5 + r() * 2.5;
        ctx.beginPath();
        let x = r() * TEX;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < TEX) {
          x += (r() - 0.45) * 40;
          y += 10 + r() * 25;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'noise': {
      noise(ctx, r, 0.08, 20000, 2);
      ctx.fillStyle = c2;
      for (let i = 0; i < 30; i++) {
        ctx.globalAlpha = 0.05;
        ctx.beginPath();
        ctx.arc(r() * TEX, r() * TEX, 20 + r() * 60, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'terrazzo': {
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = r() < 0.6 ? c2 : shade(c2, r() * 0.3);
        ctx.globalAlpha = 0.5 + r() * 0.5;
        const s = 1 + r() * 6;
        ctx.beginPath();
        ctx.ellipse(r() * TEX, r() * TEX, s, s * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'grass': {
      for (let i = 0; i < 22000; i++) {
        ctx.fillStyle = r() < 0.5 ? c2 : shade(c, (r() - 0.5) * 0.15);
        ctx.fillRect(r() * TEX, r() * TEX, 1.5, 3 + r() * 4);
      }
      break;
    }
    case 'roofTiles': {
      const rows = 6;
      const rh = TEX / rows;
      const cols = 4;
      const cw = TEX / cols;
      for (let row = 0; row < rows; row++) {
        for (let k = 0; k < cols; k++) {
          const g = ctx.createLinearGradient(k * cw, 0, (k + 1) * cw, 0);
          const tone = shade(c, (r() - 0.5) * 0.08);
          g.addColorStop(0, shade(tone, -0.08));
          g.addColorStop(0.5, shade(tone, 0.06));
          g.addColorStop(1, shade(tone, -0.1));
          ctx.fillStyle = g;
          ctx.fillRect(k * cw, row * rh, cw, rh);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, row * rh + rh - 5, TEX, 5);
      }
      break;
    }
    case 'shingles': {
      const rows = 8;
      const rh = TEX / rows;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? TEX / 8 : 0;
        for (let k = -1; k < 4; k++) {
          ctx.fillStyle = shade(c, (r() - 0.5) * 0.12);
          ctx.fillRect(k * (TEX / 4) + off + 2, row * rh, TEX / 4 - 4, rh - 3);
        }
      }
      noise(ctx, r, 0.1);
      break;
    }
    case 'seam': {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const x = (i * TEX) / n;
        ctx.fillStyle = shade(c, 0.12);
        ctx.fillRect(x, 0, 5, TEX);
        ctx.fillStyle = c2;
        ctx.fillRect(x + 5, 0, 3, TEX);
      }
      break;
    }
    case 'cladding': {
      const n = 6;
      const bh = TEX / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(c, (r() - 0.5) * 0.05);
        ctx.fillRect(0, i * bh, TEX, bh);
        woodGrain(ctx, r, 0, i * bh, TEX, bh, c2);
        const g = ctx.createLinearGradient(0, i * bh + bh - 10, 0, i * bh + bh);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, i * bh + bh - 10, TEX, 10);
      }
      break;
    }
    case 'lattice': {
      // Diagonal lattice (spileverk): dark background with crossing white slats.
      ctx.fillStyle = c2;
      ctx.fillRect(0, 0, TEX, TEX);
      ctx.strokeStyle = c;
      ctx.lineWidth = TEX / 14;
      for (let k = -TEX; k <= 2 * TEX; k += TEX / 3) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k + TEX, TEX);
        ctx.moveTo(k, TEX);
        ctx.lineTo(k + TEX, 0);
        ctx.stroke();
      }
      break;
    }
    case 'verticalCladding': {
      // Norwegian "ståendepanel": wide boards with narrow battens and shadow grooves.
      const n = 4;
      const bw = TEX / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(c, (r() - 0.5) * 0.04);
        ctx.fillRect(i * bw, 0, bw, TEX);
        woodGrain(ctx, r, i * bw, 0, bw, TEX, c2, true);
        // Groove shadow and a lit batten edge
        const g = ctx.createLinearGradient(i * bw, 0, i * bw + 14, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.45)');
        g.addColorStop(0.4, 'rgba(0,0,0,0.12)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(i * bw, 0, 14, TEX);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(i * bw + bw - 3, 0, 3, TEX);
      }
      break;
    }
    case 'woodgrain': {
      woodGrain(ctx, r, 0, 0, TEX, TEX, c2);
      break;
    }
    case 'stone': {
      ctx.fillStyle = c2;
      ctx.fillRect(0, 0, TEX, TEX);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = shade(c, (r() - 0.5) * 0.15);
        ctx.beginPath();
        const cx = r() * TEX;
        const cy = r() * TEX;
        const rad = 30 + r() * 45;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const rr = rad * (0.7 + r() * 0.3);
          ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7);
        }
        ctx.closePath();
        ctx.fill();
      }
      noise(ctx, r, 0.1);
      break;
    }
    case 'none':
      break;
  }
}

const textureCache = new Map<string, THREE.CanvasTexture>();

export function getTexture(def: MaterialDef) {
  let tex = textureCache.get(def.id);
  if (!tex) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEX;
    const ctx = canvas.getContext('2d')!;
    drawPattern(def, ctx);
    tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    textureCache.set(def.id, tex);
  }
  return tex;
}

/** Small swatch image for material pickers. */
const swatchCache = new Map<string, string>();
export function materialSwatch(ref: MaterialRef): string {
  const def = getMaterialDef(ref);
  if (def.pattern === 'none') return '';
  let url = swatchCache.get(def.id);
  if (!url) {
    const canvas = getTexture(def).image as HTMLCanvasElement;
    const small = document.createElement('canvas');
    small.width = small.height = 48;
    small.getContext('2d')!.drawImage(canvas, 0, 0, TEX / 2, TEX / 2, 0, 0, 48, 48);
    url = small.toDataURL();
    swatchCache.set(def.id, url);
  }
  return url;
}

const materialCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Shared material for a material reference. UVs are expected in metres; the texture repeat is set
 * from the material's real-world size.
 */
export function getMaterial(ref: MaterialRef, variant = ''): THREE.MeshStandardMaterial {
  const key = `${ref}|${variant}`;
  let m = materialCache.get(key);
  if (m) return m;
  const def = getMaterialDef(ref);
  m = new THREE.MeshStandardMaterial({
    color: def.pattern === 'none' ? def.color : '#ffffff',
    roughness: def.roughness,
    metalness: def.metalness ?? 0,
    transparent: def.opacity !== undefined && def.opacity < 1,
    opacity: def.opacity ?? 1,
    side: variant === 'double' ? THREE.DoubleSide : THREE.FrontSide,
  });
  // Named after the finish so exported models (GLB, DAE) show readable material names
  m.name = def.name;
  m.userData.ref = ref;
  if (def.emissive) {
    m.emissive = new THREE.Color(def.emissive);
    m.emissiveIntensity = 1.2;
  }
  if (def.opacity !== undefined && def.opacity < 1) m.depthWrite = false;
  if (def.pattern !== 'none') {
    const tex = getTexture(def).clone();
    tex.needsUpdate = true;
    const size = (def.size ?? 100) / 100;
    tex.repeat.set(1 / size, 1 / size);
    m.map = tex;
  }
  materialCache.set(key, m);
  return m;
}
