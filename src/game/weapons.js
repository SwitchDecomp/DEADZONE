import * as THREE from 'three';
import { WEAPONS, upgradeDef } from './weaponData.js';
import { buildGun, gunMaterials } from './gunModels.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp, rand, smoothstep, TAU } from '../core/utils.js';

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);
const NO_ACT = ['melee', 'grenade', 'drink', 'switching', 'forging'];

let ARM_MATS = null;
const _am = new THREE.Matrix4(), _aq = new THREE.Quaternion(), _ae = new THREE.Euler(), _as = new THREE.Vector3(1, 1, 1), _ap = new THREE.Vector3();
function placed(geo, x, y, z, rx = 0, ry = 0, rz = 0) { _ae.set(rx, ry, rz); _aq.setFromEuler(_ae); _am.compose(_ap.set(x, y, z), _aq, _as); geo.applyMatrix4(_am); return geo; }
function rbox(w, h, d, r) { return new RoundedBoxGeometry(w, h, d, 2, r ?? Math.min(w, h, d) * 0.4); }
function cylAlong(r0, r1, len, from, dir, wrinkle = 0) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 14, 8, true);
  if (wrinkle) {
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), a = Math.atan2(z, x);
      const k = 1 + wrinkle * Math.sin(y * 70 + Math.sin(a * 3) * 2.5) * (0.6 + 0.4 * Math.sin(a * 2 + y * 20));
      P.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
  }
  g.translate(0, len / 2, 0);
  g.applyQuaternion(_aq.setFromUnitVectors(Y, dir));
  g.translate(from.x, from.y, from.z);
  return g;
}
const armCache = new Map();
function armGeometry(side, grip, R) {
  const key = `${side}|${grip}|${R}`;
  if (armCache.has(key)) return armCache.get(key);
  const s = side, hand = [], sleeve = [], watch = [];
  if (grip !== 'open') {
    hand.push(placed(rbox(0.024, 0.094, 0.074), s * (R + 0.012), -0.004, 0.004));
    hand.push(placed(rbox(0.011, 0.07, 0.05, 0.005), s * (R + 0.026), 0.002, -0.004));
    const fy = [0.034, 0.012, -0.01, -0.031], fl = [1, 1.06, 1.0, 0.85];
    for (let i = 0; i < 4; i++) {
      const y = fy[i], L = fl[i];
      hand.push(placed(rbox(0.018, 0.0175, 0.03 * L), s * (R + 0.006), y, -R * 0.9 - 0.008, 0, s * 0.35, 0));
      hand.push(placed(rbox(0.024 * L + R * 0.6, 0.0165, 0.016), s * 0.004, y, -(R + 0.011), 0, 0, 0));
      hand.push(placed(rbox(0.015, 0.0155, 0.02 * L), -s * (R + 0.004), y, -R * 0.55, 0, -s * 0.45, 0));
    }
    hand.push(placed(rbox(0.02, 0.022, 0.042), -s * R * 0.45, 0.054, -0.002, 0.25, 0, 0));
    hand.push(placed(rbox(0.017, 0.018, 0.03), -s * (R + 0.005), 0.047, -0.028, 0.35, -s * 0.3, 0));
    if (grip === 'h') hand.forEach((g) => g.rotateX(-Math.PI / 2));
  } else {
    hand.push(placed(rbox(0.026, 0.09, 0.075), 0, 0, 0));
    for (let i = 0; i < 4; i++) {
      hand.push(placed(rbox(0.017, 0.016, 0.03), -s * 0.004, 0.031 - i * 0.019, -0.048, 0, 0, 0));
      hand.push(placed(rbox(0.016, 0.015, 0.024), -s * 0.014, 0.031 - i * 0.019, -0.062, 0, -s * 0.9, 0));
    }
    hand.push(placed(rbox(0.018, 0.02, 0.038), -s * 0.02, 0.035, -0.02, 0.3, -s * 0.5, 0));
  }
  // wrist attach point (bottom-back of palm)
  const W = grip === 'open' ? new THREE.Vector3(0, -0.05, 0.012) : grip === 'h' ? new THREE.Vector3(s * (R + 0.012), 0.012, 0.05) : new THREE.Vector3(s * (R + 0.012), -0.05, 0.012);
  const dir = new THREE.Vector3(s * 0.18, -0.32, 0.9).normalize();
  hand.push(cylAlong(0.03, 0.033, 0.075, W.clone().addScaledVector(dir, -0.012), dir));
  sleeve.push(cylAlong(0.035, 0.047, 0.34, W.clone().addScaledVector(dir, 0.055), dir, 0.05));
  sleeve.push(cylAlong(0.05, 0.052, 0.05, W.clone().addScaledVector(dir, 0.21), dir, 0.08));
  sleeve.push(cylAlong(0.048, 0.056, 0.42, W.clone().addScaledVector(dir, 0.38), dir, 0.04));
  if (s < 0) {
    const up = new THREE.Vector3(0, 1, 0).sub(dir.clone().multiplyScalar(dir.y)).normalize();
    const wp = W.clone().addScaledVector(dir, 0.08).addScaledVector(up, 0.034);
    const face = rbox(0.03, 0.034, 0.009, 0.004); face.lookAt(up); face.translate(wp.x, wp.y, wp.z);
    watch.push(face);
    watch.push(cylAlong(0.036, 0.036, 0.018, W.clone().addScaledVector(dir, 0.071), dir));
  }
  const merge = (list) => (list.length ? mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', g.attributes.position); c.setAttribute('normal', g.attributes.normal); c.setAttribute('uv', g.attributes.uv); return c; }), false) : null);
  const out = { hand: merge(hand), sleeve: merge(sleeve), watch: merge(watch) };
  armCache.set(key, out);
  return out;
}
function makeArm(T, side, grip = 'open', R = 0.019) {
  const M = gunMaterials(T);
  if (!ARM_MATS) ARM_MATS = {
    glove: new THREE.MeshStandardMaterial({ map: T.glove.map, normalMap: T.glove.normalMap, roughness: 0.78, color: 0x9a9a92, normalScale: new THREE.Vector2(1.5, 1.5) }),
    sleeve: new THREE.MeshStandardMaterial({ map: T.camo.map, normalMap: T.camo.normalMap, roughness: 1, normalScale: new THREE.Vector2(1.3, 1.3) }),
  };
  const geo = armGeometry(side, grip, R);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo.hand, ARM_MATS.glove));
  g.add(new THREE.Mesh(geo.sleeve, ARM_MATS.sleeve));
  if (geo.watch) g.add(new THREE.Mesh(geo.watch, M.gun));
  g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

