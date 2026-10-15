import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { NavGrid } from './nav.js';
import { rand, TAU, clamp } from '../core/utils.js';
import { buildProps } from './props.js';
import { cloneNodes } from '../core/assets.js';

function worldUV(geo, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = p.getX(i); v = p.getZ(i); }
    else if (nx >= nz) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv.setXY(i, u / tile, v / tile);
  }
}

export const ZONES = [
  { id: 0, name: 'CHECKPOINT DELTA', rect: [-12, -12, 12, 12], covered: false, surface: 'wet', open: true },
  { id: 1, name: 'ST. AGNES FIELD CLINIC', rect: [12, -9, 30, 9], covered: true, surface: 'tile', open: false },
  { id: 2, name: 'MOTOR POOL', rect: [-32, -12, -12, 12], covered: true, surface: 'concrete', open: false },
  { id: 3, name: 'GENERATOR HALL', rect: [-24, -30, 12, -12], covered: true, surface: 'metal', open: false },
];

export class Level {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.M = game.materials;
    this.T = game.textures;
    this.buckets = new Map();
    this.colliders = [];
    this.zones = ZONES.map((z) => ({ ...z, rect: [...z.rect] }));
    this.doors = [];
    this.windows = [];
    this.spawners = [];
    this.lights = [];
    this.fires = [];
    this.blinkers = [];
    this.cones = [];
    this.spots = {};
    this.uncovered = [[-26, -3, -20, 3]];
    this.power = false;
    this.time = 0;
    this.boardGeoCache = new Map();
  }

  // ---------- geometry helpers ----------
  addGeo(key, geo, { world = true, shadow = true } = {}) {
    if (world) worldUV(geo, this.M.tile[key] || 2);
    const bk = key + (shadow ? '' : '|ns');
    if (!this.buckets.has(bk)) this.buckets.set(bk, []);
    this.buckets.get(bk).push(geo);
  }
  addCollider(minX, maxX, minY, maxY, minZ, maxZ, flags = {}) {
    const c = { minX, maxX, minY, maxY, minZ, maxZ, active: true, bullets: true, player: true, nav: true, zombie: true, ...flags };
    this.colliders.push(c);
    this.gridDirty = true;
    return c;
  }
  buildGrid() {
    const cs = 4, grid = new Map();
    for (const c of this.colliders) {
      if (!c.player && !c.zombie) continue;
      for (let i = Math.floor(c.minX / cs); i <= Math.floor(c.maxX / cs); i++) for (let j = Math.floor(c.minZ / cs); j <= Math.floor(c.maxZ / cs); j++) {
        const k = i * 4096 + j;
        let a = grid.get(k); if (!a) grid.set(k, (a = []));
        a.push(c);
      }
    }
    this.grid = grid; this.gridDirty = false; this.stamp = 0;
  }
  box(key, x, y, z, w, h, d, { collide = true, rotY = 0, shadow = true, flags } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rotY) g.rotateY(rotY);
    g.translate(x, y, z);
    this.addGeo(key, g, { shadow });
    if (collide) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      this.addCollider(b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z, flags);
    }
    return g;
  }
  part(key, geo, T, opts) {
    if (T.rot) geo.rotateY(T.rot);
    geo.translate(T.x, T.y || 0, T.z);
    this.addGeo(key, geo, opts);
    return geo;
  }
  pbox(key, T, lx, ly, lz, w, h, d, opts) {
    const m = Math.min(w, h, d);
    const g = m > 0.03 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.035, m * 0.22)) : new THREE.BoxGeometry(w, h, d);
    g.translate(lx, ly, lz);
    return this.part(key, g, T, opts);
  }
  pcyl(key, T, lx, ly, lz, r, h, axis = 'y', seg = 14, opts, r2) {
    const g = new THREE.CylinderGeometry(r, r2 ?? r, h, seg);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    g.translate(lx, ly, lz);
    return this.part(key, g, T, opts);
  }
  colBox(T, lx, lz, w, d, h, flags) {
    const c = Math.cos(T.rot || 0), s = Math.sin(T.rot || 0);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const [px, pz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
      const x = lx + px, z = lz + pz;
      const wx = T.x + x * c + z * s, wz = T.z - x * s + z * c;
      minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
    }
    return this.addCollider(minX, maxX, 0, h, minZ, maxZ, flags);
  }
  localToWorld(T, lx, ly, lz) {
    const c = Math.cos(T.rot || 0), s = Math.sin(T.rot || 0);
    return new THREE.Vector3(T.x + lx * c + lz * s, (T.y || 0) + ly, T.z - lx * s + lz * c);
  }

  // ---------- photoscanned models ----------
  hasModel(id) { return !!(this.game.assets && this.game.assets.props[id]); }
  placeModel(id, x, z, rot = 0, { pick, variant = '', scale = 1, y = 0, rx = 0, rz = 0, collide = true, shadow = true, pad = 0, flags } = {}) {
    const gltf = this.game.assets && this.game.assets.props[id];
    if (!gltf) return null;
    this.modelCache = this.modelCache || new Map();
    const key = id + '|' + variant;
    let tpl = this.modelCache.get(key);
    if (!tpl) { tpl = cloneNodes(gltf, pick || (() => true)); this.modelCache.set(key, tpl); }
    const g = tpl.clone();
    g.position.set(x, y, z); g.rotation.set(rx, rot, rz); g.scale.setScalar(scale);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = shadow; m.receiveShadow = true; } });
    this.scene.add(g);
    g.updateMatrixWorld(true);
    g.traverse((o) => { o.matrixAutoUpdate = false; });
    const box = new THREE.Box3().setFromObject(g);
    if (collide) this.addCollider(box.min.x - pad, box.max.x + pad, box.min.y, box.max.y, box.min.z - pad, box.max.z + pad, flags);
    g.userData.top = box.max.y;
    return g;
  }

  addLight({ type = 'point', pos, color = 0xffffff, intensity = 10, distance = 16, decay = 2, flicker = 'none', zone = 0, powered = false, target, angle = 0.6, penumbra = 0.5, shadow = false }) {
    let L;
    if (type === 'spot') {
      L = new THREE.SpotLight(color, intensity, distance, angle, penumbra, decay);
      L.target.position.copy(target);
      this.scene.add(L.target);
    } else L = new THREE.PointLight(color, intensity, distance, decay);
    L.position.copy(pos);
    if (shadow) {
      L.castShadow = true;
      L.shadow.mapSize.set(1024, 1024);
      L.shadow.bias = -0.0005;
      L.shadow.camera.near = 0.3;
      L.shadow.camera.far = distance;
    }
    this.scene.add(L);
    const rec = { light: L, base: intensity, color: new THREE.Color(color), flicker, zone, powered, seed: Math.random() * 100, off: 0 };
    this.lights.push(rec);
    return rec;
  }

  // ---------- walls ----------
  wall(axis, fixed, a0, a1, o) {
    const h = o.h ?? 7, t = o.t ?? 0.4;
    const ops = (o.openings || []).slice().sort((a, b) => a.c - b.c);
    const piece = (s0, s1, y0, y1, collide = true) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const len = s1 - s0, mid = (s0 + s1) / 2, ym = (y0 + y1) / 2, hh = y1 - y0;
      if (axis === 'x') {
        this.box(o.matA, mid, ym, fixed - t / 4, len, hh, t / 2, { collide: false });
        this.box(o.matB, mid, ym, fixed + t / 4, len, hh, t / 2, { collide: false });
        if (collide) this.addCollider(s0, s1, y0, y1, fixed - t / 2, fixed + t / 2);
      } else {
        this.box(o.matA, fixed - t / 4, ym, mid, t / 2, hh, len, { collide: false });
        this.box(o.matB, fixed + t / 4, ym, mid, t / 2, hh, len, { collide: false });
        if (collide) this.addCollider(fixed - t / 2, fixed + t / 2, y0, y1, s0, s1);
      }
    };
    let cur = a0;
    for (const op of ops) {
      const w = op.w ?? (op.type === 'window' ? 1.7 : 4);
      const o0 = op.c - w / 2, o1 = op.c + w / 2;
      piece(cur, o0, 0, h);
      const top = op.type === 'window' ? 2.5 : 3.3;
      piece(o0, o1, top, h);
      if (op.type === 'window') {
        piece(o0, o1, 0, 1.0);
        this.makeWindow(axis, fixed, op, o0, o1, 1.0, top, t);
      } else if (op.type === 'door') this.makeDoor(axis, fixed, op, o0, o1, top, t);
      cur = o1;
    }
    piece(cur, a1, 0, h);
    if (o.cap !== false) {
      if (axis === 'x') this.box('concreteDark', (a0 + a1) / 2, h + 0.08, fixed, a1 - a0, 0.16, t + 0.12, { collide: false });
      else this.box('concreteDark', fixed, h + 0.08, (a0 + a1) / 2, t + 0.12, 0.16, a1 - a0, { collide: false });
    }
    if (o.base) {
      const side = o.base;
      if (axis === 'x') this.box('concreteDark', (a0 + a1) / 2, 0.15, fixed + side * (t / 2 + 0.02), a1 - a0, 0.3, 0.04, { collide: false });
      else this.box('concreteDark', fixed + side * (t / 2 + 0.02), 0.15, (a0 + a1) / 2, 0.04, 0.3, a1 - a0, { collide: false });
    }
  }

  makeWindow(axis, fixed, op, o0, o1, sill, top, t) {
    const inward = op.inward;
    const nx = axis === 'x' ? 0 : inward, nz = axis === 'x' ? inward : 0;
    const c = op.c;
    const cx = axis === 'x' ? c : fixed, cz = axis === 'x' ? fixed : c;
    const w = o1 - o0;
    const fr = 0.08;
    if (axis === 'x') {
      this.box('wood', o0 + fr / 2, (sill + top) / 2, fixed, fr, top - sill, t + 0.06, { collide: false });
      this.box('wood', o1 - fr / 2, (sill + top) / 2, fixed, fr, top - sill, t + 0.06, { collide: false });
      this.box('wood', c, sill + 0.03, fixed, w, 0.06, t + 0.12, { collide: false });
      this.addCollider(o0, o1, 0, 7, fixed - t / 2, fixed + t / 2, { bullets: false, zombie: false });
    } else {
      this.box('wood', fixed, (sill + top) / 2, o0 + fr / 2, t + 0.06, top - sill, fr, { collide: false });
      this.box('wood', fixed, (sill + top) / 2, o1 - fr / 2, t + 0.06, top - sill, fr, { collide: false });
      this.box('wood', fixed, sill + 0.03, c, t + 0.12, 0.06, w, { collide: false });
      this.addCollider(fixed - t / 2, fixed + t / 2, 0, 7, o0, o1, { bullets: false, zombie: false });
    }
    const len = w + 0.35;
    let geo = this.boardGeoCache.get(len);
    if (!geo) { geo = new THREE.BoxGeometry(len, 0.17, 0.05); this.boardGeoCache.set(len, geo); }
    const boards = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, this.M.woodOld);
      m.castShadow = true; m.receiveShadow = true;
      m.rotation.order = 'YXZ';
      const y = sill + 0.2 + i * 0.235;
      const ang = (i % 2 ? 1 : -1) * rand(0.08, 0.38);
      const off = t / 2 + 0.05 + (i % 2) * 0.02;
      m.position.set(cx + nx * off, y, cz + nz * off);
      m.rotation.set(0, axis === 'z' ? Math.PI / 2 : 0, ang);
      this.scene.add(m);
      boards.push({ mesh: m, home: m.position.clone(), homeRot: ang, on: true, anim: 1, mode: 'idle' });
    }
    const pos = new THREE.Vector3(cx, 0, cz);
    const normal = new THREE.Vector3(nx, 0, nz);
    this.windows.push({
      pos, normal, boards, axis,
      inside: pos.clone().addScaledVector(normal, 0.95),
      outside: pos.clone().addScaledVector(normal, -0.85),
      spawn: pos.clone().addScaledVector(normal, -7),
      zone: -1, occupant: null, queue: [], count: 6, sill, top,
    });
  }

  makeDoor(axis, fixed, op, o0, o1, top, t) {
    const w = o1 - o0;
    const cx = axis === 'x' ? (o0 + o1) / 2 : fixed, cz = axis === 'x' ? fixed : (o0 + o1) / 2;
    const g = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, top, 0.16), this.M.rust);
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);
    for (const y of [-top / 2 + 0.35, top / 2 - 0.35]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.32, 0.2), this.M.hazard);
      band.position.y = y; band.castShadow = true; g.add(band);
    }
    for (let i = -1; i <= 1; i += 2) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12, top - 0.8, 0.2), this.M.darkSteel);
      rib.position.x = i * w * 0.3; g.add(rib);
    }
    const lampMat = this.M.lampRed.clone();
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.12), lampMat);
      l.position.set(0, top / 2 + 0.3, s * (t / 2 + 0.06));
      g.add(l);
    }
    g.position.set(cx, top / 2, cz);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    this.scene.add(g);
    const collider = axis === 'x'
      ? this.addCollider(o0, o1, 0, top, fixed - t / 2, fixed + t / 2)
      : this.addCollider(fixed - t / 2, fixed + t / 2, 0, top, o0, o1);
    this.doors.push({ cost: op.cost, zones: op.zones, label: op.label, group: g, slab, collider, lampMat, pos: new THREE.Vector3(cx, 1.4, cz), axis, open: false, anim: 0, top });
  }

  // ---------- build ----------
  build() {
    const ground = new THREE.PlaneGeometry(420, 420, 1, 1); ground.rotateX(-Math.PI / 2);
    this.addGeo('dirt', ground, { shadow: false });
    const floor = (key, x0, z0, x1, z1, y = 0.012) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      this.addGeo(key, g, { shadow: false });
    };
    floor('asphalt', -12.2, -12.2, 12.2, 12.2);
    floor('tiles', 12, -9, 30, 9);
    floor('floor', -32, -12, -12, 12);
    floor('floorDark', -24, -30, 12, -12);
    floor('asphalt', -40, 12.2, 40, 30, 0.008);

    this.wall('x', 12, -12.2, 12.2, { h: 4.5, matA: 'brick', matB: 'concreteDark', openings: [{ c: -6, type: 'window', inward: -1 }, { c: 6, type: 'window', inward: -1 }] });
    this.wall('x', -12, -32.2, 12.2, {
      h: 7.5, matA: 'concrete', matB: 'brick', openings: [
        { c: -18, type: 'door', w: 3.6, cost: 1000, zones: [2, 3], label: 'Generator Hall' },
        { c: 0, type: 'door', w: 3.6, cost: 1250, zones: [0, 3], label: 'Generator Hall' },
      ],
    });
    this.wall('z', 12, -11.8, 11.8, { h: 7, matA: 'brick', matB: 'plaster', openings: [{ c: 0, type: 'door', w: 3.6, cost: 750, zones: [0, 1], label: 'Field Clinic' }] });
    this.wall('z', -12, -11.8, 11.8, { h: 7, matA: 'concrete', matB: 'brick', openings: [{ c: 0, type: 'door', w: 3.6, cost: 750, zones: [0, 2], label: 'Motor Pool' }] });
    this.wall('x', -9, 12.2, 30.2, { h: 5, matA: 'brick', matB: 'plaster', base: 1, openings: [{ c: 21, type: 'window', inward: 1 }] });
    this.wall('x', 9, 12.2, 30.2, { h: 5, matA: 'plaster', matB: 'brick', base: -1, openings: [{ c: 21, type: 'window', inward: -1 }] });
    this.wall('z', 30, -8.8, 8.8, { h: 5, matA: 'plaster', matB: 'brick', base: -1, openings: [{ c: 0, type: 'window', inward: -1 }] });
    this.wall('z', -32, -12.2, 12.2, { h: 7, matA: 'brick', matB: 'concrete', openings: [{ c: -5, type: 'window', inward: 1 }, { c: 5, type: 'window', inward: 1 }] });
    this.wall('x', 12, -32.2, -11.8, { h: 7, matA: 'concrete', matB: 'brick', openings: [{ c: -22, type: 'window', inward: -1 }] });
    this.wall('x', -30, -24.2, 12.2, { h: 7.5, matA: 'concreteDark', matB: 'concrete', openings: [{ c: -14, type: 'window', inward: 1 }, { c: 2, type: 'window', inward: 1 }] });
    this.wall('z', -24, -29.8, -12.2, { h: 7.5, matA: 'concreteDark', matB: 'concrete', openings: [{ c: -21, type: 'window', inward: 1 }] });
    this.wall('z', 12, -29.8, -12.2, { h: 7.5, matA: 'concrete', matB: 'concreteDark', openings: [{ c: -21, type: 'window', inward: -1 }] });

    const roofFlags = { player: false, nav: false, zombie: false };
    this.box('plaster', 21, 3.95, 0, 18, 0.3, 18, { flags: roofFlags });
    this.box('concreteDark', 21, 5.05, 0, 18.4, 0.1, 18.4, { collide: false });
    const ry = 6.6;
    this.box('corrugated', -29, ry, 0, 6, 0.2, 24, { flags: roofFlags });
    this.box('corrugated', -16, ry, 0, 8, 0.2, 24, { flags: roofFlags });
    this.box('corrugated', -23, ry, -7.5, 6, 0.2, 9, { flags: roofFlags });
    this.box('corrugated', -23, ry, 7.5, 6, 0.2, 9, { flags: roofFlags });
    for (let x = -31; x <= -13; x += 3) this.box('darkSteel', x, ry - 0.3, 0, 0.2, 0.4, 24, { collide: false });
    for (let i = 0; i < 8; i++) this.box('corrugated', -26 + rand(0, 6), ry - 0.05, (i < 4 ? -3 : 3) + rand(-0.4, 0.4), rand(0.5, 1.5), 0.05, rand(0.3, 0.8), { collide: false, rotY: rand(-0.5, 0.5) });
    this.box('concreteDark', -6, 7.15, -21, 36.4, 0.3, 18.4, { flags: roofFlags });
    for (let x = -22; x <= 10; x += 4) this.box('darkSteel', x, 6.7, -21, 0.25, 0.6, 18, { collide: false });

    buildProps(this);
    this.buildExterior();
    this.finalize();

    for (const w of this.windows) w.zone = this.zoneAt(w.inside.x, w.inside.z);
    this.nav = new NavGrid(-40, -40, 40, 40, 0.5);
    this.nav.build(this.colliders, this.zones);
  }

  buildExterior() {
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + rand(-0.05, 0.05);
      const r = rand(55, 95);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const w = rand(8, 20), d = rand(8, 18), h = rand(8, 30);
      this.box(i % 3 ? 'concreteDark' : 'brick', x, h / 2, z, w, h, d, { collide: false, rotY: rand(-0.3, 0.3), shadow: false });
      if (Math.random() < 0.55) {
        const n = 1 + Math.floor(Math.random() * 4);
        for (let k = 0; k < n; k++) {
          const wy = rand(2, h - 1), ox = rand(-w / 3, w / 3);
          const toC = Math.atan2(-x, -z);
          const fx = x + Math.sin(toC) * (d / 2 + 0.2) + Math.cos(toC) * ox, fz = z + Math.cos(toC) * (d / 2 + 0.2) - Math.sin(toC) * ox;
          this.box(Math.random() < 0.7 ? 'windowLit' : 'windowLitCool', fx, wy, fz, 1.0, 1.3, 0.2, { collide: false, rotY: toC, shadow: false });
        }
      }
    }
    const WT = { x: -48, z: 34, rot: 0 };
    for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) this.pcyl('rust', WT, lx, 7, lz, 0.2, 14, 'y', 8);
    this.pcyl('rust', WT, 0, 17, 0, 4, 6, 'y', 24);
    this.part('rust', new THREE.ConeGeometry(4.3, 2, 24).translate(0, 21, 0), WT);
    const RM = { x: 42, z: -52, rot: 0 };
    for (let i = 0; i < 10; i++) this.pbox('darkSteel', RM, 0, i * 4 + 2, 0, 0.6 - i * 0.03, 4, 0.6 - i * 0.03);
    const bl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), this.M.blink.clone());
    bl.position.set(42, 42, -52); this.scene.add(bl); this.blinkers.push({ mesh: bl, rate: 1.1, phase: 0 });
    const bl2 = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), this.M.blink.clone());
    bl2.position.set(-48, 22.5, 34); this.scene.add(bl2); this.blinkers.push({ mesh: bl2, rate: 0.7, phase: 0.5 });
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * TAU, r = rand(36, 60);
      this.deadTree(Math.cos(a) * r, Math.sin(a) * r, rand(5, 10));
    }
    for (let i = 0; i < 8; i++) this.deadTree(rand(-30, 30), rand(16, 26), rand(4, 8));
    for (let x = -36; x <= 36; x += 3) this.box('darkSteel', x, 1.4, 30, 0.08, 2.8, 0.08, { collide: false });
  }

  deadTree(x, z, h) {
    const T = { x, z, rot: Math.random() * TAU };
    this.pcyl('bark', T, 0, h / 2, 0, 0.12 * h / 6, h, 'y', 7, undefined, 0.25 * h / 6);
    const n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const len = rand(1, h * 0.4);
      const g = new THREE.CylinderGeometry(0.02, 0.07, len, 5);
      g.translate(0, len / 2, 0);
      g.rotateZ(rand(0.5, 1.2) * (Math.random() < 0.5 ? 1 : -1));
      g.rotateY(Math.random() * TAU);
      g.translate(0, rand(h * 0.4, h * 0.95), 0);
      this.part('bark', g, T);
    }
  }

  finalize() {
    for (const [key, list] of this.buckets) {
      const [mk, ns] = key.split('|');
      const geo = mergeGeometries(list, false);
      if (!geo) { console.warn('merge failed', key); continue; }
      const mesh = new THREE.Mesh(geo, this.M[mk]);
      mesh.castShadow = !ns && mk !== 'dirt';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
      list.forEach((g) => g.dispose());
    }
    this.buckets.clear();
  }

  // ---------- queries ----------
  zoneAt(x, z) {
    for (const zn of this.zones) {
      const r = zn.rect;
      if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return zn.id;
    }
    return -1;
  }
  isCovered(x, z) {
    for (const u of this.uncovered) if (x > u[0] && x < u[2] && z > u[1] && z < u[3]) return false;
    const id = this.zoneAt(x, z);
    return id >= 0 && this.zones[id].covered;
  }
  surfaceAt(x, z) {
    const id = this.zoneAt(x, z);
    if (id < 0) return 'concrete';
    if (id === 2 && !this.isCovered(x, z)) return 'wet';
    return this.zones[id].surface;
  }

  collide(pos, r, y0, y1, who = 'player') {
    if (this.gridDirty) this.buildGrid();
    const cs = 4, grid = this.grid;
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      const stamp = ++this.stamp;
      const i0 = Math.floor((pos.x - r) / cs), i1 = Math.floor((pos.x + r) / cs);
      const j0 = Math.floor((pos.z - r) / cs), j1 = Math.floor((pos.z + r) / cs);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const list = grid.get(i * 4096 + j);
        if (!list) continue;
        for (const c of list) {
          if (c._stamp === stamp) continue;
          c._stamp = stamp;
          if (!c.active || !c[who]) continue;
          if (c.maxY <= y0 || c.minY >= y1) continue;
          if (pos.x < c.minX - r || pos.x > c.maxX + r || pos.z < c.minZ - r || pos.z > c.maxZ + r) continue;
          const qx = clamp(pos.x, c.minX, c.maxX), qz = clamp(pos.z, c.minZ, c.maxZ);
          const dx = pos.x - qx, dz = pos.z - qz;
          const d2 = dx * dx + dz * dz;
          if (d2 > r * r) continue;
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = r - d;
            pos.x += (dx / d) * push; pos.z += (dz / d) * push;
          } else {
            const l = pos.x - c.minX, rr = c.maxX - pos.x, b = pos.z - c.minZ, f = c.maxZ - pos.z;
            const m = Math.min(l, rr, b, f);
            if (m === l) pos.x = c.minX - r; else if (m === rr) pos.x = c.maxX + r; else if (m === b) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
          }
        }
      }
    }
    return hit;
  }

  raycast(o, d, maxT = 200) {
    let best = maxT, nx = 0, ny = 0, nz = 0;
    if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0 && t < best) { best = t; nx = 0; ny = 1; nz = 0; } }
    for (const c of this.colliders) {
      if (!c.active || !c.bullets) continue;
      let tmin = 0, tmax = best, an = -1, sg = 0;
      if (Math.abs(d.x) < 1e-9) { if (o.x < c.minX || o.x > c.maxX) continue; }
      else {
        let t1 = (c.minX - o.x) / d.x, t2 = (c.maxX - o.x) / d.x, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; an = 0; sg = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (Math.abs(d.y) < 1e-9) { if (o.y < c.minY || o.y > c.maxY) continue; }
      else {
        let t1 = (c.minY - o.y) / d.y, t2 = (c.maxY - o.y) / d.y, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; an = 1; sg = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (Math.abs(d.z) < 1e-9) { if (o.z < c.minZ || o.z > c.maxZ) continue; }
      else {
        let t1 = (c.minZ - o.z) / d.z, t2 = (c.maxZ - o.z) / d.z, s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; an = 2; sg = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      if (an >= 0 && tmin < best && tmin > 0) {
        best = tmin; nx = an === 0 ? sg : 0; ny = an === 1 ? sg : 0; nz = an === 2 ? sg : 0;
      }
    }
    return { t: best, hit: best < maxT, nx, ny, nz };
  }

  sampleLight(pos, out) {
    out.setRGB(0, 0, 0);
    for (const L of this.lights) {
      const lp = L.light.position;
      const d2 = lp.distanceToSquared(pos);
      const dist = L.light.distance || 20;
      if (d2 > dist * dist) continue;
      const f = L.light.intensity / (1 + d2) * (1 - Math.sqrt(d2) / dist);
      out.r += L.light.color.r * f; out.g += L.light.color.g * f; out.b += L.light.color.b * f;
    }
    return out;
  }

  setPower(on) {
    this.power = on;
    for (const L of this.lights) {
      if (!L.powered || !on) continue;
      L.light.color.copy(L.color); L.flicker = L.powerFlicker || 'fluoro'; L.base = L.poweredBase;
      if (L.mat) L.mat.emissive.copy(L.color);
    }
  }

  openDoor(door) {
    door.open = true;
    door.collider.active = false;
    door.lampMat.emissive.set(0x20ff40);
    for (const zid of door.zones) this.zones[zid].open = true;
    this.nav.build(this.colliders, this.zones);
  }

  update(dt, t) {
    this.time = t;
    for (const L of this.lights) {
      const l = L.light;
      let k = 1;
      switch (L.flicker) {
        case 'fire': k = 0.75 + Math.sin(t * 13 + L.seed) * 0.08 + Math.sin(t * 27.3 + L.seed * 2) * 0.07 + Math.sin(t * 5.1) * 0.06 + (Math.random() - 0.5) * 0.1; break;
        case 'fluoro':
          if (L.off > 0) { L.off -= dt; k = Math.random() < 0.5 ? 0.05 : 0.6; }
          else if (Math.random() < dt * 0.25) L.off = rand(0.05, 0.6);
          break;
        case 'emergency': k = 0.4 + 0.6 * Math.pow(Math.max(0, Math.sin(t * 2.2 + L.seed)), 3); break;
        case 'police': {
          const ph = (t * 2.2) % 1;
          const red = ph < 0.5;
          l.color.setHex(red ? 0xff1a10 : 0x1838ff);
          const s = (ph % 0.5) * 2;
          k = s < 0.25 || (s > 0.4 && s < 0.6) ? 1 : 0.1;
          if (L.mats) { L.mats[0].emissiveIntensity = red && k > 0.5 ? 9 : 0.3; L.mats[1].emissiveIntensity = !red && k > 0.5 ? 9 : 0.3; }
          break;
        }
        case 'sway': k = 0.9 + Math.sin(t * 1.3 + L.seed) * 0.1; break;
      }
      l.intensity = L.base * k;
      if (L.mat && L.flicker === 'fluoro') L.mat.emissiveIntensity = 5 * k;
      if (L.mat && L.flicker === 'emergency') L.mat.emissiveIntensity = 4 * k;
      if (L.mat && L.flicker === 'sway') L.mat.emissiveIntensity = 6 * k;
    }
    for (const b of this.blinkers) {
      const on = ((t * b.rate + b.phase) % 1) < 0.15;
      b.mesh.material.emissiveIntensity = on ? 10 : 0.2;
    }
    for (const d of this.doors) {
      if (d.open && d.anim < 1) {
        d.anim = Math.min(1, d.anim + dt / 1.6);
        const e = d.anim * d.anim * (3 - 2 * d.anim);
        d.group.position.y = d.top / 2 + e * (d.top + 0.1);
        if (d.anim >= 1) d.group.visible = false;
      }
    }
    for (const w of this.windows) {
      for (const b of w.boards) {
        if (b.mode === 'idle') continue;
        b.anim = Math.min(1, b.anim + dt / (b.mode === 'tear' ? 0.55 : 0.35));
        const m = b.mesh;
        if (b.mode === 'tear') {
          const e = b.anim;
          m.position.copy(b.home).addScaledVector(w.normal, -e * 1.6);
          m.position.y = b.home.y + Math.sin(e * Math.PI) * 0.5 - e * e * 1.4;
          m.rotation.z = b.homeRot + e * b.spin;
          m.rotation.x = e * 1.2;
          if (b.anim >= 1) { m.visible = false; b.mode = 'idle'; }
        } else if (b.mode === 'repair') {
          const e = 1 - Math.pow(1 - b.anim, 3);
          m.visible = true;
          m.position.copy(b.home).addScaledVector(w.normal, (1 - e) * 0.9);
          m.position.y = b.home.y - (1 - e) * 1.0;
          m.rotation.z = b.homeRot + (1 - e) * 1.5;
          m.rotation.x = 0;
          if (b.anim >= 1) { b.mode = 'idle'; m.position.copy(b.home); m.rotation.z = b.homeRot; }
        }
      }
    }
    for (const c of this.cones) {
      const L = c.userData.light;
      c.material.uniforms.uOpacity.value = c.userData.base * (L ? L.light.intensity / Math.max(0.001, L.base || 1) : 1);
    }
  }

  tearBoard(w) {
    for (let i = w.boards.length - 1; i >= 0; i--) {
      const b = w.boards[i];
      if (b.on) { b.on = false; b.mode = 'tear'; b.anim = 0; b.spin = rand(-3, 3); w.count--; return true; }
    }
    return false;
  }
  repairBoard(w) {
    for (const b of w.boards) {
      if (!b.on) { b.on = true; b.mode = 'repair'; b.anim = 0; w.count++; return true; }
    }
    return false;
  }
  snapshotLights() {
    for (const L of this.lights) L.init = { color: L.light.color.clone(), base: L.base, flicker: L.flicker, matEm: L.mat ? L.mat.emissive.clone() : null };
  }
  resetState() {
    if (!this.lights[0].init) this.snapshotLights();
    this.power = false;
    for (const L of this.lights) {
      const i = L.init; if (!i) continue;
      L.light.color.copy(i.color); L.base = i.base; L.flicker = i.flicker;
      if (L.mat && i.matEm) L.mat.emissive.copy(i.matEm);
    }
    if (this.poweredCones) for (const c of this.poweredCones) c.userData.base = 0;
    for (const d of this.doors) {
      d.open = false; d.anim = 0; d.collider.active = true; d.group.visible = true;
      d.group.position.y = d.top / 2; d.lampMat.emissive.set(0xff2010);
    }
    for (const z of this.zones) z.open = z.id === 0;
    for (const w of this.windows) {
      w.count = 6; w.occupant = null; w.queue.length = 0;
      for (const b of w.boards) { b.on = true; b.mode = 'idle'; b.mesh.visible = true; b.mesh.position.copy(b.home); b.mesh.rotation.set(0, w.axis === 'z' ? Math.PI / 2 : 0, b.homeRot); }
    }
    this.nav.build(this.colliders, this.zones);
  }
  repairAll() { for (const w of this.windows) while (w.count < 6) this.repairBoard(w); }
}
