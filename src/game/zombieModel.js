import * as THREE from 'three';
import { pick, rand } from '../core/utils.js';

let A = null;

function headGeometry() {
  const g = new THREE.SphereGeometry(0.115, 18, 14);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.y *= 1.18;
    v.x *= 0.88;
    if (v.z > 0.02 && v.y > 0.01 && v.y < 0.06 && Math.abs(v.x) > 0.02 && Math.abs(v.x) < 0.07) v.z -= 0.022;
    if (v.z > 0.05 && v.y > 0.055 && v.y < 0.085) v.z += 0.012;
    if (v.y < -0.03 && Math.abs(v.x) > 0.05) v.x *= 0.85;
    if (v.z > 0.06 && Math.abs(v.x) < 0.02 && v.y > -0.03 && v.y < 0.03) v.z += 0.018;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function cap(r, len, sx = 1, sz = 1) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.scale(sx, 1, sz);
  return g;
}

export function zombieAssets(T) {
  if (A) return A;
  const skinMat = (tint) => new THREE.MeshStandardMaterial({ map: T.skin.map, normalMap: T.skin.normalMap, roughnessMap: T.skin.roughnessMap, color: tint, roughness: 1 });
  const clothMat = (key) => new THREE.MeshStandardMaterial({ map: T.cloth[key].map, normalMap: T.cloth[key].normalMap, roughnessMap: T.cloth[key].roughnessMap, roughness: 1 });
  A = {
    geo: {
      head: headGeometry(),
      jaw: new THREE.BoxGeometry(0.1, 0.045, 0.1),
      teeth: new THREE.BoxGeometry(0.075, 0.018, 0.012),
      eye: new THREE.SphereGeometry(0.016, 8, 6),
      hair: (() => { const g = new THREE.SphereGeometry(0.122, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45); g.scale(0.92, 1.15, 1); return g; })(),
      helmet: (() => { const g = new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5); g.scale(1, 0.9, 1.08); return g; })(),
      mask: new THREE.BoxGeometry(0.14, 0.12, 0.08),
      maskFilter: new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10).rotateX(Math.PI / 2),
      neck: cap(0.05, 0.06),
      torso: cap(0.165, 0.3, 1.18, 0.72),
      pelvis: cap(0.15, 0.08, 1.15, 0.75),
      upperArm: cap(0.052, 0.2),
      forearm: cap(0.043, 0.2),
      hand: new THREE.BoxGeometry(0.065, 0.1, 0.035),
      thigh: cap(0.072, 0.28),
      shin: cap(0.058, 0.3),
      foot: new THREE.BoxGeometry(0.1, 0.07, 0.24),
      ribs: new THREE.TorusGeometry(0.1, 0.012, 4, 10, Math.PI),
      plate: new THREE.BoxGeometry(0.4, 0.34, 0.08),
      shoulderPad: new THREE.BoxGeometry(0.16, 0.06, 0.18),
      wound: new THREE.CircleGeometry(0.05, 8),
    },
    mat: {
      skins: [skinMat(0xffffff), skinMat(0xd8e0c8), skinMat(0xc0b0a8), skinMat(0x9a9a90)],
      cloth: Object.fromEntries(['labcoat', 'soldier', 'hazmat', 'plaid', 'worker', 'denim', 'khaki', 'black', 'scrubs'].map((k) => [k, clothMat(k)])),
      boot: new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.8 }),
      eye: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa21a, emissiveIntensity: 9 }),
      eyeRed: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2010, emissiveIntensity: 12 }),
      teeth: new THREE.MeshStandardMaterial({ color: 0xb8a878, roughness: 0.5 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 1 }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x200404, roughness: 0.4 }),
      helmet: new THREE.MeshStandardMaterial({ color: 0x2e3526, roughness: 0.6, metalness: 0.5 }),
      armor: new THREE.MeshStandardMaterial({ map: T.rustMetal.map, normalMap: T.rustMetal.normalMap, color: 0x606060, roughness: 0.5, metalness: 0.9 }),
      mask: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }),
      bone: new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.6 }),
      wound: new THREE.MeshStandardMaterial({ color: 0x3a0505, roughness: 0.25, polygonOffset: true, polygonOffsetFactor: -2 }),
    },
  };
  return A;
}

const OUTFITS = [
  { shirt: 'labcoat', pants: 'khaki', hair: 0.6 },
  { shirt: 'soldier', pants: 'soldier', helmet: 0.6 },
  { shirt: 'soldier', pants: 'soldier', helmet: 0.6 },
  { shirt: 'hazmat', pants: 'hazmat', mask: true, fullSleeve: true },
  { shirt: 'plaid', pants: 'denim', hair: 0.8 },
  { shirt: 'worker', pants: 'denim', hair: 0.5 },
  { shirt: 'scrubs', pants: 'scrubs', hair: 0.7 },
  { shirt: 'black', pants: 'khaki', hair: 0.5 },
];

