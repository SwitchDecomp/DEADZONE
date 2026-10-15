import * as THREE from 'three';
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
  MATS = {
    gun: m({ map: T.gunmetal.map, normalMap: T.gunmetal.normalMap, roughnessMap: T.gunmetal.roughnessMap, metalness: 1, roughness: 1, color: 0x9a9ca0 }),
    poly: m({ map: T.polymer.map, normalMap: T.polymer.normalMap, roughness: 0.7, metalness: 0.05, color: 0x9a9a9a }),
    wood: m({ map: T.wood.map, normalMap: T.wood.normalMap, roughness: 0.55, metalness: 0, color: 0xc89a70 }),
    olive: m({ map: T.polymer.map, color: 0x6a7350, roughness: 0.7, metalness: 0.1 }),
    rubber: m({ color: 0x111111, roughness: 0.95 }),
    chrome: m({ color: 0xdddddd, roughness: 0.15, metalness: 1 }),
    copper: m({ color: 0xc07840, roughness: 0.3, metalness: 1 }),
    glass: m({ color: 0x223040, roughness: 0.05, metalness: 0.8 }),
    reddot: m({ color: 0x000000, emissive: 0xff2010, emissiveIntensity: 6 }),
    volt: m({ color: 0x0a2030, emissive: 0x40d0ff, emissiveIntensity: 5, roughness: 0.2 }),
    forged: m({ map: T.gunmetal.map, normalMap: T.gunmetal.normalMap, color: 0x4a3058, metalness: 1, roughness: 0.3, emissive: 0xa040ff, emissiveMap: forged, emissiveIntensity: 2.5 }),
    forgedDark: m({ map: T.polymer.map, color: 0x1a1020, metalness: 0.6, roughness: 0.4, emissive: 0xff5020, emissiveMap: forged, emissiveIntensity: 1.6 }),
    brass: m({ color: 0xd8a040, roughness: 0.25, metalness: 1 }),
  };
  return MATS;
}

