import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { rand, damp, pick } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Realistic zombies built from rigged (Mixamo-standard) human scans.
// Procedural animation drives "proxy" joints that match the procedural rig
// (hips, torso, neck, head, shL/elL/handL, hipL/kneeL/ankleL ...) and is
// retargeted onto the real skeleton, blended with motion-captured locomotion.
// ---------------------------------------------------------------------------
const short = (n) => n.replace(/^mixamorig:?/, '');
const PROXIES = ['hips', 'torso', 'neck', 'head', 'jaw', 'shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'];
const UPPER = new Set(['shL', 'elL', 'handL', 'shR', 'elR', 'handR', 'neck', 'head']);
const DOWN = new THREE.Vector3(0, -1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _m = new THREE.Matrix4();

const NOISE = /* glsl */ `
  float zh(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float zn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
    return mix(mix(mix(zh(i), zh(i+vec3(1,0,0)), f.x), mix(zh(i+vec3(0,1,0)), zh(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(zh(i+vec3(0,0,1)), zh(i+vec3(1,0,1)), f.x), mix(zh(i+vec3(0,1,1)), zh(i+vec3(1,1,1)), f.x), f.y), f.z); }
  float zfbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a*zn(p); p *= 2.07; a *= 0.5; } return s; }`;

const DIFFUSE = /* glsl */ `
  vec3 zp = vZPos;
  float zn1 = zfbm(zp * 4.5 + uSeed);
  float zn2 = zfbm(zp * 15.0 - uSeed * 1.7);
  float zl = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(zl), uDesat) * uTint;
  diffuseColor.rgb *= mix(1.0, 0.45, smoothstep(0.5, 0.85, zn1) * 0.85);
  diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.55, zp.y)) * 0.4;
  float zBlood = smoothstep(0.64 - uBlood * 0.16, 0.7 - uBlood * 0.16, zfbm(zp * 3.0 + uSeed * 3.1));
  zBlood = max(zBlood, smoothstep(0.52, 0.6, zn2) * smoothstep(1.1, 1.45, zp.y) * smoothstep(-0.02, 0.06, zp.z) * uBlood);
  zBlood = max(zBlood, smoothstep(0.55, 0.78, abs(zp.x)) * smoothstep(0.42, 0.58, zn2));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15, 0.012, 0.01) * (0.55 + 0.6 * zn2), zBlood * 0.93);`;

function zombify(src, U) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uMeshToModel;\nvarying vec3 vZPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZPos = (uMeshToModel * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSeed, uDesat, uBlood; uniform vec3 uTint; varying vec3 vZPos;\n' + NOISE)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + DIFFUSE)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.2, zBlood);');
  };
  m.customProgramCacheKey = () => 'zombie-skin-v1';
  return m;
}

const VARIANTS = [
  { tint: [0.8, 0.88, 0.76], desat: 0.55, blood: 0.7 },
  { tint: [0.92, 0.9, 0.74], desat: 0.45, blood: 0.5 },
  { tint: [0.84, 0.78, 0.84], desat: 0.5, blood: 0.9 },
  { tint: [0.7, 0.74, 0.68], desat: 0.6, blood: 0.6 },
];

