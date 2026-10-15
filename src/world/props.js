import * as THREE from 'three';
import { rand, TAU } from '../core/utils.js';
import { graffiti, textPanel } from '../core/textures.js';

const PI = Math.PI;

const CRATE_MODELS = [
  ['wooden_crate_01', (n) => true, 'a'],
  ['wooden_crate_02', (n) => true, 'a'],
  ['old_military_crate', (n) => n.endsWith('_a'), 'a'],
];
function crate(L, x, z, s = 1, rot = 0, y = 0, key = 'wood') {
  if (L.hasModel('wooden_crate_01')) {
    if (y > 0) {
      const top = L._crateTop || 0.4;
      const id = Math.random() < 0.5 ? 'medical_box' : 'ammo_box';
      L.placeModel(id, x, z, rot + Math.random(), { y: top, collide: false, shadow: false });
      return;
    }
    const [id, pick, v] = CRATE_MODELS[Math.floor(Math.random() * CRATE_MODELS.length)];
    const sc = 0.95 + s * 0.25;
    const g = L.placeModel(id, x, z, rot, { pick, variant: v, scale: sc });
    L._crateTop = g ? g.userData.top : 0.4;
    if (Math.random() < 0.4 && g) L.placeModel(Math.random() < 0.5 ? 'ammo_box' : 'medical_box', x + (Math.random() - 0.5) * 0.2, z + (Math.random() - 0.5) * 0.2, Math.random() * 6, { y: g.userData.top, collide: false, shadow: false });
    return;
  }
  const T = { x, z, y, rot };
  L.pbox(key, T, 0, s / 2, 0, s, s, s);
  const e = 0.06;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.pbox('woodOld', T, sx * (s / 2 - e / 2 + 0.01), s / 2, sz * (s / 2 - e / 2 + 0.01), e + 0.02, s + 0.02, e + 0.02);
  L.pbox('woodOld', T, 0, s / 2, 0, s + 0.03, 0.08, s + 0.03);
  L.colBox(T, 0, 0, s, s, y + s);
}

function barrel(L, x, z, key = 'rustRed', collide = true, tipped = false) {
  if (L.hasModel('Barrel_01')) {
    const id = key === 'rust' ? 'barrel_03' : 'Barrel_01';
    if (tipped) L.placeModel(id, x, z, Math.random() * 6, { rz: Math.PI / 2, y: 0.3, collide, pad: -0.05 });
    else L.placeModel(id, x, z, Math.random() * 6, { collide });
    return;
  }
  const T = { x, z, rot: Math.random() * TAU };
  if (tipped) {
    L.pcyl(key, T, 0, 0.3, 0, 0.3, 0.9, 'x', 16);
    if (collide) L.colBox(T, 0, 0, 0.9, 0.6, 0.6);
    return;
  }
  L.pcyl(key, T, 0, 0.45, 0, 0.3, 0.9, 'y', 16);
  for (const y of [0.15, 0.45, 0.75]) {
    const g = new THREE.TorusGeometry(0.305, 0.018, 6, 20); g.rotateX(PI / 2); g.translate(0, y, 0);
    L.part('darkSteel', g, T);
  }
  if (collide) L.colBox(T, 0, 0, 0.62, 0.62, 0.9);
}

function sandbags(L, x, z, len, rot = 0, rows = 3) {
  const T = { x, z, rot };
  const n = Math.max(2, Math.floor(len / 0.55));
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < n - (r % 2); i++) {
      const g = new THREE.CapsuleGeometry(0.15, 0.32, 3, 8);
      g.rotateZ(PI / 2); g.scale(1, 0.62, 1.05);
      g.rotateY(rand(-0.08, 0.08));
      g.translate(-len / 2 + 0.3 + i * 0.55 + (r % 2) * 0.27, 0.1 + r * 0.19, rand(-0.03, 0.03));
      if (r === 0) { const g2 = g.clone(); g2.translate(0, 0, 0.3); L.part('sandbag', g2, T, { world: false }); }
      L.part('sandbag', g, T, { world: false });
    }
  }
  L.colBox(T, 0, 0.1, len, 0.62, 0.1 + rows * 0.19);
}

function jersey(L, x, z, rot = 0) {
  if (L.hasModel('concrete_road_barrier')) {
    L.placeModel('concrete_road_barrier', x, z, rot + (Math.random() - 0.5) * 0.06, { shadow: Math.abs(z) < 12.5 && Math.abs(x) < 12.5 });
    return;
  }
  const T = { x, z, rot };
  L.pbox('concrete', T, 0, 0.16, 0, 3, 0.32, 0.62);
  L.pbox('concrete', T, 0, 0.55, 0, 3, 0.5, 0.26);
  L.pbox('concrete', T, 0, 0.36, 0, 3, 0.15, 0.42);
  L.colBox(T, 0, 0, 3, 0.62, 0.8);
}

