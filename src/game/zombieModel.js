import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pick, rand, smoothstep, mulberry32 } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Skeleton layout (bind pose, model space, metres). Arms hang straight down.
// ---------------------------------------------------------------------------
export const BONES = ['root', 'hips', 'torso', 'neck', 'head', 'jaw', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const LOCAL = {
  root: [null, 0, 0, 0], hips: ['root', 0, 0.95, 0], torso: ['hips', 0, 0.05, 0], neck: ['torso', 0, 0.5, 0], head: ['neck', 0, 0.12, 0], jaw: ['head', 0, 0.055, 0],
  shL: ['torso', -0.2, 0.45, 0], elL: ['shL', -0.01, -0.28, 0], handL: ['elL', 0, -0.25, 0],
  shR: ['torso', 0.2, 0.45, 0], elR: ['shR', 0.01, -0.28, 0], handR: ['elR', 0, -0.25, 0],
  hipL: ['hips', -0.1, -0.04, 0], kneeL: ['hipL', 0, -0.44, 0], ankleL: ['kneeL', 0, -0.41, 0],
  hipR: ['hips', 0.1, -0.04, 0], kneeR: ['hipR', 0, -0.44, 0], ankleR: ['kneeR', 0, -0.41, 0],
};
const J = {};
for (const n of BONES) {
  const [par, x, y, z] = LOCAL[n];
  const p = par ? J[par] : new THREE.Vector3();
  J[n] = new THREE.Vector3(x, y, z).add(p);
}
const HEAD_C = J.head.clone().add(new THREE.Vector3(0, 0.095, 0.012));

// material group indices
const G_SKIN = 0, G_SHIRT = 1, G_PANTS = 2, G_MISC = 3, G_EYE = 4;

// ---------------------------------------------------------------------------
// Skinned geometry builder
// ---------------------------------------------------------------------------
function W(...pairs) {
  const list = pairs.filter((p) => p[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  let s = 0; for (const p of list) s += p[1];
  return list.map(([b, w]) => [b, w / s]);
}

class SkinBuilder {
  constructor() {
    this.pos = []; this.nor = []; this.uv = []; this.col = []; this.si = []; this.sw = [];
    this.groups = [[], [], [], [], []];
  }
  get count() { return this.pos.length / 3; }
  vert(p, n, u, v, weights, color) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.col.push(color[0], color[1], color[2]);
    for (let k = 0; k < 4; k++) { const w = weights[k]; this.si.push(w ? w[0] : 0); this.sw.push(w ? w[1] : 0); }
  }
  tri(a, b, c, group) { this.groups[group].push(a, b, c); }
  centroidY(a, b, c) { return (this.pos[a * 3 + 1] + this.pos[b * 3 + 1] + this.pos[c * 3 + 1]) / 3; }
  centroid(a, b, c) {
    const P = this.pos;
    return [(P[a * 3] + P[b * 3] + P[c * 3]) / 3, (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3, (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3];
  }

  // Tube with elliptical cross-section along a->b. prof(t) => [rx, rz, ox, oz]
  tube(a, b, prof, { radial = 14, rings = 10, capA = 0, capB = 0, uvScale = 0.4, group = G_SKIN, groupFn, weightFn, color = [1, 1, 1], jitter = 0 }) {
    const axis = new THREE.Vector3().subVectors(b, a); const len = axis.length(); axis.normalize();
    const right = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1));
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
    const fwd = new THREE.Vector3().crossVectors(right, axis).normalize();
    const rs = [];
    const CR = 4;
    if (capA > 0) for (let i = CR; i >= 1; i--) { const ang = (i / CR) * Math.PI / 2; rs.push({ t: 0, off: -Math.sin(ang) * capA, s: Math.cos(ang), cap: -1 }); }
    for (let i = 0; i < rings; i++) rs.push({ t: i / (rings - 1), off: 0, s: 1, cap: 0 });
    if (capB > 0) for (let i = 1; i <= CR; i++) { const ang = (i / CR) * Math.PI / 2; rs.push({ t: 1, off: Math.sin(ang) * capB, s: Math.cos(ang), cap: 1 }); }
    const base = this.count, Wn = radial + 1;
    const c = new THREE.Vector3(), p = new THREE.Vector3(), n = new THREE.Vector3(), nr = new THREE.Vector3();
    for (const r of rs) {
      const [rx, rz, ox = 0, oz = 0] = prof(r.t);
      const dt = 0.02;
      const r1 = prof(Math.min(1, r.t + dt)), r0 = prof(Math.max(0, r.t - dt));
      const drdl = ((r1[0] + r1[1]) - (r0[0] + r0[1])) * 0.5 / (2 * dt * len);
      const tp = r.t + r.off / len;
      c.copy(a).addScaledVector(axis, r.t * len + r.off); c.x += ox; c.z += oz;
      for (let j = 0; j <= radial; j++) {
        const th = (j / radial) * Math.PI * 2, ct = Math.cos(th), st = Math.sin(th);
        const jit = jitter ? 1 + (Math.sin(th * 7 + r.t * 23) * 0.5 + Math.sin(th * 3 - r.t * 11) * 0.5) * jitter : 1;
        p.copy(c).addScaledVector(right, ct * rx * r.s * jit).addScaledVector(fwd, st * rz * r.s * jit);
        nr.copy(right).multiplyScalar(ct / Math.max(1e-4, rx)).addScaledVector(fwd, st / Math.max(1e-4, rz)).normalize();
        if (r.cap) n.copy(nr).multiplyScalar(r.s).addScaledVector(axis, r.cap * Math.sqrt(Math.max(0, 1 - r.s * r.s))).normalize();
        else n.copy(nr).addScaledVector(axis, -drdl).normalize();
        this.vert(p, n, j / radial, (r.t * len + r.off) / uvScale, weightFn(p, tp), color);
      }
    }
    for (let i = 0; i < rs.length - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const A = base + i * Wn + j, B = base + (i + 1) * Wn + j, C = B + 1, D = A + 1;
        const g1 = groupFn ? groupFn(this.centroid(A, B, D)) : group;
        const g2 = groupFn ? groupFn(this.centroid(B, C, D)) : group;
        this.tri(A, B, D, g1); this.tri(B, C, D, g2);
      }
    }
  }

  // add an arbitrary BufferGeometry (model space)
  geo(geo, { group = G_SKIN, groupFn, weightFn, color = [1, 1, 1], colorFn, keepTri }) {
    const base = this.count;
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i);
      this.vert(p, n, U ? U.getX(i) : 0, U ? U.getY(i) : 0, weightFn(p), colorFn ? colorFn(p) : color);
    }
    const idx = geo.index ? geo.index.array : null;
    const cnt = idx ? idx.length : P.count;
    for (let i = 0; i < cnt; i += 3) {
      const a = base + (idx ? idx[i] : i), b = base + (idx ? idx[i + 1] : i + 1), c = base + (idx ? idx[i + 2] : i + 2);
      if (keepTri && !keepTri(this.centroid(a, b, c))) continue;
      this.tri(a, b, c, groupFn ? groupFn(this.centroid(a, b, c)) : group);
    }
  }

  build(skinned = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    }
    const index = [];
    let start = 0;
    this.groups.forEach((arr, gi) => {
      for (let i = 0; i < arr.length; i++) index.push(arr[i]);
      if (arr.length) g.addGroup(start, arr.length, gi);
      start += arr.length;
    });
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Sculpted head
// ---------------------------------------------------------------------------
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));
function sculptHead(seed) {
  const R = mulberry32(seed);
  const g = new THREE.SphereGeometry(0.104, 34, 26);
  const P = g.attributes.position;
  const v = new THREE.Vector3();
  const cheek = 0.85 + R() * 0.12, jawW = 0.85 + R() * 0.15, nose = 0.8 + R() * 0.5, brow = 0.8 + R() * 0.5;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    let { x, y, z } = v;
    y *= 1.15; x *= 0.86;
    if (z < 0) z *= 1.06; else z *= 0.94;
    const ax = Math.abs(x);
    if (z > 0.03) {
      z += 0.011 * brow * gauss(y - 0.032, 0.012) * gauss(ax - 0.035, 0.035);              // brow ridge
      z -= 0.019 * gauss(y - 0.014, 0.014) * gauss(ax - 0.035, 0.016);                     // eye sockets
      z += 0.026 * nose * gauss(ax, 0.012) * (y < 0.02 && y > -0.035 ? 1 - smoothstep(-0.035, 0.02, y) * 0.6 : 0); // nose
      z -= 0.012 * gauss(y + 0.045, 0.008) * gauss(ax, 0.028);                             // mouth line
      z += 0.006 * gauss(y + 0.085, 0.015) * gauss(ax, 0.02);                              // chin
    }
    x *= 1 + 0.05 * gauss(y - 0.0, 0.015) * (z > 0 ? 1 : 0.3) * cheek;                    // cheekbones
    x *= 1 - 0.1 * gauss(y + 0.035, 0.02) * (z > 0 ? 1 : 0) * cheek;                       // sunken cheeks
    if (y < -0.04) x *= 1 - (1 - jawW) * smoothstep(-0.04, -0.12, y);                    // jaw width
    // temporal hollow & skull bumps
    x *= 1 - 0.04 * gauss(y - 0.04, 0.02) * gauss(z + 0.0, 0.04);
    const bump = 1 + (Math.sin(x * 90 + seed) * Math.sin(y * 70) * Math.sin(z * 80)) * 0.012;
    P.setXYZ(i, x * bump, y * bump, z * bump);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Body construction
// ---------------------------------------------------------------------------
const lerpKeys = (keys, t) => {
  if (t <= keys[0][0]) return keys[0].slice(1);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) {
      let k = (t - a[0]) / (b[0] - a[0]); k = k * k * (3 - 2 * k);
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * k);
    }
  }
  return keys[keys.length - 1].slice(1);
};