// ---------------------------------------------------------------------------
class CharTemplate {
  constructor(id, gltf, clips) {
    this.id = id;
    const scene = (this.scene = gltf.scene);
    scene.updateMatrixWorld(true);
    let B = this.findBones(scene);
    // face +Z
    if (B.LeftToeBase && B.LeftFoot) {
      const tz = B.LeftToeBase.getWorldPosition(new THREE.Vector3()).z - B.LeftFoot.getWorldPosition(new THREE.Vector3()).z;
      if (tz < 0) { scene.rotation.y = Math.PI; scene.updateMatrixWorld(true); }
    }
    const lx = B.LeftArm.getWorldPosition(new THREE.Vector3()).x;
    this.side = lx < 0 ? { L: 'Left', R: 'Right' } : { L: 'Right', R: 'Left' };
    const S = this.side;
    this.map = {
      hips: 'Hips', torso: 'Spine', neck: 'Neck', head: 'Head',
      shL: S.L + 'Arm', elL: S.L + 'ForeArm', handL: S.L + 'Hand', shR: S.R + 'Arm', elR: S.R + 'ForeArm', handR: S.R + 'Hand',
      hipL: S.L + 'UpLeg', kneeL: S.L + 'Leg', ankleL: S.L + 'Foot', hipR: S.R + 'UpLeg', kneeR: S.R + 'Leg', ankleR: S.R + 'Foot',
    };
    // rest data
    this.rest = {};
    const sceneInvQ = scene.getWorldQuaternion(new THREE.Quaternion()).invert();
    const sceneInvM = new THREE.Matrix4().copy(scene.matrixWorld).invert();
    const list = [];
    scene.traverse((o) => { if (o.isBone) list.push(o); });
    this.boneOrder = list.map((b) => short(b.name));
    for (const b of list) {
      const n = short(b.name);
      const W = sceneInvQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion()));
      const pos = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(sceneInvM);
      this.rest[n] = { W, L: b.quaternion.clone(), pos, parent: b.parent && b.parent.isBone ? short(b.parent.name) : null };
    }
    // the scene rotation (flip) is part of "model space"
    const flipQ = scene.quaternion.clone();
    for (const n in this.rest) { this.rest[n].W.premultiply(flipQ); this.rest[n].pos.applyQuaternion(flipQ); }
    const hipsBone = B.Hips;
    this.charW = flipQ.clone().multiply(sceneInvQ.clone().multiply(hipsBone.parent.getWorldQuaternion(new THREE.Quaternion())));
    this.charNodeQ = hipsBone.parent.quaternion.clone();
    this.charInv = new THREE.Matrix4().copy(hipsBone.parent.matrixWorld).invert();
    // height & scale
    const top = B.HeadTop_End ? this.rest.HeadTop_End.pos.y : this.rest.Head.pos.y + 0.17;
    this.height = top;
    this.hipsY = this.rest.Hips.pos.y;
    const R = this.rest;
    if (!R.HeadTop_End) {
      const d = R.Head.pos.clone().sub(R.Neck.pos).normalize();
      R.__top = { pos: R.Head.pos.clone().addScaledVector(d, 0.17) };
    } else R.__top = { pos: R.HeadTop_End.pos.clone() };
    // corrections: arms hang down, legs straight down
    const corr = {};
    for (const s of ['Left', 'Right']) {
      const ad = R[s + 'ForeArm'].pos.clone().sub(R[s + 'Arm'].pos).normalize();
      const ca = new THREE.Quaternion().setFromUnitVectors(ad, DOWN);
      corr[s + 'Arm'] = corr[s + 'ForeArm'] = corr[s + 'Hand'] = ca;
      const ld = R[s + 'Leg'].pos.clone().sub(R[s + 'UpLeg'].pos).normalize();
      const cl = new THREE.Quaternion().setFromUnitVectors(ld, DOWN);
      corr[s + 'UpLeg'] = corr[s + 'Leg'] = cl;
    }
    const driven = new Set(Object.values(this.map));
    this.E = {};
    for (const n of this.boneOrder) {
      const r = R[n];
      if (driven.has(n)) this.E[n] = corr[n] ? corr[n].clone().multiply(r.W) : r.W.clone();
      else {
        const pe = r.parent ? this.E[r.parent] : this.charW;
        this.E[n] = pe.clone().multiply(r.L);
      }
    }
    this.drive = {};
    for (const p of PROXIES) {
      const n = this.map[p];
      if (!n) continue;
      const par = R[n].parent;
      const Ep = par ? this.E[par] : this.charW;
      this.drive[p] = { name: n, E: this.E[n], Einv: this.E[n].clone().invert(), EpInv: Ep.clone().invert() };
      // arms are solved relative to the chest, ignoring any clavicle motion from the mocap clip
      if ((p === 'shL' || p === 'shR') && par && R[par].parent) {
        this.drive[p].clav = par;
        this.drive[p].EancInv = this.E[R[par].parent].clone().invert();
      }
    }
    // meshes
    this.meshes = [];
    scene.traverse((o) => { if (o.isSkinnedMesh) this.meshes.push(o); });
    this.meshInfo = this.meshes.map((m) => {
      m.updateMatrixWorld(true);
      const toModel = new THREE.Matrix4().multiplyMatrices(sceneInvM, m.matrixWorld).premultiply(new THREE.Matrix4().makeRotationFromQuaternion(flipQ));
      return { name: m.name, toModel, gibs: this.gibSets(m), material: m.material };
    });
    // animations (retarget hips for rigs whose root node is oriented differently)
    this.clips = {};
    for (const [k, clip] of Object.entries(clips)) {
      if (!clip) continue;
      this.clips[k] = clip.src === this.id ? clip.clip : retargetHips(clip.clip, clip.charNodeQ, this.charW);
    }
  }
  findBones(root) { const B = {}; root.traverse((o) => { if (o.isBone) B[short(o.name)] = o; }); return B; }

  // triangle lists for slicing gibs off the skinned mesh
  gibSets(mesh) {
    const bones = mesh.skeleton.bones.map((b) => short(b.name));
    const descendants = (rootName) => {
      const set = new Set([rootName]);
      let grew = true;
      while (grew) { grew = false; for (const n of bones) { const p = this.rest[n] && this.rest[n].parent; if (p && set.has(p) && !set.has(n)) { set.add(n); grew = true; } } }
      return set;
    };
    const S = this.side;
    const groups = {
      head: descendants('Head'), armL: descendants(S.L + 'ForeArm'), armR: descendants(S.R + 'ForeArm'),
      legL: descendants(S.L + 'Leg'), legR: descendants(S.R + 'Leg'),
    };
    const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const dom = new Int32Array(si.count);
    for (let i = 0; i < si.count; i++) {
      let best = 0, bi = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
      dom[i] = bi;
    }
    const idx = g.index ? g.index.array : null;
    const triCount = idx ? idx.length / 3 : si.count / 3;
    const out = {};
    for (const [k, set] of Object.entries(groups)) {
      const ok = bones.map((n) => set.has(n));
      const tris = [];
      for (let t = 0; t < triCount; t++) {
        const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
        if (ok[dom[a]] && ok[dom[b]] && ok[dom[c]]) tris.push(a, b, c);
      }
      out[k] = new Uint32Array(tris);
    }
    return out;
  }
}

