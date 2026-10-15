import * as THREE from 'three';
import { buildZombie } from './zombieModel.js';
import { rand, clamp, angleDiff, lerp, damp, chance, smoothstep } from '../core/utils.js';

const _d = { x: 0, z: 0, d: 0 };
const UP = new THREE.Vector3(0, 1, 0);

export class Zombie {
  constructor(mgr, type, hp, speed) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    const m = buildZombie(this.game.textures, type);
    this.root = m.root; this.p = m.parts; this.meshes = m.meshes; this.helmet = m.helmet; this.headMesh = m.headMesh; this.scale = m.scale;
    for (const mesh of this.meshes) mesh.userData.zombie = this;
    this.hp = hp; this.maxHp = hp;
    this.speed = speed;
    this.run = speed > 2.2;
    this.state = 'idle';
    this.t = 0;
    this.phase = Math.random() * 10;
    this.seed = Math.random() * 100;
    this.limp = Math.random() < 0.35 ? rand(0.3, 0.8) : 0;
    this.armsOut = !this.run && Math.random() < 0.65;
    this.tilt = rand(-0.25, 0.25);
    this.hunch = rand(0.05, 0.35);
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
    this.helmetHp = type === 'brute' ? hp * 0.25 : hp * 0.6;
    this.window = null;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.charge = 0; this.chargeCd = rand(3, 6);
    this.footT = 0;
    this.fallDir = -1;
    this.impulse = new THREE.Vector3();
    this.hipsBaseY = 0.95;
    this.shockT = 0;
    this.tearAnim = 0;
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

  damage(amount, part, point, dir, src = {}) {
    if (!this.alive) return { killed: false };
    const g = this.game;
    const head = part === 'head';
    if (this.state === 'rising' && this.t < 0.6) amount *= 0.5;
    if (head && this.helmet && src.kind === 'bullet') {
      this.helmetHp -= amount;
      amount *= 0.35;
      if (this.helmetHp <= 0) {
        const hp = new THREE.Vector3(); this.helmet.getWorldPosition(hp);
        g.effects.gib(this.helmet, hp, new THREE.Vector3(dir.x * 3, 4, dir.z * 3), this.scale * 1.08);
        this.helmet.visible = false; this.helmet.userData.part = null;
        this.helmet = null;
      }
      g.audio.ricochet(point.clone());
    }
    if (g.powerups.active.instakill > 0) amount = this.type === 'brute' ? amount * 3 : this.hp + 1;
    this.hp -= amount;
    this.shockT = 0.12;
    if (this.state === 'chase' || this.state === 'attack') {
      this.impulse.addScaledVector(dir, Math.min(1.5, (amount / this.maxHp) * 4) * (this.type === 'brute' ? 0.2 : 1));
    }
    if (part === 'limb' && amount > 160 && chance(0.25) && this.hp > 0) this.loseArm(dir);
    if (this.hp <= 0) {
      this.die(dir, head, src);
      return { killed: true, head };
    }
    if (src.kind === 'explosion' && !this.crawler && this.type !== 'brute' && chance(0.35)) this.makeCrawler();
    return { killed: false, head };
  }

  loseArm(dir) {
    const side = Math.random() < 0.5 ? this.p.elL : this.p.elR;
    if (!side.visible) return;
    const wp = new THREE.Vector3(); side.getWorldPosition(wp);
    this.game.effects.gib(side, wp, new THREE.Vector3(dir.x * 3 + rand(-1, 1), 3, dir.z * 3 + rand(-1, 1)), this.scale);
    side.visible = false;
    side.children.forEach((c) => { c.userData.part = null; });
    this.game.effects.bloodSpray(wp, dir, 1.5, true);
    this.armsOut = false;
  }