function buildBody(opts) {
  const { bulk = 1, sleeve = 'short', gloves = false, hair = 0, torn = 0, seed = 1, brute = false } = opts;
  const R = mulberry32(seed);
  const B = new SkinBuilder();
  const S = (s) => (s < 0 ? 'L' : 'R');
  const skinCol = [1, 1, 1];
  const boot = [0.09, 0.07, 0.055], belt = [0.06, 0.045, 0.035], tooth = [0.62, 0.55, 0.38], mouth = [0.12, 0.015, 0.015], hairC = [0.05, 0.042, 0.035], glove = [0.06, 0.06, 0.055];
  const bx = bulk * (brute ? 1.35 : 1), bz = bulk * (brute ? 1.3 : 1);
  const belly = R() * 0.02;

  // ---- torso ----
  const torsoKeys = [
    [0.0, 0.14, 0.095, 0, 0], [0.15, 0.172, 0.112, 0, 0], [0.34, 0.142 + belly * 0.5, 0.098 + belly, 0, 0.006 + belly], [0.6, 0.168, 0.122, 0, 0.012],
    [0.8, 0.188, 0.118, 0, 0.004], [0.92, 0.16, 0.092, 0, -0.005], [1.0, 0.075, 0.06, 0, -0.005],
  ];
  const torsoProf = (t) => { const [rx, rz, ox, oz] = lerpKeys(torsoKeys, t); return [rx * bx, rz * bz, ox, oz]; };
  const tA = new THREE.Vector3(0, 0.83, 0), tB = new THREE.Vector3(0, 1.56, 0);
  const tornFn = (c) => torn > 0 && c[2] > 0.04 && c[1] > 1.04 && c[1] < 1.38 && Math.sin(c[0] * 61 + seed) * Math.sin(c[1] * 47 + seed * 2) > 1 - torn;
  B.tube(tA, tB, torsoProf, {
    radial: 22, rings: 16, capA: 0.05, uvScale: 0.45,
    groupFn: (c) => (c[1] < 0.985 ? G_PANTS : tornFn(c) ? G_SKIN : G_SHIRT),
    weightFn: (p) => {
      const y = p.y, ax = Math.abs(p.x), side = p.x < 0 ? 'L' : 'R';
      let wh = 1 - smoothstep(0.93, 1.1, y), wt = 1 - wh;
      const ksh = smoothstep(1.3, 1.48, y) * smoothstep(0.09, 0.19, ax) * 0.45;
      const kgr = (1 - smoothstep(0.83, 0.93, y)) * smoothstep(0.03, 0.09, ax) * 0.45;
      const kn = smoothstep(1.5, 1.57, y) * 0.5;
      return W([BI.hips, wh * (1 - kgr)], [BI.torso, wt * (1 - ksh - kn)], [BI['sh' + side], ksh], [BI['hip' + side], kgr], [BI.neck, kn]);
    },
  });
  // belt
  B.tube(new THREE.Vector3(0, 0.965, 0), new THREE.Vector3(0, 1.0, 0), (t) => { const r = torsoProf((0.965 + t * 0.035 - 0.83) / 0.73); return [r[0] + 0.007, r[1] + 0.007, 0, r[3]]; }, {
    radial: 22, rings: 2, group: G_MISC, color: belt, uvScale: 0.3,
    weightFn: (p) => W([BI.hips, 0.7], [BI.torso, 0.3]),
  });
  // ---- neck ----
  B.tube(new THREE.Vector3(0, 1.47, -0.005), new THREE.Vector3(0, 1.66, 0.0), (t) => [0.056 * bx * (1 - t * 0.15), 0.052 * bz, 0, 0], {
    radial: 14, rings: 6, uvScale: 0.3, group: G_SKIN,
    weightFn: (p, t) => W([BI.torso, 1 - smoothstep(0.0, 0.5, t)], [BI.neck, smoothstep(0.0, 0.5, t) * (1 - smoothstep(0.7, 1, t) * 0.5)], [BI.head, smoothstep(0.7, 1, t) * 0.5]),
  });
  // ---- head ----
  const hg = sculptHead(seed);
  hg.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
  const jawW = (p) => {
    const ly = p.y - HEAD_C.y, lz = p.z - HEAD_C.z;
    const k = (1 - smoothstep(-0.05, -0.032, ly)) * smoothstep(-0.04, 0.0, lz);
    return W([BI.head, 1 - k], [BI.jaw, k]);
  };
  B.geo(hg, { group: G_SKIN, weightFn: jawW });
  // mouth cavity
  const mc = new THREE.SphereGeometry(0.042, 12, 10); mc.scale(1, 0.75, 1); mc.translate(HEAD_C.x, HEAD_C.y - 0.045, HEAD_C.z + 0.035);
  B.geo(mc, { group: G_MISC, color: mouth, weightFn: jawW });
  // teeth
  const tU = new RoundedBoxGeometry(0.048, 0.012, 0.02, 1, 0.004); tU.translate(HEAD_C.x, HEAD_C.y - 0.037, HEAD_C.z + 0.072);
  B.geo(tU, { group: G_MISC, color: tooth, weightFn: () => W([BI.head, 1]) });
  const tL = new RoundedBoxGeometry(0.044, 0.011, 0.018, 1, 0.004); tL.translate(HEAD_C.x, HEAD_C.y - 0.055, HEAD_C.z + 0.066);
  B.geo(tL, { group: G_MISC, color: tooth, weightFn: () => W([BI.jaw, 1]) });
  // eyes
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(0.0125, 10, 8); e.translate(HEAD_C.x + s * 0.034, HEAD_C.y + 0.013, HEAD_C.z + 0.071);
    B.geo(e, { group: G_EYE, weightFn: () => W([BI.head, 1]) });
    const ear = new THREE.SphereGeometry(0.026, 10, 8); ear.scale(0.32, 1, 0.65); ear.rotateY(s * 0.3); ear.translate(HEAD_C.x + s * 0.091, HEAD_C.y - 0.002, HEAD_C.z - 0.012);
    B.geo(ear, { group: G_SKIN, weightFn: () => W([BI.head, 1]) });
  }
  // patchy hair
  if (hair > 0) {
    const hgeo = new THREE.SphereGeometry(0.109, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    hgeo.scale(0.88, 1.15, 1.04); hgeo.translate(HEAD_C.x, HEAD_C.y + 0.004, HEAD_C.z - 0.01);
    B.geo(hgeo, {
      group: G_MISC, color: hairC, weightFn: () => W([BI.head, 1]),
      keepTri: (c) => c[2] < 0.06 + HEAD_C.z && (Math.sin(c[0] * 120 + seed) * Math.cos(c[2] * 110 - seed) + Math.sin(c[1] * 90)) * 0.5 < hair - 0.3,
    });
  }

  // ---- arms ----
  for (const s of [-1, 1]) {
    const side = S(s);
    const sh = J['sh' + side], el = J['el' + side], hd = J['hand' + side];
    const ua0 = new THREE.Vector3(sh.x - s * 0.005, sh.y + 0.03, sh.z), ua1 = el.clone();
    const armB = brute ? 1.35 : bulk;
    B.tube(ua0, ua1, (t) => { const r = lerpKeys([[0, 0.058, 0.055], [0.25, 0.056, 0.052], [0.7, 0.046, 0.044], [1, 0.042, 0.041]], t); return [r[0] * armB, r[1] * armB, 0, 0]; }, {
      radial: 14, rings: 9, capA: 0.04, uvScale: 0.35, group: G_SHIRT,
      weightFn: (p, t) => W([BI['sh' + side], 1 - smoothstep(0.75, 1.0, t) * 0.5 - (1 - smoothstep(-0.25, 0.12, t)) * 0.4], [BI['el' + side], smoothstep(0.75, 1.0, t) * 0.5], [BI.torso, (1 - smoothstep(-0.25, 0.12, t)) * 0.4]),
    });
    if (sleeve === 'short') { // sleeve hem
      B.tube(new THREE.Vector3(ua0.x + (ua1.x - ua0.x) * 0.55, ua0.y + (ua1.y - ua0.y) * 0.55, 0), new THREE.Vector3(ua0.x + (ua1.x - ua0.x) * 0.62, ua0.y + (ua1.y - ua0.y) * 0.62, 0), () => [0.055 * armB, 0.053 * armB], {
        radial: 14, rings: 2, group: G_SHIRT, uvScale: 0.35, jitter: 0.08, weightFn: () => W([BI['sh' + side], 1]),
      });
    }
    B.tube(el.clone(), hd.clone(), (t) => { const r = lerpKeys([[0, 0.043, 0.042], [0.25, 0.042, 0.038], [0.85, 0.03, 0.025], [1, 0.029, 0.024]], t); return [r[0] * armB, r[1] * armB, 0, 0]; }, {
      radial: 12, rings: 8, uvScale: 0.35, group: sleeve === 'long' ? G_SHIRT : G_SKIN,
      weightFn: (p, t) => W([BI['el' + side], 1 - (1 - smoothstep(-0.1, 0.15, t)) * 0.5 - smoothstep(0.85, 1.1, t) * 0.4], [BI['sh' + side], (1 - smoothstep(-0.1, 0.15, t)) * 0.5], [BI['hand' + side], smoothstep(0.85, 1.1, t) * 0.4]),
    });
    // hand: palm + fingers + thumb
    const hw = () => W([BI['hand' + side], 1]);
    const hGroup = gloves ? G_MISC : G_SKIN;
    const palm = new RoundedBoxGeometry(0.028, 0.085, 0.076, 2, 0.011);
    palm.translate(hd.x + s * 0.002, hd.y - 0.05, hd.z + 0.004);
    B.geo(palm, { group: hGroup, color: glove, weightFn: hw });
    for (let f = 0; f < 4; f++) {
      const fz = hd.z - 0.026 + f * 0.017, len = [0.07, 0.078, 0.074, 0.06][f];
      const a = new THREE.Vector3(hd.x + s * 0.002, hd.y - 0.088, fz), b = new THREE.Vector3(hd.x - s * 0.004, hd.y - 0.088 - len, fz + 0.022);
      B.tube(a, b, (t) => [0.0085 - t * 0.0015, 0.0085 - t * 0.0015], { radial: 6, rings: 3, capB: 0.007, group: hGroup, color: glove, uvScale: 0.2, weightFn: hw });
    }
    B.tube(new THREE.Vector3(hd.x - s * 0.006, hd.y - 0.03, hd.z + 0.036), new THREE.Vector3(hd.x - s * 0.012, hd.y - 0.085, hd.z + 0.058), () => [0.0095, 0.0095], { radial: 6, rings: 3, capB: 0.008, group: hGroup, color: glove, uvScale: 0.2, weightFn: hw });
  }

  // ---- legs ----
  for (const s of [-1, 1]) {
    const side = S(s);
    const hp = J['hip' + side], kn = J['knee' + side], an = J['ankle' + side];
    const legB = brute ? 1.3 : bulk;
    B.tube(new THREE.Vector3(hp.x, hp.y + 0.05, hp.z), kn.clone(), (t) => { const r = lerpKeys([[0, 0.09, 0.088, 0, 0], [0.25, 0.084, 0.082, 0, 0.008], [0.85, 0.064, 0.06, 0, 0.003], [1, 0.056, 0.056, 0, 0.005]], t); return [r[0] * legB, r[1] * legB, r[2], r[3]]; }, {
      radial: 16, rings: 10, capA: 0.03, uvScale: 0.45, group: G_PANTS,
      weightFn: (p, t) => W([BI['hip' + side], 1 - (1 - smoothstep(-0.2, 0.15, t)) * 0.45 - smoothstep(0.8, 1.05, t) * 0.5], [BI.hips, (1 - smoothstep(-0.2, 0.15, t)) * 0.45], [BI['knee' + side], smoothstep(0.8, 1.05, t) * 0.5]),
    });
    B.tube(kn.clone(), new THREE.Vector3(an.x, an.y + 0.03, an.z), (t) => { const r = lerpKeys([[0, 0.056, 0.057, 0, 0.004], [0.25, 0.057, 0.06, 0, -0.01], [0.7, 0.045, 0.045, 0, -0.003], [1, 0.042, 0.044, 0, 0]], t); return [r[0] * legB, r[1] * legB, r[2], r[3]]; }, {
      radial: 14, rings: 10, capB: 0.02, uvScale: 0.45,
      groupFn: (c) => (c[1] < 0.24 ? G_MISC : G_PANTS), color: boot,
      weightFn: (p, t) => W([BI['knee' + side], 1 - (1 - smoothstep(-0.1, 0.12, t)) * 0.5 - smoothstep(0.85, 1.05, t) * 0.5], [BI['hip' + side], (1 - smoothstep(-0.1, 0.12, t)) * 0.5], [BI['ankle' + side], smoothstep(0.85, 1.05, t) * 0.5]),
    });
    // trouser hem over boot
    B.tube(new THREE.Vector3(an.x, 0.235, an.z), new THREE.Vector3(an.x, 0.27, an.z), () => [0.052 * legB, 0.054 * legB, 0, -0.002], {
      radial: 14, rings: 2, group: G_PANTS, uvScale: 0.4, jitter: 0.06, weightFn: () => W([BI['knee' + side], 1]),
    });
    const foot = new RoundedBoxGeometry(0.1 * (brute ? 1.2 : 1), 0.085, 0.27 * (brute ? 1.15 : 1), 2, 0.03);
    foot.translate(an.x, 0.043, an.z + 0.045);
    B.geo(foot, { group: G_MISC, color: boot, weightFn: () => W([BI['ankle' + side], 1]) });
  }
  return B.build(true);
}