function retargetHips(clip, srcQ, dstQ) {
  const R = dstQ.clone().invert().multiply(srcQ);
  const c = clip.clone();
  for (const tr of c.tracks) {
    if (!/Hips\.(quaternion|position)$/.test(tr.name)) continue;
    const v = tr.values;
    if (tr.name.endsWith('quaternion')) {
      for (let i = 0; i < v.length; i += 4) { _q.fromArray(v, i).premultiply(R).toArray(v, i); }
    } else {
      for (let i = 0; i < v.length; i += 3) { _v.fromArray(v, i).applyQuaternion(R).toArray(v, i); }
    }
  }
  return c;
}

// ---------------------------------------------------------------------------
export class CharLibrary {
  constructor(assets) {
    this.templates = [];
    const chars = assets && assets.chars;
    if (!chars || !chars.Soldier) return;
    const sol = chars.Soldier;
    const find = (n) => sol.animations.find((a) => a.name.toLowerCase() === n);
    const raw = { walk: find('walk'), run: find('run'), idle: find('idle') };
    const own = Object.fromEntries(Object.entries(raw).map(([k, c]) => [k, c && { clip: c, src: 'Soldier' }]));
    let solT = null;
    try { solT = new CharTemplate('Soldier', sol, own); this.templates.push(solT); } catch (e) { console.warn('char template failed', 'Soldier', e); }
    if (solT && chars.Michelle) {
      const other = Object.fromEntries(Object.entries(raw).map(([k, c]) => [k, c && { clip: c, src: 'Soldier', charNodeQ: solT.charW }]));
      try { this.templates.push(new CharTemplate('Michelle', chars.Michelle, other)); } catch (e) { console.warn('char template failed', 'Michelle', e); }
    }
    this.byId = Object.fromEntries(this.templates.map((t) => [t.id, t]));
    // zombified materials: per template material x variant
    this.mats = new Map();
  }
  get ready() { return this.templates.length > 0; }
  material(tpl, mi, src, variant, brute) {
    const key = `${tpl.id}|${mi}|${src.uuid}|${brute ? 'b' : variant}`;
    if (this.mats.has(key)) return this.mats.get(key);
    const V = brute ? { tint: [0.62, 0.62, 0.64], desat: 0.5, blood: 1.0 } : VARIANTS[variant];
    let m;
    if (/visor/i.test(src.name)) {
      m = src.clone();
      m.color = new THREE.Color(0x101010); m.roughness = 0.15; m.metalness = 0.6;
      if (brute) { m.emissive = new THREE.Color(0xff1808); m.emissiveIntensity = 3; }
    } else {
      m = zombify(src, {
        uSeed: { value: rand(0, 50) }, uDesat: { value: V.desat }, uBlood: { value: V.blood },
        uTint: { value: new THREE.Vector3(...V.tint) }, uMeshToModel: { value: tpl.meshInfo[mi].toModel },
      });
      m.envMapIntensity = 0.8;
    }
    this.mats.set(key, m);
    return m;
  }
  pickTemplate(brute) {
    if (brute) return this.byId.Soldier || this.templates[0];
    return pick(this.templates);
  }
}