// part: b: [type, mat, w,h,d, x,y,z, rx, name]  c: [type, mat, r,len, x,y,z, axis, name]
const SPECS = {
  pistol: {
    parts: [
      ['b', 'gun', 0.034, 0.034, 0.2, 0, 0.035, -0.06, 0, 'slide'],
      ['b', 'poly', 0.03, 0.024, 0.17, 0, 0.008, -0.045],
      ['b', 'poly', 0.031, 0.115, 0.046, 0, -0.045, 0.022, -0.22],
      ['b', 'poly', 0.008, 0.022, 0.045, 0, -0.016, -0.03],
      ['c', 'gun', 0.008, 0.02, 0, 0.033, -0.163],
      ['b', 'gun', 0.004, 0.009, 0.006, 0, 0.056, -0.15, 0, 'slide'],
      ['b', 'gun', 0.022, 0.009, 0.008, 0, 0.056, 0.03, 0, 'slide'],
      ['b', 'gun', 0.025, 0.11, 0.036, 0, -0.05, 0.028, -0.22, 'mag'],
      ['b', 'gun', 0.033, 0.014, 0.05, 0, -0.105, 0.04, -0.22, 'mag'],
    ],
    muzzle: [0, 0.033, -0.18], eject: [0.02, 0.045, -0.03], sightY: 0.058, left: [-0.005, -0.06, 0.03], rightGrip: [0, -0.04, 0.03],
  },
  smg: {
    parts: [
      ['b', 'gun', 0.046, 0.062, 0.28, 0, 0.02, -0.08],
      ['c', 'gun', 0.017, 0.12, 0, 0.03, -0.28],
      ['c', 'gun', 0.012, 0.06, 0, 0.03, -0.37],
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.05, 0.02, -0.3],
      ['b', 'gun', 0.025, 0.17, 0.042, 0, -0.1, -0.12, 0.18, 'mag'],
      ['b', 'poly', 0.03, 0.03, 0.2, 0, 0.025, 0.15],
      ['b', 'poly', 0.03, 0.085, 0.022, 0, 0.0, 0.25],
      ['b', 'gun', 0.022, 0.012, 0.22, 0, 0.056, -0.08],
      ['b', 'poly', 0.032, 0.036, 0.055, 0, 0.078, -0.03],
      ['b', 'reddot', 0.02, 0.018, 0.004, 0, 0.083, -0.058],
      ['b', 'gun', 0.02, 0.012, 0.025, 0.032, 0.035, -0.05, 0, 'bolt'],
      ['b', 'poly', 0.03, 0.07, 0.032, 0, -0.035, -0.22],
    ],
    muzzle: [0, 0.03, -0.4], eject: [0.03, 0.04, -0.05], sightY: 0.084, left: [0, -0.06, -0.22], rightGrip: [0, -0.045, 0.02],
  },
  shotgun: {
    parts: [
      ['b', 'gun', 0.05, 0.068, 0.26, 0, 0.02, -0.05],
      ['c', 'gun', 0.016, 0.5, 0, 0.046, -0.42],
      ['c', 'gun', 0.014, 0.42, 0, 0.012, -0.38],
      ['b', 'wood', 0.054, 0.05, 0.19, 0, 0.01, -0.33, 0, 'pump'],
      ['b', 'wood', 0.042, 0.075, 0.32, 0, -0.015, 0.24, 0.12],
      ['b', 'wood', 0.036, 0.085, 0.05, 0, -0.045, 0.065, -0.4],
      ['b', 'chrome', 0.006, 0.006, 0.006, 0, 0.066, -0.66],
      ['b', 'gun', 0.03, 0.018, 0.05, 0.026, 0.03, -0.04],
    ],
    muzzle: [0, 0.046, -0.68], eject: [0.03, 0.03, -0.05], sightY: 0.068, left: [0, -0.03, -0.33], rightGrip: [0, -0.04, 0.06],
  },
  ar: {
    parts: [
      ['b', 'gun', 0.05, 0.072, 0.32, 0, 0.02, -0.05],
      ['b', 'poly', 0.056, 0.062, 0.27, 0, 0.026, -0.34],
      ['c', 'gun', 0.011, 0.15, 0, 0.03, -0.52],
      ['c', 'gun', 0.015, 0.05, 0, 0.03, -0.61],
      ['b', 'gun', 0.03, 0.19, 0.062, 0, -0.1, -0.1, 0.22, 'mag'],
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.055, 0.06, -0.3],
      ['b', 'poly', 0.04, 0.07, 0.24, 0, 0.005, 0.27],
      ['b', 'rubber', 0.045, 0.115, 0.03, 0, -0.005, 0.395],
      ['b', 'gun', 0.022, 0.012, 0.3, 0, 0.063, -0.12],
      ['b', 'poly', 0.042, 0.05, 0.075, 0, 0.09, -0.06],
      ['b', 'reddot', 0.026, 0.02, 0.004, 0, 0.1, -0.098],
      ['b', 'gun', 0.018, 0.01, 0.03, 0, 0.06, 0.09, 0, 'bolt'],
    ],
    muzzle: [0, 0.03, -0.64], eject: [0.03, 0.03, -0.03], sightY: 0.1, left: [0, -0.03, -0.33], rightGrip: [0, -0.05, 0.06],
  },
  burst: {
    parts: [
      ['b', 'poly', 0.056, 0.092, 0.5, 0, 0.012, 0.0],
      ['c', 'gun', 0.012, 0.2, 0, 0.03, -0.33],
      ['c', 'gun', 0.016, 0.04, 0, 0.03, -0.43],
      ['b', 'gun', 0.03, 0.14, 0.05, 0, -0.08, 0.15, 0.12, 'mag'],
      ['b', 'poly', 0.034, 0.1, 0.042, 0, -0.06, -0.08, -0.25],
      ['b', 'gun', 0.032, 0.04, 0.2, 0, 0.085, -0.05],
      ['c', 'glass', 0.019, 0.02, 0, 0.085, -0.16],
      ['b', 'reddot', 0.004, 0.004, 0.002, 0, 0.088, -0.151],
      ['b', 'gun', 0.06, 0.02, 0.1, 0, 0.065, 0.1],
    ],
    muzzle: [0, 0.03, -0.45], eject: [0.03, 0.03, 0.1], sightY: 0.088, left: [0, -0.03, -0.23], rightGrip: [0, -0.05, -0.08],
  },
  lmg: {
    parts: [
      ['b', 'gun', 0.07, 0.1, 0.4, 0, 0.02, -0.05],
      ['c', 'gun', 0.017, 0.5, 0, 0.035, -0.5],
      ['b', 'gun', 0.05, 0.04, 0.35, 0, 0.065, -0.4],
      ['b', 'olive', 0.1, 0.12, 0.13, -0.065, -0.08, -0.1, 0, 'mag'],
      ['b', 'brass', 0.03, 0.02, 0.08, -0.03, 0.045, -0.1, 0, 'mag'],
      ['b', 'gun', 0.074, 0.03, 0.25, 0, 0.085, -0.05, 0, 'cover'],
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.06, 0.08, -0.3],
      ['b', 'poly', 0.05, 0.095, 0.26, 0, 0.0, 0.3],
      ['b', 'gun', 0.015, 0.04, 0.1, 0.04, 0.1, -0.25],
      ['c', 'gun', 0.008, 0.25, 0, -0.01, -0.55],
      ['b', 'gun', 0.006, 0.03, 0.006, 0, 0.09, -0.7],
      ['b', 'gun', 0.03, 0.022, 0.012, 0, 0.11, 0.06],
    ],
    muzzle: [0, 0.035, -0.77], eject: [0.04, 0.03, -0.05], sightY: 0.12, left: [0, -0.02, -0.38], rightGrip: [0, -0.05, 0.08],
  },
  sniper: {
    parts: [
      ['b', 'gun', 0.055, 0.07, 0.3, 0, 0.02, -0.02],
      ['c', 'gun', 0.014, 0.7, 0, 0.035, -0.5],
      ['b', 'gun', 0.04, 0.03, 0.07, 0, 0.035, -0.88],
      ['b', 'olive', 0.05, 0.1, 0.4, 0, -0.01, 0.3],
      ['b', 'olive', 0.055, 0.06, 0.45, 0, 0.0, -0.35],
      ['b', 'poly', 0.034, 0.1, 0.04, 0, -0.06, 0.08, -0.35],
      ['b', 'gun', 0.035, 0.075, 0.08, 0, -0.045, -0.05, 0, 'mag'],
      ['c', 'gun', 0.022, 0.38, 0, 0.11, -0.05],
      ['c', 'gun', 0.03, 0.08, 0, 0.11, -0.27],
      ['c', 'glass', 0.027, 0.005, 0, 0.11, -0.312],
      ['c', 'gun', 0.027, 0.06, 0, 0.11, 0.17],
      ['b', 'gun', 0.02, 0.05, 0.02, 0, 0.075, -0.15],
      ['b', 'gun', 0.02, 0.05, 0.02, 0, 0.075, 0.06],
      ['c', 'chrome', 0.007, 0.07, 0.05, 0.04, 0.1, 'x', 'bolt'],
      ['b', 'chrome', 0.016, 0.016, 0.016, 0.085, 0.04, 0.1, 0, 'bolt'],
    ],
    muzzle: [0, 0.035, -0.93], eject: [0.03, 0.04, 0.0], sightY: 0.11, left: [0, -0.04, -0.3], rightGrip: [0, -0.05, 0.08],
  },
  volt: {
    parts: [
      ['c', 'gun', 0.045, 0.34, 0, 0.02, -0.08],
      ['c', 'copper', 0.056, 0.022, 0, 0.02, -0.13],
      ['c', 'volt', 0.05, 0.018, 0, 0.02, -0.17],
      ['c', 'copper', 0.056, 0.022, 0, 0.02, -0.21],
      ['c', 'volt', 0.05, 0.018, 0, 0.02, -0.25],
      ['c', 'copper', 0.058, 0.03, 0, 0.02, -0.28],
      ['b', 'copper', 0.012, 0.012, 0.09, 0.03, 0.05, -0.32],
      ['b', 'copper', 0.012, 0.012, 0.09, -0.03, 0.05, -0.32],
      ['b', 'copper', 0.012, 0.012, 0.09, 0, -0.015, -0.32],
      ['c', 'volt', 0.03, 0.15, 0, 0.1, 0.0, 'y', 'mag'],
      ['c', 'copper', 0.035, 0.02, 0, 0.18, 0.0, 'y'],
      ['b', 'poly', 0.034, 0.1, 0.045, 0, -0.06, 0.08, -0.3],
      ['b', 'copper', 0.075, 0.075, 0.06, 0, 0.02, 0.12],
      ['c', 'gun', 0.012, 0.25, 0.05, 0.02, -0.05],
    ],
    muzzle: [0, 0.02, -0.37], eject: [0.03, 0.03, 0], sightY: 0.075, left: [0, -0.04, -0.2], rightGrip: [0, -0.05, 0.08],
  },
};