// static gib geometries (non skinned, centred at their joint)
function buildGibs() {
  const head = new SkinBuilder();
  const hg = sculptHead(7);
  head.geo(hg, { group: G_SKIN, weightFn: () => [] });
  for (const s of [-1, 1]) { const e = new THREE.SphereGeometry(0.0125, 8, 6); e.translate(s * 0.034, 0.013, 0.071); head.geo(e, { group: G_EYE, weightFn: () => [] }); }
  const neck = new THREE.CylinderGeometry(0.048, 0.05, 0.06, 10); neck.translate(0, -0.11, -0.01);
  head.geo(neck, { group: G_MISC, color: [0.25, 0.02, 0.02], weightFn: () => [] });
  const arm = new SkinBuilder();
  arm.tube(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.25, 0), (t) => [0.043 - t * 0.013, 0.042 - t * 0.017], { radial: 10, rings: 5, capA: 0.02, group: G_SKIN, weightFn: () => [] });
  const palm = new RoundedBoxGeometry(0.028, 0.12, 0.076, 2, 0.011); palm.translate(0, -0.31, 0); arm.geo(palm, { group: G_SKIN, weightFn: () => [] });
  const leg = new SkinBuilder();
  leg.tube(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.38, 0), (t) => [0.056 - t * 0.014, 0.057 - t * 0.013], { radial: 12, rings: 6, capA: 0.025, groupFn: (c) => (c[1] < -0.22 ? G_MISC : G_PANTS), color: [0.09, 0.07, 0.055], weightFn: () => [] });
  const foot = new RoundedBoxGeometry(0.1, 0.085, 0.27, 2, 0.03); foot.translate(0, -0.37, 0.045); leg.geo(foot, { group: G_MISC, color: [0.09, 0.07, 0.055], weightFn: () => [] });
  return { head: head.build(false), arm: arm.build(false), leg: leg.build(false) };
}