// ---------------------------------------------------------------------------
export class MixamoRig {
  constructor(lib, brute = false) {
    const tpl = (this.tpl = lib.pickTemplate(brute));
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(tpl.scene);
    this.modelScale = 1.78 / tpl.height;
    this.model.scale.multiplyScalar(this.modelScale);
    this.root.add(this.model);
    this.bones = {};
    this.model.traverse((o) => { if (o.isBone) this.bones[short(o.name)] = o; });
    this.meshes = [];
    const variant = Math.floor(Math.random() * VARIANTS.length);
    let mi = 0;
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const info = tpl.meshInfo[mi];
      o.material = lib.material(tpl, mi, info.material, variant, brute);
      o.castShadow = true; o.receiveShadow = true;
      o.frustumCulled = false;
      o.userData.gibs = info.gibs;
      this.meshes.push(o);
      mi++;
    });
    // proxies driven by the procedural animation code
    this.parts = {};
    for (const p of PROXIES) this.parts[p] = new THREE.Object3D();
    this.parts.hips.position.y = 0.95;
    // locomotion
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const k of ['walk', 'run', 'idle']) {
      const c = tpl.clips[k];
      if (!c) continue;
      const a = this.mixer.clipAction(c);
      a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0); a.time = Math.random() * c.duration;
      this.actions[k] = a;
    }
    this.w = { walk: 0, run: 0, idle: 1 };
    this.procW = 1;
    this.ragdoll = null;
  }

  // --- per frame -----------------------------------------------------------
  update(dt, full, loco) {
    if (this.ragdoll) { this.stepRagdoll(dt); return; }
    const tpl = this.tpl, B = this.bones, P = this.parts;
    this.procW = damp(this.procW, full ? 1 : 0, 9, dt);
    if (this.procW < 0.995 && this.actions.walk) {
      for (const k of ['walk', 'run', 'idle']) {
        const tgt = loco ? (loco[k] || 0) : 0;
        this.w[k] = damp(this.w[k], tgt, 7, dt);
        if (this.actions[k]) this.actions[k].setEffectiveWeight(this.w[k]);
      }
      if (loco) {
        if (this.actions.walk) this.actions.walk.timeScale = loco.walkScale || 1;
        if (this.actions.run) this.actions.run.timeScale = loco.runScale || 1;
      }
      this.mixer.update(dt);
    }
    const pw = this.actions.walk ? this.procW : 1;
    for (const p of PROXIES) {
      const d = tpl.drive[p];
      if (!d) continue;
      const bone = B[d.name];
      _q2.setFromEuler(P[p].rotation);
      if (d.clav) _q.copy(B[d.clav].quaternion).invert().multiply(d.EancInv).multiply(_q2).multiply(d.E);
      else _q.copy(d.EpInv).multiply(_q2).multiply(d.E);
      if (UPPER.has(p)) bone.quaternion.copy(_q);
      else if (p === 'torso' && pw < 1) {
        _q3.copy(d.Einv).multiply(_q2).multiply(d.E);
        bone.quaternion.multiply(_q3).slerp(_q, pw);
      } else if (pw > 0.001) bone.quaternion.slerp(_q, pw);
    }
    // relax unmapped spine/clavicle bones toward rest in fully procedural poses
    if (pw > 0.001) for (const n of ['Spine1', 'Spine2', 'LeftShoulder', 'RightShoulder']) { const b = B[n]; if (b) b.quaternion.slerp(tpl.rest[n].L, pw); }
    // hips height
    if (pw > 0.001) {
      const hs = tpl.hipsY / 0.95;
      _v.copy(tpl.rest.Hips.pos);
      _v.y += (P.hips.position.y - 0.95) * hs;
      _v2.copy(_v).applyMatrix4(tpl.charInv);
      B.Hips.position.lerp(_v2, pw);
    }
  }

  joint(name, out) {
    const n = name === 'head' ? 'Head' : this.tpl.map[name];
    return this.bones[n].getWorldPosition(out);
  }
  headCenter(out) {
    const B = this.bones;
    if (B.HeadTop_End) { B.Head.getWorldPosition(out); B.HeadTop_End.getWorldPosition(_v3); return out.add(_v3).multiplyScalar(0.5); }
    B.Head.getWorldPosition(out); B.Neck.getWorldPosition(_v3);
    _v3.subVectors(out, _v3).normalize();
    return out.addScaledVector(_v3, 0.09 * this.root.scale.x);
  }
  hide(name) {
    const n = name === 'head' ? 'Head' : this.tpl.map[name];
    if (this.bones[n]) this.bones[n].scale.setScalar(1e-4);
  }

  // slice a static gib mesh (world space) off the current skinned pose
  gib(kind) {
    const pos = [], uvs = [];
    const v = new THREE.Vector3();
    let mat = null;
    for (const m of this.meshes) {
      const tris = m.userData.gibs && m.userData.gibs[kind];
      if (!tris || !tris.length) continue;
      mat = mat || m.material;
      const uv = m.geometry.attributes.uv;
      const cache = new Map();
      for (let i = 0; i < tris.length; i++) {
        const vi = tris[i];
        let p = cache.get(vi);
        if (!p) { m.getVertexPosition(vi, v); v.applyMatrix4(m.matrixWorld); p = [v.x, v.y, v.z]; cache.set(vi, p); }
        pos.push(p[0], p[1], p[2]);
        if (uv) uvs.push(uv.getX(vi), uv.getY(vi)); else uvs.push(0, 0);
      }
    }
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    const c = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) { c.x += pos[i]; c.y += pos[i + 1]; c.z += pos[i + 2]; }
    c.multiplyScalar(3 / pos.length);
    for (let i = 0; i < pos.length; i += 3) { pos[i] -= c.x; pos[i + 1] -= c.y; pos[i + 2] -= c.z; }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.copy(c);
    mesh.userData.center = c;
    return mesh;
  }

  // --- ragdoll (Verlet) ----------------------------------------------------
  startRagdoll(impulse, hitPart, level) {
    const tpl = this.tpl, B = this.bones, S = tpl.side;
    this.root.updateMatrixWorld(true);
    const P = {};
    const sc = this.modelScale * this.root.scale.x;
    const names = { hips: 'Hips', neck: 'Neck', head: 'Head' };
    for (const s of ['Left', 'Right']) { names['sh' + s] = s + 'Arm'; names['el' + s] = s + 'ForeArm'; names['ha' + s] = s + 'Hand'; names['up' + s] = s + 'UpLeg'; names['kn' + s] = s + 'Leg'; names['ft' + s] = s + 'Foot'; if (B[s + 'ToeBase']) names['to' + s] = s + 'ToeBase'; }
    const restPos = (n) => (n === 'top' ? tpl.rest.__top.pos : tpl.rest[names[n]].pos);
    for (const [k, bn] of Object.entries(names)) {
      const p = B[bn].getWorldPosition(new THREE.Vector3());
      P[k] = { p, o: p.clone(), r: k.startsWith('ft') || k.startsWith('to') ? 0.05 : k === 'head' ? 0.1 : 0.07 };
    }
    // head-top particle from the head's current orientation
    const hq = B.Head.getWorldQuaternion(new THREE.Quaternion());
    const topLocal = restPos('top').clone().sub(tpl.rest.Head.pos).applyQuaternion(tpl.rest.Head.W.clone().invert());
    const top = topLocal.applyQuaternion(hq).multiplyScalar(sc).add(P.head.p);
    P.top = { p: top, o: top.clone(), r: 0.1 };
    const hitMap = { head: ['head', 'top'], torso: ['neck', 'hips'], armL: ['el' + S.L, 'ha' + S.L], armR: ['el' + S.R, 'ha' + S.R], legL: ['kn' + S.L, 'ft' + S.L], legR: ['kn' + S.R, 'ft' + S.R] };
    const strong = new Set(hitMap[hitPart] || ['neck']);
    const dt = 1 / 60;
    for (const [k, q] of Object.entries(P)) {
      const f = strong.has(k) ? 1 : 0.45;
      q.o.addScaledVector(impulse, -f * dt);
      q.o.x += rand(-0.004, 0.004); q.o.z += rand(-0.004, 0.004);
    }
    const sticks = [];
    const L = (a, b, stiff = 1, min = 0) => {
      if (!P[a] || !P[b]) return;
      const len = restPos(a).distanceTo(restPos(b)) * sc;
      sticks.push({ a: P[a], b: P[b], len, stiff, min });
    };
    L('hips', 'neck'); L('neck', 'head'); L('head', 'top');
    for (const s of ['Left', 'Right']) {
      L('neck', 'sh' + s); L('sh' + s, 'el' + s); L('el' + s, 'ha' + s);
      L('hips', 'up' + s); L('up' + s, 'kn' + s); L('kn' + s, 'ft' + s); L('ft' + s, 'to' + s); L('kn' + s, 'to' + s, 0.6);
      L('up' + s, 'sh' + s, 0.9); L('hips', 'sh' + s, 0.9); L('head', 'sh' + s, 0.35); L('up' + s, 'neck', 0.8);
      L('up' + s, 'ft' + s, 1, 0.62); L('sh' + s, 'ha' + s, 1, 0.45); L('hips', 'kn' + s, 1, 0.75);
    }
    L('shLeft', 'shRight'); L('upLeft', 'upRight'); L('upLeft', 'shRight', 0.9); L('upRight', 'shLeft', 0.9); L('top', 'neck', 0.4); L('hips', 'head', 1, 0.8);
    for (const s of sticks) if (s.min) { s.minLen = s.len * s.min; s.len = 0; }
    // rest data for orientation solve
    const rq = this.root.quaternion.clone().multiply(this.model.quaternion);
    this.ragdoll = { P, sticks, t: 0, level, rq, sleep: false, landed: false, charQ: B.Hips.parent.getWorldQuaternion(new THREE.Quaternion()), charInv: new THREE.Matrix4().copy(B.Hips.parent.matrixWorld).invert() };
    this.mixer.stopAllAction();
  }

  stepRagdoll(dt) {
    const R = this.ragdoll;
    if (R.sleep) return;
    R.t += dt;
    const sub = 2, h = Math.min(dt, 1 / 30) / sub;
    const P = R.P;
    for (let s = 0; s < sub; s++) {
      for (const q of Object.values(P)) {
        const p = q.p, o = q.o;
        const vx = (p.x - o.x) * 0.992, vy = (p.y - o.y) * 0.992, vz = (p.z - o.z) * 0.992;
        o.copy(p);
        p.x += vx; p.y += vy - 9.8 * h * h; p.z += vz;
      }
      for (let it = 0; it < 6; it++) {
        for (const st of R.sticks) {
          const a = st.a.p, b = st.b.p;
          _v.subVectors(b, a);
          const d = _v.length() || 1e-6;
          let diff;
          if (st.minLen) { if (d >= st.minLen) continue; diff = (d - st.minLen) / d; }
          else diff = (d - st.len) / d;
          _v.multiplyScalar(0.5 * diff * st.stiff);
          a.add(_v); b.sub(_v);
        }
        for (const q of Object.values(P)) {
          const p = q.p;
          if (p.y < q.r) {
            p.y = q.r;
            q.o.x = p.x - (p.x - q.o.x) * 0.55; q.o.z = p.z - (p.z - q.o.z) * 0.55;
            if (q.o.y < p.y) q.o.y = p.y + (q.o.y - p.y) * -0.15;
          }
        }
      }
      if (R.level) for (const q of Object.values(P)) R.level.collide(q.p, q.r, q.p.y - 0.05, q.p.y + 0.05, 'zombie');
    }
    if (!R.landed && P.hips.p.y < 0.35) R.landed = true;
    this.solveBones();
    if (R.t > 4) R.sleep = true;
  }

  solveBones() {
    const R = this.ragdoll, P = R.P, tpl = this.tpl, B = this.bones, rest = tpl.rest;
    const worldRest = (n) => _q3.copy(R.rq).multiply(rest[n].W);
    const target = {};
    const basis = (upA, upB, sideA, sideB, ru, rs) => {
      const u = new THREE.Vector3().subVectors(upB, upA).normalize();
      const sd = new THREE.Vector3().subVectors(sideB, sideA);
      const x = sd.sub(u.clone().multiplyScalar(sd.dot(u))).normalize();
      const z = new THREE.Vector3().crossVectors(x, u);
      const u0 = ru.clone().applyQuaternion(R.rq).normalize();
      const s0 = rs.clone().applyQuaternion(R.rq);
      const x0 = s0.sub(u0.clone().multiplyScalar(s0.dot(u0))).normalize();
      const z0 = new THREE.Vector3().crossVectors(x0, u0);
      const m1 = new THREE.Matrix4().makeBasis(x, u, z), m0 = new THREE.Matrix4().makeBasis(x0, u0, z0);
      return new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.transpose()));
    };
    const rp = (n) => rest[n].pos;
    const ru = rp('Neck').clone().sub(rp('Hips'));
    target.Hips = basis(P.hips.p, P.neck.p, P.upLeft.p, P.upRight.p, ru, rp('RightUpLeg').clone().sub(rp('LeftUpLeg'))).multiply(worldRest('Hips'));
    target.Spine = basis(P.hips.p, P.neck.p, P.shLeft.p, P.shRight.p, ru, rp('RightArm').clone().sub(rp('LeftArm'))).multiply(worldRest('Spine'));
    const align = (bone, child, pa, pb) => {
      _v.subVectors(pb, pa); if (_v.lengthSq() < 1e-8) return;
      _v.normalize();
      _v2.copy(child === '__top' ? rest.__top.pos : rp(child)).sub(rp(bone)).normalize().applyQuaternion(R.rq);
      target[bone] = new THREE.Quaternion().setFromUnitVectors(_v2, _v).multiply(worldRest(bone));
    };
    align('Neck', 'Head', P.neck.p, P.head.p);
    align('Head', '__top', P.head.p, P.top.p);
    for (const s of ['Left', 'Right']) {
      align(s + 'Arm', s + 'ForeArm', P['sh' + s].p, P['el' + s].p);
      align(s + 'ForeArm', s + 'Hand', P['el' + s].p, P['ha' + s].p);
      align(s + 'UpLeg', s + 'Leg', P['up' + s].p, P['kn' + s].p);
      align(s + 'Leg', s + 'Foot', P['kn' + s].p, P['ft' + s].p);
      if (P['to' + s]) align(s + 'Foot', s + 'ToeBase', P['ft' + s].p, P['to' + s].p);
    }
    // top-down local solve
    const wq = { __char: R.charQ };
    for (const n of tpl.boneOrder) {
      const b = B[n];
      if (!b) continue;
      const par = rest[n].parent;
      const pw = par ? wq[par] : R.charQ;
      if (!pw) continue;
      if (target[n]) { b.quaternion.copy(pw).invert().multiply(target[n]); wq[n] = target[n]; }
      else {
        if (n === 'Spine1' || n === 'Spine2' || n.endsWith('Shoulder')) b.quaternion.copy(rest[n].L);
        wq[n] = pw.clone().multiply(b.quaternion);
      }
    }
    B.Hips.position.copy(P.hips.p).applyMatrix4(R.charInv);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
