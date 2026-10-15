import * as THREE from 'three';
import { buildZombie } from './zombieModel.js';
import { MixamoRig } from './charModel.js';
import { rand, clamp, angleDiff, lerp, damp, chance, smoothstep } from '../core/utils.js';

const _d = { x: 0, z: 0, d: 0 };
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function boneWorld(b, out, lx = 0, ly = 0, lz = 0) { return out.set(lx, ly, lz).applyMatrix4(b.matrixWorld); }
function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const h = b * b - cc;
  if (h < 0) return -1;
  const s = Math.sqrt(h);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t >= 0 ? t : -1;
}
function rayCapsule(o, d, pa, pb, r) {
  const bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
  const oax = o.x - pa.x, oay = o.y - pa.y, oaz = o.z - pa.z;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * d.x + bay * d.y + baz * d.z;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = d.x * oax + d.y * oay + d.z * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  let best = -1;
  if (a > 1e-10) {
    const b = baba * rdoa - baoa * bard;
    const c = baba * oaoa - baoa * baoa - r * r * baba;
    const h = b * b - a * c;
    if (h >= 0) {
      const t = (-b - Math.sqrt(h)) / a;
      const y = baoa + t * bard;
      if (t >= 0 && y > 0 && y < baba) best = t;
    }
  }
  const t1 = raySphere(o, d, pa, r), t2 = raySphere(o, d, pb, r);
  if (t1 >= 0 && (best < 0 || t1 < best)) best = t1;
  if (t2 >= 0 && (best < 0 || t2 < best)) best = t2;
  return best;
}

