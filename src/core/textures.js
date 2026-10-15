import * as THREE from 'three';
import { Noise, clamp, smoothstep, hash2, TAU, nextFrame } from './utils.js';

const N = new Noise(1337);
const N2 = new Noise(4242);

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function canvasTex(canvas, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Generic PBR texture generator: fn(u, v, out) fills out.r,g,b (0..1), out.h (height 0..1), out.ro (roughness 0..1), out.m (metal)
function generate(size, fn, normalStrength = 3) {
  const cCol = makeCanvas(size), cNor = makeCanvas(size), cRou = makeCanvas(size);
  const col = cCol.getContext('2d').createImageData(size, size);
  const rou = cRou.getContext('2d').createImageData(size, size);
  const nor = cNor.getContext('2d').createImageData(size, size);
  const hgt = new Float32Array(size * size);
  const o = { r: 0, g: 0, b: 0, h: 0, ro: 0.8, m: 0 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      o.m = 0;
      fn(x / size, y / size, o);
      const i = y * size + x, j = i * 4;
      col.data[j] = clamp(o.r, 0, 1) * 255;
      col.data[j + 1] = clamp(o.g, 0, 1) * 255;
      col.data[j + 2] = clamp(o.b, 0, 1) * 255;
      col.data[j + 3] = 255;
      const rr = clamp(o.ro, 0.02, 1) * 255;
      rou.data[j] = rr; rou.data[j + 1] = rr; rou.data[j + 2] = clamp(o.m, 0, 1) * 255; rou.data[j + 3] = 255;
      hgt[i] = o.h;
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size, xr = (x + 1) % size;
      const yu = (y - 1 + size) % size, yd = (y + 1) % size;
      const dx = (hgt[y * size + xr] - hgt[y * size + xl]) * normalStrength;
      const dy = (hgt[yd * size + x] - hgt[yu * size + x]) * normalStrength;
      let nx = -dx, ny = dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const j = (y * size + x) * 4;
      nor.data[j] = (nx * 0.5 + 0.5) * 255;
      nor.data[j + 1] = (ny * 0.5 + 0.5) * 255;
      nor.data[j + 2] = (nz * 0.5 + 0.5) * 255;
      nor.data[j + 3] = 255;
    }
  }
  cCol.getContext('2d').putImageData(col, 0, 0);
  cRou.getContext('2d').putImageData(rou, 0, 0);
  cNor.getContext('2d').putImageData(nor, 0, 0);
  return { map: canvasTex(cCol, true), normalMap: canvasTex(cNor, false), roughnessMap: canvasTex(cRou, false), canvas: cCol };
}

const mix = (a, b, t) => a + (b - a) * t;
function setCol(o, r, g, b) { o.r = r; o.g = g; o.b = b; }