  makeCrawler() {
    this.crawler = true;
    for (const k of [this.p.kneeL, this.p.kneeR]) {
      const wp = new THREE.Vector3(); k.getWorldPosition(wp);
      this.game.effects.gib(k, wp, new THREE.Vector3(rand(-3, 3), rand(2, 5), rand(-3, 3)), this.scale);
      k.visible = false;
      k.children.forEach((c) => (c.userData.part = null));
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
    this.deathPose = { arms: [rand(-2.8, -0.4), rand(-2.8, -0.4)], twist: rand(-0.5, 0.5), legs: [rand(-0.6, 0.2), rand(-0.6, 0.2)] };
    for (const m of this.meshes) m.userData.part = null;
    if (head && !this.headless && src.kind !== 'melee' && (chance(0.55) || src.weapon?.type === 'sniper' || src.weapon?.type === 'shotgun')) {
      const hp = new THREE.Vector3(); this.headMesh.getWorldPosition(hp);
      g.effects.gib(this.p.head, hp, new THREE.Vector3(dir.x * 3 + rand(-1, 1), rand(3, 5), dir.z * 3 + rand(-1, 1)), this.scale);
      this.p.head.visible = false;
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
    this.mgr.onDeath(this, head, src);
  }

  update(dt, player) {
    this.t += dt;
    const g = this.game;
    const pp = player.pos;
    if (this.state === 'dead') { this.updateDead(dt); return; }
    if (this.shockT > 0) this.shockT -= dt;
    const dx = pp.x - this.pos.x, dz = pp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.voiceT -= dt;
    if (this.voiceT <= 0 && dist < 30) {
      this.voiceT = rand(2.5, 6);
      g.audio.zombieVoice(this.pos.clone().setY(1.6), this.run && dist < 12 && chance(0.5) ? 'scream' : 'groan', this.type === 'brute' ? 0.55 : rand(0.9, 1.15));
    }
    let moving = 0;
    switch (this.state) {
      case 'rising': {
        const k = Math.min(1, this.t / 1.7);
        this.pos.y = -1.9 * (1 - smoothstep(0, 1, k));
        if (Math.random() < 0.3) g.effects.dirtBurst(this.pos, 2);
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
        const side = new THREE.Vector3(-w.normal.z, 0, w.normal.x);
        const tgt = w.outside.clone().addScaledVector(w.normal, -0.9 - idx * 0.5).addScaledVector(side, (idx % 2 ? 1 : -1) * 0.7);
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
          if (this.game.level.tearBoard(w)) { g.audio.boardTear(w.pos.clone().setY(1.5)); this.tearAnim = 0.001; }
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
          const dmg = this.type === 'brute' ? 75 : this.crawler ? 30 : 45;
          player.damage(dmg, this.pos);
          g.audio.swipe(pp.clone());
        }
        if (this.type === 'brute') {
          g.effects.dirtBurst(this.pos.clone().addScaledVector(this.dir, 1.2), 30);
          g.shake(canHit ? 0.8 : 0.4);
          g.audio.bruteSlam(this.pos.clone());
        }
      }
      if (this.attackT >= 1) { this.attackT = 0; if (this.state === 'attack') this.state = 'chase'; }
    }
    if (moving > 0.5 && dist < 18) {
      this.footT -= dt * moving;
      if (this.footT <= 0) {
        this.footT = 0.75;
        if (chance(0.5)) g.audio.noise({ dur: 0.08, type: 'lowpass', freq: this.type === 'brute' ? 200 : 380, gain: this.type === 'brute' ? 0.5 : 0.18, pos: this.pos.clone(), rev: 0.1 });
      }
    }
    if (this.tearAnim > 0) { this.tearAnim += dt * 1.6; if (this.tearAnim >= 1) this.tearAnim = 0; }
    this.animate(dt, moving > 0.1 ? 'move' : 'idle', moving);
  }

  chase(dt, player, dist, dx, dz) {
    const g = this.game;
    const nav = g.level.nav;
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.25; this.hasLos = dist < 14 && nav.los(this.pos.x, this.pos.z, player.pos.x, player.pos.z); }
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
      p.hipL.rotation.x = -sw * amp;
      p.hipR.rotation.x = sw * amp * (1 - this.limp * 0.6);
      p.kneeL.rotation.x = 0.1 + Math.max(0, cw) * amp * 1.4;
      p.kneeR.rotation.x = 0.1 + Math.max(0, -cw) * amp * 1.4 + this.limp * 0.2;
      hipsY -= Math.abs(cw) * (run ? 0.06 : 0.035) * (amp > 0 ? 1 : 0) + this.limp * Math.max(0, -sw) * 0.06 * (amp > 0 ? 1 : 0);
      p.hips.rotation.z = sw * (0.05 + this.limp * 0.08) * (amp > 0 ? 1 : 0.3);
      p.hips.rotation.y = sw * 0.08;
      const lean = run ? 0.42 : this.hunch;
      p.torso.rotation.x = damp(p.torso.rotation.x, lean + att * 0.35, 6, dt);
      p.torso.rotation.y = -sw * (run ? 0.25 : 0.12);
      p.torso.rotation.z = this.tilt * 0.4;
      p.head.rotation.x = -lean * 0.7 + Math.sin(t * 1.3) * 0.05;
      p.head.rotation.z = this.tilt + Math.sin(t * 1.7) * 0.08;
      p.head.rotation.y = Math.sin(t * 0.9) * 0.15;
      if (this.armsOut && !run) {
        p.shL.rotation.x = -1.35 + Math.sin(t * 2.1) * 0.12 + sw * 0.08; p.shR.rotation.x = -1.3 + Math.sin(t * 2.3 + 1) * 0.12 - sw * 0.08;
        p.shL.rotation.z = -0.1; p.shR.rotation.z = 0.1;
        p.elL.rotation.x = -0.25; p.elR.rotation.x = -0.35;
      } else if (run) {
        p.shL.rotation.x = sw * 1.0 - 0.3; p.shR.rotation.x = -sw * 1.0 - 0.3;
        p.shL.rotation.z = -0.2; p.shR.rotation.z = 0.2;
        p.elL.rotation.x = -1.3; p.elR.rotation.x = -1.3;
      } else {
        p.shL.rotation.x = sw * 0.35 + 0.05; p.shR.rotation.x = -sw * 0.35 + 0.05;
        p.shL.rotation.z = -0.12; p.shR.rotation.z = 0.12;
        p.elL.rotation.x = -0.2; p.elR.rotation.x = -0.25;
      }
      p.jaw.rotation.x = 0.15 + Math.max(0, Math.sin(t * 7)) * 0.3;
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
        const raise = -2.5 * up + 2.2 * down;
        const k = 1 - back;
        if (this.type === 'brute') {
          p.shL.rotation.x = lerp(p.shL.rotation.x, -2.9 * up + 2.6 * down, k); p.shR.rotation.x = lerp(p.shR.rotation.x, -2.9 * up + 2.6 * down, k);
          p.torso.rotation.x = lerp(p.torso.rotation.x, -0.3 * up + 0.9 * down, k);
        } else {
          p.shR.rotation.x = lerp(p.shR.rotation.x, raise - 0.5, k);
          p.shR.rotation.z = lerp(0.1, 0.6 * up - 0.9 * down, k);
          p.elR.rotation.x = lerp(p.elR.rotation.x, -1.2 * up + 0.9 * down, k);
          p.shL.rotation.x = lerp(p.shL.rotation.x, -1.6, k * 0.7);
          p.torso.rotation.y = lerp(p.torso.rotation.y, -0.4 * up + 0.5 * down, k);
        }
        p.jaw.rotation.x = 0.55 * Math.sin(att * Math.PI);
      }
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
    p.head.rotation.x = -1.2 + Math.sin(t * 2) * 0.1;
    p.shL.rotation.x = -2.2 + sw * 0.7; p.shR.rotation.x = -2.2 - sw * 0.7;
    p.elL.rotation.x = -0.4 - Math.max(0, sw) * 0.6; p.elR.rotation.x = -0.4 - Math.max(0, -sw) * 0.6;
    p.hipL.rotation.x = 0.1; p.hipR.rotation.x = 0.1;
    p.jaw.rotation.x = 0.3 + Math.max(0, Math.sin(t * 8)) * 0.3;
    if (att > 0) p.shR.rotation.x = -2.6 + Math.sin(att * Math.PI) * 1.2;
  }

  updateDead(dt) {
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
      const np = new THREE.Vector3(); p.neck.getWorldPosition(np);
      for (let i = 0; i < 2; i++) g.effects.alpha.emit(np.x, np.y, np.z, rand(-0.8, 0.8), rand(1.5, 3.5), rand(-0.8, 0.8), { life: 0.6, size: rand(0.03, 0.07), color: [0.4, 0.01, 0.01], gravity: 9.8 });
    }
    if (this.shockDeath > 0) {
      this.shockDeath -= dt;
      p.torso.rotation.x = Math.sin(k * 60) * 0.25; p.torso.rotation.z = Math.cos(k * 53) * 0.2;
      p.shL.rotation.x = -1.5 + Math.sin(k * 70) * 0.8; p.shR.rotation.x = -1.5 + Math.cos(k * 65) * 0.8;
      if (Math.random() < 0.5) { const hp = new THREE.Vector3(); p.torso.getWorldPosition(hp); hp.y += 0.4 * this.scale; g.effects.electric(hp, 2); }
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
      const a = Math.min(1, dt * 15);
      p.kneeL.rotation.x = lerp(p.kneeL.rotation.x, 1.2 * e1 * (1 - e2) + 0.3 * e2, a);
      p.kneeR.rotation.x = lerp(p.kneeR.rotation.x, 1.1 * e1 * (1 - e2) + 0.4 * e2, a);
      p.hipL.rotation.x = lerp(p.hipL.rotation.x, -0.9 * e1 * (1 - e2) + d.legs[0] * e2, a);
      p.hipR.rotation.x = lerp(p.hipR.rotation.x, -0.8 * e1 * (1 - e2) + d.legs[1] * e2, a);
      p.hips.position.y = lerp(this.hipsBaseY, this.hipsBaseY - 0.35, e1) * (1 - e2) + 0.17 * e2;
      p.hips.rotation.x = f * 1.48 * e2 * e2;
      p.hips.rotation.z = d.twist * e2;
      const b = Math.min(1, dt * 6);
      p.torso.rotation.x = lerp(p.torso.rotation.x, f * 0.1, b);
      p.torso.rotation.y = lerp(p.torso.rotation.y, 0, b);
      p.shL.rotation.x = lerp(p.shL.rotation.x, f > 0 ? -2.8 : d.arms[0], b * 0.8);
      p.shR.rotation.x = lerp(p.shR.rotation.x, f > 0 ? -2.6 : d.arms[1], b * 0.8);
      p.shL.rotation.z = lerp(p.shL.rotation.z, -0.6, b); p.shR.rotation.z = lerp(p.shR.rotation.z, 0.6, b);
      p.elL.rotation.x = lerp(p.elL.rotation.x, -0.3, b); p.elR.rotation.x = lerp(p.elR.rotation.x, -0.2, b);
      p.head.rotation.x = lerp(p.head.rotation.x, f * 0.4, b);
      p.head.rotation.y = lerp(p.head.rotation.y, d.twist * 2, b * 0.5);
      p.jaw.rotation.x = lerp(p.jaw.rotation.x, 0.5, b);
      if (k > 0.75 && !this.thudded) {
        this.thudded = true;
        g.audio.noise({ dur: 0.15, type: 'lowpass', freq: 250, gain: 0.45, pos: this.pos.clone(), rev: 0.1 });
        if (chance(0.7)) g.effects.bloodFloor(this.pos.x + rand(-0.4, 0.4), this.pos.z + rand(-0.4, 0.4), 1.1);
      }
    }
    if (k > 5) this.pos.y -= dt * 0.25;
    if (k > 7.5) this.remove = true;
  }

  dispose() { this.game.scene.remove(this.root); }
}

export class ZombieManager {
  constructor(game) {
    this.game = game;
    this.zombies = [];
    this.navT = 0;
    this.hitList = [];
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
  }
  postUpdate() { for (const z of this.zombies) z.root.updateMatrixWorld(true); }

  hittable() {
    const list = this.hitList; list.length = 0;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      for (const m of z.meshes) if (m.userData.part && m.visible && m.parent.visible) list.push(m);
    }
    return list;
  }

  clear() {
    for (const z of this.zombies) z.dispose();
    this.zombies = [];
    for (const w of this.game.level.windows) { w.occupant = null; w.queue.length = 0; }
  }
}