function wheel(L, T, lx, ly, lz, r = 0.45, w = 0.32) {
  L.pcyl('rubber', T, lx, ly, lz, r, w, 'x', 16);
  L.pcyl('darkSteel', T, lx + Math.sign(lx) * 0.02, ly, lz, r * 0.55, w + 0.02, 'x', 10);
}

function truck(L, x, z, rot) {
  const T = { x, z, rot };
  L.pbox('olive', T, 0, 0.95, 0, 2.2, 0.35, 6.4);
  L.pbox('olive', T, 0, 1.95, -2.35, 2.3, 1.7, 1.7);
  L.pbox('olive', T, 0, 1.45, -3.65, 2.1, 0.9, 1.0);
  L.pbox('darkSteel', T, 0, 1.05, -4.2, 2.3, 0.3, 0.2);
  L.pbox('glass', T, 0, 2.35, -3.21, 2.0, 0.65, 0.05);
  L.pbox('darkSteel', T, 0, 1.55, -4.16, 1.6, 0.6, 0.04);
  L.pbox('woodOld', T, 0, 1.18, 1.0, 2.3, 0.1, 4.4);
  for (const s of [-1, 1]) L.pbox('olive', T, s * 1.12, 1.5, 1.0, 0.06, 0.6, 4.4);
  L.pbox('olive', T, 0, 1.5, 3.18, 2.3, 0.6, 0.06);
  const cover = new THREE.CylinderGeometry(1.18, 1.18, 4.4, 14, 1, true, -PI / 2, PI);
  cover.rotateX(-PI / 2); cover.scale(1, 0.9, 1); cover.translate(0, 1.8, 1.0);
  L.part('canvas', cover, T, { world: false });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.TorusGeometry(1.18, 0.03, 4, 16, PI); g.scale(1, 0.9, 1); g.translate(0, 1.8, -1.0 + i * 1.35);
    L.part('darkSteel', g, T);
  }
  for (const lz of [-3.1, 0.6, 2.1]) for (const s of [-1, 1]) wheel(L, T, s * 1.0, 0.5, lz, 0.5, 0.36);
  for (const s of [-1, 1]) L.pbox('headlight', T, s * 0.75, 1.55, -4.17, 0.28, 0.22, 0.05);
  L.pcyl('rubber', T, 0, 2.0, -1.4, 0.45, 0.25, 'z', 14);
  L.colBox(T, 0, -0.45, 2.4, 7.5, 3.0);
  const from = L.localToWorld(T, 0, 1.6, -4.3);
  const to = L.localToWorld(T, 0.5, 0, -14);
  const rec = L.addLight({ type: 'spot', pos: from, target: to, color: 0xfff0d0, intensity: 60, distance: 26, angle: 0.42, penumbra: 0.6, shadow: true });
  L.truckLight = rec;
  for (const s of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(2.4, 11, 20, 1, true), L.M.cone(0xfff0d0, 0.07));
    c.geometry.translate(0, -5.5, 0);
    c.position.copy(L.localToWorld(T, s * 0.75, 1.55, -4.2));
    c.lookAt(L.localToWorld(T, s * 0.9, 0.4, -14));
    c.rotateX(-PI / 2);
    c.userData.base = 0.07; c.userData.light = rec;
    L.scene.add(c); L.cones.push(c);
  }
}

function policeCar(L, x, z, rot) {
  const T = { x, z, rot };
  L.pbox('policeBlack', T, 0, 0.62, 0, 1.85, 0.62, 4.7);
  L.pbox('policeWhite', T, 0, 0.66, 0.1, 1.87, 0.5, 2.0);
  L.pbox('policeBlack', T, 0, 1.2, 0.25, 1.65, 0.55, 2.3);
  L.pbox('glass', T, 0, 1.22, 0.25, 1.68, 0.4, 2.1);
  L.pbox('darkSteel', T, 0, 0.45, -2.38, 1.9, 0.22, 0.12);
  L.pbox('darkSteel', T, 0, 0.45, 2.38, 1.9, 0.22, 0.12);
  for (const s of [-1, 1]) {
    L.pbox('headlight', T, s * 0.65, 0.72, -2.36, 0.35, 0.14, 0.05);
    L.pbox('lampRed', T, s * 0.7, 0.75, 2.36, 0.3, 0.14, 0.05);
    for (const lz of [-1.5, 1.5]) wheel(L, T, s * 0.85, 0.36, lz, 0.36, 0.25);
  }
  const red = L.M.lampRed.clone(), blue = L.M.lampRed.clone();
  blue.emissive.set(0x1838ff);
  const bar = new THREE.Group();
  bar.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.1, 0.25), L.M.darkSteel));
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.24), red); r.position.x = -0.35; bar.add(r);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.24), blue); b.position.x = 0.35; bar.add(b);
  bar.position.copy(L.localToWorld(T, 0, 1.55, 0.2)); bar.rotation.y = rot;
  L.scene.add(bar);
  L.colBox(T, 0, 0, 1.95, 4.8, 1.6);
  const rec = L.addLight({ pos: L.localToWorld(T, 0, 2.2, 0.2), color: 0xff1a10, intensity: 30, distance: 16, flicker: 'police' });
  rec.mats = [red, blue];
}