// ---------------------------------------------------------------------------
// Assets & outfits
// ---------------------------------------------------------------------------
let A = null;
const OUTFITS = [
  { key: 'labcoat', shirt: 'labcoat', pants: 'khaki', sleeve: 'long', hair: 0.7 },
  { key: 'soldier', shirt: 'soldier', pants: 'soldier', sleeve: 'long', helmet: 0.6, hair: 0.4 },
  { key: 'soldier2', shirt: 'soldier', pants: 'soldier', sleeve: 'short', helmet: 0.5, hair: 0.3 },
  { key: 'hazmat', shirt: 'hazmat', pants: 'hazmat', sleeve: 'long', mask: true, gloves: true },
  { key: 'plaid', shirt: 'plaid', pants: 'denim', sleeve: 'long', hair: 0.85 },
  { key: 'worker', shirt: 'worker', pants: 'denim', sleeve: 'short', hair: 0.55, torn: 0.5 },
  { key: 'scrubs', shirt: 'scrubs', pants: 'scrubs', sleeve: 'short', hair: 0.75 },
  { key: 'black', shirt: 'black', pants: 'khaki', sleeve: 'short', hair: 0.6, torn: 0.6 },
];
const VARIANTS = 3;

export function zombieAssets(T) {
  if (A) return A;
  const skinMat = (tint) => new THREE.MeshStandardMaterial({ map: T.skin.map, normalMap: T.skin.normalMap, roughnessMap: T.skin.roughnessMap, color: tint, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) });
  const clothMat = (k) => new THREE.MeshStandardMaterial({ map: T.cloth[k].map, normalMap: T.cloth[k].normalMap, roughnessMap: T.cloth[k].roughnessMap, roughness: 1 });
  A = {
    skins: [skinMat(0xf0f0e8), skinMat(0xd0d8c0), skinMat(0xc8b4a8), skinMat(0xa8a49a), skinMat(0xb8c0b0)],
    cloth: Object.fromEntries(['labcoat', 'soldier', 'hazmat', 'plaid', 'worker', 'denim', 'khaki', 'black', 'scrubs'].map((k) => [k, clothMat(k)])),
    misc: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x8a8070, emissive: 0xff8a1a, emissiveIntensity: 2.6, roughness: 0.2 }),
    eyeRed: new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff2010, emissiveIntensity: 5, roughness: 0.2 }),
    helmet: new THREE.MeshStandardMaterial({ map: T.rustMetal.map, normalMap: T.rustMetal.normalMap, color: 0x5a6448, roughness: 0.6, metalness: 0.4 }),
    armor: new THREE.MeshStandardMaterial({ map: T.rustMetal.map, normalMap: T.rustMetal.normalMap, color: 0x707070, roughness: 0.45, metalness: 0.9 }),
    mask: new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.55 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: 0.05, metalness: 0.6 }),
    geoCache: new Map(),
    gibs: buildGibs(),
    helmetGeo: (() => { const g = new THREE.SphereGeometry(0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(1, 0.85, 1.1); return g; })(),
    rimGeo: (() => { const g = new THREE.TorusGeometry(0.13, 0.008, 4, 24); g.rotateX(Math.PI / 2); g.scale(1, 1, 1.1); return g; })(),
    maskGeo: new RoundedBoxGeometry(0.13, 0.1, 0.07, 2, 0.025),
    filterGeo: new THREE.CylinderGeometry(0.03, 0.034, 0.045, 12).rotateX(Math.PI / 2),
    lensGeo: new THREE.CylinderGeometry(0.02, 0.02, 0.01, 12).rotateX(Math.PI / 2),
    plateGeo: new RoundedBoxGeometry(0.38, 0.32, 0.07, 2, 0.02),
    padGeo: new RoundedBoxGeometry(0.17, 0.07, 0.19, 2, 0.025),
  };
  return A;
}