// ---------- SURFACE DEFINITIONS ----------
const surfaces = {
  concrete(u, v, o) {
    const n = N.fbm(u * 8, v * 8, 5, 8);
    const n2 = N.fbm(u * 32 + 5, v * 32, 3, 32);
    const stain = N2.fbm(u * 3, v * 3, 4, 3);
    const streak = N.fbm(u * 40, v * 2, 3, 40);
    const cr = N2.fbm(u * 5, v * 5, 5, 5);
    const crack = 1 - smoothstep(0, 0.012, Math.abs(cr - 0.5));
    let c = 0.4 + n * 0.2 + n2 * 0.08 - smoothstep(0.5, 0.75, stain) * 0.16 - streak * 0.07 - crack * 0.22;
    const pits = n2 > 0.78 ? 0.08 : 0;
    c -= pits;
    setCol(o, c * 0.98, c * 0.97, c * 0.94);
    o.h = n2 * 0.4 + n * 0.4 - crack * 0.8 - pits * 3;
    o.ro = 0.88 - stain * 0.12;
  },
  brick(u, v, o) {
    const rows = 22, cols = 7;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const off = (row % 2) * 0.5;
    const rx = u * cols + off, col = Math.floor(rx), fx = rx - col;
    const mx = 0.045, my = 0.14;
    const n = N.fbm(u * 16, v * 16, 4, 16);
    const nb = N2.fbm(u * 48, v * 48, 3, 48);
    const soot = N.fbm(u * 2 + 3, v * 2, 4, 2);
    const isM = fx < mx || fy < my;
    if (isM) {
      const c = 0.36 + n * 0.12;
      setCol(o, c, c * 0.96, c * 0.9);
      o.h = 0.05 + nb * 0.1; o.ro = 0.95;
    } else {
      const hv = hash2(col % cols, row);
      const bev = smoothstep(0, 0.06, fx - mx) * smoothstep(0, 0.06, 1 - fx) * smoothstep(0, 0.12, fy - my) * smoothstep(0, 0.12, 1 - fy);
      const k = 0.72 + n * 0.4 + nb * 0.12;
      setCol(o, mix(0.38, 0.5, hv) * k, mix(0.15, 0.24, hv) * k, mix(0.1, 0.17, hv) * k);
      if (hv > 0.85) { o.r *= 0.6; o.g *= 0.6; o.b *= 0.62; }
      o.h = 0.45 + bev * 0.4 + nb * 0.15; o.ro = 0.82;
    }
    const s = smoothstep(0.45, 0.8, soot) * 0.55;
    o.r *= 1 - s; o.g *= 1 - s; o.b *= 1 - s;
  },
  asphalt(u, v, o) {
    const n = N.fbm(u * 12, v * 12, 5, 12);
    const sp = N2.n2(u * 256, v * 256, 256);
    const pud = N.fbm(u * 3 + 7, v * 3, 5, 3);
    const p = smoothstep(0.56, 0.6, pud);
    const cr = N2.fbm(u * 4, v * 4, 5, 4);
    const crack = 1 - smoothstep(0, 0.008, Math.abs(cr - 0.5));
    const dirt = N2.fbm(u * 6 + 3, v * 6, 4, 6);
    let c = 0.13 + n * 0.08 + (sp > 0.8 ? 0.06 : 0) - crack * 0.07;
    let r = c, g = c, b = c * 1.03;
    const d = smoothstep(0.5, 0.75, dirt);
    r = mix(r, 0.17, d); g = mix(g, 0.14, d); b = mix(b, 0.1, d);
    const k = 1 - p * 0.45;
    setCol(o, r * k, g * k, b * k * 1.05);
    o.h = (1 - p) * (sp * 0.3 + n * 0.5) - crack * 0.5;
    o.ro = mix(0.85 - sp * 0.1, 0.04, p);
  },
  tiles(u, v, o) {
    const T = 8;
    const tx = u * T, ty = v * T;
    const fx = tx - Math.floor(tx), fy = ty - Math.floor(ty);
    const id = hash2(Math.floor(tx), Math.floor(ty));
    const g = 0.04;
    const isG = fx < g || fy < g;
    const n = N.fbm(u * 10, v * 10, 4, 10);
    const dirt = N2.fbm(u * 3, v * 3, 4, 3);
    const blood = smoothstep(0.62, 0.7, N.fbm(u * 2 + 9, v * 2 + 4, 5, 2));
    if (isG) { const c = 0.18 + n * 0.08; setCol(o, c, c * 0.95, c * 0.85); o.h = 0; o.ro = 0.95; }
    else {
      const c = 0.68 + id * 0.08 + n * 0.1 - smoothstep(0.4, 0.8, dirt) * 0.3;
      setCol(o, c * 0.92, c * 0.94, c * 0.9);
      o.h = 0.6; o.ro = 0.25 + dirt * 0.3;
      if (id > 0.93) { const cr = Math.abs(fx - fy) < 0.02 ? 0.3 : 0; o.r -= cr; o.g -= cr; o.b -= cr; o.h -= cr; }
    }
    if (blood > 0) {
      o.r = mix(o.r, 0.22, blood * 0.95); o.g = mix(o.g, 0.02, blood * 0.95); o.b = mix(o.b, 0.02, blood * 0.95);
      o.ro = mix(o.ro, 0.15, blood);
    }
  },
  wood(u, v, o) {
    const planks = 5;
    const py = v * planks, pid = Math.floor(py), fy = py - pid;
    const hv = hash2(pid, 3);
    const grain = N.fbm(u * 3 + hv * 10, v * 60, 4, 3);
    const ring = Math.sin((grain * 12 + u * 2) * TAU) * 0.5 + 0.5;
    const n = N2.fbm(u * 20, v * 20, 3, 20);
    const edge = smoothstep(0, 0.05, fy) * smoothstep(0, 0.05, 1 - fy);
    const k = (0.65 + ring * 0.2 + n * 0.2) * (0.4 + edge * 0.6);
    setCol(o, mix(0.32, 0.45, hv) * k, mix(0.2, 0.3, hv) * k, mix(0.11, 0.17, hv) * k);
    o.h = edge * 0.6 + ring * 0.15 + n * 0.1;
    o.ro = 0.8;
  },
  woodOld(u, v, o) {
    const grain = N.fbm(u * 2, v * 80, 4, 2);
    const ring = Math.sin(grain * 20 * TAU) * 0.5 + 0.5;
    const n = N2.fbm(u * 16, v * 16, 4, 16);
    const k = 0.55 + ring * 0.2 + n * 0.25;
    setCol(o, 0.42 * k, 0.36 * k, 0.28 * k);
    o.h = ring * 0.3 + n * 0.3; o.ro = 0.9;
  },
  rustMetal(u, v, o) {
    const n = N.fbm(u * 6, v * 6, 5, 6);
    const rust = smoothstep(0.52, 0.66, N2.fbm(u * 4, v * 4, 6, 4));
    const fine = N.n2(u * 128, v * 128, 128);
    const scratch = N2.fbm(u * 2, v * 64, 3, 2);
    const s = smoothstep(0.7, 0.72, scratch);
    let r = 0.24 + n * 0.06, g = 0.27 + n * 0.06, b = 0.2 + n * 0.05;
    r = mix(r, 0.6, s * 0.5); g = mix(g, 0.6, s * 0.5); b = mix(b, 0.58, s * 0.5);
    const rc = 0.6 + fine * 0.5;
    r = mix(r, 0.36 * rc, rust); g = mix(g, 0.17 * rc, rust); b = mix(b, 0.07 * rc, rust);
    setCol(o, r, g, b);
    o.h = rust * (0.4 + fine * 0.4) + n * 0.1;
    o.ro = mix(0.5, 0.92, rust);
    o.m = mix(0.6 + s * 0.4, 0.1, rust);
  },
  corrugated(u, v, o) {
    const ridge = Math.sin(u * TAU * 10) * 0.5 + 0.5;
    const streak = N.fbm(u * 30, v * 3, 4, 30);
    const rust = smoothstep(0.55, 0.75, N2.fbm(u * 3, v * 3, 5, 3) * 0.7 + streak * 0.3 + (1 - v) * 0.0);
    const n = N.fbm(u * 20, v * 20, 3, 20);
    const c = 0.42 + n * 0.1 + ridge * 0.06;
    setCol(o, mix(c, 0.33, rust), mix(c, 0.16, rust), mix(c * 1.02, 0.07, rust));
    o.h = ridge;
    o.ro = mix(0.45, 0.9, rust);
    o.m = mix(0.7, 0.1, rust);
  },
  plaster(u, v, o) {
    const n = N.fbm(u * 6, v * 6, 5, 6);
    const peel = smoothstep(0.6, 0.62, N2.fbm(u * 3, v * 3, 6, 3));
    const water = N.fbm(u * 20, v * 1.5, 4, 20) * smoothstep(0.4, 0.8, N2.fbm(u * 2 + 4, v * 2, 3, 2));
    const fine = N2.n2(u * 200, v * 200, 200);
    let r = 0.5 + n * 0.08, g = 0.54 + n * 0.08, b = 0.47 + n * 0.07;
    r -= water * 0.25; g -= water * 0.24; b -= water * 0.2;
    if (peel) { const c = 0.32 + fine * 0.1; r = c; g = c * 0.97; b = c * 0.92; }
    setCol(o, r, g, b);
    o.h = (1 - peel) * 0.5 + fine * 0.1;
    o.ro = peel ? 0.95 : 0.75;
  },
  skin(u, v, o) {
    const n = N.fbm(u * 8, v * 8, 5, 8);
    const blot = smoothstep(0.5, 0.75, N2.fbm(u * 4, v * 4, 4, 4));
    const vein = N.ridge(u * 6 + 2, v * 6, 4, 6);
    const ve = smoothstep(0.82, 0.95, vein);
    const blood = smoothstep(0.64, 0.72, N2.fbm(u * 3 + 5, v * 3 + 1, 5, 3));
    const pore = N2.n2(u * 160, v * 160, 160);
    let r = 0.52 + n * 0.12, g = 0.55 + n * 0.1, b = 0.46 + n * 0.08;
    r = mix(r, 0.38, blot); g = mix(g, 0.32, blot); b = mix(b, 0.36, blot);
    r = mix(r, 0.22, ve * 0.7); g = mix(g, 0.2, ve * 0.7); b = mix(b, 0.32, ve * 0.7);
    r = mix(r, 0.28, blood); g = mix(g, 0.03, blood); b = mix(b, 0.03, blood);
    setCol(o, r, g, b);
    o.h = n * 0.4 + pore * 0.2 - ve * 0.2 + blot * 0.1;
    o.ro = mix(0.62, 0.28, blood);
  },
  hazard(u, v, o) {
    const s = ((u + v) * 6) % 1;
    const yellow = s < 0.5;
    const wear = smoothstep(0.55, 0.7, N.fbm(u * 6, v * 6, 5, 6));
    const n = N2.fbm(u * 30, v * 30, 3, 30);
    let r = yellow ? 0.75 : 0.06, g = yellow ? 0.55 : 0.06, b = yellow ? 0.05 : 0.05;
    r = mix(r, 0.3 + n * 0.1, wear); g = mix(g, 0.28 + n * 0.1, wear); b = mix(b, 0.26, wear);
    setCol(o, r * (0.85 + n * 0.2), g * (0.85 + n * 0.2), b);
    o.h = (1 - wear) * 0.3 + n * 0.1; o.ro = mix(0.5, 0.9, wear); o.m = wear * 0.5;
  },
  dirt(u, v, o) {
    const n = N.fbm(u * 6, v * 6, 6, 6);
    const pebble = N2.n2(u * 90, v * 90, 90);
    const wet = smoothstep(0.55, 0.65, N2.fbm(u * 2, v * 2, 4, 2));
    const c = 0.2 + n * 0.12 + (pebble > 0.75 ? 0.08 : 0);
    const k = 1 - wet * 0.35;
    setCol(o, c * 1.0 * k, c * 0.85 * k, c * 0.65 * k);
    o.h = n * 0.6 + pebble * 0.3; o.ro = mix(0.95, 0.35, wet);
  },
  gunmetal(u, v, o) {
    const n = N.fbm(u * 20, v * 20, 4, 20);
    const sc = smoothstep(0.72, 0.74, N2.fbm(u * 3, v * 50, 3, 3));
    const c = 0.16 + n * 0.05 + sc * 0.25;
    setCol(o, c, c, c * 1.04);
    o.h = n * 0.2 - sc * 0.3; o.ro = 0.38 + n * 0.2 - sc * 0.15; o.m = 1;
  },
  polymer(u, v, o) {
    const n = N.fbm(u * 60, v * 60, 3, 60);
    const c = 0.07 + n * 0.03;
    setCol(o, c, c, c);
    o.h = n * 0.5; o.ro = 0.6 + n * 0.2; o.m = 0;
  },
  camo(u, v, o) {
    const a = N.fbm(u * 4, v * 4, 4, 4), b = N2.fbm(u * 4 + 3, v * 4, 4, 4);
    const weave = (Math.sin(u * TAU * 160) * Math.sin(v * TAU * 160)) * 0.5 + 0.5;
    let r = 0.25, g = 0.27, bb = 0.19;
    if (a > 0.55) { r = 0.16; g = 0.17; bb = 0.12; }
    if (b > 0.58) { r = 0.35; g = 0.32; bb = 0.24; }
    const k = 0.85 + weave * 0.2;
    setCol(o, r * k, g * k, bb * k);
    o.h = weave * 0.4; o.ro = 0.95;
  },
  glove(u, v, o) {
    const n = N.fbm(u * 30, v * 30, 4, 30);
    const c = 0.08 + n * 0.05;
    setCol(o, c, c * 0.95, c * 0.9);
    o.h = n; o.ro = 0.7;
  },
};