function streetLamp(L, x, z, armRot, withLight = true) {
  const T = { x, z, rot: armRot };
  L.pcyl('darkSteel', T, 0, 3, 0, 0.08, 6, 'y', 8, undefined, 0.12);
  L.pcyl('darkSteel', T, 0, 0.25, 0, 0.18, 0.5, 'y', 8);
  L.pbox('darkSteel', T, 0, 5.95, 0.7, 0.08, 0.08, 1.4);
  L.pbox('darkSteel', T, 0, 5.9, 1.45, 0.4, 0.14, 0.6);
  L.pbox('lampWarm', T, 0, 5.82, 1.45, 0.32, 0.03, 0.5);
  L.colBox(T, 0, 0, 0.3, 0.3, 6);
  const p = L.localToWorld(T, 0, 5.6, 1.45);
  const rec = withLight ? L.addLight({ pos: p, color: 0xffa04a, intensity: 55, distance: 22, flicker: 'sway' }) : null;
  const c = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.7, 24, 1, true), L.M.cone(0xffa04a, withLight ? 0.09 : 0.05));
  c.geometry.translate(0, -2.85, 0);
  c.position.copy(p).setY(5.8);
  c.userData.base = withLight ? 0.09 : 0.05; c.userData.light = rec;
  L.scene.add(c); L.cones.push(c);
  return rec;
}

function burningBarrel(L, x, z) {
  barrel(L, x, z, 'rust');
  L.fires.push({ pos: new THREE.Vector3(x, 0.95, z), scale: 1 });
  const g = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), L.M.fireGlow);
  g.rotation.x = -PI / 2; g.position.set(x, 0.86, z); L.scene.add(g);
  return L.addLight({ pos: new THREE.Vector3(x, 1.6, z), color: 0xff7a2a, intensity: 26, distance: 14, flicker: 'fire' });
}

function gurney(L, x, z, rot) {
  const T = { x, z, rot };
  L.pbox('steel', T, 0, 0.75, 0, 0.7, 0.05, 2.0);
  L.pbox('mattress', T, 0, 0.83, 0, 0.66, 0.12, 1.9);
  L.pbox('white', T, rand(-0.05, 0.05), 0.9, 0.2, 0.7, 0.04, 1.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    L.pcyl('steel', T, sx * 0.3, 0.38, sz * 0.9, 0.02, 0.75);
    L.pcyl('rubber', T, sx * 0.3, 0.05, sz * 0.9, 0.05, 0.04, 'x', 8);
  }
  L.colBox(T, 0, 0, 0.75, 2.05, 0.95);
}

function cabinet(L, x, z, rot, w = 1.2, h = 2, key = 'rustBlue') {
  const T = { x, z, rot };
  L.pbox(key, T, 0, h / 2, 0, w, h, 0.5);
  L.pbox('darkSteel', T, 0, h / 2, 0.26, 0.02, h - 0.1, 0.02);
  for (const s of [-1, 1]) L.pbox('chrome', T, s * 0.08, h * 0.55, 0.27, 0.03, 0.2, 0.03);
  L.colBox(T, 0, 0, w, 0.5, h);
}

function tires(L, x, z, n) {
  if (L.hasModel('old_tyre')) {
    for (let i = 0; i < n; i++) L.placeModel('old_tyre', x + (Math.random() - 0.5) * 0.06, z - 0.3 + (Math.random() - 0.5) * 0.06, Math.random() * 6, { rx: Math.PI / 2, y: 0.08 + i * 0.165, collide: false, shadow: i === n - 1 });
    if (n) L.addCollider(x - 0.3, x + 0.3, 0, n * 0.165, z - 0.3, z + 0.3);
    return;
  }
  const T = { x, z, rot: 0 };
  for (let i = 0; i < n; i++) {
    const g = new THREE.TorusGeometry(0.33, 0.14, 8, 18); g.rotateX(PI / 2); g.translate(rand(-0.04, 0.04), 0.14 + i * 0.27, rand(-0.04, 0.04));
    L.part('rubber', g, T);
  }
  L.colBox(T, 0, 0, 0.95, 0.95, n * 0.27);
}