const geoCache = new Map();
function getBox(w, h, d) {
  const k = `b${w},${h},${d}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}
function getCyl(r, len, axis) {
  const k = `c${r},${len},${axis}`;
  if (!geoCache.has(k)) {
    const g = new THREE.CylinderGeometry(r, r, len, 14);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    geoCache.set(k, g);
  }
  return geoCache.get(k);
}

export function getSpec(id) { return SPECS[id]; }

export function buildGun(id, T, upgraded = false) {
  const M = gunMaterials(T);
  const spec = SPECS[id];
  const root = new THREE.Group();
  const named = {};
  const getGroup = (name) => {
    if (!name) return root;
    if (!named[name]) { named[name] = new THREE.Group(); root.add(named[name]); named[name].userData.home = new THREE.Vector3(); }
    return named[name];
  };
  for (const p of spec.parts) {
    let mesh, matName = p[1], name;
    if (upgraded) {
      if (matName === 'gun') matName = 'forged';
      else if (matName === 'poly' || matName === 'olive' || matName === 'wood') matName = 'forgedDark';
    }
    const mat = M[matName];
    if (p[0] === 'b') {
      const [, , w, h, d, x, y, z, rx = 0, nm] = p;
      mesh = new THREE.Mesh(getBox(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.rotation.x = rx; name = nm;
    } else {
      const [, , r, len, x, y, z, axis = 'z', nm] = p;
      mesh = new THREE.Mesh(getCyl(r, len, axis), mat);
      mesh.position.set(x, y, z); name = nm;
    }
    getGroup(name).add(mesh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.fromArray(spec.muzzle); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.fromArray(spec.eject); root.add(eject);
  return { root, named, muzzle, eject, spec };
}