function bodyGeometry(outfit, brute) {
  const key = brute ? 'brute' : `${outfit.key}:${Math.floor(Math.random() * VARIANTS)}`;
  if (!A.geoCache.has(key)) {
    const seed = Math.floor(Math.random() * 1e6);
    A.geoCache.set(key, buildBody({
      bulk: brute ? 1 : rand(0.9, 1.08), sleeve: outfit.sleeve, gloves: !!outfit.gloves, hair: outfit.hair ? (Math.random() < outfit.hair ? rand(0.4, 0.95) : 0) : 0,
      torn: outfit.torn || (Math.random() < 0.3 ? 0.4 : 0), seed, brute,
    }));
  }
  return A.geoCache.get(key);
}

// prebuild a few geometries during loading so spawns don't hitch
export function prewarmZombies(T) {
  zombieAssets(T);
  for (const o of OUTFITS) bodyGeometry(o, false);
  bodyGeometry(OUTFITS[0], true);
}

export function buildZombie(T, type = 'walker') {
  const a = zombieAssets(T);
  const brute = type === 'brute';
  const outfit = brute ? { key: 'brute', shirt: 'black', pants: 'soldier', sleeve: 'short', helmet: 1 } : pick(OUTFITS);
  const geo = bodyGeometry(outfit, brute);
  const mats = [pick(a.skins), a.cloth[outfit.shirt], a.cloth[outfit.pants], a.misc, brute ? a.eyeRed : a.eye];
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.8);
  // bones
  const bones = [], parts = {};
  for (const n of BONES) {
    const b = new THREE.Bone(); b.name = n;
    const [par, x, y, z] = LOCAL[n];
    b.position.set(x, y, z);
    if (par) parts[par].add(b);
    bones.push(b); parts[n] = b;
  }
  const root = new THREE.Group();
  root.add(mesh);
  mesh.add(parts.root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  // rigid attachments
  let helmet = null;
  if (outfit.helmet && Math.random() < outfit.helmet) {
    helmet = new THREE.Group();
    const h = new THREE.Mesh(a.helmetGeo, a.helmet); h.castShadow = true; helmet.add(h);
    const rim = new THREE.Mesh(a.rimGeo, a.helmet); rim.position.y = 0.002; helmet.add(rim);
    helmet.position.set(0, 0.125, 0.0);
    helmet.rotation.x = rand(-0.15, 0.1); helmet.rotation.z = rand(-0.12, 0.12);
    if (brute) helmet.scale.setScalar(1.12);
    parts.head.add(helmet);
  } else if (outfit.mask) {
    const m = new THREE.Group();
    const body = new THREE.Mesh(a.maskGeo, a.mask); body.position.set(0, 0.06, 0.085); m.add(body);
    const f = new THREE.Mesh(a.filterGeo, a.mask); f.position.set(0, 0.03, 0.125); m.add(f);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(a.lensGeo, a.lens); l.position.set(s * 0.034, 0.108, 0.116); m.add(l); }
    parts.head.add(m);
  }
  if (brute) {
    const pl = new THREE.Mesh(a.plateGeo, a.armor); pl.position.set(0, 0.3, 0.15); pl.castShadow = true; parts.torso.add(pl);
    const pb = new THREE.Mesh(a.plateGeo, a.armor); pb.position.set(0, 0.3, -0.15); parts.torso.add(pb);
    for (const s of ['L', 'R']) { const pad = new THREE.Mesh(a.padGeo, a.armor); pad.position.set((s === 'L' ? -1 : 1) * 0.03, 0.03, 0); parts['sh' + s].add(pad); }
  }
  const scale = brute ? 1.3 : rand(0.93, 1.06);
  root.scale.setScalar(scale);
  const gib = (kind) => new THREE.Mesh(a.gibs[kind], mats);
  return { root, mesh, parts, helmet, scale, mats, gib, brute };
}
