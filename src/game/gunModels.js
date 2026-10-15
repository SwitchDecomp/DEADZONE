import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeCanvas, canvasTex } from '../core/textures.js';
import { TAU } from '../core/utils.js';

let MATS = null;

function forgedTexture() {
  const s = 256, c = makeCanvas(s), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  g.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    let x = Math.random() * s, y = Math.random() * s, a = Math.random() * TAU;
    g.strokeStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.shadowColor = '#fff'; g.shadowBlur = 6;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { a += (Math.random() - 0.5) * 1.6; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); }
    g.stroke();
  }
  return canvasTex(c, true, true);
}

export function gunMaterials(T) {
  if (MATS) return MATS;
  const m = (o) => new THREE.MeshStandardMaterial(o);
  const forged = forgedTexture();
  const gm = T.gunmetal;
  MATS = {
    gun: m({ map: gm.map, normalMap: gm.normalMap, roughnessMap: gm.roughnessMap, metalness: 1, roughness: 1, color: 0x8a8c90 }),
    gunLight: m({ map: gm.map, normalMap: gm.normalMap, roughnessMap: gm.roughnessMap, metalness: 1, roughness: 0.8, color: 0xb0b2b6 }),
    poly: m({ map: T.polymer.map, normalMap: T.polymer.normalMap, roughness: 0.72, metalness: 0.05, color: 0x8e8e8e }),
    tan: m({ map: T.polymer.map, normalMap: T.polymer.normalMap, roughness: 0.75, metalness: 0.0, color: 0xb8a07a }),
    wood: m({ map: T.wood.map, normalMap: T.wood.normalMap, roughness: 0.5, metalness: 0, color: 0xc89a70 }),
    olive: m({ map: T.polymer.map, normalMap: T.polymer.normalMap, color: 0x6a7350, roughness: 0.7, metalness: 0.1 }),
    rubber: m({ color: 0x141414, roughness: 0.95 }),
    dark: m({ color: 0x050505, roughness: 0.9, metalness: 0.2 }),
    chrome: m({ color: 0xdddddd, roughness: 0.15, metalness: 1 }),
    copper: m({ color: 0xc07840, roughness: 0.3, metalness: 1 }),
    glass: m({ color: 0x1a2a3a, roughness: 0.02, metalness: 0.9, emissive: 0x0a1830, emissiveIntensity: 0.6 }),
    reddot: m({ color: 0x000000, emissive: 0xff2010, emissiveIntensity: 6 }),
    volt: m({ color: 0x0a2030, emissive: 0x40d0ff, emissiveIntensity: 5, roughness: 0.2 }),
    forged: m({ map: gm.map, normalMap: gm.normalMap, color: 0x4a3058, metalness: 1, roughness: 0.3, emissive: 0xa040ff, emissiveMap: forged, emissiveIntensity: 2.5 }),
    forgedDark: m({ map: T.polymer.map, color: 0x1a1020, metalness: 0.6, roughness: 0.4, emissive: 0xff5020, emissiveMap: forged, emissiveIntensity: 1.6 }),
    brass: m({ color: 0xd8a040, roughness: 0.25, metalness: 1 }),
  };
  return MATS;
}

// ---------- detail generators ----------
function rail(z0, z1, y, mat = 'gun', w = 0.022) {
  const parts = [['b', mat, w, 0.008, z1 - z0, 0, y, (z0 + z1) / 2]];
  for (let z = z0 + 0.006; z < z1 - 0.004; z += 0.01) parts.push(['B', mat, w + 0.002, 0.005, 0.005, 0, y + 0.006, z]);
  return parts;
}
function trigger(y, z, R = 0.022, mat = 'gun') {
  return [
    ['b', mat, 0.006, 0.022, 0.008, 0, y - 0.012, z, 0.35],
    ['t', 'poly', R, 0.0035, 0, y - 0.006, z - 0.002, Math.PI, 0, Math.PI / 2, Math.PI],
  ];
}
function port(x, y, z, len, h = 0.014) { return [['B', 'dark', 0.004, h, len, x, y, z]]; }
function bore(y, z, r) { return [['c', 'dark', r * 0.55, 0.004, 0, y, z - 0.002]]; }
function slots(x, y, z0, n, step, len = 0.018, h = 0.005) {
  const out = [];
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) out.push(['B', 'dark', 0.003, h, len, s * x, y, z0 + i * step]);
  return out;
}
function ribs(x, y0, z, n, step, w = 0.034, d = 0.003) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(['B', 'gun', w, 0.004, d, x, y0 - i * step, z]);
  return out;
}
function pins(x, ys) { return ys.map(([y, z]) => ['c', 'chrome', 0.003, x * 2 + 0.002, 0, y, z, 'x']); }