function cloth(base, bloodAmt = 0.5, seed = 0) {
  return (u, v, o) => {
    const weave = (Math.sin(u * TAU * 128) * Math.sin(v * TAU * 128)) * 0.5 + 0.5;
    const n = N.fbm(u * 6 + seed, v * 6, 5, 6);
    const dirt = smoothstep(0.45, 0.8, N2.fbm(u * 3 + seed, v * 3, 4, 3));
    const blood = smoothstep(0.7 - bloodAmt * 0.12, 0.76 - bloodAmt * 0.12, N.fbm(u * 2.5 + seed * 3, v * 2.5 + 2, 5, 2.5));
    const tear = N2.fbm(u * 8 + seed, v * 8, 4, 8) > 0.74;
    const k = 0.75 + n * 0.3 + weave * 0.1;
    let r = base[0] * k, g = base[1] * k, b = base[2] * k;
    r = mix(r, 0.2, dirt * 0.6); g = mix(g, 0.17, dirt * 0.6); b = mix(b, 0.12, dirt * 0.6);
    r = mix(r, 0.2, blood); g = mix(g, 0.015, blood); b = mix(b, 0.015, blood);
    if (tear) { r = 0.05; g = 0.03; b = 0.03; }
    setCol(o, r, g, b);
    o.h = weave * 0.3 + n * 0.2 - (tear ? 0.6 : 0);
    o.ro = mix(0.95, 0.4, blood);
  };
}