function shelf(L, x, z, rot, len = 2.4, h = 2.2) {
  const T = { x, z, rot };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.pbox('darkSteel', T, sx * (len / 2 - 0.03), h / 2, sz * 0.27, 0.05, h, 0.05);
  for (let i = 0; i < 4; i++) {
    const y = 0.15 + i * (h - 0.2) / 3;
    L.pbox('rust', T, 0, y, 0, len, 0.04, 0.6);
    for (let k = 0; k < 4; k++) if (Math.random() < 0.7) {
      const s = rand(0.2, 0.45);
      L.pbox(Math.random() < 0.5 ? 'woodOld' : 'rustBlue', T, rand(-len / 2 + 0.3, len / 2 - 0.3), y + s / 2 + 0.02, rand(-0.1, 0.1), s, s, s * 1.2);
    }
  }
  L.colBox(T, 0, 0, len, 0.65, h);
}

function generator(L, x, z, rot) {
  const T = { x, z, rot };
  L.pbox('olive', T, 0, 0.15, 0, 4.6, 0.3, 2.6);
  L.pbox('olive', T, -0.4, 1.4, 0, 3.4, 2.2, 2.2);
  L.pbox('darkSteel', T, 1.75, 1.2, 0, 0.9, 1.8, 2.0);
  for (let i = 0; i < 9; i++) L.pbox('steel', T, 2.21, 0.5 + i * 0.16, 0, 0.02, 0.06, 1.8);
  L.pcyl('rust', T, -0.6, 2.7, 0, 0.75, 3.0, 'x', 18);
  L.pcyl('darkSteel', T, -1.6, 4.9, 0.6, 0.15, 4.5);
  L.pcyl('darkSteel', T, 0.6, 4.9, -0.6, 0.15, 4.5);
  L.pcyl('steel', T, 1.4, 3, 0.8, 0.09, 6);
  for (let i = 0; i < 3; i++) {
    L.pcyl('chrome', T, -1.4 + i * 0.5, 1.8, 1.12, 0.12, 0.05, 'z', 14);
    L.pcyl('gauge', T, -1.4 + i * 0.5, 1.8, 1.145, 0.1, 0.02, 'z', 14);
  }
  L.pbox('hazard', T, -0.4, 0.55, 1.11, 3.2, 0.25, 0.02);
  L.colBox(T, 0, 0, 4.7, 2.7, 3.5);
}

function workbench(L, x, z, rot, len = 2.4) {
  const T = { x, z, rot };
  L.pbox('wood', T, 0, 0.92, 0, len, 0.08, 0.8);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.pbox('darkSteel', T, sx * (len / 2 - 0.06), 0.45, sz * 0.33, 0.06, 0.9, 0.06);
  L.pbox('wood', T, 0, 0.25, 0, len - 0.1, 0.04, 0.7);
  L.pbox('darkSteel', T, len / 2 - 0.3, 1.05, 0.2, 0.2, 0.2, 0.25);
  L.pbox('rustRed', T, -0.4, 1.05, -0.1, 0.5, 0.18, 0.25);
  L.pbox('woodOld', T, 0, 1.6, -0.38, len, 1.2, 0.04);
  L.colBox(T, 0, 0, len, 0.85, 1.0);
}

function jeep(L, x, z, rot) {
  const T = { x, z, rot };
  L.pbox('olive', T, 0, 0.8, 0, 1.8, 0.6, 3.8);
  L.pbox('olive', T, 0, 1.15, -1.3, 1.7, 0.2, 1.2);
  L.pbox('darkSteel', T, 0, 1.55, -0.5, 1.6, 0.6, 0.05);
  L.pbox('glass', T, 0, 1.55, -0.52, 1.5, 0.5, 0.03);
  L.pbox('canvas', T, 0, 1.15, 0.6, 1.6, 0.3, 1.6);
  for (const s of [-1, 1]) for (const lz of [-1.25, 1.25]) wheel(L, T, s * 0.88, 0.42, lz, 0.42, 0.3);
  L.pcyl('rubber', T, 0, 1.0, 2.0, 0.4, 0.25, 'z', 14);
  L.colBox(T, 0, 0, 2.0, 4.2, 1.8);
}

function sedan(L, x, z, rot) {
  const T = { x, z, rot };
  L.pbox('rustRed', T, 0, 0.6, 0, 1.8, 0.55, 4.4);
  L.pbox('rustRed', T, 0, 1.12, 0.3, 1.6, 0.5, 2.1);
  L.pbox('black', T, 0, 1.12, 0.3, 1.62, 0.36, 1.9);
  L.pbox('rust', T, 0, 0.92, -1.6, 1.7, 0.06, 1.2);
  for (const s of [-1, 1]) for (const lz of [-1.4, 1.4]) wheel(L, T, s * 0.82, 0.34, lz, 0.34, 0.24);
  L.colBox(T, 0, 0, 1.9, 4.5, 1.4);
}

