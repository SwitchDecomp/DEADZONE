import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/utils.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.reset({ x: 0, z: 0, yaw: 0 });
  }

  reset(s) {
    this.pos.set(s.x, 0, s.z);
    this.vel.set(0, 0, 0);
    this.yaw = s.yaw || 0; this.pitch = 0;
    this.recoilP = 0; this.recoilY = 0;
    this.eye = 1.65; this.eyeTarget = 1.65;
    this.grounded = true;
    this.crouching = false;
    this.sprinting = false;
    this.sliding = 0; this.slideDir = new THREE.Vector3();
    this.stamina = 1;
    this.sprintLock = false;
    this.bob = 0; this.bobAmt = 0; this.lastStep = 0;
    this.landDip = 0; this.landVel = 0;
    this.maxHealth = 100; this.health = 100;
    this.lastHit = -10;
    this.alive = true;
    this.downed = false; this.downT = 0;
    this.perks = new Set();
    this.time = 0;
    this.moveSpeed = 0;
    this.zone = 0;
    this.heartbeatT = 0;
  }

  get speedMul() { return this.perks.has('swiftstep') ? 1.12 : 1; }

  addRecoil(p, y) { this.recoilP += p; this.recoilY += y; }

  update(dt, input, settings) {
    const g = this.game;
    this.time += dt;
    const canMove = this.alive && !this.downed;
    if (canMove) {
      const ads = g.weapons.adsAmount;
      const sens = settings.sens * 0.0022 * lerp(1, settings.adsSens / (g.weapons.zoom || 1), ads);
      this.yaw -= input.mouse.dx * sens;
      this.pitch -= input.mouse.dy * sens * (settings.invert ? -1 : 1);
    }
    const rp = this.recoilP * Math.min(1, dt * 9), ry = this.recoilY * Math.min(1, dt * 9);
    this.pitch += rp; this.yaw += ry;
    this.recoilP -= rp; this.recoilY -= ry;
    this.pitch = clamp(this.pitch, -1.5, 1.5);

    let fx = 0, fz = 0;
    if (canMove) {
      if (input.down('KeyW')) fz -= 1;
      if (input.down('KeyS')) fz += 1;
      if (input.down('KeyA')) fx -= 1;
      if (input.down('KeyD')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = fx * cy + fz * sy, wz = -fx * sy + fz * cy;
    const wantSprint = canMove && (input.down('ShiftLeft') || input.down('ShiftRight')) && fz < 0 && !g.weapons.isADS && !this.crouching;
    const crouchKey = canMove && input.down('KeyC');
    if (crouchKey && this.sprinting && this.grounded && this.sliding <= 0 && input.hit('KeyC')) {
      this.sliding = 0.75;
      this.slideDir.set(wx, 0, wz).normalize();
      g.audio.noise({ dur: 0.6, type: 'bandpass', freq: 600, q: 0.8, gain: 0.25, rev: 0.1 });
      g.shake(0.1);
    }
    this.crouching = crouchKey;
    const staminaMax = this.perks.has('swiftstep') ? 10 : 6;
    if (wantSprint && !this.sprintLock && len > 0) {
      this.sprinting = true;
      this.stamina -= dt / staminaMax;
      if (this.stamina <= 0) { this.stamina = 0; this.sprintLock = true; }
    } else {
      this.sprinting = false;
      this.stamina = Math.min(1, this.stamina + dt / 3);
      if (this.stamina > 0.95 || !(input.down('ShiftLeft') || input.down('ShiftRight'))) this.sprintLock = false;
    }
    let target = 4.4;
    if (this.sprinting) target = 7.0;
    if (this.crouching) target = 2.3;
    target *= this.speedMul * g.weapons.moveMul;
    if (g.weapons.isADS) target *= 0.6;
    if (this.sliding > 0) {
      this.sliding -= dt;
      const k = Math.max(0, this.sliding / 0.75);
      this.vel.x = this.slideDir.x * (3 + 6.5 * k); this.vel.z = this.slideDir.z * (3 + 6.5 * k);
    } else {
      const accel = this.grounded ? 14 : 2.5;
      this.vel.x = damp(this.vel.x, wx * target, accel, dt);
      this.vel.z = damp(this.vel.z, wz * target, accel, dt);
    }
    if (canMove && input.hit('Space') && this.grounded) {
      this.vel.y = 5.4; this.grounded = false; this.sliding = 0;
      g.audio.noise({ dur: 0.08, type: 'lowpass', freq: 500, gain: 0.15 });
    }
    this.vel.y -= 16 * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= 0) {
      if (!this.grounded) {
        const impact = -this.vel.y;
        if (impact > 3) { this.landVel = -impact * 0.03; g.audio.land(impact / 5); }
      }
      this.pos.y = 0; this.vel.y = 0; this.grounded = true;
    }
    g.level.collide(this.pos, 0.35, this.pos.y + 0.1, this.pos.y + 1.7, 'player');
    this.moveSpeed = Math.hypot(this.vel.x, this.vel.z);

    this.eyeTarget = this.downed ? 0.5 : this.sliding > 0 ? 0.95 : this.crouching ? 1.1 : 1.65;
    this.eye = damp(this.eye, this.eyeTarget, 12, dt);
    {
      const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
      for (let i = 0; i < steps; i++) { this.landVel += (-this.landDip * 120 - this.landVel * 14) * h; this.landDip += this.landVel * h * 10; }
      this.landDip = clamp(this.landDip, -0.2, 0.1);
    }
    const bobSpeed = this.grounded && this.sliding <= 0 ? this.moveSpeed : 0;
    this.bob += dt * bobSpeed * (this.sprinting ? 1.45 : 1.75);
    this.bobAmt = damp(this.bobAmt, Math.min(1, bobSpeed / 5), 8, dt);
    const adsK = 1 - g.weapons.adsAmount * 0.85;
    const bobY = Math.abs(Math.sin(this.bob)) * 0.045 * this.bobAmt * adsK * (this.sprinting ? 1.6 : 1);
    const bobX = Math.cos(this.bob) * 0.025 * this.bobAmt * adsK;
    const stepPhase = Math.floor(this.bob / Math.PI);
    if (stepPhase !== this.lastStep) {
      this.lastStep = stepPhase;
      if (bobSpeed > 1) g.audio.footstep(g.level.surfaceAt(this.pos.x, this.pos.z), this.sprinting, this.crouching);
    }
    const cam = this.camera;
    const shake = g.shakeOffset;
    cam.position.set(this.pos.x + bobX * cy, this.pos.y + this.eye - bobY + this.landDip, this.pos.z - bobX * sy);
    cam.rotation.order = 'YXZ';
    const tilt = this.downed ? 0.4 : (this.sliding > 0 ? 0.08 : 0) - fx * 0.012 * this.bobAmt;
    cam.rotation.set(this.pitch + shake.x, this.yaw + shake.y, tilt + shake.z + Math.sin(this.bob * 0.5) * 0.004 * this.bobAmt);

    if (this.alive && !this.downed) {
      if (this.time - this.lastHit > 4 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 70 * dt);
      const low = this.health / this.maxHealth;
      if (low < 0.4) {
        this.heartbeatT -= dt;
        if (this.heartbeatT <= 0) { this.heartbeatT = 0.9; g.audio.heartbeat(0.5 * (1 - low)); }
      }
    }
    if (this.downed) {
      this.downT -= dt;
      if (this.downT <= 0) this.revive();
    }
    const z = g.level.zoneAt(this.pos.x, this.pos.z);
    if (z >= 0 && z !== this.zone) { this.zone = z; g.hud.zone(g.level.zones[z].name); }
  }

  damage(amount, from) {
    if (!this.alive || this.downed || this.game.godMode) return;
    const g = this.game;
    this.health -= amount;
    this.lastHit = this.time;
    g.audio.hurt();
    g.shake(0.35);
    g.hud.hurt(amount / this.maxHealth);
    if (from) {
      const ang = Math.atan2(from.x - this.pos.x, from.z - this.pos.z);
      g.hud.damageDir(ang - this.yaw);
    }
    if (this.health <= 0) {
      this.health = 0;
      if (this.perks.has('secondwind')) this.goDown();
      else this.die();
    }
  }

  goDown() {
    this.downed = true; this.downT = 4;
    this.perks.delete('secondwind');
    this.game.hud.setPerks(this.perks);
    this.game.hud.downed(true);
    this.game.audio.tinnitus(3);
  }
  revive() {
    const g = this.game;
    this.downed = false;
    this.health = this.maxHealth;
    g.hud.downed(false);
    for (const z of g.zombies.zombies) {
      if (!z.alive) continue;
      const d = z.pos.distanceTo(this.pos);
      if (d < 6) z.impulse.add(z.pos.clone().sub(this.pos).setY(0).normalize().multiplyScalar(8 / (1 + d)));
    }
    g.effects.electric(this.pos.clone().setY(1), 40);
    g.audio.powerupGrab();
    g.hud.banner('SECOND WIND', 'BACK ON YOUR FEET');
  }
  die() {
    this.alive = false;
    this.game.onPlayerDeath();
  }
}