class Grenade {
  constructor(sys, pos, vel) {
    this.sys = sys;
    const M = gunMaterials(sys.game.textures);
    this.mesh = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.olive); b.scale.y = 1.25; b.castShadow = true; this.mesh.add(b);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.06, 0.02), M.gun); s.position.set(0.03, 0.04, 0); this.mesh.add(s);
    this.mesh.position.copy(pos);
    sys.game.scene.add(this.mesh);
    this.vel = vel.clone();
    this.fuse = 2.4;
    this.spin = new THREE.Vector3(rand(-15, 15), rand(-15, 15), rand(-15, 15));
    this.tmp = new THREE.Vector3();
  }
  update(dt) {
    const g = this.sys.game;
    this.fuse -= dt;
    this.vel.y -= 14 * dt;
    const p = this.mesh.position;
    p.addScaledVector(this.vel, dt);
    if (p.y < 0.05) {
      p.y = 0.05;
      if (this.vel.y < -1.5) g.audio.bounce(p.clone());
      this.vel.y *= -0.35; this.vel.x *= 0.65; this.vel.z *= 0.65; this.spin.multiplyScalar(0.6);
    }
    this.tmp.copy(p);
    if (g.level.collide(this.tmp, 0.06, p.y - 0.05, p.y + 0.05, 'player')) {
      if (Math.abs(this.tmp.x - p.x) > 1e-4) this.vel.x *= -0.45;
      if (Math.abs(this.tmp.z - p.z) > 1e-4) this.vel.z *= -0.45;
      p.x = this.tmp.x; p.z = this.tmp.z;
      if (this.vel.lengthSq() > 2) g.audio.bounce(p.clone());
    }
    this.mesh.rotation.x += this.spin.x * dt; this.mesh.rotation.y += this.spin.y * dt; this.mesh.rotation.z += this.spin.z * dt;
    if (this.fuse <= 0) {
      g.scene.remove(this.mesh);
      g.explode(p.clone(), 6.5, 350 + g.rounds.round * 110, { kind: 'explosion', grenade: true });
      return false;
    }
    return true;
  }
}

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.T = game.textures;
    this.vmScene = game.vmScene;
    this.root = new THREE.Group();
    this.vmScene.add(this.root);
    this.kick = new THREE.Group(); this.root.add(this.kick);
    this.holder = new THREE.Group(); this.kick.add(this.holder);
    this.models = new Map();
    this.grenades = [];
    const fm = new THREE.MeshBasicMaterial({ map: this.T.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffd8a0 });
    this.flashMat = fm;
    this.flash = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), fm);
      if (i === 1) p.rotation.y = Math.PI / 2;
      if (i === 2) { p.rotation.x = Math.PI / 2; p.scale.setScalar(0.7); }
      p.frustumCulled = false;
      this.flash.add(p);
    }
    this.flash.visible = false;
    this.flashT = 0;
    this.vmLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.vmScene.add(this.vmLight);
    const sg = new THREE.CylinderGeometry(0.005, 0.005, 0.022, 6); sg.rotateZ(Math.PI / 2);
    this.shells = [];
    const M = gunMaterials(this.T);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(sg, M.brass); m.visible = false; m.frustumCulled = false; this.vmScene.add(m);
      this.shells.push({ mesh: m, vel: new THREE.Vector3(), life: 0, spin: 0 });
    }
    // knife
    this.knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.2), M.chrome); blade.position.z = -0.12; this.knife.add(blade);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.02, 0.04), M.chrome); tip.position.set(0, 0.006, -0.23); tip.rotation.x = 0.4; this.knife.add(tip);
    this.knife.add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.035, 0.1), M.rubber));
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.012), M.gun); guard.position.z = -0.05; this.knife.add(guard);
    this.knife.add(makeArm(this.T, -1, 'open'));
    this.knife.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.knife.visible = false;
    this.vmScene.add(this.knife);
    // perk bottle
    this.bottle = new THREE.Group();
    this.bottleMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 1.5, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.9 });
    this.bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12), this.bottleMat));
    const bn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.06, 10), this.bottleMat); bn.position.y = 0.1; this.bottle.add(bn);
    this.bottle.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0355, 0.0355, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 })));
    const barm = makeArm(this.T, 1, 'open'); barm.position.set(0.02, -0.02, 0.03); this.bottle.add(barm);
    this.bottle.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.bottle.visible = false;
    this.vmScene.add(this.bottle);
    // grenade hand
    this.nadeHand = new THREE.Group();
    const gb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.olive); gb.scale.y = 1.25; this.nadeHand.add(gb);
    const garm = makeArm(this.T, -1, 'open'); garm.position.set(0.0, -0.03, 0.03); this.nadeHand.add(garm);
    this.nadeHand.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.nadeHand.visible = false;
    this.vmScene.add(this.nadeHand);
    this.reset();
  }

  reset() {
    this.slots = [];
    this.cur = 0;
    this.state = 'idle'; this.stateT = 0;
    this.fireCd = 0; this.burstLeft = 0;
    this.adsAmount = 0; this.isADS = false;
    this.spreadNow = 0.02;
    this.kickPos = new THREE.Vector3(); this.kickVel = new THREE.Vector3();
    this.kickRot = new THREE.Vector3(); this.kickRotVel = new THREE.Vector3();
    this.sway = new THREE.Vector2(); this.swayVel = new THREE.Vector2();
    this.grenadeCount = 2;
    this.moveMul = 1;
    this.zoom = 1;
    this.sprintK = 0;
    for (const gr of this.grenades) this.game.scene.remove(gr.mesh);
    this.grenades = [];
    this.give('pistol', true);
  }

  get current() { return this.slots[this.cur]; }
  get maxSlots() { return this.game.player.perks.has('mule') ? 3 : 2; }
  has(id) { return this.slots.findIndex((s) => s.def.id === id); }

  model(id, up) {
    const key = id + (up ? '+' : '');
    if (!this.models.has(key)) {
      const gm = buildGun(id, this.T, up);
      const lg = gm.spec.leftGrip;
      const right = makeArm(this.T, 1, 'v', gm.spec.gripR); right.position.fromArray(gm.spec.rightGrip); right.rotation.x = gm.spec.gripRx ?? -0.3; gm.root.add(right);
      const left = makeArm(this.T, -1, lg.type, lg.r); left.position.fromArray(lg.pos); if (lg.type === 'v') left.rotation.x = gm.spec.gripRx ?? -0.3; gm.root.add(left);
      gm.right = right; gm.left = left; gm.leftHome = left.position.clone();
      for (const n of Object.values(gm.named)) { n.userData.home = n.position.clone(); n.userData.homeRot = n.rotation.clone(); }
      gm.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      this.models.set(key, gm);
    }
    return this.models.get(key);
  }

  give(id, silent = false) {
    const idx = this.has(id);
    if (idx >= 0) {
      const s = this.slots[idx];
      s.reserve = s.def.reserve; s.mag = s.def.mag;
      return 'ammo';
    }
    const def = WEAPONS[id];
    const slot = { def, mag: def.mag, reserve: def.reserve, upgraded: false };
    if (this.slots.length >= this.maxSlots) this.slots[this.cur] = slot;
    else { this.slots.push(slot); this.cur = this.slots.length - 1; }
    this.equip(silent);
    return 'new';
  }

  upgradeCurrentTo(slotIndex) {
    const s = this.slots[slotIndex];
    if (!s) return;
    s.def = upgradeDef(WEAPONS[s.def.id]);
    s.upgraded = true; s.mag = s.def.mag; s.reserve = s.def.reserve;
    this.cur = slotIndex;
    this.equip();
  }

  refillAll() {
    for (const s of this.slots) s.reserve = s.def.reserve;
    this.grenadeCount = 4;
  }

  equip(silent = false) {
    const s = this.current;
    if (this.gm) this.holder.remove(this.gm.root);
    this.gm = this.model(s.def.id, s.upgraded);
    this.holder.add(this.gm.root);
    this.gm.root.add(this.flash);
    this.flash.position.copy(this.gm.muzzle.position);
    this.state = 'raise'; this.stateT = 0;
    this.burstLeft = 0;
    if (!silent) this.game.audio.weaponRaise();
    this.game.hud.weaponName(s.def.name, s.upgraded);
  }

  switchTo(i) {
    if (i === this.cur || !this.slots[i] || NO_ACT.includes(this.state)) return;
    const now = performance.now();
    if (this.lastSwitch && now - this.lastSwitch < 450) return;
    this.lastSwitch = now;
    this.state = 'switching'; this.stateT = 0; this.nextSlot = i;
  }

  busy() { return ['melee', 'grenade', 'drink', 'switching', 'raise'].includes(this.state); }

  drink(color) {
    this.bottleMat.emissive.set(color);
    this.state = 'drink'; this.stateT = 0;
    this.game.audio.drink();
  }

  update(dt, input) {
    const g = this.game, p = g.player, s = this.current, def = s.def;
    const canAct = p.alive && !p.downed;
    this.stateT += dt;
    this.fireCd -= dt;
    const quick = p.perks.has('quickhands') ? 0.55 : 1;
    const rapid = p.perks.has('rapidfire') ? 1.33 : 1;
    const wantADS = canAct && input.mouse.right && !p.sprinting && !NO_ACT.includes(this.state) && this.state !== 'raise' && !(this.state === 'reload' && !def.perShell);
    this.isADS = wantADS;
    this.adsAmount = damp(this.adsAmount, wantADS ? 1 : 0, (1 / Math.max(0.05, def.adsTime)) * 2.2, dt);
    this.zoom = lerp(1, def.adsZoom, this.adsAmount);
    this.moveMul = def.move;

    if (canAct) {
      if (input.hit('Digit1')) this.switchTo(0);
      if (input.hit('Digit2')) this.switchTo(1);
      if (input.hit('Digit3')) this.switchTo(2);
      if (input.mouse.wheel && this.slots.length > 1) this.switchTo((this.cur + (input.mouse.wheel > 0 ? 1 : -1) + this.slots.length) % this.slots.length);
      if ((input.hit('KeyV') || input.hit('KeyE')) && !NO_ACT.includes(this.state)) this.startMelee();
      if (input.hit('KeyG') && this.grenadeCount > 0 && !NO_ACT.includes(this.state)) this.startGrenade();
      if (input.hit('KeyR') && this.state === 'idle' && s.mag < def.mag && s.reserve > 0) this.startReload();
    }

    switch (this.state) {
      case 'raise': if (this.stateT > 0.35) this.state = 'idle'; break;
      case 'switching': if (this.stateT > 0.25) { this.cur = this.nextSlot; this.equip(); } break;
      case 'reload': this.updateReload(quick); break;
      case 'pump': if (this.stateT > (def.bolt ? 0.85 : 0.55)) this.state = 'idle'; break;
      case 'melee': this.updateMelee(); break;
      case 'grenade': this.updateGrenade(); break;
      case 'drink': if (this.stateT > 2.1) { this.state = 'raise'; this.stateT = 0; this.game.audio.weaponRaise(); } break;
    }

    if (canAct && (this.state === 'idle' || (this.state === 'reload' && def.perShell && s.mag > 0)) && !p.sprinting && this.sprintK < 0.35) {
      const trig = def.auto ? input.mouse.left : input.mouse.leftPressed;
      if (this.burstLeft > 0) {
        if (this.fireCd <= 0) {
          if (s.mag > 0) { this.fire(rapid); this.burstLeft--; } else this.burstLeft = 0;
          if (this.burstLeft === 0) this.fireCd = def.burstDelay;
        }
      } else if (trig && this.fireCd <= 0) {
        if (s.mag > 0) {
          if (this.state === 'reload') this.state = 'idle';
          if (def.burst) this.burstLeft = def.burst - 1;
          this.fire(rapid);
        } else {
          this.game.audio.dryFire(); this.fireCd = 0.25;
          if (s.reserve > 0) this.startReload();
        }
      }
    }
    if (p.sprinting) this.burstLeft = 0;

    this.animate(dt, input);
    this.updateShells(dt);
    this.grenades = this.grenades.filter((gr) => gr.update(dt));
    const moveK = clamp(p.moveSpeed / 5, 0, 1.5);
    let sp = def.spread * (1 + moveK * 0.8) * (p.crouching ? 0.75 : 1) * (p.grounded ? 1 : 2);
    sp = lerp(sp, def.ads ?? 0.003, this.adsAmount);
    this.spreadNow = damp(this.spreadNow, sp, 12, dt);
    g.hud.setAmmo(s.mag, s.reserve, def.mag, this.grenadeCount, this.state === 'reload');
  }

  startReload() {
    this.state = 'reload'; this.stateT = 0;
    this.reloadEmpty = this.current.mag === 0;
    this.reloadStage = 0;
    this.burstLeft = 0;
  }

  updateReload(quick) {
    const s = this.current, def = s.def, a = this.game.audio;
    if (def.perShell) {
      const per = def.reload * quick;
      if (this.stateT > per) {
        this.stateT -= per;
        if (s.mag < def.mag && s.reserve > 0) { s.mag++; s.reserve--; a.shellIn(); }
        if (s.mag >= def.mag || s.reserve <= 0) { this.state = 'pump'; this.stateT = 0; a.pump(); }
      }
      return;
    }
    const dur = (this.reloadEmpty ? def.reloadEmpty : def.reload) * quick;
    const k = this.stateT / dur;
    if (this.reloadStage === 0 && k > 0.15) { this.reloadStage = 1; a.magOut(); }
    if (this.reloadStage === 1 && k > 0.62) {
      this.reloadStage = 2; a.magIn();
      const take = Math.min(def.mag - s.mag, s.reserve);
      s.mag += take; s.reserve -= take;
    }
    if (this.reloadStage === 2 && this.reloadEmpty && k > 0.78) { this.reloadStage = 3; a.bolt(); }
    if (k >= 1) this.state = 'idle';
  }

  fire(rapid) {
    const g = this.game, s = this.current, def = s.def, p = g.player;
    s.mag--;
    this.fireCd = 60 / (def.rpm * rapid);
    const cam = g.camera;
    cam.getWorldDirection(_d);
    _o.copy(cam.position);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    if (def.type === 'volt') this.fireVolt(def);
    else {
      for (let i = 0; i < def.pellets; i++) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * this.spreadNow;
        const dir = new THREE.Vector3().copy(_d).addScaledVector(_r, Math.cos(a) * r).addScaledVector(_u, Math.sin(a) * r).normalize();
        this.hitscan(_o.clone(), dir, def, i === 0 || Math.random() < 0.3);
      }
    }
    const adsK = lerp(1, 0.55, this.adsAmount) * (p.crouching ? 0.8 : 1);
    p.addRecoil(def.recoil * adsK * rand(0.8, 1.2), rand(-1, 1) * def.recoil * 0.35 * adsK);
    this.kickVel.z += def.kick * 9 * lerp(1, 0.6, this.adsAmount);
    this.kickRotVel.x += def.kick * 40 * lerp(1, 0.4, this.adsAmount);
    this.kickRotVel.z += rand(-1, 1) * def.kick * 10;
    this.flash.visible = true; this.flashT = def.type === 'shotgun' || def.type === 'sniper' ? 0.06 : 0.04;
    this.flash.rotation.z = Math.random() * TAU;
    const fs = def.type === 'shotgun' ? 1.6 : def.type === 'sniper' || def.type === 'lmg' ? 1.4 : def.type === 'pistol' ? 0.8 : 1;
    this.flash.scale.setScalar(fs * rand(0.8, 1.2));
    this.flashMat.color.setHex(def.type === 'volt' ? 0x60c0ff : s.upgraded ? 0xd090ff : 0xffd8a0);
    this.vmLight.color.setHex(def.type === 'volt' ? 0x60c0ff : s.upgraded ? 0xb070ff : 0xffb060);
    this.vmLight.intensity = 4;
    g.audio.gunshot(def.sound, s.upgraded);
    g.effects.muzzleWorld(_o.clone().addScaledVector(_d, 0.8).addScaledVector(_r, 0.15), _d);
    if (def.type !== 'volt' && def.type !== 'shotgun' && !def.bolt) this.ejectShell();
    if (def.type === 'shotgun') { this.state = 'pump'; this.stateT = 0; setTimeout(() => { g.audio.pump(); this.ejectShell(true); }, 220); }
    if (def.bolt) { this.state = 'pump'; this.stateT = 0; setTimeout(() => { g.audio.bolt(); this.ejectShell(true); }, 250); }
    g.stats.shots++;
  }

  hitscan(origin, dir, def, tracer) {
    const g = this.game;
    const wall = g.level.raycast(origin, dir, 150);
    const hits = g.zombies.raycast(origin, dir, wall.t);
    let pen = def.pen;
    let end = null;
    for (const h of hits) {
      const z = h.zombie;
      if (!z.alive) continue;
      const point = origin.clone().addScaledVector(dir, h.t);
      const part = h.part;
      let dmg = def.dmg * (part === 'head' ? def.headMult : part === 'limb' ? 0.8 : 1);
      if (def.pellets > 1) dmg *= clamp(1.3 - h.t / 14, 0.25, 1.3);
      dmg *= Math.pow(0.75, def.pen - pen);
      g.effects.bloodSpray(point, dir, def.pellets > 1 ? 0.5 : 1);
      if (def.pellets === 1 && def.dmg >= 60) g.effects.bloodSpray(point.clone().addScaledVector(dir, 0.25), dir, 0.6);
      if (part === 'head') g.audio.headshot(point); else g.audio.hitFlesh(point);
      g.hitZombie(z, dmg, part, point, dir, { kind: 'bullet', weapon: def }, h.sub);
      pen--;
      if (pen <= 0) { end = point; break; }
    }
    const endPt = end || origin.clone().addScaledVector(dir, wall.t);
    if (!end && wall.hit) {
      const n = new THREE.Vector3(wall.nx, wall.ny, wall.nz);
      const surf = wall.ny > 0.5 ? g.level.surfaceAt(endPt.x, endPt.z) : (Math.random() < 0.2 ? 'metal' : 'concrete');
      g.effects.impact(endPt, n, surf);
      if (Math.random() < 0.15) g.audio.ricochet(endPt);
    }
    if (def.explosive && (end || wall.hit)) g.explode(endPt, def.type === 'sniper' ? 4 : 2.6, def.type === 'sniper' ? def.dmg : 260 + g.rounds.round * 30, { kind: 'explosion', small: true });
    if (tracer) g.effects.tracer(this.muzzleWorld(), endPt);
  }

  muzzleWorld() {
    const cam = this.game.camera;
    return cam.position.clone()
      .addScaledVector(_r, lerp(0.12, 0.0, this.adsAmount))
      .addScaledVector(_u, lerp(-0.1, -0.04, this.adsAmount))
      .addScaledVector(_d, 0.7);
  }

  fireVolt(def) {
    const g = this.game;
    const origin = _o.clone(), dir = _d.clone();
    const zs = g.zombies.zombies.filter((z) => z.alive && z.state !== 'rising');
    let first = null, best = 0.14;
    for (const z of zs) {
      const c = z.pos.clone().setY(1.2 * z.scale).sub(origin);
      const d = c.length();
      if (d > 40) continue;
      c.normalize();
      const ang = c.angleTo(dir);
      if (ang < best && !g.level.raycast(origin, c, d).hit) { best = ang; first = z; }
    }
    const mz = this.muzzleWorld();
    if (!first) {
      const wall = g.level.raycast(origin, dir, 40);
      const end = origin.clone().addScaledVector(dir, wall.t);
      g.effects.bolt(g.effects.jaggedPath(mz, end, 12, 0.3), 0.2);
      g.effects.electric(end, 15);
      return;
    }
    let prev = mz, cur = first;
    const hit = new Set();
    for (let i = 0; i < def.chains && cur; i++) {
      hit.add(cur);
      const tp = cur.pos.clone().setY(1.2 * cur.scale);
      g.effects.bolt(g.effects.jaggedPath(prev, tp, 10, 0.35), 0.3);
      g.effects.electric(tp, 14);
      g.audio.zap(tp);
      const from = cur.pos;
      g.hitZombie(cur, def.dmg * (i === 0 ? 1 : 0.85), 'torso', tp, dir, { kind: 'volt', weapon: def });
      prev = tp;
      let next = null, nd = 7;
      for (const z of zs) { if (hit.has(z) || !z.alive) continue; const d = z.pos.distanceTo(from); if (d < nd) { nd = d; next = z; } }
      cur = next;
    }
    g.effects.boomLight.position.copy(prev); g.effects.boomLight.color.setHex(0x60c0ff); g.effects.boomLight.intensity = 40; g.effects.boomT = 0.4;
  }

  startMelee() {
    this.state = 'melee'; this.stateT = 0; this.meleeHit = false; this.burstLeft = 0;
    this.game.audio.knifeSwing();
    const g = this.game, p = g.player;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    let bd = 2.8, found = false;
    for (const z of g.zombies.zombies) {
      if (!z.alive) continue;
      const v = z.pos.clone().sub(p.pos).setY(0); const d = v.length();
      if (d < bd && v.normalize().dot(fwd) > 0.6) { bd = d; found = true; }
    }
    if (found && bd > 1.2) { p.vel.x += fwd.x * 7; p.vel.z += fwd.z * 7; }
  }
  updateMelee() {
    const g = this.game, p = g.player;
    if (!this.meleeHit && this.stateT > 0.14) {
      this.meleeHit = true;
      const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      let target = null, bd = 2.0;
      for (const z of g.zombies.zombies) {
        if (!z.alive) continue;
        const v = z.pos.clone().sub(p.pos).setY(0); const d = v.length() - z.radius;
        if (d < bd && v.normalize().dot(fwd) > 0.45) { bd = d; target = z; }
      }
      if (target) {
        const hp = target.pos.clone().setY(1.3 * target.scale);
        g.effects.bloodSpray(hp, fwd, 1.5);
        g.audio.knifeHit(hp);
        g.shake(0.15);
        target.impulse.addScaledVector(fwd, 2.5);
        g.hitZombie(target, 150, 'torso', hp, fwd, { kind: 'melee' });
      }
    }
    if (this.stateT > 0.55) this.state = 'idle';
  }

  startGrenade() {
    this.state = 'grenade'; this.stateT = 0; this.thrown = false; this.burstLeft = 0;
    this.game.audio.pin();
  }
  updateGrenade() {
    const g = this.game, p = g.player;
    if (!this.thrown && this.stateT > 0.35) {
      this.thrown = true;
      this.grenadeCount--;
      const cam = g.camera;
      cam.getWorldDirection(_d);
      const pos = cam.position.clone().addScaledVector(_d, 0.5);
      pos.y -= 0.1;
      const vel = _d.clone().multiplyScalar(15).add(new THREE.Vector3(p.vel.x, 3, p.vel.z));
      this.grenades.push(new Grenade(this, pos, vel));
      g.audio.knifeSwing();
    }
    if (this.stateT > 0.7) this.state = 'idle';
  }

  ejectShell(big = false) {
    const sh = this.shells.find((s) => s.life <= 0);
    if (!sh || !this.gm) return;
    this.gm.root.updateMatrixWorld(true);
    this.gm.eject.getWorldPosition(sh.mesh.position);
    sh.mesh.visible = true; sh.life = 0.9;
    sh.mesh.scale.setScalar(big ? 1.8 : 1);
    sh.vel.set(rand(0.8, 1.4), rand(0.8, 1.3), rand(-0.1, 0.2));
    sh.spin = rand(15, 30);
    this.game.audio.shell(rand(0.35, 0.5));
  }
  updateShells(dt) {
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= 6 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.z += s.spin * dt; s.mesh.rotation.y += s.spin * 0.3 * dt;
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  animate(dt, input) {
    const g = this.game, p = g.player, s = this.current, def = s.def, gm = this.gm;
    const t = p.time;
    // recoil springs: fixed small sub-steps so they stay stable at any frame rate
    const k = 180, d = 16, steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.kickVel.addScaledVector(this.kickPos, -k * h).multiplyScalar(Math.exp(-d * h));
      this.kickPos.addScaledVector(this.kickVel, h);
      this.kickRotVel.addScaledVector(this.kickRot, -k * h).multiplyScalar(Math.exp(-d * h));
      this.kickRot.addScaledVector(this.kickRotVel, h);
    }
    this.kick.position.set(0, this.kickPos.z * 0.15, this.kickPos.z * 0.6);
    this.kick.rotation.set(this.kickRot.x * 0.05, 0, this.kickRot.z * 0.05);
    const ads = this.adsAmount;
    const swayK = lerp(1, 0.15, ads);
    // weapon sway: frame-rate independent, unconditionally stable smoothing toward mouse velocity
    const idt = 1 / Math.max(dt, 1 / 240);
    const tx = clamp(-input.mouse.dx * idt * 0.000012 * swayK, -0.035, 0.035);
    const ty = clamp(input.mouse.dy * idt * 0.000012 * swayK, -0.03, 0.03);
    this.swayVel.x = damp(this.swayVel.x, tx, 14, dt); this.swayVel.y = damp(this.swayVel.y, ty, 14, dt);
    this.sway.x = damp(this.sway.x, this.swayVel.x, 9, dt); this.sway.y = damp(this.sway.y, this.swayVel.y, 9, dt);
    const hip = def.hip;
    const spec = gm.spec;
    const adsPos = [0, -spec.sightY, def.type === 'pistol' ? -0.3 : -0.24];
    const bobA = p.bobAmt * lerp(1, 0.1, ads);
    const sprint = p.sprinting && !['melee', 'grenade', 'drink'].includes(this.state) ? 1 : 0;
    this.sprintK = damp(this.sprintK, sprint, 10, dt);
    const sk = this.sprintK;
    const breathe = Math.sin(t * 1.6) * 0.003 * (1 - ads);
    let x = lerp(hip[0], adsPos[0], ads) + Math.cos(p.bob) * 0.012 * bobA * (1 + sk);
    let y = lerp(hip[1], adsPos[1], ads) - Math.abs(Math.sin(p.bob)) * 0.014 * bobA * (1 + sk) + breathe - p.landDip * 0.5;
    let z = lerp(hip[2], adsPos[2], ads);
    let rx = 0, ry = 0, rz = 0;
    x += sk * -0.02; y += sk * -0.04; z += sk * 0.02; rx += sk * -0.25; ry += sk * 0.9; rz += sk * 0.35;
    if (p.crouching) rz += 0.05 * (1 - ads);
    let low = 0;
    if (this.state === 'switching') low = smoothstep(0, 0.25, this.stateT);
    else if (this.state === 'raise') low = 1 - smoothstep(0, 0.35, this.stateT);
    else if (this.state === 'forging') low = smoothstep(0, 0.3, this.stateT);
    else if (this.state === 'drink') low = this.stateT < 1.9 ? smoothstep(0, 0.25, this.stateT) : 1;
    else if (this.state === 'grenade') low = Math.sin(clamp(this.stateT / 0.7, 0, 1) * Math.PI) * 0.9;
    else if (this.state === 'melee') low = Math.sin(clamp(this.stateT / 0.55, 0, 1) * Math.PI) * 0.6;
    if (p.downed) low = 1;
    this.lowK = damp(this.lowK || 0, low, 18, dt);
    y -= this.lowK * 0.3; rx -= this.lowK * 0.6;
    this.root.position.set(x + this.sway.x, y + this.sway.y, z);
    this.root.rotation.set(rx + this.sway.y * 2, ry + this.sway.x * 2, rz + this.sway.x * 1.5);
    // reset parts
    gm.root.rotation.set(0, 0, 0);
    gm.root.position.set(0, 0, 0);
    gm.left.position.copy(gm.leftHome);
    for (const n of Object.values(gm.named)) { n.position.copy(n.userData.home); n.rotation.copy(n.userData.homeRot); n.visible = true; }
    if (this.state === 'reload' && !def.perShell) {
      const dur = (this.reloadEmpty ? def.reloadEmpty : def.reload) * (p.perks.has('quickhands') ? 0.55 : 1);
      const kk = clamp(this.stateT / dur, 0, 1);
      const tilt = smoothstep(0, 0.15, kk) * (1 - smoothstep(0.85, 1, kk));
      gm.root.rotation.z = tilt * 0.55; gm.root.rotation.x = tilt * 0.25; gm.root.position.y = -tilt * 0.03;
      const mag = gm.named.mag;
      if (mag) {
        const out = smoothstep(0.15, 0.32, kk), back = smoothstep(0.42, 0.62, kk);
        if (kk < 0.42) { mag.position.y = mag.userData.home.y - out * 0.35; mag.visible = kk < 0.3; }
        else mag.position.y = mag.userData.home.y - (1 - back) * 0.25;
        const toMag = kk > 0.25 && kk < 0.66 ? Math.sin(((kk - 0.25) / 0.41) * Math.PI) : 0;
        gm.left.position.set(lerp(gm.leftHome.x, mag.userData.home.x, toMag), gm.leftHome.y - toMag * 0.2, lerp(gm.leftHome.z, mag.userData.home.z, toMag));
      }
      if (this.reloadEmpty) {
        const b = gm.named.bolt || gm.named.slide;
        if (b) { const pull = kk > 0.75 && kk < 0.9 ? Math.sin(((kk - 0.75) / 0.15) * Math.PI) : 0; b.position.z = b.userData.home.z + pull * 0.05; }
      }
      if (def.type === 'lmg' && gm.named.cover) gm.named.cover.rotation.x = Math.sin(kk * Math.PI) * -0.8;
    } else if (this.state === 'reload' && def.perShell) {
      gm.root.rotation.z = 0.4; gm.root.rotation.x = 0.15;
      const ph = (this.stateT / (def.reload * (p.perks.has('quickhands') ? 0.55 : 1))) % 1;
      gm.left.position.set(0.03, -0.06 + Math.sin(ph * Math.PI) * 0.03, -0.05 - Math.sin(ph * Math.PI) * 0.03);
    } else if (this.state === 'pump') {
      const dur = def.bolt ? 0.85 : 0.55;
      const kk = clamp(this.stateT / dur, 0, 1);
      if (def.type === 'shotgun' && gm.named.pump) {
        const e = kk > 0.25 ? Math.sin(((kk - 0.25) / 0.75) * Math.PI) : 0;
        gm.named.pump.position.z = gm.named.pump.userData.home.z + e * 0.1;
        gm.left.position.z = gm.leftHome.z + e * 0.1;
        gm.root.rotation.x = e * 0.08;
      }
      if (def.bolt && gm.named.bolt) {
        const e = kk > 0.2 ? Math.sin(((kk - 0.2) / 0.8) * Math.PI) : 0;
        gm.named.bolt.position.z = gm.named.bolt.userData.home.z + e * 0.08;
        gm.named.bolt.rotation.z = gm.named.bolt.userData.homeRot.z - e * 1.2;
        gm.root.rotation.z = e * 0.25;
      }
    }
    if (gm.named.slide && def.type === 'pistol') {
      if (this.fireCd > 0 && this.state === 'idle') gm.named.slide.position.z = gm.named.slide.userData.home.z + Math.max(0, this.fireCd / (60 / def.rpm)) * 0.03;
      if (s.mag === 0 && this.state !== 'reload') gm.named.slide.position.z = gm.named.slide.userData.home.z + 0.03;
    }
    this.knife.visible = this.state === 'melee';
    if (this.knife.visible) {
      const kk = clamp(this.stateT / 0.55, 0, 1);
      const sw = smoothstep(0.05, 0.35, kk);
      this.knife.position.set(lerp(0.25, -0.15, sw), lerp(-0.12, -0.18, sw) + Math.sin(sw * Math.PI) * 0.06 - Math.max(0, kk - 0.8) * 1.5, -0.35 - Math.sin(sw * Math.PI) * 0.1);
      this.knife.rotation.set(-0.2, lerp(0.9, -0.6, sw), lerp(-1.2, 0.3, sw));
    }
    this.nadeHand.visible = this.state === 'grenade' && !this.thrown;
    if (this.nadeHand.visible) {
      const kk = clamp(this.stateT / 0.35, 0, 1);
      this.nadeHand.position.set(-0.12 + kk * 0.05, -0.12 + kk * 0.12, -0.3 - kk * 0.1);
      this.nadeHand.rotation.set(-kk * 0.6, 0, 0);
    }
    this.bottle.visible = this.state === 'drink' && this.stateT > 0.25 && this.stateT < 1.95;
    if (this.bottle.visible) {
      const kk = clamp((this.stateT - 0.25) / 1.7, 0, 1);
      const up = smoothstep(0, 0.25, kk) * (1 - smoothstep(0.85, 1, kk));
      this.bottle.position.set(0.05 - up * 0.04, -0.35 + up * 0.27, -0.28 + up * 0.08);
      this.bottle.rotation.set(up * 1.9 + Math.sin(kk * 20) * 0.03 * up, 0, 0.2);
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    this.vmLight.position.set(this.root.position.x, this.root.position.y + 0.05, this.root.position.z - 0.5);
    this.vmLight.intensity = Math.max(0, this.vmLight.intensity - dt * 60);
    if (s.upgraded) {
      const M = gunMaterials(this.T); M.forged.emissiveIntensity = 2 + Math.sin(t * 3) * 0.8; M.forgedDark.emissiveIntensity = 1.4 + Math.sin(t * 2.3) * 0.5;
      if (M.forgedList) for (const fm of M.forgedList) fm.emissiveIntensity = 1.6 + Math.sin(t * 3) * 0.7;
    }
    const scoped = def.scope && ads > 0.92;
    this.root.visible = !scoped;
    g.hud.scope(scoped);
  }
}