function bodyBag(L, x, z, rot) {
  const g = new THREE.CapsuleGeometry(0.28, 1.4, 4, 10);
  g.rotateZ(PI / 2); g.scale(1, 0.45, 1); g.translate(0, 0.13, 0);
  L.part('rubber', g, { x, z, rot }, { world: false });
}

function rubble(L, x0, z0, x1, z1, n, key = 'concrete') {
  for (let i = 0; i < n; i++) {
    const s = rand(0.06, 0.3);
    L.box(key, rand(x0, x1), s * 0.35, rand(z0, z1), s * rand(0.8, 1.6), s * rand(0.4, 0.8), s * rand(0.8, 1.4), { collide: false, rotY: rand(0, TAU) });
  }
}

function fluoroBank(L, spots, y, zone) {
  const mat = L.M.lampCool.clone();
  mat.emissive.set(0xff1a10); mat.emissiveIntensity = 2;
  let cx = 0, cz = 0;
  for (const [x, z, len] of spots) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.22), mat);
    g.position.set(x, y, z); L.scene.add(g);
    const h = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.08, 0.3), L.M.darkSteel);
    h.position.set(x, y + 0.06, z); L.scene.add(h);
    cx += x / spots.length; cz += z / spots.length;
  }
  const rec = L.addLight({ pos: new THREE.Vector3(cx, y - 0.35, cz), color: 0xff2010, intensity: 16, distance: 22, flicker: 'emergency', zone, powered: true });
  rec.color = new THREE.Color(0xdde8ff);
  rec.poweredBase = 48; rec.powerFlicker = 'fluoro'; rec.mat = mat;
  return rec;
}

function hangingLamp(L, x, z, y, zone, color = 0xffc070, powered = false) {
  if (!L.placeModel('hanging_industrial_lamp', x, z, 0, { y: y - 0.16, collide: false, shadow: false })) {
    L.pcyl('darkSteel', { x, z, rot: 0 }, 0, y + 0.8, 0, 0.01, 1.6, 'y', 4);
    const shade = new THREE.ConeGeometry(0.4, 0.35, 16, 1, true); shade.translate(0, y + 0.05, 0);
    L.part('darkSteel', shade, { x, z, rot: 0 });
  }
  const mat = L.M.lampWarm.clone();
  if (powered) { mat.emissive.set(0xff1a10); mat.emissiveIntensity = 2; }
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), mat);
  bulb.position.set(x, y - 0.08, z); L.scene.add(bulb);
  const rec = L.addLight({ pos: new THREE.Vector3(x, y - 0.3, z), color: powered ? 0xff2010 : color, intensity: powered ? 26 : 45, distance: 24, flicker: powered ? 'emergency' : 'sway', zone, powered });
  rec.mat = mat;
  if (powered) { rec.color = new THREE.Color(color); rec.poweredBase = 70; rec.powerFlicker = 'sway'; }
  const c = new THREE.Mesh(new THREE.ConeGeometry(3.2, y, 24, 1, true), L.M.cone(color, 0.05));
  c.geometry.translate(0, -y / 2, 0); c.position.set(x, y, z);
  c.userData.base = powered ? 0.0 : 0.05; c.userData.light = rec;
  if (powered) { c.userData.poweredBase = 0.05; L.poweredCones = L.poweredCones || []; L.poweredCones.push(c); }
  L.scene.add(c); L.cones.push(c);
  return rec;
}

function decalPlane(L, tex, x, y, z, w, h, rotY = 0, flat = false, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.4, opacity }));
  m.position.set(x, y, z);
  if (flat) { m.rotation.x = -PI / 2; m.rotation.z = rotY; } else m.rotation.y = rotY;
  m.receiveShadow = true;
  L.scene.add(m);
  return m;
}

function signTex() {
  return textPanel(1024, 512, (g, w, h) => {
    g.fillStyle = '#d9c9a0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#b01a10'; g.fillRect(0, 0, w, 120);
    g.fillStyle = '#f2e8d0'; g.font = 'bold 84px "Black Ops One", Impact'; g.textAlign = 'center';
    g.fillText('WARNING', w / 2, 92);
    g.fillStyle = '#1a1612'; g.font = 'bold 70px Oswald, Impact';
    g.fillText('SITE 9 — QUARANTINE ZONE', w / 2, 220);
    g.font = '42px Oswald, Impact';
    g.fillText('HOLLOW CREEK CONTAINMENT AUTHORITY', w / 2, 295);
    g.fillText('LETHAL FORCE AUTHORIZED BEYOND THIS POINT', w / 2, 360);
    g.font = 'bold 38px "Share Tech Mono", monospace'; g.fillStyle = '#b01a10';
    g.fillText('BIOHAZARD LEVEL 4', w / 2, 440);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(40,30,20,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 30, Math.random() * 30); }
    for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(90,40,20,0.25)'; g.fillRect(Math.random() * w, Math.random() * h * 0.3, 3 + Math.random() * 6, Math.random() * h); }
  });
}