export const CLOTH_VARIANTS = {
  labcoat: [0.75, 0.75, 0.72],
  soldier: [0.26, 0.29, 0.19],
  hazmat: [0.72, 0.6, 0.12],
  plaid: [0.5, 0.15, 0.12],
  worker: [0.18, 0.25, 0.42],
  denim: [0.14, 0.18, 0.28],
  khaki: [0.4, 0.35, 0.24],
  black: [0.08, 0.08, 0.09],
  scrubs: [0.25, 0.45, 0.42],
};

// ---------- 2D CANVAS DRAWN TEXTURES ----------
function radial(size, stops) {
  const c = makeCanvas(size), g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}

function bloodDecal(seed) {
  const s = 256, c = makeCanvas(s), g = c.getContext('2d');
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = 'rgba(70,4,4,0.95)';
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU, d = rnd() * 40;
    g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 18 + rnd() * 30, 0, TAU); g.fill();
  }
  for (let i = 0; i < 50; i++) {
    const a = rnd() * TAU, d = 50 + rnd() * 70;
    g.fillStyle = `rgba(${60 + rnd() * 30},3,3,${0.7 + rnd() * 0.3})`;
    g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 1 + rnd() * 6, 0, TAU); g.fill();
  }
  // streaks
  for (let i = 0; i < 8; i++) {
    const a = rnd() * TAU, len = 60 + rnd() * 60;
    g.strokeStyle = 'rgba(60,3,3,0.8)'; g.lineWidth = 2 + rnd() * 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len); g.stroke();
  }
  // darker core
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 60);
  gr.addColorStop(0, 'rgba(25,0,0,0.6)'); gr.addColorStop(1, 'rgba(25,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return c;
}