export function buildZombie(T, type = 'walker') {
  const a = zombieAssets(T);
  const G = a.geo, Mt = a.mat;
  const brute = type === 'brute';
  const outfit = brute ? { shirt: 'black', pants: 'soldier', helmet: 1 } : pick(OUTFITS);
  const skin = pick(Mt.skins);
  const shirt = Mt.cloth[outfit.shirt], pants = Mt.cloth[outfit.pants];
  const meshes = [];
  const mk = (geo, mat, part, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = false;
    if (part) { m.userData.part = part; meshes.push(m); }
    return m;
  };
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.95; root.add(hips);
  hips.add(mk(G.pelvis, pants, 'torso'));
  const torso = new THREE.Group(); torso.position.y = 0.05; hips.add(torso);
  const torsoMesh = mk(G.torso, shirt, 'torso'); torsoMesh.position.y = 0.3; torso.add(torsoMesh);
  if (Math.random() < 0.3 && !brute) {
    for (let i = 0; i < 3; i++) {
      const r = mk(G.ribs, Mt.bone, null, false); r.position.set(0.05, 0.25 + i * 0.06, 0.1); r.rotation.set(0, 0, -Math.PI / 2); r.scale.set(0.6, 0.8, 1);
      torso.add(r);
    }
  }
  for (let i = 0; i < 2; i++) {
    const w = mk(G.wound, Mt.wound, null, false);
    w.position.set(rand(-0.12, 0.12), rand(0.15, 0.45), 0.121); w.scale.setScalar(rand(0.6, 1.4));
    torso.add(w);
  }
  if (brute) {
    const pl = mk(G.plate, Mt.armor, 'torso'); pl.position.set(0, 0.33, 0.1); torso.add(pl);
    const pb = mk(G.plate, Mt.armor, 'torso'); pb.position.set(0, 0.33, -0.1); torso.add(pb);
  }
  const neck = new THREE.Group(); neck.position.y = 0.56; torso.add(neck);
  neck.add(mk(G.neck, skin, null, false));
  const head = new THREE.Group(); head.position.y = 0.1; neck.add(head);
  const headMesh = mk(G.head, skin, 'head'); headMesh.position.y = 0.1; head.add(headMesh);
  const eyeMat = brute ? Mt.eyeRed : Mt.eye;
  for (const s of [-1, 1]) {
    const e = mk(G.eye, eyeMat, null, false); e.position.set(s * 0.04, 0.125, 0.088); head.add(e);
  }
  const jaw = new THREE.Group(); jaw.position.set(0, 0.04, 0.02); head.add(jaw);
  const jm = mk(G.jaw, skin, 'head', false); jm.position.set(0, -0.02, 0.035); jaw.add(jm);
  const tt = mk(G.teeth, Mt.teeth, null, false); tt.position.set(0, 0.006, 0.08); jaw.add(tt);
  const tu = mk(G.teeth, Mt.teeth, null, false); tu.position.set(0, 0.052, 0.098); head.add(tu);
  const mouth = mk(G.teeth, Mt.mouth, null, false); mouth.scale.set(1, 2.5, 1); mouth.position.set(0, 0.04, 0.09); head.add(mouth);
  let helmet = null;
  if (outfit.helmet && Math.random() < outfit.helmet) {
    helmet = mk(G.helmet, Mt.helmet, 'head'); helmet.position.set(0, 0.15, -0.005); head.add(helmet);
    if (brute) helmet.scale.setScalar(1.08);
  } else if (outfit.mask) {
    const m = mk(G.mask, Mt.mask, 'head', false); m.position.set(0, 0.06, 0.08); head.add(m);
    const f = mk(G.maskFilter, Mt.mask, null, false); f.position.set(0, 0.03, 0.135); head.add(f);
    const hood = mk(G.hair, shirt, 'head'); hood.scale.setScalar(1.12); hood.position.y = 0.1; head.add(hood);
  } else if (Math.random() < (outfit.hair || 0.5)) {
    const h = mk(G.hair, Mt.hair, null, false); h.position.y = 0.105; head.add(h);
  }
  const arm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * 0.225, 0.5, 0); torso.add(sh);
    const ua = mk(G.upperArm, shirt, 'limb'); ua.position.y = -0.13; sh.add(ua);
    if (brute) { const pad = mk(G.shoulderPad, Mt.armor, 'limb'); pad.position.set(s * 0.02, 0.02, 0); sh.add(pad); }
    const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
    const fa = mk(G.forearm, outfit.fullSleeve ? shirt : skin, 'limb'); fa.position.y = -0.12; el.add(fa);
    const hd = mk(G.hand, outfit.fullSleeve ? Mt.mask : skin, 'limb', false); hd.position.y = -0.29; el.add(hd);
    return [sh, el];
  };
  const leg = (s) => {
    const hp = new THREE.Group(); hp.position.set(s * 0.1, -0.04, 0); hips.add(hp);
    const th = mk(G.thigh, pants, 'limb'); th.position.y = -0.21; hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.44; hp.add(kn);
    const sn = mk(G.shin, pants, 'limb'); sn.position.y = -0.2; kn.add(sn);
    const ft = mk(G.foot, Mt.boot, 'limb', false); ft.position.set(0, -0.43, 0.05); kn.add(ft);
    return [hp, kn];
  };
  const [shL, elL] = arm(-1), [shR, elR] = arm(1);
  const [hipL, kneeL] = leg(-1), [hipR, kneeR] = leg(1);
  const scale = brute ? 1.42 : rand(0.92, 1.06);
  root.scale.setScalar(scale);
  if (brute) torso.scale.set(1.25, 1.05, 1.2);
  return { root, parts: { hips, torso, neck, head, jaw, shL, elL, shR, elR, hipL, kneeL, hipR, kneeR }, meshes, helmet, headMesh, scale };
}