export class Zombie {
  constructor(mgr, type, hp, speed) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    const shadow = this.game.quality !== 'low' && this.game.quality !== 'medium' ? true : type === 'brute' || Math.random() < 0.5;
    const lib = this.game.chars;
    if (lib && lib.ready) {
      this.rig = new MixamoRig(lib, type === 'brute');
      this.root = this.rig.root; this.p = this.rig.parts; this.mesh = null; this.helmet = null; this.model = null;
      this.scale = type === 'brute' ? 1.3 : rand(0.93, 1.06);
      this.root.scale.setScalar(this.scale);
      for (const mm of this.rig.meshes) mm.castShadow = shadow;
    } else {
      const m = buildZombie(this.game.textures, type);
      this.root = m.root; this.mesh = m.mesh; this.p = m.parts; this.helmet = m.helmet; this.scale = m.scale; this.model = m;
      this.mesh.castShadow = shadow;
    }
    this.bulk = type === 'brute' ? 1.35 : 1;
    this.hp = hp; this.maxHp = hp;
    this.speed = speed;
    this.run = speed > 2.2;
    this.state = 'idle';
    this.t = 0;
    this.phase = Math.random() * 10;
    this.seed = Math.random() * 100;
    this.limp = Math.random() < 0.35 ? rand(0.3, 0.8) : 0;
    this.armsOut = !this.run && Math.random() < 0.6;
    this.oneArm = Math.random() < 0.3;
    this.tilt = rand(-0.25, 0.25);
    this.hunch = rand(0.08, 0.38);
    this.vel = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 0, 1);
    this.yaw = 0;
    this.attackT = 0; this.attackCd = 0;
    this.voiceT = rand(1, 5);
    this.losT = Math.random() * 0.3; this.hasLos = false;
    this.deadT = 0;
    this.radius = type === 'brute' ? 0.55 : 0.32;
    this.crawler = false;
    this.headless = false;
    this.lost = { L: false, R: false };
    this.helmetHp = type === 'brute' ? hp * 0.25 : hp * 0.6;
    this.window = null;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.charge = 0; this.chargeCd = rand(3, 6);
    this.footT = Math.random();
    this.fallDir = -1;
    this.impulse = new THREE.Vector3();
    this.hipsBaseY = 0.95;
    this.shockT = 0;
    this.tearAnim = 0;
    this.react = 0; this.reactPart = null; this.reactSgn = 1; this.reactSide = 0;
    this.stumble = 0;
    this.game.scene.add(this.root);
  }

  get pos() { return this.root.position; }
  get alive() { return this.state !== 'dead'; }

  spawnAtWindow(win) {
    this.window = win;
    const side = new THREE.Vector3(-win.normal.z, 0, win.normal.x);
    this.root.position.copy(win.spawn).addScaledVector(side, rand(-2.5, 2.5));
    this.state = 'toWindow';
    this.face(win.pos.x - this.pos.x, win.pos.z - this.pos.z, true);
  }
  spawnRise(pos) {
    this.root.position.set(pos.x + rand(-0.6, 0.6), -1.9, pos.z + rand(-0.6, 0.6));
    this.state = 'rising'; this.t = 0;
    this.yaw = Math.random() * Math.PI * 2; this.root.rotation.y = this.yaw;
    this.game.effects.dirtBurst(this.root.position, 25);
    this.game.audio.rise(this.root.position.clone());
  }

  face(dx, dz, instant = false, dt = 0.016, rate = 8) {
    const target = Math.atan2(dx, dz);
    if (instant) this.yaw = target;
    else this.yaw += angleDiff(this.yaw, target) * Math.min(1, rate * dt);
    this.root.rotation.y = this.yaw;
  }

  // analytic hit test against bone-driven capsules. returns {t, part, sub} | null
  hitTest(o, d, maxT) {
    if (!this.alive) return null;
    const s = this.scale;
    _c.copy(this.pos); _c.y += (this.crawler ? 0.35 : 0.95) * s;
    const bt = raySphere(o, d, _c, 1.35 * s);
    if (bt < 0 || bt > maxT + 1.4 * s) return null;
    let best = maxT, part = null, sub = null;
    const test = (t, name, sb) => { if (t >= 0 && t < best) { best = t; part = name; sub = sb; } };
    if (!this.headless) { this.headPos(_a); test(raySphere(o, d, _a, 0.115 * s * (this.type === 'brute' ? 1.1 : 1)), 'head', 'head'); }
    this.J('hips', _a); _a.y -= 0.06 * s; this.J('neck', _b); _b.y -= 0.03 * s;
    test(rayCapsule(o, d, _a, _b, 0.165 * s * this.bulk), 'torso', 'torso');
    for (const sd of ['L', 'R']) {
      this.J('sh' + sd, _a); this.J('el' + sd, _b);
      test(rayCapsule(o, d, _a, _b, 0.058 * s * this.bulk), 'limb', 'arm' + sd);
      if (!this.lost[sd]) { this.J('hand' + sd, _a); _c.subVectors(_a, _b).normalize(); _a.addScaledVector(_c, 0.1 * s); test(rayCapsule(o, d, _b, _a, 0.048 * s * this.bulk), 'limb', 'arm' + sd); }
      this.J('hip' + sd, _a); this.J('knee' + sd, _b);
      test(rayCapsule(o, d, _a, _b, 0.085 * s * this.bulk), 'limb', 'leg' + sd);
      if (!this.crawler) { this.J('ankle' + sd, _a); test(rayCapsule(o, d, _b, _a, 0.062 * s * this.bulk), 'limb', 'leg' + sd); }
    }
    return part ? { t: best, part, sub } : null;
  }

  hideBone(b) { b.scale.setScalar(0.0001); }
  J(name, out) { return this.rig ? this.rig.joint(name, out) : boneWorld(this.p[name], out); }
  headPos(out) { return this.rig ? this.rig.headCenter(out) : boneWorld(this.p.head, out, 0, 0.095, 0.012); }
  hide(name) { if (this.rig) this.rig.hide(name); else this.hideBone(this.p[name]); }
  spawnGib(kind, side, pos, vel) {
    if (this.rig) {
      const m = this.rig.gib(side ? kind + side : kind);
      if (m) this.game.effects.gib(m, m.position.clone(), vel, 1);
      return;
    }
    const g = this.model.gib(kind); g.rotation.y = this.yaw;
    this.game.effects.gib(g, pos, vel, this.scale);
  }

  damage(amount, part, point, dir, src = {}, sub = null) {
    if (!this.alive) return { killed: false };
    const g = this.game;
    const head = part === 'head';
    if (this.state === 'rising' && this.t < 0.6) amount *= 0.5;
    if (head && this.helmet && src.kind === 'bullet') {
      this.helmetHp -= amount;
      amount *= 0.35;
      if (this.helmetHp <= 0) {
        const hp = new THREE.Vector3(); this.helmet.getWorldPosition(hp);
        g.effects.gib(this.helmet, hp, new THREE.Vector3(dir.x * 3, 4, dir.z * 3), this.scale);
        this.helmet.visible = false;
        this.helmet = null;
      }
      g.audio.ricochet(point.clone());
    }
    if (g.powerups.active.instakill > 0) amount = this.type === 'brute' ? amount * 3 : this.hp + 1;
    this.hp -= amount;
    this.shockT = 0.12;
    // hit reaction
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.reactSgn = dir.x * fx + dir.z * fz < 0 ? 1 : -1;
    this.reactSide = (dir.x * fz - dir.z * fx) > 0 ? 1 : -1;
    this.react = Math.min(1, 0.35 + amount / this.maxHp) * (this.type === 'brute' ? 0.35 : 1);
    this.reactPart = sub || part;
    this.lastSub = sub || part;
    if (sub && sub.startsWith('leg') && this.type !== 'brute') this.stumble = Math.max(this.stumble, Math.min(0.9, 0.3 + amount / this.maxHp));
    if (this.state === 'chase' || this.state === 'attack') {
      this.impulse.addScaledVector(dir, Math.min(1.5, (amount / this.maxHp) * 4) * (this.type === 'brute' ? 0.2 : 1));
    }
    if (part === 'limb' && sub && sub.startsWith('arm') && amount > 160 && chance(0.3) && this.hp > 0) this.loseArm(dir, sub.slice(3));
    if (this.hp <= 0) {
      this.die(dir, head, src);
      return { killed: true, head };
    }
    if (src.kind === 'explosion' && !this.crawler && this.type !== 'brute' && chance(0.35)) this.makeCrawler();
    return { killed: false, head };
  }

  loseArm(dir, side) {
    if (!side) side = this.lost.L ? 'R' : this.lost.R ? 'L' : (Math.random() < 0.5 ? 'L' : 'R');
    if (this.lost[side]) return;
    const wp = this.J('el' + side, new THREE.Vector3());
    this.spawnGib('arm', side, wp, new THREE.Vector3(dir.x * 3 + rand(-1, 1), 3, dir.z * 3 + rand(-1, 1)));
    this.hide('el' + side);
    this.lost[side] = true;
    this.game.effects.bloodSpray(wp, dir, 1.5, true);
    this.armsOut = false;
  }

  makeCrawler() {
    if (this.crawler) return;
    this.crawler = true;
    for (const sd of ['L', 'R']) {
      const wp = this.J('knee' + sd, new THREE.Vector3());
      this.spawnGib('leg', sd, wp, new THREE.Vector3(rand(-3, 3), rand(2, 5), rand(-3, 3)));
      this.hide('knee' + sd);
    }
    this.game.effects.bloodSpray(this.pos.clone().setY(0.6), UP, 2, true);
    this.speed = 0.9;
    this.radius = 0.4;
  }

  die(dir, head, src) {
    const g = this.game;
    this.state = 'dead';
    this.deadT = 0;
    this.fallDir = (dir.x * Math.sin(this.yaw) + dir.z * Math.cos(this.yaw)) > 0 ? 1 : -1;
    if (this.crawler) this.fallDir = 1;
    this.impulse.copy(dir).multiplyScalar(src.kind === 'explosion' ? 5 : 1.6);
    this.impulse.y = 0;
    this.deathPose = { arms: [rand(-2.8, -0.4), rand(-2.8, -0.4)], twist: rand(-0.5, 0.5), legs: [rand(-0.6, 0.2), rand(-0.6, 0.2)], head: rand(-0.6, 0.6) };
    if (head && !this.headless && src.kind !== 'melee' && (chance(0.5) || src.weapon?.type === 'sniper' || src.weapon?.type === 'shotgun')) {
      const hp = this.headPos(new THREE.Vector3());
      this.spawnGib('head', '', hp, new THREE.Vector3(dir.x * 3 + rand(-1, 1), rand(3, 5), dir.z * 3 + rand(-1, 1)));
      this.hide('head');
      this.headless = true;
      g.effects.bloodSpray(hp, UP, 2.2, true);
      this.neckBleed = 1.5;
      g.audio.gore(hp);
    }
    if (src.kind === 'explosion' && chance(0.6)) { this.loseArm(dir); if (!this.crawler && chance(0.5)) this.makeCrawler(); }
    if (src.kind === 'volt') this.shockDeath = 1.0;
    if (chance(0.5)) g.audio.zombieVoice(this.pos.clone().setY(1.5), 'death', this.type === 'brute' ? 0.6 : 1);
    if (this.window) {
      if (this.window.occupant === this) this.window.occupant = null;
      const q = this.window.queue; const i = q.indexOf(this); if (i >= 0) q.splice(i, 1);
    }
    if (this.rig) {
      const k = src.kind;
      const mag = k === 'explosion' ? 7 : k === 'melee' ? 3.2 : k === 'volt' ? 1.5 : src.weapon?.type === 'sniper' ? 6 : src.weapon?.type === 'shotgun' ? 4.5 : 2.4;
      const imp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(mag);
      imp.y = k === 'explosion' ? 4.5 : 0.6;
      imp.addScaledVector(this.vel, 0.6);
      this.rig.startRagdoll(imp, head ? 'head' : (this.lastSub || 'torso'), g.level);
    }
    this.mgr.onDeath(this, head, src);
  }

  update(dt, player) {
    this.t += dt;
    const g = this.game;
    const pp = player.pos;
    if (this.state === 'dead') { this.updateDead(dt); return; }
    if (this.shockT > 0) this.shockT -= dt;
    if (this.react > 0) this.react = Math.max(0, this.react - dt * 3.5);
    if (this.stumble > 0) this.stumble = Math.max(0, this.stumble - dt);
    const dx = pp.x - this.pos.x, dz = pp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.voiceT -= dt;
    if (this.voiceT <= 0 && dist < 28) {
      this.voiceT = rand(3, 7);
      g.audio.zombieVoice(this.pos.clone().setY(1.6), this.run && dist < 12 && chance(0.5) ? 'scream' : 'groan', this.type === 'brute' ? 0.55 : rand(0.9, 1.15));
    }
    let moving = 0;
    switch (this.state) {
      case 'rising': {
        const k = Math.min(1, this.t / 1.7);
        this.pos.y = -1.9 * (1 - smoothstep(0, 1, k));
        if (Math.random() < 0.25) g.effects.dirtBurst(this.pos, 2);
        if (k >= 1) { this.pos.y = 0; this.state = 'chase'; }
        this.animate(dt, 'rise', 0);
        return;
      }
      case 'toWindow': {
        const w = this.window;
        const tx = w.outside.x - this.pos.x, tz = w.outside.z - this.pos.z;
        const d = Math.hypot(tx, tz) || 0.0001;
        if (w.occupant && w.occupant !== this && d < 2.2) {
          if (!w.queue.includes(this)) w.queue.push(this);
          this.state = 'windowWait';
          break;
        }
        const sp = Math.min(this.speed, 2.6);
        const step = Math.min(d, sp * dt);
        this.pos.x += (tx / d) * step; this.pos.z += (tz / d) * step;
        this.face(tx, tz, false, dt);
        moving = sp;
        if (d < 0.15) {
          if (!w.occupant) w.occupant = this;
          if (w.occupant === this) { this.state = w.count > 0 ? 'tearing' : 'climbing'; this.t = 0; this.tearT = rand(0.5, 1.0); this.climbFrom = this.pos.clone(); }
        }
        break;
      }
      case 'windowWait': {
        const w = this.window;
        const idx = Math.max(0, w.queue.indexOf(this));
        const side = _a.set(-w.normal.z, 0, w.normal.x);
        const tgt = _b.copy(w.outside).addScaledVector(w.normal, -0.9 - idx * 0.5).addScaledVector(side, (idx % 2 ? 1 : -1) * 0.7);
        const tx = tgt.x - this.pos.x, tz = tgt.z - this.pos.z, d = Math.hypot(tx, tz);
        if (d > 0.1) { this.pos.x += (tx / d) * 1.2 * dt; this.pos.z += (tz / d) * 1.2 * dt; moving = 1.2; }
        this.face(w.pos.x - this.pos.x, w.pos.z - this.pos.z, false, dt);
        if (!w.occupant && w.queue[0] === this) { w.queue.shift(); w.occupant = this; this.state = 'toWindow'; }
        else if (!w.queue.includes(this)) this.state = 'toWindow';
        break;
      }
      case 'tearing': {
        const w = this.window;
        this.face(w.normal.x, w.normal.z, false, dt);
        this.tearT -= dt;
        const pd = Math.hypot(pp.x - w.inside.x, pp.z - w.inside.z);
        if (pd < 1.0 && w.count <= 3 && this.attackCd <= 0 && player.alive && this.attackT <= 0) { this.attackT = 0.001; this.attackCd = 1.6; this.attackHit = false; }
        if (this.tearT <= 0) {
          this.tearT = rand(1.0, 1.5) / clamp(this.speed / 1.2, 1, 1.6);
          if (g.level.tearBoard(w)) { g.audio.boardTear(w.pos.clone().setY(1.5)); this.tearAnim = 0.001; }
        }
        if (w.count <= 0) { this.state = 'climbing'; this.t = 0; this.climbFrom = this.pos.clone(); }
        break;
      }
      case 'climbing': {
        const w = this.window;
        const dur = this.run ? 0.9 : 1.5;
        const k = Math.min(1, this.t / dur);
        const e = smoothstep(0, 1, k);
        this.pos.x = lerp(this.climbFrom.x, w.inside.x, e);
        this.pos.z = lerp(this.climbFrom.z, w.inside.z, e);
        this.pos.y = Math.sin(k * Math.PI) * 0.75;
        this.face(w.normal.x, w.normal.z, false, dt);
        this.animate(dt, 'climb', k);
        if (k >= 1) {
          this.pos.y = 0;
          this.state = 'chase';
          if (w.occupant === this) w.occupant = null;
          this.window = null;
        }
        return;
      }
      case 'chase':
      case 'attack':
        moving = this.chase(dt, player, dist, dx, dz);
        break;
    }
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackT > 0) {
      const dur = this.type === 'brute' ? 1.3 : this.crawler ? 1.1 : 0.85;
      this.attackT += dt / dur;
      if (!this.attackHit && this.attackT > 0.5) {
        this.attackHit = true;
        let canHit;
        if (this.state === 'tearing') canHit = Math.hypot(pp.x - this.window.inside.x, pp.z - this.window.inside.z) < 1.3;
        else canHit = dist < (this.type === 'brute' ? 2.6 : 1.7);
        if (canHit && player.alive) {
          player.damage(this.type === 'brute' ? 75 : this.crawler ? 30 : 45, this.pos);
          g.audio.swipe(pp.clone());
        }
        if (this.type === 'brute') {
          g.effects.dirtBurst(_a.copy(this.pos).addScaledVector(this.dir, 1.2), 30);
          g.shake(canHit ? 0.8 : 0.4);
          g.audio.bruteSlam(this.pos.clone());
        }
      }
      if (this.attackT >= 1) { this.attackT = 0; if (this.state === 'attack') this.state = 'chase'; }
    }
    if (moving > 0.5 && dist < 11) {
      this.footT -= dt * moving;
      if (this.footT <= 0) {
        this.footT = 0.75;
        if (chance(this.type === 'brute' ? 1 : 0.35)) g.audio.noise({ dur: 0.08, type: 'lowpass', freq: this.type === 'brute' ? 200 : 380, gain: this.type === 'brute' ? 0.5 : 0.16, pos: this.pos.clone(), rev: 0.05 });
      }
    }
    if (this.tearAnim > 0) { this.tearAnim += dt * 1.6; if (this.tearAnim >= 1) this.tearAnim = 0; }
    this.animate(dt, moving > 0.1 ? 'move' : 'idle', moving);
  }

  chase(dt, player, dist, dx, dz) {
    const g = this.game;
    const nav = g.level.nav;
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.3; this.hasLos = dist < 14 && nav.los(this.pos.x, this.pos.z, player.pos.x, player.pos.z); }
    let mx, mz;
    if (this.hasLos || dist < 1.5) { mx = dx / (dist || 1); mz = dz / (dist || 1); }
    else { nav.dir(this.pos.x, this.pos.z, _d); mx = _d.x; mz = _d.z; if (!mx && !mz) { mx = dx / (dist || 1); mz = dz / (dist || 1); } }
    let sx = 0, sz = 0;
    for (const o of this.mgr.zombies) {
      if (o === this || !o.alive || o.state === 'rising' || o.state === 'climbing') continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz, rr = this.radius + o.radius + 0.15;
      if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2); sx += (ox / d) * (rr - d); sz += (oz / d) * (rr - d); }
    }
    let speed = this.speed;
    if (this.type === 'brute') {
      this.chargeCd -= dt;
      if (this.charge > 0) { this.charge -= dt; speed = 5.2; }
      else if (this.chargeCd <= 0 && dist < 12 && dist > 3 && this.hasLos) {
        this.charge = 1.8; this.chargeCd = rand(6, 9);
        g.audio.zombieVoice(this.pos.clone().setY(2), 'scream', 0.5);
        g.shake(0.25);
      }
    }
    if (this.shockT > 0) speed *= 0.4;
    if (this.stumble > 0) speed *= 0.35;
    if (this.attackT > 0) speed *= this.type === 'brute' ? 0.1 : 0.3;
    const stopDist = this.type === 'brute' ? 1.4 : 0.85;
    let moving = 0;
    if (dist > stopDist) {
      this.vel.x = damp(this.vel.x, mx * speed + sx * 3, 8, dt); this.vel.z = damp(this.vel.z, mz * speed + sz * 3, 8, dt);
      moving = speed;
    } else {
      this.vel.x = damp(this.vel.x, sx * 3, 10, dt); this.vel.z = damp(this.vel.z, sz * 3, 10, dt);
    }
    this.pos.x += (this.vel.x + this.impulse.x) * dt; this.pos.z += (this.vel.z + this.impulse.z) * dt;
    this.impulse.multiplyScalar(Math.exp(-10 * dt));
    g.level.collide(this.pos, this.radius, 0.1, 1.7, 'zombie');
    const px = this.pos.x - player.pos.x, pz = this.pos.z - player.pos.z, pd = Math.hypot(px, pz), minD = this.radius + 0.35;
    if (pd < minD && pd > 1e-4) { this.pos.x = player.pos.x + (px / pd) * minD; this.pos.z = player.pos.z + (pz / pd) * minD; }
    this.face(dist < 3 ? dx : (mx || dx), dist < 3 ? dz : (mz || dz), false, dt, this.run ? 10 : 6);
    this.dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const range = this.type === 'brute' ? 2.2 : this.crawler ? 1.2 : 1.35;
    if (dist < range && this.attackCd <= 0 && player.alive && this.attackT <= 0) {
      this.state = 'attack'; this.attackT = 0.001; this.attackHit = false;
      this.attackCd = this.type === 'brute' ? 2.2 : rand(1.1, 1.5);
      if (chance(0.7)) g.audio.zombieVoice(this.pos.clone().setY(1.6), 'attack', this.type === 'brute' ? 0.55 : 1);
      if (this.type === 'brute') this.charge = 0;
    }
    this.stuckT += dt;
    if (this.stuckT > 2) {
      if (this.pos.distanceTo(this.lastPos) < 0.3 && dist > 3) { this.impulse.set(rand(-1.5, 1.5), 0, rand(-1.5, 1.5)); this.hasLos = false; }
      this.lastPos.copy(this.pos); this.stuckT = 0;
    }
    return moving;
  }

  animate(dt, mode, v) {
    this.animatePose(dt, mode, v);
    this.applyRig(dt, mode, v);
  }

  animatePose(dt, mode, v) {
    const p = this.p, t = this.t + this.seed;
    const att = this.attackT > 0 ? this.attackT : 0;
    if (this.crawler) { this.animateCrawl(dt, v, att); return; }
    let hipsY = this.hipsBaseY;
    if (mode === 'move' || mode === 'idle') {
      const run = this.run || this.charge > 0;
      const stride = run ? 1.25 : 0.62;
      if (mode === 'move') this.phase += (v / stride) * dt * Math.PI;
      const ph = this.phase, sw = Math.sin(ph), cw = Math.cos(ph);
      const amp = mode === 'idle' ? 0 : run ? 0.85 : 0.42;
      const mv = amp > 0 ? 1 : 0;
      p.hipL.rotation.x = -sw * amp;
      p.hipR.rotation.x = sw * amp * (1 - this.limp * 0.6);
      p.kneeL.rotation.x = 0.12 + Math.max(0, cw) * amp * 1.4;
      p.kneeR.rotation.x = 0.12 + Math.max(0, -cw) * amp * 1.4 + this.limp * 0.2;
      p.ankleL.rotation.x = -Math.max(0, -cw) * amp * 0.4; p.ankleR.rotation.x = -Math.max(0, cw) * amp * 0.4 + this.limp * 0.25;
      p.hipR.rotation.z = this.limp * 0.12;
      hipsY -= (Math.abs(cw) * (run ? 0.06 : 0.035) + this.limp * Math.max(0, -sw) * 0.06) * mv;
      p.hips.rotation.z = sw * (0.05 + this.limp * 0.08) * (mv ? 1 : 0.3);
      p.hips.rotation.y = sw * 0.08;
      const lean = run ? 0.42 : this.hunch;
      p.torso.rotation.x = damp(p.torso.rotation.x, lean + att * 0.35, 6, dt);
      p.torso.rotation.y = -sw * (run ? 0.25 : 0.12);
      p.torso.rotation.z = this.tilt * 0.4 + (mode === 'idle' ? Math.sin(t * 0.8) * 0.04 : 0);
      p.neck.rotation.x = -lean * 0.35;
      p.head.rotation.x = -lean * 0.45 + Math.sin(t * 1.3) * 0.05;
      p.head.rotation.z = this.tilt + Math.sin(t * 1.7) * 0.08;
      p.head.rotation.y = Math.sin(t * 0.9) * 0.15;
      const dangle = (sh, el, hand, phase, sgn) => {
        sh.rotation.x = phase * 0.35 + 0.05; sh.rotation.z = sgn * 0.1;
        el.rotation.x = -0.25 - Math.max(0, phase) * 0.15; hand.rotation.x = 0.25;
      };
      if (this.armsOut && !run) {
        p.shL.rotation.x = -1.35 + Math.sin(t * 2.1) * 0.12 + sw * 0.08; p.shL.rotation.z = -0.1;
        p.elL.rotation.x = -0.25; p.handL.rotation.x = 0.35;
        if (this.oneArm) dangle(p.shR, p.elR, p.handR, -sw, 1);
        else { p.shR.rotation.x = -1.3 + Math.sin(t * 2.3 + 1) * 0.12 - sw * 0.08; p.shR.rotation.z = 0.1; p.elR.rotation.x = -0.35; p.handR.rotation.x = 0.4; }
      } else if (run) {
        p.shL.rotation.x = sw * 1.0 - 0.3; p.shR.rotation.x = -sw * 1.0 - 0.3;
        p.shL.rotation.z = -0.2; p.shR.rotation.z = 0.2;
        p.elL.rotation.x = -1.3; p.elR.rotation.x = -1.3;
        p.handL.rotation.x = 0.3; p.handR.rotation.x = 0.3;
      } else { dangle(p.shL, p.elL, p.handL, sw, -1); dangle(p.shR, p.elR, p.handR, -sw, 1); }
      p.jaw.rotation.x = 0.12 + Math.max(0, Math.sin(t * 7)) * 0.28;
      if (this.state === 'tearing' || this.state === 'windowWait') {
        const k = this.tearAnim || 0;
        const reach = Math.sin(t * 5) * 0.3;
        const pull = Math.sin(k * Math.PI);
        p.shL.rotation.x = -1.5 + reach - pull * 0.6; p.shR.rotation.x = -1.5 - reach - pull * 0.6;
        p.elL.rotation.x = -0.5 + pull * 0.4; p.elR.rotation.x = -0.4;
        p.torso.rotation.x = 0.25 - pull * 0.25;
      }
      if (att > 0) {
        const up = smoothstep(0, 0.4, att), down = smoothstep(0.4, 0.6, att), back = smoothstep(0.65, 1, att);
        const k = 1 - back;
        if (this.type === 'brute') {
          p.shL.rotation.x = lerp(p.shL.rotation.x, -2.9 * up + 2.6 * down, k); p.shR.rotation.x = lerp(p.shR.rotation.x, -2.9 * up + 2.6 * down, k);
          p.torso.rotation.x = lerp(p.torso.rotation.x, -0.3 * up + 0.9 * down, k);
        } else {
          p.shR.rotation.x = lerp(p.shR.rotation.x, -2.5 * up + 2.2 * down - 0.5, k);
          p.shR.rotation.z = lerp(0.1, 0.6 * up - 0.9 * down, k);
          p.elR.rotation.x = lerp(p.elR.rotation.x, -1.2 * up + 0.9 * down, k);
          p.shL.rotation.x = lerp(p.shL.rotation.x, -1.6, k * 0.7);
          p.torso.rotation.y = lerp(p.torso.rotation.y, -0.4 * up + 0.5 * down, k);
        }
        p.jaw.rotation.x = 0.55 * Math.sin(att * Math.PI);
      }
      // hit reactions
      if (this.react > 0) {
        const r = this.react * this.react, sg = this.reactSgn;
        switch (this.reactPart) {
          case 'head': p.head.rotation.x -= 0.9 * r * sg; p.neck.rotation.x -= 0.4 * r * sg; p.torso.rotation.x -= 0.15 * r * sg; break;
          case 'torso': p.torso.rotation.x -= 0.45 * r * sg; p.torso.rotation.y += 0.35 * r * this.reactSide; p.head.rotation.x += 0.3 * r * sg; break;
          case 'armL': p.shL.rotation.x += 0.9 * r; p.shL.rotation.z -= 0.5 * r; p.torso.rotation.y -= 0.3 * r; break;
          case 'armR': p.shR.rotation.x += 0.9 * r; p.shR.rotation.z += 0.5 * r; p.torso.rotation.y += 0.3 * r; break;
          case 'legL': p.kneeL.rotation.x += 0.8 * r; hipsY -= 0.08 * r; p.hips.rotation.z -= 0.15 * r; break;
          case 'legR': p.kneeR.rotation.x += 0.8 * r; hipsY -= 0.08 * r; p.hips.rotation.z += 0.15 * r; break;
        }
      }
      if (this.stumble > 0) { hipsY -= this.stumble * 0.08; p.torso.rotation.x += this.stumble * 0.3; }
      if (this.shockT > 0) { p.torso.rotation.x -= this.shockT * 2; p.head.rotation.x -= this.shockT * 3; }
    } else if (mode === 'rise') {
      const k = Math.min(1, this.t / 1.7);
      p.shL.rotation.x = -2.8 + Math.sin(t * 9) * 0.3; p.shR.rotation.x = -2.6 + Math.sin(t * 8 + 1) * 0.3;
      p.elL.rotation.x = -0.5; p.elR.rotation.x = -0.6;
      p.torso.rotation.x = 0.4 * (1 - k); p.head.rotation.x = -0.4;
      p.hipL.rotation.x = -0.4 * (1 - k); p.kneeL.rotation.x = 0.8 * (1 - k);
      p.jaw.rotation.x = 0.5;
    } else if (mode === 'climb') {
      const k = v;
      p.hipL.rotation.x = -1.4 * Math.sin(Math.min(1, k * 1.6) * Math.PI);
      p.hipR.rotation.x = -1.4 * Math.sin(clamp(k * 1.6 - 0.6, 0, 1) * Math.PI);
      p.kneeL.rotation.x = 1.4 * Math.sin(k * Math.PI); p.kneeR.rotation.x = 1.2 * Math.sin(k * Math.PI);
      p.torso.rotation.x = 0.7 * Math.sin(k * Math.PI);
      p.shL.rotation.x = -1.8; p.shR.rotation.x = -1.6;
      p.elL.rotation.x = -0.6; p.elR.rotation.x = -0.6;
    }
    p.hips.position.y = hipsY;
  }

  animateCrawl(dt, v, att) {
    const p = this.p, t = this.t + this.seed;
    this.phase += v * dt * 3;
    const sw = Math.sin(this.phase);
    p.hips.position.y = damp(p.hips.position.y, 0.22, 8, dt);
    p.hips.rotation.x = damp(p.hips.rotation.x, 1.35, 8, dt);
    p.torso.rotation.x = 0.1;
    p.neck.rotation.x = -0.5;
    p.head.rotation.x = -0.8 + Math.sin(t * 2) * 0.1;
    p.shL.rotation.x = -2.2 + sw * 0.7; p.shR.rotation.x = -2.2 - sw * 0.7;
    p.elL.rotation.x = -0.4 - Math.max(0, sw) * 0.6; p.elR.rotation.x = -0.4 - Math.max(0, -sw) * 0.6;
    p.hipL.rotation.x = 0.1; p.hipR.rotation.x = 0.1;
    p.jaw.rotation.x = 0.3 + Math.max(0, Math.sin(t * 8)) * 0.3;
    if (att > 0) p.shR.rotation.x = -2.6 + Math.sin(att * Math.PI) * 1.2;
  }

  updateDead(dt) {
    if (this.rig) { this.updateDeadRig(dt); return; }
    this.deadT += dt;
    const p = this.p, k = this.deadT;
    const g = this.game;
    if (this.impulse.lengthSq() > 0.001) {
      this.pos.addScaledVector(this.impulse, dt);
      this.impulse.multiplyScalar(Math.exp(-5 * dt));
      g.level.collide(this.pos, 0.3, 0.1, 1.0, 'zombie');
    }
    if (this.pos.y > 0 && k < 1) this.pos.y = Math.max(0, this.pos.y - dt * 4);
    if (this.neckBleed > 0) {
      this.neckBleed -= dt;
      boneWorld(p.neck, _a, 0, 0.1, 0);
      for (let i = 0; i < 2; i++) g.effects.alpha.emit(_a.x, _a.y, _a.z, rand(-0.8, 0.8), rand(1.5, 3.5), rand(-0.8, 0.8), { life: 0.6, size: rand(0.03, 0.07), color: [0.4, 0.01, 0.01], gravity: 9.8 });
    }
    if (this.shockDeath > 0) {
      this.shockDeath -= dt;
      p.torso.rotation.x = Math.sin(k * 60) * 0.25; p.torso.rotation.z = Math.cos(k * 53) * 0.2;
      p.shL.rotation.x = -1.5 + Math.sin(k * 70) * 0.8; p.shR.rotation.x = -1.5 + Math.cos(k * 65) * 0.8;
      if (Math.random() < 0.4) { boneWorld(p.torso, _a, 0, 0.35, 0); g.effects.electric(_a, 2); }
      this.deadT = 0;
      return;
    }
    const d = this.deathPose, f = this.fallDir;
    if (this.crawler) {
      p.hips.position.y = damp(p.hips.position.y, 0.14, 6, dt);
      p.shL.rotation.x = damp(p.shL.rotation.x, d.arms[0], 4, dt);
      p.shR.rotation.x = damp(p.shR.rotation.x, d.arms[1], 4, dt);
      p.head.rotation.x = damp(p.head.rotation.x, -0.2, 4, dt);
    } else {
      const e1 = smoothstep(0, 0.35, k), e2 = smoothstep(0.15, 0.85, k);
      const a = Math.min(1, dt * 15), b = Math.min(1, dt * 6);
      p.kneeL.rotation.x = lerp(p.kneeL.rotation.x, 1.2 * e1 * (1 - e2) + 0.3 * e2, a);
      p.kneeR.rotation.x = lerp(p.kneeR.rotation.x, 1.1 * e1 * (1 - e2) + 0.4 * e2, a);
      p.hipL.rotation.x = lerp(p.hipL.rotation.x, -0.9 * e1 * (1 - e2) + d.legs[0] * e2, a);
      p.hipR.rotation.x = lerp(p.hipR.rotation.x, -0.8 * e1 * (1 - e2) + d.legs[1] * e2, a);
      p.hips.position.y = lerp(this.hipsBaseY, this.hipsBaseY - 0.35, e1) * (1 - e2) + 0.17 * e2;
      p.hips.rotation.x = f * 1.48 * e2 * e2;
      p.hips.rotation.z = d.twist * e2;
      p.torso.rotation.x = lerp(p.torso.rotation.x, f * 0.1, b);
      p.torso.rotation.y = lerp(p.torso.rotation.y, 0, b);
      p.shL.rotation.x = lerp(p.shL.rotation.x, f > 0 ? -2.8 : d.arms[0], b * 0.8);
      p.shR.rotation.x = lerp(p.shR.rotation.x, f > 0 ? -2.6 : d.arms[1], b * 0.8);
      p.shL.rotation.z = lerp(p.shL.rotation.z, -0.6, b); p.shR.rotation.z = lerp(p.shR.rotation.z, 0.6, b);
      p.elL.rotation.x = lerp(p.elL.rotation.x, -0.3, b); p.elR.rotation.x = lerp(p.elR.rotation.x, -0.2, b);
      p.neck.rotation.x = lerp(p.neck.rotation.x, 0, b);
      p.head.rotation.x = lerp(p.head.rotation.x, f * 0.4, b);
      p.head.rotation.y = lerp(p.head.rotation.y, d.head, b * 0.5);
      p.jaw.rotation.x = lerp(p.jaw.rotation.x, 0.5, b);
      if (k > 0.75 && !this.thudded) {
        this.thudded = true;
        g.audio.noise({ dur: 0.15, type: 'lowpass', freq: 250, gain: 0.45, pos: this.pos.clone(), rev: 0.1 });
        boneWorld(p.torso, _a, 0, 0.25, 0);
        g.effects.bloodPool(_a.x, _a.z, this.headless ? 1.6 : 1.1);
      }
    }
    if (k > 8) this.pos.y -= dt * 0.25;
    if (k > 10.5) this.remove = true;
  }

  updateDeadRig(dt) {
    this.deadT += dt;
    const g = this.game, k = this.deadT;
    this.rig.update(dt, true, null);
    if (this.neckBleed > 0) {
      this.neckBleed -= dt;
      this.J('neck', _a);
      for (let i = 0; i < 2; i++) g.effects.alpha.emit(_a.x, _a.y, _a.z, rand(-0.8, 0.8), rand(1.5, 3.5), rand(-0.8, 0.8), { life: 0.6, size: rand(0.03, 0.07), color: [0.4, 0.01, 0.01], gravity: 9.8 });
    }
    if (this.shockDeath > 0) {
      this.shockDeath -= dt;
      if (Math.random() < 0.5) { this.J('torso', _a); g.effects.electric(_a, 2); }
    }
    if (!this.thudded && this.rig.ragdoll && this.rig.ragdoll.landed) {
      this.thudded = true;
      g.audio.noise({ dur: 0.15, type: 'lowpass', freq: 250, gain: 0.45, pos: this.pos.clone(), rev: 0.1 });
    }
    if (!this.pooled && k > 1.2) {
      this.pooled = true;
      this.J('torso', _a);
      g.effects.bloodPool(_a.x, _a.z, this.headless ? 1.6 : 1.1);
    }
    if (k > 8) this.root.position.y -= dt * 0.25;
    if (k > 10.5) this.remove = true;
  }

  applyRig(dt, mode, v) {
    if (!this.rig) return;
    const full = mode === 'rise' || mode === 'climb' || this.crawler;
    let loco = null;
    if (!full) {
      if (mode === 'move') {
        const run = this.run || this.charge > 0;
        loco = run ? { run: 1, runScale: clamp(v / 3.6, 0.6, 1.45) } : { walk: 1, walkScale: clamp(v / 1.5, 0.45, 1.25) * (1 - this.limp * 0.2) };
      } else loco = { idle: 1 };
    }
    this.rig.update(dt, full, loco);
  }

  dispose() {
    this.game.scene.remove(this.root);
    if (this.rig) this.rig.dispose();
    else this.mesh.skeleton.dispose();
  }
}