function bulletHole() {
  const s = 64, c = makeCanvas(s), g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.18, 'rgba(10,8,6,1)');
  gr.addColorStop(0.3, 'rgba(40,36,30,0.9)'); gr.addColorStop(0.6, 'rgba(30,26,22,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(15,12,10,0.7)'; g.lineWidth = 1;
  for (let i = 0; i < 7; i++) { const a = Math.random() * TAU; g.beginPath(); g.moveTo(32, 32); g.lineTo(32 + Math.cos(a) * (12 + Math.random() * 14), 32 + Math.sin(a) * (12 + Math.random() * 14)); g.stroke(); }
  return c;
}

function smokePuff() {
  const s = 128, c = makeCanvas(s), g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = x / s - 0.5, dy = y / s - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2;
    const n = N.fbm(x / s * 4, y / s * 4, 5, 4);
    const a = clamp((1 - d) * 1.4 - (1 - n) * 0.9, 0, 1);
    const j = (y * s + x) * 4;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = 200 + n * 55;
    img.data[j + 3] = a * a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function muzzleFlash() {
  const s = 256, c = makeCanvas(s), g = c.getContext('2d');
  g.translate(128, 128);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    g.save(); g.rotate((i / 7) * TAU + Math.random() * 0.3);
    const len = 70 + Math.random() * 50;
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.4, 'rgba(255,160,60,0.7)'); gr.addColorStop(1, 'rgba(255,80,10,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(len, 0); g.lineTo(0, 10); g.fill();
    g.restore();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.3, 'rgba(255,200,110,0.8)'); gr.addColorStop(1, 'rgba(255,100,20,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 60, 0, TAU); g.fill();
  return c;
}

function fogTex() {
  const s = 256, c = makeCanvas(s), g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const n = N2.fbm(x / s * 4, y / s * 4, 6, 4);
    const j = (y * s + x) * 4;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = 255;
    img.data[j + 3] = smoothstep(0.3, 0.75, n) * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// stencil sign / graffiti
export function textPanel(w, h, draw) {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  draw(g, w, h);
  return canvasTex(c, true, false);
}

export function graffiti(text, color = '#8a0e0a', w = 1024, h = 256, font = 'Black Ops One') {
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.font = `${Math.floor(h * 0.55)}px "${font}", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = color;
  g.save(); g.translate(w / 2, h * 0.45); g.rotate(-0.03);
  g.shadowColor = color; g.shadowBlur = 6;
  g.fillText(text, 0, 0);
  g.restore();
  // drips
  const m = g.measureText(text).width;
  for (let i = 0; i < 26; i++) {
    const x = w / 2 - m / 2 + Math.random() * m, y = h * 0.55 + Math.random() * 10;
    const len = 10 + Math.random() * h * 0.35;
    g.fillStyle = color;
    g.fillRect(x, y, 2 + Math.random() * 3, len);
    g.beginPath(); g.arc(x + 2, y + len, 3, 0, TAU); g.fill();
  }
  return canvasTex(c, true, false);
}

// ---------- ICONS (perks / powerups) ----------
export function perkIcon(color, symbol) {
  const s = 128, c = makeCanvas(s), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 54, 4, 64, 64, 62);
  gr.addColorStop(0, color); gr.addColorStop(1, '#050505');
  g.fillStyle = gr;
  g.beginPath(); g.arc(64, 64, 60, 0, TAU); g.fill();
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,0.75)'; g.stroke();
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = color; g.shadowBlur = 12;
  g.translate(64, 64);
  switch (symbol) {
    case 'shield':
      g.beginPath(); g.moveTo(0, -34); g.lineTo(28, -24); g.lineTo(24, 10); g.quadraticCurveTo(14, 30, 0, 38); g.quadraticCurveTo(-14, 30, -24, 10); g.lineTo(-28, -24); g.closePath(); g.fill();
      g.fillStyle = color; g.fillRect(-4, -20, 8, 36); g.fillRect(-16, -6, 32, 8);
      break;
    case 'hand':
      g.beginPath(); g.arc(0, 0, 30, -Math.PI * 0.5, Math.PI * 1.1); g.stroke();
      g.beginPath(); g.moveTo(-30, -6); g.lineTo(-30, 10); g.lineTo(-18, 2); g.fill();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -18); g.moveTo(0, 0); g.lineTo(13, 8); g.stroke();
      break;
    case 'bullets':
      for (let i = -1; i <= 1; i++) { g.fillRect(i * 18 - 6, -12, 12, 40); g.beginPath(); g.moveTo(i * 18 - 6, -12); g.quadraticCurveTo(i * 18, -40, i * 18 + 6, -12); g.fill(); }
      break;
    case 'wing':
      g.beginPath(); g.moveTo(-30, 20); g.quadraticCurveTo(-10, -30, 34, -30); g.quadraticCurveTo(20, -10, 26, -6); g.quadraticCurveTo(10, 0, 18, 6); g.quadraticCurveTo(0, 14, 6, 20); g.closePath(); g.fill();
      break;
    case 'heart':
      g.beginPath(); g.moveTo(0, 30); g.bezierCurveTo(-46, 0, -26, -40, 0, -16); g.bezierCurveTo(26, -40, 46, 0, 0, 30); g.fill();
      g.strokeStyle = color; g.lineWidth = 5; g.beginPath(); g.moveTo(-22, -2); g.lineTo(-8, -2); g.lineTo(-2, -12); g.lineTo(5, 8); g.lineTo(10, -2); g.lineTo(22, -2); g.stroke();
      break;
    case 'mule':
      g.font = 'bold 50px Oswald, Impact'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('III', 0, 3);
      break;
  }
  return c;
}

export function powerupIcon(kind) {
  const s = 256, c = makeCanvas(s), g = c.getContext('2d');
  g.translate(128, 128);
  g.fillStyle = '#c8ffcc'; g.strokeStyle = '#c8ffcc';
  g.shadowColor = '#3cff6a'; g.shadowBlur = 24;
  g.lineWidth = 12; g.lineJoin = 'round'; g.lineCap = 'round';
  switch (kind) {
    case 'maxammo':
      g.fillRect(-70, -20, 140, 80);
      g.fillStyle = '#103a18'; g.font = 'bold 30px Oswald, Impact'; g.textAlign = 'center'; g.fillText('AMMO', 0, 34);
      g.fillStyle = '#c8ffcc';
      for (let i = -2; i <= 2; i++) { g.fillRect(i * 26 - 8, -70, 16, 44); g.beginPath(); g.arc(i * 26, -70, 8, Math.PI, 0); g.fill(); }
      break;
    case 'instakill':
      g.beginPath(); g.ellipse(0, -14, 70, 74, 0, 0, TAU); g.fill();
      g.fillRect(-36, 40, 72, 40);
      g.fillStyle = '#062010';
      g.beginPath(); g.ellipse(-28, -10, 20, 24, 0, 0, TAU); g.ellipse(28, -10, 20, 24, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(0, 18); g.lineTo(-10, 36); g.lineTo(10, 36); g.fill();
      for (let i = -2; i <= 2; i++) g.fillRect(i * 14 - 3, 52, 6, 28);
      break;
    case 'double':
      g.font = 'bold 150px "Black Ops One", Impact'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x2', 0, 8);
      break;
    case 'nuke':
      g.beginPath(); g.arc(0, 0, 100, 0, TAU); g.lineWidth = 10; g.stroke();
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 86, i * TAU / 3 - Math.PI / 2 - 0.5, i * TAU / 3 - Math.PI / 2 + 0.5); g.closePath(); g.fill(); }
      g.fillStyle = '#062010'; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill();
      g.fillStyle = '#c8ffcc'; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
      break;
    case 'carpenter':
      g.save(); g.rotate(-0.6);
      g.fillRect(-10, -40, 20, 130);
      g.fillRect(-60, -80, 120, 44);
      g.restore();
      break;
  }
  return c;
}

// ---------- MAIN LOADER ----------
export async function buildTextures(progress) {
  const T = {};
  const list = [
    ['concrete', 512, 3], ['brick', 512, 4], ['asphalt', 512, 3], ['tiles', 512, 2], ['wood', 256, 3],
    ['woodOld', 256, 3], ['rustMetal', 512, 3], ['corrugated', 256, 4], ['plaster', 512, 2], ['skin', 256, 3],
    ['hazard', 256, 2], ['dirt', 256, 3], ['gunmetal', 256, 2], ['polymer', 128, 2], ['camo', 256, 2], ['glove', 128, 2],
  ];
  const total = list.length + Object.keys(CLOTH_VARIANTS).length + 2;
  let done = 0;
  for (const [name, size, ns] of list) {
    T[name] = generate(size, surfaces[name], ns);
    done++; progress(done / total, `GENERATING SURFACES: ${name.toUpperCase()}`);
    await nextFrame();
  }
  T.cloth = {};
  let seed = 1;
  for (const [k, col] of Object.entries(CLOTH_VARIANTS)) {
    T.cloth[k] = generate(256, cloth(col, 0.5, seed++ * 1.7), 2);
    done++; progress(done / total, `GENERATING FABRICS: ${k.toUpperCase()}`);
    await nextFrame();
  }
  T.blood = [0, 1, 2, 3].map((i) => canvasTex(bloodDecal(i + 1), true, false));
  T.bulletHole = canvasTex(bulletHole(), true, false);
  T.scorch = canvasTex(radial(128, [[0, 'rgba(0,0,0,0.95)'], [0.5, 'rgba(10,8,6,0.7)'], [1, 'rgba(0,0,0,0)']]), true, false);
  T.soft = canvasTex(radial(64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]), true, false);
  T.glow = canvasTex(radial(128, [[0, 'rgba(255,255,255,1)'], [0.15, 'rgba(255,255,255,0.7)'], [0.5, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]), true, false);
  T.smoke = canvasTex(smokePuff(), true, false);
  done++; progress(done / total, 'GENERATING EFFECTS');
  await nextFrame();
  T.flash = canvasTex(muzzleFlash(), true, false);
  T.fog = canvasTex(fogTex(), true, true);
  done++; progress(done / total, 'GENERATING ATMOSPHERE');
  return T;
}