// b: [type, mat, w,h,d, x,y,z, rx, name]  c: [type, mat, r,len, x,y,z, axis, name]  t: [type, mat, R, tube, x,y,z, arc, rx, ry, rz, name]
const SPECS = {
  pistol: {
    parts: [
      ['b', 'gun', 0.032, 0.032, 0.2, 0, 0.035, -0.06, 0, 'slide'],
      ...slots(0.0165, 0.035, 0.0, 6, 0.006, 0.003, 0.022).map((p) => [...p, 0, 'slide']),
      ...port(0.0165, 0.041, -0.04, 0.04, 0.012).map((p) => [...p, 0, 'slide']),
      ['b', 'poly', 0.029, 0.022, 0.17, 0, 0.009, -0.045],
      ['B', 'poly', 0.022, 0.008, 0.06, 0, -0.004, -0.1],
      ['b', 'poly', 0.031, 0.118, 0.047, 0, -0.046, 0.023, -0.22],
      ['b', 'poly', 0.026, 0.02, 0.03, 0, 0.012, 0.045, 0.3],
      ...trigger(0.0, -0.03, 0.02),
      ['c', 'gun', 0.0085, 0.02, 0, 0.033, -0.163],
      ...bore(0.033, -0.172, 0.0085),
      ['b', 'gun', 0.004, 0.008, 0.006, 0, 0.055, -0.148, 0, 'slide'],
      ['b', 'gun', 0.02, 0.008, 0.008, 0, 0.055, 0.03, 0, 'slide'],
      ['b', 'gun', 0.008, 0.012, 0.01, 0, 0.042, 0.043],
      ['b', 'gun', 0.025, 0.11, 0.036, 0, -0.05, 0.028, -0.22, 'mag'],
      ['b', 'gun', 0.033, 0.013, 0.05, 0, -0.105, 0.04, -0.22, 'mag'],
      ...pins(0.0155, [[0.012, -0.02], [0.014, 0.025]]),
    ],
    muzzle: [0, 0.033, -0.18], eject: [0.02, 0.045, -0.03], sightY: 0.057, left: [-0.008, -0.055, 0.03], rightGrip: [0, -0.035, 0.03], gripR: 0.017, leftGrip: { type: 'v', pos: [-0.014, -0.045, 0.036], r: 0.027 }, gripRx: -0.22,
  },
  smg: {
    parts: [
      ['b', 'gun', 0.046, 0.062, 0.28, 0, 0.02, -0.08],
      ...port(0.0235, 0.03, -0.06, 0.05),
      ['c', 'gun', 0.018, 0.12, 0, 0.03, -0.28],
      ...slots(0.0175, 0.03, -0.32, 4, 0.025, 0.012, 0.004),
      ['c', 'gun', 0.012, 0.06, 0, 0.03, -0.37],
      ...bore(0.03, -0.4, 0.012),
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.05, 0.02, -0.3],
      ...trigger(-0.01, -0.04),
      ['b', 'gun', 0.025, 0.17, 0.042, 0, -0.1, -0.12, 0.18, 'mag'],
      ...ribs(0, -0.06, -0.1, 5, 0.025, 0.027).map((p) => [...p, 0.18, 'mag']),
      ['b', 'poly', 0.03, 0.03, 0.2, 0, 0.025, 0.15],
      ['b', 'rubber', 0.032, 0.088, 0.022, 0, 0.0, 0.255],
      ...rail(-0.19, 0.03, 0.054),
      ['b', 'poly', 0.032, 0.036, 0.055, 0, 0.078, -0.03],
      ['c', 'glass', 0.012, 0.004, 0, 0.083, -0.057],
      ['b', 'reddot', 0.003, 0.003, 0.002, 0, 0.083, -0.06],
      ['b', 'gun', 0.02, 0.012, 0.025, 0.032, 0.035, -0.05, 0, 'bolt'],
      ['b', 'poly', 0.03, 0.07, 0.032, 0, -0.035, -0.22],
      ...pins(0.0235, [[0.0, -0.02], [0.01, 0.03]]),
    ],
    muzzle: [0, 0.03, -0.4], eject: [0.03, 0.04, -0.05], sightY: 0.083, left: [0, -0.065, -0.22], rightGrip: [0, -0.045, 0.02], gripR: 0.019, leftGrip: { type: 'v', pos: [0, -0.035, -0.22], r: 0.017 }, gripRx: -0.3,
  },
  shotgun: {
    parts: [
      ['b', 'gun', 0.05, 0.068, 0.26, 0, 0.02, -0.05],
      ...port(0.0255, 0.03, -0.04, 0.07, 0.02),
      ['c', 'gun', 0.016, 0.5, 0, 0.046, -0.42],
      ...bore(0.046, -0.67, 0.016),
      ['c', 'gun', 0.014, 0.42, 0, 0.012, -0.38],
      ['c', 'gun', 0.016, 0.02, 0, 0.012, -0.6],
      ['b', 'wood', 0.054, 0.05, 0.19, 0, 0.01, -0.33, 0, 'pump'],
      ...[0, 1, 2, 3, 4, 5].map((i) => ['B', 'dark', 0.056, 0.004, 0.004, 0, 0.02, -0.4 + i * 0.025, 0, 'pump']),
      ['b', 'wood', 0.042, 0.075, 0.32, 0, -0.015, 0.24, 0.12],
      ['b', 'rubber', 0.044, 0.09, 0.02, 0, -0.035, 0.405, 0.12],
      ['b', 'wood', 0.036, 0.085, 0.05, 0, -0.045, 0.065, -0.4],
      ...trigger(-0.012, 0.0),
      ['c', 'chrome', 0.003, 0.006, 0, 0.066, -0.66, 'y'],
      ['b', 'gun', 0.03, 0.018, 0.05, 0.026, 0.03, -0.04],
      ...pins(0.025, [[0.0, -0.1], [0.0, 0.02]]),
    ],
    muzzle: [0, 0.046, -0.68], eject: [0.03, 0.03, -0.05], sightY: 0.068, left: [0, -0.03, -0.33], rightGrip: [0, -0.045, 0.065], gripR: 0.019, leftGrip: { type: 'h', pos: [0, 0.01, -0.33], r: 0.027 }, gripRx: -0.4,
  },
  ar: {
    parts: [
      ['b', 'gun', 0.05, 0.072, 0.32, 0, 0.02, -0.05],
      ...port(0.0255, 0.03, -0.04, 0.06),
      ['c', 'gun', 0.008, 0.012, 0.024, 0.03, 0.03, 'x'],
      ['b', 'tan', 0.058, 0.064, 0.27, 0, 0.026, -0.34],
      ...slots(0.0295, 0.026, -0.44, 6, 0.035, 0.022, 0.006),
      ['c', 'gun', 0.011, 0.15, 0, 0.03, -0.52],
      ['c', 'gun', 0.015, 0.05, 0, 0.03, -0.61],
      ...slots(0.0152, 0.03, -0.62, 1, 0, 0.03, 0.004),
      ...bore(0.03, -0.635, 0.015),
      ['b', 'gun', 0.008, 0.045, 0.012, 0, 0.065, -0.47],
      ['b', 'gun', 0.03, 0.19, 0.062, 0, -0.1, -0.1, 0.22, 'mag'],
      ...ribs(0, -0.04, -0.07, 6, 0.024, 0.032, 0.004).map((p) => [...p, 0.22, 'mag']),
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.055, 0.06, -0.3],
      ...trigger(-0.012, 0.005),
      ['c', 'gun', 0.016, 0.16, 0, 0.012, 0.18],
      ['b', 'tan', 0.04, 0.07, 0.17, 0, 0.0, 0.29],
      ['b', 'rubber', 0.045, 0.115, 0.03, 0, -0.005, 0.39],
      ...rail(-0.47, 0.1, 0.063),
      ['b', 'poly', 0.042, 0.05, 0.075, 0, 0.09, -0.06],
      ['c', 'glass', 0.016, 0.004, 0, 0.098, -0.097],
      ['b', 'reddot', 0.003, 0.003, 0.002, 0, 0.098, -0.1],
      ['b', 'gun', 0.018, 0.01, 0.03, 0, 0.06, 0.09, 0, 'bolt'],
      ...pins(0.0255, [[0.0, -0.02], [0.02, 0.06]]),
    ],
    muzzle: [0, 0.03, -0.64], eject: [0.03, 0.03, -0.03], sightY: 0.098, left: [0, -0.03, -0.33], rightGrip: [0, -0.05, 0.06], gripR: 0.019, leftGrip: { type: 'h', pos: [0, 0.026, -0.36], r: 0.031 }, gripRx: -0.3,
  },
  burst: {
    parts: [
      ['b', 'poly', 0.056, 0.092, 0.5, 0, 0.012, 0.0],
      ...port(0.0285, 0.03, 0.08, 0.06),
      ...slots(0.0285, 0.0, -0.2, 4, 0.03, 0.02, 0.006),
      ['c', 'gun', 0.012, 0.2, 0, 0.03, -0.33],
      ['c', 'gun', 0.016, 0.04, 0, 0.03, -0.43],
      ...bore(0.03, -0.452, 0.016),
      ['b', 'gun', 0.03, 0.14, 0.05, 0, -0.08, 0.15, 0.12, 'mag'],
      ['b', 'poly', 0.034, 0.1, 0.042, 0, -0.06, -0.08, -0.25],
      ...trigger(-0.02, -0.11),
      ['b', 'gun', 0.032, 0.04, 0.2, 0, 0.085, -0.05],
      ['c', 'glass', 0.019, 0.02, 0, 0.085, -0.16],
      ['c', 'glass', 0.016, 0.01, 0, 0.085, 0.055],
      ['b', 'reddot', 0.003, 0.003, 0.002, 0, 0.087, -0.151],
      ['b', 'gun', 0.06, 0.02, 0.1, 0, 0.065, 0.1],
      ['b', 'rubber', 0.058, 0.1, 0.02, 0, 0.012, 0.26],
    ],
    muzzle: [0, 0.03, -0.45], eject: [0.03, 0.03, 0.1], sightY: 0.087, left: [0, -0.035, -0.23], rightGrip: [0, -0.05, -0.08], gripR: 0.019, leftGrip: { type: 'h', pos: [0, 0.012, -0.2], r: 0.03 }, gripRx: -0.25,
  },
  lmg: {
    parts: [
      ['b', 'gun', 0.07, 0.1, 0.4, 0, 0.02, -0.05],
      ...port(0.0355, 0.03, -0.02, 0.08, 0.02),
      ['c', 'gun', 0.017, 0.5, 0, 0.035, -0.5],
      ...bore(0.035, -0.75, 0.017),
      ['b', 'gun', 0.05, 0.04, 0.35, 0, 0.065, -0.4],
      ...slots(0.0255, 0.065, -0.54, 7, 0.04, 0.02, 0.012),
      ['b', 'olive', 0.1, 0.12, 0.13, -0.065, -0.08, -0.1, 0, 'mag'],
      ['b', 'gun', 0.104, 0.012, 0.134, -0.065, -0.14, -0.1, 0, 'mag'],
      ...[0, 1, 2, 3, 4].map((i) => ['c', 'brass', 0.005, 0.03, -0.03 + i * 0.006, 0.045 - i * 0.008, -0.1, 'x', 'mag']),
      ['b', 'gun', 0.074, 0.03, 0.25, 0, 0.085, -0.05, 0, 'cover'],
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.06, 0.08, -0.3],
      ...trigger(-0.02, 0.02),
      ['b', 'poly', 0.05, 0.095, 0.26, 0, 0.0, 0.3],
      ['b', 'rubber', 0.052, 0.1, 0.02, 0, 0.0, 0.44],
      ['b', 'gun', 0.015, 0.04, 0.1, 0.04, 0.1, -0.25],
      ['c', 'gun', 0.007, 0.25, 0.012, -0.012, -0.55],
      ['c', 'gun', 0.007, 0.25, -0.012, -0.012, -0.55],
      ['b', 'gun', 0.006, 0.03, 0.006, 0, 0.09, -0.7],
      ['b', 'gun', 0.03, 0.022, 0.012, 0, 0.11, 0.06],
      ...pins(0.0355, [[0.0, -0.15], [0.04, 0.05], [-0.01, 0.1]]),
    ],
    muzzle: [0, 0.035, -0.77], eject: [0.04, 0.03, -0.05], sightY: 0.12, left: [0, -0.025, -0.38], rightGrip: [0, -0.05, 0.08], gripR: 0.019, leftGrip: { type: 'h', pos: [0, 0.05, -0.4], r: 0.03 }, gripRx: -0.3,
  },
  sniper: {
    parts: [
      ['b', 'gun', 0.055, 0.07, 0.3, 0, 0.02, -0.02],
      ...port(0.028, 0.035, 0.0, 0.07),
      ['c', 'gun', 0.015, 0.7, 0, 0.035, -0.5],
      ['b', 'gun', 0.04, 0.03, 0.07, 0, 0.035, -0.88],
      ...slots(0.0205, 0.035, -0.9, 3, 0.02, 0.01, 0.018),
      ...bore(0.035, -0.916, 0.015),
      ['b', 'olive', 0.05, 0.1, 0.4, 0, -0.01, 0.3],
      ['b', 'olive', 0.04, 0.03, 0.16, 0, 0.05, 0.3],
      ['b', 'rubber', 0.052, 0.11, 0.02, 0, -0.01, 0.505],
      ['b', 'olive', 0.055, 0.06, 0.45, 0, 0.0, -0.35],
      ['b', 'poly', 0.034, 0.1, 0.04, 0, -0.06, 0.08, -0.35],
      ...trigger(-0.02, 0.03),
      ['b', 'gun', 0.035, 0.075, 0.08, 0, -0.045, -0.05, 0, 'mag'],
      ['c', 'gun', 0.022, 0.38, 0, 0.11, -0.05],
      ['c', 'gun', 0.03, 0.08, 0, 0.11, -0.27],
      ['c', 'glass', 0.027, 0.005, 0, 0.11, -0.312],
      ['c', 'gun', 0.027, 0.06, 0, 0.11, 0.17],
      ['c', 'glass', 0.023, 0.004, 0, 0.11, 0.2],
      ['c', 'gun', 0.012, 0.025, 0, 0.14, -0.05, 'y'],
      ['c', 'gun', 0.012, 0.025, 0.033, 0.11, -0.05, 'x'],
      ['b', 'gun', 0.02, 0.05, 0.02, 0, 0.075, -0.15],
      ['b', 'gun', 0.02, 0.05, 0.02, 0, 0.075, 0.06],
      ['c', 'chrome', 0.007, 0.07, 0.05, 0.04, 0.1, 'x', 'bolt'],
      ['b', 'chrome', 0.016, 0.016, 0.016, 0.085, 0.04, 0.1, 0, 'bolt'],
    ],
    muzzle: [0, 0.035, -0.93], eject: [0.03, 0.04, 0.0], sightY: 0.11, left: [0, -0.045, -0.3], rightGrip: [0, -0.05, 0.08], gripR: 0.019, leftGrip: { type: 'h', pos: [0, 0.0, -0.32], r: 0.03 }, gripRx: -0.35,
  },
  volt: {
    parts: [
      ['c', 'gun', 0.045, 0.34, 0, 0.02, -0.08],
      ['c', 'copper', 0.056, 0.022, 0, 0.02, -0.13],
      ['c', 'volt', 0.05, 0.018, 0, 0.02, -0.17],
      ['c', 'copper', 0.056, 0.022, 0, 0.02, -0.21],
      ['c', 'volt', 0.05, 0.018, 0, 0.02, -0.25],
      ['c', 'copper', 0.058, 0.03, 0, 0.02, -0.28],
      ['t', 'copper', 0.05, 0.004, 0, 0.02, -0.19, TAU, 0, 0, 0],
      ['t', 'copper', 0.05, 0.004, 0, 0.02, -0.23, TAU, 0, 0, 0],
      ['b', 'copper', 0.012, 0.012, 0.09, 0.03, 0.05, -0.32],
      ['b', 'copper', 0.012, 0.012, 0.09, -0.03, 0.05, -0.32],
      ['b', 'copper', 0.012, 0.012, 0.09, 0, -0.015, -0.32],
      ['c', 'volt', 0.03, 0.15, 0, 0.1, 0.0, 'y', 'mag'],
      ['c', 'copper', 0.035, 0.02, 0, 0.18, 0.0, 'y'],
      ['c', 'copper', 0.035, 0.02, 0, 0.025, 0.0, 'y'],
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.06, 0.08, -0.3],
      ...trigger(-0.025, 0.03),
      ['b', 'copper', 0.075, 0.075, 0.06, 0, 0.02, 0.12],
      ['c', 'gun', 0.012, 0.25, 0.05, 0.02, -0.05],
      ['c', 'rubber', 0.006, 0.2, -0.05, 0.03, -0.02],
    ],
    muzzle: [0, 0.02, -0.37], eject: [0.03, 0.03, 0], sightY: 0.075, left: [0, -0.05, -0.2], rightGrip: [0, -0.05, 0.08], gripR: 0.019, leftGrip: { type: 'h', pos: [0, 0.02, -0.12], r: 0.047 }, gripRx: -0.3,
  },
};