export class ZombieManager {
  constructor(game) {
    this.game = game;
    this.zombies = [];
    this.navT = 0;
    this._hits = [];
  }

  spawn(type, hp, speed, forceRise = false) {
    const g = this.game, L = g.level, pp = g.player.pos;
    const z = new Zombie(this, type, hp, speed);
    const openZones = L.zones.filter((zn) => zn.open).map((zn) => zn.id);
    const wins = L.windows.filter((w) => openZones.includes(w.zone));
    const rises = L.spawners.filter((s) => openZones.includes(s.zone) && s.pos.distanceTo(pp) > 7);
    const score = (p) => { const d = p.distanceTo(pp); return d < 6 ? 0.1 : 1 / (1 + Math.max(0, d - 10) * 0.15); };
    const pickWeighted = (arr, posOf) => {
      let tot = 0;
      const w = arr.map((a) => { const s = score(posOf(a)) * rand(0.5, 1.5); tot += s; return s; });
      let r = Math.random() * tot;
      for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    };
    const useRise = forceRise || type === 'brute' || !wins.length || (rises.length && chance(0.35));
    if (useRise && rises.length) z.spawnRise(pickWeighted(rises, (s) => s.pos).pos);
    else if (wins.length) z.spawnAtWindow(pickWeighted(wins, (w) => w.pos));
    else z.spawnRise(new THREE.Vector3(rand(-8, 8), 0, rand(-8, 8)));
    this.zombies.push(z);
    return z;
  }

  onDeath(z, head, src) { this.game.onZombieKilled(z, head, src); }

  get aliveCount() { let n = 0; for (const z of this.zombies) if (z.alive) n++; return n; }

  update(dt) {
    const g = this.game, player = g.player;
    this.navT -= dt;
    if (this.navT <= 0) { this.navT = 0.2; g.level.nav.compute(player.pos.x, player.pos.z); }
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      z.update(dt, player);
      if (z.remove) { z.dispose(); this.zombies.splice(i, 1); }
    }
    // cap corpse count for performance
    let dead = 0;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (!z.alive && ++dead > 14 && z.deadT < 8) z.deadT = 8;
    }
  }
  postUpdate() { for (const z of this.zombies) z.root.updateMatrixWorld(true); }

  // sorted list of zombie hits along a ray
  raycast(o, d, maxT) {
    const hits = this._hits; hits.length = 0;
    for (const z of this.zombies) {
      const h = z.hitTest(o, d, maxT);
      if (h) hits.push({ zombie: z, t: h.t, part: h.part, sub: h.sub });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
  }

  clear() {
    for (const z of this.zombies) z.dispose();
    this.zombies = [];
    for (const w of this.game.level.windows) { w.occupant = null; w.queue.length = 0; }
  }
}
