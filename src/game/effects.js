import * as THREE from 'three';
import { rand, TAU, pick } from '../core/utils.js';

const VERT = /* glsl */ `
  attribute float aAlpha; attribute float aSize; attribute float aRot; attribute vec3 aColor;
  varying float vAlpha; varying float vRot; varying vec3 vColor; varying float vDepth;
  uniform float uScale;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    vAlpha = aAlpha; vRot = aRot; vColor = aColor; vDepth = -mv.z;
  }`;
const FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uFogColor; uniform float uFogDensity; uniform float uAdditive;
  varying float vAlpha; varying float vRot; varying vec3 vColor; varying float vDepth;
  void main(){
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c*p.x - s*p.y, s*p.x + c*p.y) + 0.5;
    vec4 t = texture2D(uMap, p);
    float f = 1.0 - exp(-uFogDensity*uFogDensity*vDepth*vDepth);
    vec3 col = vColor * t.rgb;
    float a = t.a * vAlpha;
    if (a < 0.003) discard;
    if (uAdditive > 0.5) { gl_FragColor = vec4(col * a * (1.0 - f), 1.0); }
    else { gl_FragColor = vec4(mix(col, uFogColor, f), a); }
  }`;

function cloneVisual(o) {
  const c = o.isMesh ? new THREE.Mesh(o.geometry, o.material) : new THREE.Group();
  c.position.copy(o.position); c.rotation.copy(o.rotation); c.scale.copy(o.scale);
  c.castShadow = true;
  for (const ch of o.children) if (ch.visible) c.add(cloneVisual(ch));
  return c;
}

class ParticleSystem {
  constructor(scene, cap, map, additive) {
    this.cap = cap; this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.alpha = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.rot = new Float32Array(cap);
    this.d = [];
    for (let i = 0; i < cap; i++) this.d.push({ life: 0, max: 1, s0: 1, s1: 1, a0: 1, rv: 0, g: 0, drag: 0, bounce: 0, fadeIn: 0, c0: [1, 1, 1], c1: null });
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aAlpha', this.aAlpha); geo.setAttribute('aSize', this.aSize); geo.setAttribute('aRot', this.aRot);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: map }, uScale: { value: 500 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.03 }, uAdditive: { value: additive ? 1 : 0 } },
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, o) {
    if (this.n >= this.cap) return;
    const i = this.n++, i3 = i * 3, d = this.d[i];
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    d.life = 0; d.max = o.life ?? 1; d.s0 = o.size ?? 0.2; d.s1 = o.sizeEnd ?? d.s0; d.a0 = o.alpha ?? 1;
    d.rv = o.rotVel ?? 0; d.g = o.gravity ?? 0; d.drag = o.drag ?? 0; d.bounce = o.bounce ?? 0; d.fadeIn = o.fadeIn ?? 0;
    d.c0 = o.color || [1, 1, 1]; d.c1 = o.colorEnd || null;
    this.rot[i] = o.rot ?? Math.random() * TAU;
    this.col[i3] = d.c0[0]; this.col[i3 + 1] = d.c0[1]; this.col[i3 + 2] = d.c0[2];
    this.alpha[i] = d.fadeIn ? 0 : d.a0; this.size[i] = d.s0;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      const d = this.d[i];
      d.life += dt;
      if (d.life >= d.max) { this._kill(i); continue; }
      const i3 = i * 3;
      const k = d.life / d.max;
      if (d.drag) { const f = Math.exp(-d.drag * dt); this.vel[i3] *= f; this.vel[i3 + 1] *= f; this.vel[i3 + 2] *= f; }
      this.vel[i3 + 1] -= d.g * dt;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (d.bounce && this.pos[i3 + 1] < 0.02) { this.pos[i3 + 1] = 0.02; this.vel[i3 + 1] *= -d.bounce; this.vel[i3] *= 0.5; this.vel[i3 + 2] *= 0.5; }
      this.size[i] = d.s0 + (d.s1 - d.s0) * k;
      this.alpha[i] = d.a0 * (1 - k) * (d.fadeIn ? Math.min(1, d.life / d.fadeIn) : 1);
      this.rot[i] += d.rv * dt;
      if (d.c1) {
        this.col[i3] = d.c0[0] + (d.c1[0] - d.c0[0]) * k;
        this.col[i3 + 1] = d.c0[1] + (d.c1[1] - d.c0[1]) * k;
        this.col[i3 + 2] = d.c0[2] + (d.c1[2] - d.c0[2]) * k;
      }
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aAlpha.needsUpdate = this.aSize.needsUpdate = this.aRot.needsUpdate = true;
  }
  _kill(i) {
    const last = --this.n;
    if (i !== last) {
      const i3 = i * 3, l3 = last * 3;
      for (let k = 0; k < 3; k++) { this.pos[i3 + k] = this.pos[l3 + k]; this.vel[i3 + k] = this.vel[l3 + k]; this.col[i3 + k] = this.col[l3 + k]; }
      this.alpha[i] = this.alpha[last]; this.size[i] = this.size[last]; this.rot[i] = this.rot[last];
      const t = this.d[i]; this.d[i] = this.d[last]; this.d[last] = t;
    }
  }
  clear() { this.n = 0; this.points.geometry.setDrawRange(0, 0); }
}

class DecalPool {
  constructor(scene, tex, cap, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: opts.rough ?? 0.4, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, cap);
    this.mesh.count = 0; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.cap = cap; this.i = 0; this.filled = 0;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._n = new THREE.Vector3();
    this._z = new THREE.Vector3(0, 0, 1);
  }
  add(pos, normal, size) {
    this._n.copy(normal);
    this._q.setFromUnitVectors(this._z, this._n);
    this._q2.setFromAxisAngle(this._z, Math.random() * TAU);
    this._q.multiply(this._q2);
    this._p.copy(pos).addScaledVector(this._n, 0.012 + Math.random() * 0.004);
    this._s.set(size, size, size);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(this.i, this._m);
    this.i = (this.i + 1) % this.cap;
    this.filled = Math.min(this.cap, this.filled + 1);
    this.mesh.count = this.filled;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.filled = 0; this.i = 0; }
}

export class Effects {
  constructor(game) {
    this.game = game;
    const T = game.textures, scene = game.scene;
    this.scene = scene;
    this.add = new ParticleSystem(scene, 2500, T.soft, true);
    this.alpha = new ParticleSystem(scene, 2500, T.soft, false);
    this.smoke = new ParticleSystem(scene, 600, T.smoke, false);
    this.fireP = new ParticleSystem(scene, 800, T.smoke, true);
    this.systems = [this.add, this.alpha, this.smoke, this.fireP];
    this.holes = new DecalPool(scene, T.bulletHole, 160, { rough: 0.9 });
    this.bloods = T.blood.map((t) => new DecalPool(scene, t, 50, { rough: 0.15 }));
    this.scorch = new DecalPool(scene, T.scorch, 20, { rough: 1 });
    this.tracers = [];
    const tg = new THREE.BoxGeometry(0.012, 0.012, 1);
    const tm = new THREE.MeshBasicMaterial({ color: 0xffd890, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(tg, tm); m.visible = false; m.frustumCulled = false; scene.add(m);
      this.tracers.push({ mesh: m, active: false, start: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0 });
    }
    this.gibs = [];
    this.bolts = [];
    this.boltMat = new THREE.LineBasicMaterial({ color: 0x9ae8ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.boltMat2 = new THREE.LineBasicMaterial({ color: 0x3060ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 });
    this.flashLight = new THREE.PointLight(0xffb060, 0, 9, 2); scene.add(this.flashLight);
    this.boomLight = new THREE.PointLight(0xff8030, 0, 22, 2); scene.add(this.boomLight);
    this.boomT = 0;
    this.fireAcc = 0; this.ambAcc = 0;
    this._tmpV = new THREE.Vector3();
    this.buildRain();
    this.buildFogLayers();
  }

  buildRain() {
    const N = this.game.quality === 'low' ? 1200 : 3200;
    this.rainN = N;
    this.rainPos = new Float32Array(N * 6);
    this.rainData = new Float32Array(N * 4);
    const geo = new THREE.BufferGeometry();
    this.rainAttr = new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.rainAttr);
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9aa8b8, transparent: true, opacity: 0.32, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    const c = new THREE.Vector3();
    for (let i = 0; i < N; i++) this._respawnDrop(i, true, c);
  }
  _respawnDrop(i, init, c) {
    const L = this.game.level;
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 4 && !ok; k++) {
      x = c.x + rand(-22, 22); z = c.z + rand(-22, 22);
      ok = !L.isCovered(x, z);
    }
    const d = this.rainData;
    d[i * 4] = x; d[i * 4 + 1] = init ? rand(0, 16) : rand(14, 18); d[i * 4 + 2] = z; d[i * 4 + 3] = ok ? rand(16, 22) : -1;
  }

  buildFogLayers() {
    const T = this.game.textures;
    this.fogLayers = [];
    const mk = (y, op, scale, speed) => {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uMap: { value: T.fog }, uTime: { value: 0 }, uColor: { value: new THREE.Color(0x4a5560) }, uOpacity: { value: op }, uCam: { value: new THREE.Vector3() }, uScale: { value: scale }, uSpeed: { value: speed } },
        vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: `uniform sampler2D uMap; uniform float uTime, uOpacity, uScale, uSpeed; uniform vec3 uColor, uCam; varying vec3 vW;
          void main(){
            vec2 uv = vW.xz / uScale;
            float n = texture2D(uMap, uv + vec2(uTime*uSpeed, uTime*uSpeed*0.6)).a;
            float n2 = texture2D(uMap, uv*0.47 - vec2(uTime*uSpeed*0.7, 0.0)).a;
            float d = distance(vW.xz, uCam.xz);
            float a = n*n2*1.6 * uOpacity * smoothstep(1.2, 5.0, d) * (1.0 - smoothstep(30.0, 60.0, d));
            gl_FragColor = vec4(uColor, a);
          }`,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = 3;
      this.scene.add(m); this.fogLayers.push(m);
    };
    mk(0.18, 0.5, 14, 0.008);
    mk(0.55, 0.35, 18, -0.006);
    mk(1.1, 0.18, 24, 0.004);
  }

  setFogColor(c) { for (const f of this.fogLayers) f.material.uniforms.uColor.value.copy(c); }

  bloodSpray(p, dir, amount = 1, big = false) {
    const n = Math.floor((big ? 26 : 12) * amount);
    for (let i = 0; i < n; i++) {
      const sp = rand(1, big ? 6 : 4);
      this.alpha.emit(p.x, p.y, p.z, dir.x * sp + rand(-1.5, 1.5), dir.y * sp + rand(-0.5, 2.5), dir.z * sp + rand(-1.5, 1.5),
        { life: rand(0.35, 0.8), size: rand(0.03, 0.09), sizeEnd: 0.02, color: [rand(0.25, 0.45), 0.01, 0.01], gravity: 9.8, drag: 1 });
    }
    for (let i = 0; i < (big ? 4 : 2); i++) {
      this.smoke.emit(p.x, p.y, p.z, dir.x * 0.8 + rand(-0.3, 0.3), rand(0, 0.5), dir.z * 0.8 + rand(-0.3, 0.3),
        { life: rand(0.25, 0.5), size: rand(0.25, 0.4), sizeEnd: rand(0.6, 1.0), color: [0.35, 0.02, 0.02], alpha: 0.75, drag: 3 });
    }
    if (Math.random() < 0.35 * amount) this.bloodFloor(p.x + dir.x * rand(0.3, 1.2), p.z + dir.z * rand(0.3, 1.2), 0.6);
  }
  bloodDecal(p, n, size) { pick(this.bloods).add(p, n, size); }
  bloodFloor(x, z, size = 1) { this.bloodDecal(this._tmpV.set(x, 0, z), new THREE.Vector3(0, 1, 0), size * rand(0.6, 1.3)); }

  impact(p, n, surface = 'concrete') {
    this.holes.add(p, n, rand(0.08, 0.12));
    const ns = surface === 'metal' ? 10 : 4;
    for (let i = 0; i < ns; i++) {
      this.add.emit(p.x, p.y, p.z, n.x * rand(1, 4) + rand(-2, 2), n.y * rand(1, 4) + rand(0, 3), n.z * rand(1, 4) + rand(-2, 2),
        { life: rand(0.1, 0.35), size: rand(0.02, 0.05), sizeEnd: 0.005, color: [1, 0.7, 0.35], gravity: 12, bounce: 0.3 });
    }
    for (let i = 0; i < 3; i++) {
      this.smoke.emit(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, n.x * rand(0.3, 1) + rand(-0.2, 0.2), n.y * 0.5 + rand(0, 0.4), n.z * rand(0.3, 1) + rand(-0.2, 0.2),
        { life: rand(0.5, 1.0), size: rand(0.1, 0.2), sizeEnd: rand(0.4, 0.7), color: [0.45, 0.42, 0.38], alpha: 0.5, drag: 2 });
    }
    for (let i = 0; i < 5; i++) {
      this.alpha.emit(p.x, p.y, p.z, n.x * rand(1, 3) + rand(-1, 1), n.y * rand(1, 3) + rand(0, 2), n.z * rand(1, 3) + rand(-1, 1),
        { life: rand(0.4, 0.8), size: rand(0.015, 0.035), color: [0.2, 0.19, 0.17], gravity: 9.8, bounce: 0.2 });
    }
  }

  muzzleWorld(p, dir) {
    this.flashLight.position.copy(p);
    this.flashLight.intensity = 18;
    for (let i = 0; i < 2; i++) this.smoke.emit(p.x + dir.x * 0.3, p.y + dir.y * 0.3, p.z + dir.z * 0.3, dir.x * 0.6 + rand(-0.2, 0.2), rand(0.1, 0.5), dir.z * 0.6 + rand(-0.2, 0.2),
      { life: rand(0.4, 0.8), size: 0.1, sizeEnd: rand(0.4, 0.6), color: [0.6, 0.6, 0.6], alpha: 0.18, drag: 2 });
  }

  tracer(start, end) {
    const t = this.tracers.find((x) => !x.active);
    if (!t) return;
    t.active = true; t.start.copy(start); t.dir.subVectors(end, start); t.dist = t.dir.length(); t.dir.normalize(); t.t = 0;
    t.mesh.visible = true;
  }

  explosion(p, scale = 1) {
    for (let i = 0; i < 40 * scale; i++) {
      const a = Math.random() * TAU, e = rand(-0.2, 1), sp = rand(2, 8) * scale;
      this.fireP.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * sp * (1 - Math.abs(e) * 0.5), e * sp, Math.sin(a) * sp * (1 - Math.abs(e) * 0.5),
        { life: rand(0.25, 0.6), size: rand(0.8, 1.6) * scale, sizeEnd: rand(1.8, 3) * scale, color: [1, 0.6, 0.2], colorEnd: [0.6, 0.1, 0.02], drag: 4, rotVel: rand(-2, 2) });
    }
    for (let i = 0; i < 20 * scale; i++) {
      const a = Math.random() * TAU, sp = rand(0.5, 2.5) * scale;
      this.smoke.emit(p.x + rand(-0.5, 0.5), p.y + rand(0.2, 1.2), p.z + rand(-0.5, 0.5), Math.cos(a) * sp, rand(0.5, 2.2), Math.sin(a) * sp,
        { life: rand(1.8, 3.5), size: rand(1, 2) * scale, sizeEnd: rand(3, 5) * scale, color: [0.12, 0.11, 0.1], alpha: 0.7, drag: 1.5, rotVel: rand(-0.5, 0.5), fadeIn: 0.15 });
    }
    for (let i = 0; i < 50 * scale; i++) {
      const a = Math.random() * TAU, sp = rand(5, 16);
      this.add.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * sp, rand(2, 10), Math.sin(a) * sp,
        { life: rand(0.4, 1.3), size: rand(0.03, 0.08), sizeEnd: 0.01, color: [1, 0.75, 0.4], gravity: 12, bounce: 0.3, drag: 0.5 });
    }
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * TAU, sp = rand(3, 9);
      this.alpha.emit(p.x, p.y + 0.3, p.z, Math.cos(a) * sp, rand(3, 9), Math.sin(a) * sp,
        { life: rand(0.8, 1.6), size: rand(0.05, 0.12), color: [0.08, 0.07, 0.06], gravity: 14, bounce: 0.3 });
    }
    this.scorch.add(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(0, 1, 0), 3 * scale);
    this.boomLight.position.set(p.x, p.y + 1, p.z);
    this.boomLight.color.setHex(0xff8030);
    this.boomLight.intensity = 140 * scale;
    this.boomT = 1;
  }

  smallExplosion(p) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU, sp = rand(1, 4);
      this.fireP.emit(p.x, p.y, p.z, Math.cos(a) * sp, rand(-1, 3), Math.sin(a) * sp,
        { life: rand(0.15, 0.35), size: rand(0.3, 0.6), sizeEnd: rand(0.8, 1.2), color: [1, 0.55, 0.9], colorEnd: [0.5, 0.1, 0.6], drag: 5 });
    }
    for (let i = 0; i < 4; i++) this.smoke.emit(p.x, p.y, p.z, rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5), { life: rand(0.8, 1.4), size: 0.4, sizeEnd: 1.4, color: [0.15, 0.12, 0.15], alpha: 0.5, drag: 2 });
    this.boomLight.position.copy(p); this.boomLight.color.setHex(0xc060ff); this.boomLight.intensity = 30; this.boomT = 0.4;
  }

  dirtBurst(p, n = 20) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = rand(0.5, 3);
      this.alpha.emit(p.x + rand(-0.3, 0.3), 0.05, p.z + rand(-0.3, 0.3), Math.cos(a) * sp, rand(1, 4), Math.sin(a) * sp,
        { life: rand(0.5, 1.1), size: rand(0.04, 0.1), color: [0.16, 0.13, 0.1], gravity: 10, bounce: 0.2 });
    }
    for (let i = 0; i < Math.min(6, n / 3); i++) this.smoke.emit(p.x + rand(-0.4, 0.4), 0.2, p.z + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(0.2, 0.6), rand(-0.3, 0.3),
      { life: rand(1, 2), size: 0.5, sizeEnd: 1.5, color: [0.2, 0.18, 0.15], alpha: 0.5, drag: 1 });
  }

  electric(p, n = 10) {
    for (let i = 0; i < n; i++) {
      this.add.emit(p.x, p.y, p.z, rand(-3, 3), rand(-1, 4), rand(-3, 3), { life: rand(0.15, 0.4), size: rand(0.03, 0.08), color: [0.5, 0.85, 1], gravity: 4, drag: 2 });
    }
    this.add.emit(p.x, p.y, p.z, 0, 0, 0, { life: 0.15, size: 1.2, sizeEnd: 0.2, color: [0.3, 0.6, 1], alpha: 0.8 });
  }

  bolt(points, life = 0.25) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const l1 = new THREE.Line(geo, this.boltMat);
    const g2 = new THREE.BufferGeometry().setFromPoints(points.map((p) => p.clone().add(new THREE.Vector3(rand(-0.05, 0.05), rand(-0.05, 0.05), rand(-0.05, 0.05)))));
    const l2 = new THREE.Line(g2, this.boltMat2);
    l1.frustumCulled = l2.frustumCulled = false;
    this.scene.add(l1); this.scene.add(l2);
    this.bolts.push({ lines: [l1, l2], base: points.map((p) => p.clone()), life, max: life });
  }
  jaggedPath(a, b, seg = 10, amp = 0.35) {
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const p = new THREE.Vector3().lerpVectors(a, b, i / seg);
      if (i > 0 && i < seg) p.add(new THREE.Vector3(rand(-amp, amp), rand(-amp, amp), rand(-amp, amp)));
      pts.push(p);
    }
    return pts;
  }

  gib(obj, pos, vel, scale = 1) {
    const m = cloneVisual(obj);
    m.position.copy(pos); m.scale.setScalar(scale);
    this.scene.add(m);
    this.gibs.push({ mesh: m, vel: vel.clone(), av: new THREE.Vector3(rand(-10, 10), rand(-10, 10), rand(-10, 10)), life: 0, bleed: 1.2 });
    if (this.gibs.length > 24) { const g = this.gibs.shift(); this.scene.remove(g.mesh); }
  }

  update(dt, camera) {
    const g = this.game;
    const fog = g.scene.fog;
    const scale = g.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const s of this.systems) {
      s.mat.uniforms.uScale.value = scale;
      s.mat.uniforms.uFogColor.value.copy(fog.color);
      s.mat.uniforms.uFogDensity.value = fog.density;
      s.update(dt);
    }
    this.fireAcc += dt;
    while (this.fireAcc > 0.03) {
      this.fireAcc -= 0.03;
      for (const f of g.level.fires) {
        const s = f.scale;
        if (s < 0.01) continue;
        if (f.pos.distanceToSquared(camera.position) > 3600) continue;
        this.fireP.emit(f.pos.x + rand(-0.15, 0.15) * s, f.pos.y, f.pos.z + rand(-0.15, 0.15) * s, rand(-0.1, 0.1), rand(0.8, 1.6) * Math.sqrt(s), rand(-0.1, 0.1),
          { life: rand(0.4, 0.8), size: rand(0.35, 0.6) * s, sizeEnd: 0.1 * s, color: [1, 0.55, 0.18], colorEnd: [0.7, 0.12, 0.02], alpha: 0.9, rotVel: rand(-2, 2) });
        if (Math.random() < 0.3) this.add.emit(f.pos.x, f.pos.y + 0.3, f.pos.z, rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5),
          { life: rand(1, 2.5), size: rand(0.02, 0.04), color: [1, 0.6, 0.25], drag: 0.5, gravity: -0.3 });
        if (Math.random() < 0.25) this.smoke.emit(f.pos.x, f.pos.y + 0.8 * s, f.pos.z, rand(-0.2, 0.2), rand(0.6, 1.2), rand(-0.2, 0.2),
          { life: rand(2, 4), size: 0.5 * s, sizeEnd: 2 * s, color: [0.1, 0.09, 0.08], alpha: 0.4, drag: 0.3, fadeIn: 0.3, rotVel: rand(-0.4, 0.4) });
      }
    }
    this.ambAcc += dt;
    const cp = camera.position;
    while (this.ambAcc > 0.05) {
      this.ambAcc -= 0.05;
      const x = cp.x + rand(-6, 6), z = cp.z + rand(-6, 6);
      if (g.level.isCovered(x, z)) {
        this.add.emit(x, rand(0.3, 3), z, rand(-0.05, 0.05), rand(-0.02, 0.05), rand(-0.05, 0.05), { life: rand(3, 6), size: rand(0.008, 0.016), color: [0.6, 0.55, 0.5], alpha: 0.6, fadeIn: 1 });
      } else {
        for (let k = 0; k < 3; k++) {
          const sx = cp.x + rand(-8, 8), sz = cp.z + rand(-8, 8);
          if (g.level.isCovered(sx, sz)) continue;
          this.alpha.emit(sx, 0.03, sz, rand(-0.3, 0.3), rand(0.6, 1.2), rand(-0.3, 0.3), { life: 0.18, size: 0.03, sizeEnd: 0.01, color: [0.6, 0.65, 0.7], alpha: 0.5, gravity: 9 });
        }
      }
    }
    const N = this.rainN, rp = this.rainPos, rd = this.rainData;
    for (let i = 0; i < N; i++) {
      const j = i * 4;
      if (rd[j + 3] < 0) { if (Math.random() < 0.02) this._respawnDrop(i, false, cp); rp[i * 6 + 1] = rp[i * 6 + 4] = -50; continue; }
      rd[j + 1] -= rd[j + 3] * dt;
      if (rd[j + 1] < 0 || Math.abs(rd[j] - cp.x) > 24 || Math.abs(rd[j + 2] - cp.z) > 24) this._respawnDrop(i, false, cp);
      const x = rd[j], y = rd[j + 1], z = rd[j + 2];
      rp[i * 6] = x; rp[i * 6 + 1] = y; rp[i * 6 + 2] = z;
      rp[i * 6 + 3] = x + 0.03; rp[i * 6 + 4] = y + 0.5; rp[i * 6 + 5] = z + 0.015;
    }
    this.rainAttr.needsUpdate = true;
    for (const f of this.fogLayers) { f.material.uniforms.uTime.value += dt; f.material.uniforms.uCam.value.copy(cp); }
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.t += dt;
      const head = Math.min(t.dist, t.t * 320), tail = Math.max(0, head - 5);
      if (tail >= t.dist - 0.01 || t.t > 0.4) { t.active = false; t.mesh.visible = false; continue; }
      const len = Math.max(0.01, head - tail);
      t.mesh.position.copy(t.start).addScaledVector(t.dir, (head + tail) / 2);
      t.mesh.lookAt(this._tmpV.copy(t.mesh.position).add(t.dir));
      t.mesh.scale.set(1, 1, len);
    }
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const gb = this.gibs[i];
      gb.life += dt;
      gb.vel.y -= 14 * dt;
      gb.mesh.position.addScaledVector(gb.vel, dt);
      gb.mesh.rotation.x += gb.av.x * dt; gb.mesh.rotation.y += gb.av.y * dt; gb.mesh.rotation.z += gb.av.z * dt;
      if (gb.mesh.position.y < 0.08) {
        gb.mesh.position.y = 0.08;
        if (gb.vel.y < -1.5) this.bloodFloor(gb.mesh.position.x, gb.mesh.position.z, 0.5);
        gb.vel.y *= -0.3; gb.vel.x *= 0.6; gb.vel.z *= 0.6; gb.av.multiplyScalar(0.6);
      }
      if (gb.bleed > 0) {
        gb.bleed -= dt;
        const p = gb.mesh.position;
        this.alpha.emit(p.x, p.y, p.z, rand(-0.3, 0.3), rand(0, 0.5), rand(-0.3, 0.3), { life: 0.5, size: 0.05, color: [0.35, 0.01, 0.01], gravity: 9 });
      }
      if (gb.life > 6) gb.mesh.position.y -= dt * 0.2;
      if (gb.life > 8) { this.scene.remove(gb.mesh); this.gibs.splice(i, 1); }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      const attr = b.lines[0].geometry.attributes.position;
      for (let k = 1; k < b.base.length - 1; k++) attr.setXYZ(k, b.base[k].x + rand(-0.12, 0.12), b.base[k].y + rand(-0.12, 0.12), b.base[k].z + rand(-0.12, 0.12));
      attr.needsUpdate = true;
      if (b.life <= 0) { for (const l of b.lines) { this.scene.remove(l); l.geometry.dispose(); } this.bolts.splice(i, 1); }
    }
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 300);
    if (this.boomT > 0) { this.boomT -= dt * 2.5; this.boomLight.intensity *= Math.exp(-dt * 7); if (this.boomT <= 0) this.boomLight.intensity = 0; }
  }

  clear() {
    for (const s of this.systems) s.clear();
    this.holes.clear(); this.scorch.clear(); this.bloods.forEach((b) => b.clear());
    for (const gb of this.gibs) this.scene.remove(gb.mesh);
    this.gibs = [];
    for (const b of this.bolts) for (const l of b.lines) this.scene.remove(l);
    this.bolts = [];
  }
}