function clinicSign() {
  return textPanel(1024, 256, (g, w, h) => {
    g.fillStyle = '#e8ece8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c01818'; g.fillRect(40, 48, 160, 160); g.fillStyle = '#fff'; g.fillRect(100, 68, 40, 120); g.fillRect(60, 108, 120, 40);
    g.fillStyle = '#1c2a2a'; g.font = 'bold 86px Oswald, Impact'; g.textAlign = 'left'; g.fillText('ST. AGNES', 240, 130);
    g.font = '48px Oswald, Impact'; g.fillText('FIELD TRIAGE — WARD C', 240, 200);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(60,40,30,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, Math.random() * 20, Math.random() * 20); }
  });
}

export function buildProps(L) {
  // ================= COURTYARD =================
  truck(L, -6.4, 2.4, 0);
  policeCar(L, 6.6, 3.6, 0.55);
  L.fireLight = burningBarrel(L, 4.2, -6.8);
  sandbags(L, -3, -8.2, 3.2, 0);
  sandbags(L, 8.4, -7.6, 2.6, 1.2);
  sandbags(L, -9.8, -2.8, 2.2, PI / 2, 2);
  jersey(L, -1.5, 9.2, 0.12);
  jersey(L, 3.8, -10.2, -0.08);
  crate(L, 9.7, -10.6, 1.1, 0.1); crate(L, 10.9, -10.7, 1.0, -0.15); crate(L, 10.2, -10.6, 0.8, 0.4, 1.1);
  crate(L, -10.6, 10.5, 1.1, 0.2); crate(L, -10.7, 9.2, 1.0, -0.1); crate(L, -9.4, 10.6, 0.9, 0.5);
  barrel(L, 11.2, -4.0, 'rustBlue'); barrel(L, -11.1, -8.5, 'rustRed'); barrel(L, -11.0, -7.7, 'rust');
  barrel(L, 2.5, 10.9, 'rust', true, true);
  streetLamp(L, -11.4, -5.2, PI / 2);
  streetLamp(L, 11.4, 10.2, -PI / 2, false);
  bodyBag(L, -3.8, 4.5, 0.3); bodyBag(L, -3.7, 5.6, 0.1); bodyBag(L, -3.4, 2.8, -0.2);
  rubble(L, -11.5, -11.5, 11.5, 11.5, 70);
  for (let x = -11.5; x <= 11.5; x += 0.5) {
    const g = new THREE.TorusGeometry(0.28, 0.012, 3, 10); g.rotateY(PI / 2 + rand(-0.3, 0.3)); g.translate(x, 4.85, 12);
    L.addGeo('wire', g);
  }
  const tent = { x: 7.5, z: -3.4, rot: 0 };
  const tg = new THREE.ConeGeometry(2.0, 2.6, 4, 1, true); tg.rotateY(PI / 4); tg.translate(0, 1.3, 0);
  L.part('canvas', tg, tent, { world: false });
  L.colBox(tent, 0, 0, 2.4, 2.4, 2.6);
  decalPlane(L, signTex(), -4.5, 4.8, -11.78, 4.4, 2.2, 0);
  decalPlane(L, graffiti('THEY HEAR YOU'), 11.78, 4.3, 7, 5, 1.25, -PI / 2);
  decalPlane(L, graffiti('NO RESCUE', '#b8b2a6'), -11.78, 4.6, 6.5, 4, 1, PI / 2);
  decalPlane(L, graffiti('DEADZONE', '#8a0e0a'), 0, 3.2, 11.78, 4.2, 1.05, PI);
  for (let i = 0; i < 9; i++) decalPlane(L, L.T.blood[i % 4], rand(-10, 10), 0.03 + i * 0.001, rand(-10, 10), rand(1, 2.4), rand(1, 2.4), rand(0, TAU), true, 0.9);

  // ================= CLINIC =================
  gurney(L, 16, 5, 0.3); gurney(L, 19.5, -5.2, -0.2); gurney(L, 26.5, 3.5, 1.4); gurney(L, 23, -2, 2.6);
  cabinet(L, 24.5, -8.5, 0); cabinet(L, 25.8, -8.5, 0, 1.2, 1.6, 'rust'); cabinet(L, 27.1, -8.5, 0);
  cabinet(L, 12.5, 6.8, PI / 2, 1.0, 1.8, 'plasterBlue');
  L.box('wood', 15.2, 0.55, -3.4, 2.6, 1.1, 0.7);
  L.box('wood', 16.15, 0.55, -5.2, 0.7, 1.1, 2.9);
  for (const cz of [-1.0, 3.0]) {
    L.box('steel', 21, 2.2, cz, 4, 0.04, 0.04, { collide: false });
    L.box('mattress', 21.0, 1.25, cz, 3.8, 1.7, 0.03);
  }
  rubble(L, 12.5, -8.5, 29.5, 8.5, 30, 'plaster');
  decalPlane(L, clinicSign(), 11.79, 4.1, 0, 4, 1, -PI / 2);
  decalPlane(L, graffiti('ABANDON HOPE', '#7a0a08', 1024, 256), 29.78, 2.6, -5.5, 3.6, 0.9, -PI / 2);
  for (let i = 0; i < 8; i++) decalPlane(L, L.T.blood[i % 4], rand(13, 29), 0.03 + i * 0.001, rand(-8, 8), rand(1, 2.6), rand(1, 2.6), rand(0, TAU), true);
  L.clinicLights = [fluoroBank(L, [[16.5, 0, 1.6], [25, 0, 1.6], [21, -5, 1.4], [21, 5, 1.4]], 3.75, 1)];

  // ================= MOTOR POOL =================
  jeep(L, -26.5, 6.8, 1.35);
  sedan(L, -17, 6.2, 0.1);
  tires(L, -30.8, 10.4, 4); tires(L, -29.7, 10.8, 3); tires(L, -30.9, 9.3, 2);
  shelf(L, -31.4, 0, PI / 2, 2.6);
  workbench(L, -14.6, -11.2, 0, 2.6);
  barrel(L, -22, -9.6, 'rustRed'); barrel(L, -21.3, -10.1, 'rustBlue'); barrel(L, -22.6, -10.3, 'rust');
  barrel(L, -25.5, 1.8, 'rust', true, true);
  crate(L, -14, -4.2, 1.1, 0.2); crate(L, -14.2, -5.5, 1.0, -0.1); crate(L, -14.1, -4.8, 0.8, 0.3, 1.1);
  L.box('corrugated', -16, 2.0, 11.76, 4.2, 4, 0.08, { collide: false });
  L.box('hazard', -16, 0.12, 11.7, 4.2, 0.24, 0.1, { collide: false });
  for (let i = 0; i < 5; i++) decalPlane(L, L.T.blood[i % 4], rand(-31, -13), 0.03 + i * 0.001, rand(-11, 11), rand(1, 2), rand(1, 2), rand(0, TAU), true);
  decalPlane(L, graffiti('SECTOR 4 LOST', '#d8d0c0'), -31.78, 3.6, -0.5, 4.2, 1.05, PI / 2);
  rubble(L, -27, -4, -19, 4, 40, 'concreteDark');
  L.motorLights = [hangingLamp(L, -16.5, -5, 5.2, 2, 0xffb060), hangingLamp(L, -23, 6, 5.2, 2, 0xffb060)];

  // ================= GENERATOR HALL =================
  generator(L, -12, -21.2, 0);
  generator(L, -2.5, -21.2, PI);
  cabinet(L, -23.5, -26, PI / 2, 1.4, 2.2, 'rust'); cabinet(L, -23.5, -24.4, PI / 2, 1.4, 2.2, 'olive');
  cabinet(L, 11.5, -15.5, -PI / 2, 1.4, 2.2, 'rust');
  crate(L, 10.6, -28.6, 1.1, 0.1); crate(L, 9.4, -28.8, 1, -0.2); crate(L, 10.4, -27.4, 0.9, 0.3);
  L.pcyl('rust', { x: 0, z: 0, rot: 0 }, -6, 6.2, -29.4, 0.25, 36, 'x', 12);
  L.pcyl('steel', { x: 0, z: 0, rot: 0 }, -6, 5.6, -29.5, 0.12, 36, 'x', 10);
  L.box('hazard', -6, 0.01, -16.5, 6, 0.02, 0.3, { collide: false });
  decalPlane(L, graffiti('RESTORE POWER', '#e8e0c8', 1024, 256), -12, 4.6, -29.78, 5, 1.25, 0);
  for (let i = 0; i < 5; i++) decalPlane(L, L.T.blood[i % 4], rand(-23, 11), 0.03 + i * 0.001, rand(-29, -13), rand(1, 2), rand(1, 2), rand(0, TAU), true);
  L.genLights = [hangingLamp(L, -17, -16, 6.2, 3, 0xffe0b0, true), hangingLamp(L, 4, -16, 6.2, 3, 0xffe0b0, true)];

  // ================= SCANNED DECOR =================
  const P = (id, x, z, rot = 0, o = {}) => L.placeModel(id, x, z, rot, o);
  const can = { pick: (n) => !n.includes('rust'), variant: 'clean' };
  P('trashbag', -11.2, 3.5, 0.4, { collide: false }); P('trashbag', -11.0, 4.3, 2.1, { collide: false }); P('trashbag', 10.8, 8.0, 1.2, { collide: false });
  P('metal_trash_can', -11.15, 2.2, 0.3, can);
  P('metal_jerrycan', -4.9, -0.9, 0.2, { shadow: false }); P('metal_jerrycan', -4.6, -0.5, 1.4, { shadow: false });
  P('ammo_box', -3.2, -7.95, 0.1, { y: 0.66, collide: false, shadow: false });
  P('utility_box_01', 6, -11.55, 0);
  P('wheelchair_01', 19, 6.6, 2.2);
  P('medical_box', 16, 5, 0.3, { y: 0.92, collide: false, shadow: false });
  P('medical_box', 25.8, -8.5, 0.1, { y: 1.6, collide: false, shadow: false });
  P('trashbag', 28.8, 7.9, 0.5, { collide: false });
  P('cardboard_box_01', 13.2, -8.2, 0.4); P('cardboard_box_01', 13.3, -7.6, 1.9, { y: 0, collide: false });
  P('tool_cart', -25.5, -8.6, 0.2);
  P('metal_tool_chest', -14.6, -11.2, 0.05, { y: 0.96, collide: false });
  P('portable_generator', -30.5, -2.7, Math.PI / 2);
  P('metal_jerrycan', -30.6, -3.75, 1.6, { shadow: false }); P('metal_jerrycan', -30.2, -4.0, 1.4, { shadow: false });
  P('utility_box_01', -12.55, 8, -Math.PI / 2);
  P('portable_generator', 8, -14, 0.5);
  P('metal_tool_chest', -22.8, -28.6, Math.PI / 2);
  P('cardboard_box_01', 9.6, -27.4, 0.3, { y: 0, collide: false });
  P('utility_box_01', 7.5, -29.55, 0); P('utility_box_01', -17, -29.55, 0);
  P('trashbag', 11.2, -13.1, 0.9, { collide: false });

  // ================= OUTSIDE (south) =================
  sedan(L, -4, 20, 1.2); sedan(L, 9, 22, -0.4);
  L.fires.push({ pos: new THREE.Vector3(-4, 1.0, 20), scale: 2.2 });
  L.fires.push({ pos: new THREE.Vector3(18, 0.4, -40), scale: 3 });
  jersey(L, 2, 16, 0.4); jersey(L, -10, 17, -0.2);

  L.spots = {
    perks: [
      { id: 'secondwind', x: -8, z: -11.3, rot: 0 },
      { id: 'ironhide', x: 29.3, z: -5, rot: -PI / 2 },
      { id: 'swiftstep', x: -31.3, z: -9, rot: PI / 2 },
      { id: 'rapidfire', x: -13.8, z: 11.3, rot: PI },
      { id: 'quickhands', x: -23.3, z: -16.5, rot: PI / 2 },
      { id: 'mule', x: 11.3, z: -17.6, rot: -PI / 2 },
    ],
    wallbuys: [
      { weapon: 'smg', x: 0, z: 11.78, rot: PI },
      { weapon: 'shotgun', x: 16, z: -8.78, rot: 0 },
      { weapon: 'ar', x: -27.5, z: 11.78, rot: PI },
      { weapon: 'burst', x: -20, z: -29.78, rot: 0 },
    ],
    box: [
      { x: 11.35, z: -6.8, rot: -PI / 2 },
      { x: 24, z: 8.35, rot: PI },
      { x: -28, z: -11.35, rot: 0 },
      { x: -2, z: -29.35, rot: 0 },
    ],
    power: { x: -6, z: -29.78, rot: 0 },
    forge: { x: 6, z: -25.5, rot: 0 },
    start: { x: 1.5, z: 2.5, yaw: 0 },
  };
  const gs = [
    [0, -9.5, -9.5], [0, 9.5, 9.5], [0, -9.2, 6.5], [0, 2, -10.5],
    [1, 27, -6.5], [1, 17, 7], [1, 28, 6],
    [2, -28, -7.5], [2, -18, 9.8], [2, -29, 3],
    [3, -20, -27], [3, 8, -27.5], [3, -6, -26.5], [3, -18, -14],
  ];
  for (const [zone, x, z] of gs) L.spawners.push({ zone, pos: new THREE.Vector3(x, 0, z) });
}