function partGeometry(p) {
  let g;
  if (p[0] === 'b' || p[0] === 'B') {
    const [, , w, h, d, x, y, z, rx = 0] = p;
    if (p[0] === 'b') {
      const r = Math.min(w, h, d) * 0.28;
      g = new RoundedBoxGeometry(w, h, d, 2, r);
    } else g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
  } else if (p[0] === 'c') {
    const [, , r, len, x, y, z, axis = 'z'] = p;
    g = new THREE.CylinderGeometry(r, r, len, Math.max(10, Math.min(24, Math.round(r * 900))));
    if (axis === 'z') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
  } else if (p[0] === 't') {
    const [, , R, tube, x, y, z, arc, rx = 0, ry = 0, rz = 0] = p;
    g = new THREE.TorusGeometry(R, tube, 6, 20, arc);
    if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry);
    g.translate(x, y, z);
  }
  if (g.index === null) return g;
  return g;
}
function partName(p) {
  if (p[0] === 'b' || p[0] === 'B') return p[9];
  if (p[0] === 'c') return p[8];
  if (p[0] === 't') return p[11];
  return undefined;
}

const compiled = new Map();
function compile(id) {
  if (compiled.has(id)) return compiled.get(id);
  const spec = SPECS[id];
  const buckets = new Map();
  for (const p of spec.parts) {
    const name = partName(p) || '';
    const key = name + '|' + p[1];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(partGeometry(p));
  }
  const out = [];
  for (const [key, list] of buckets) {
    const [name, mat] = key.split('|');
    const norm = list.map((g) => (g.index ? g.toNonIndexed() : g));
    norm.forEach((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); });
    const merged = mergeGeometries(norm.map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', g.attributes.position); c.setAttribute('normal', g.attributes.normal); c.setAttribute('uv', g.attributes.uv); return c; }), false);
    out.push({ name, mat, geo: merged });
  }
  const c = { spec, groups: out };
  compiled.set(id, c);
  return c;
}

export function getSpec(id) { return SPECS[id]; }

export function buildGun(id, T, upgraded = false) {
  const M = gunMaterials(T);
  const { spec, groups } = compile(id);
  const root = new THREE.Group();
  const named = {};
  for (const { name, mat, geo } of groups) {
    let mn = mat;
    if (upgraded) {
      if (mn === 'gun' || mn === 'gunLight') mn = 'forged';
      else if (mn === 'poly' || mn === 'olive' || mn === 'wood' || mn === 'tan') mn = 'forgedDark';
    }
    const mesh = new THREE.Mesh(geo, M[mn]);
    if (name) {
      if (!named[name]) { named[name] = new THREE.Group(); named[name].userData.home = new THREE.Vector3(); root.add(named[name]); }
      named[name].add(mesh);
    } else root.add(mesh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.fromArray(spec.muzzle); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.fromArray(spec.eject); root.add(eject);
  return { root, named, muzzle, eject, spec };
}

// prebuild merged geometry so first equips don't hitch
export function prewarmGuns() { for (const id of Object.keys(SPECS)) compile(id); }
