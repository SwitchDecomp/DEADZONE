import * as THREE from 'three';
import { perkIcon, makeCanvas, canvasTex, textPanel } from '../core/textures.js';
import { WEAPONS, BOX_POOL, upgradeDef } from '../game/weaponData.js';
import { buildGun, getSpec } from '../game/gunModels.js';
import { rand, pick, smoothstep } from '../core/utils.js';

export const PERKS = {
  ironhide: { name: 'IRON HIDE', cost: 2500, color: '#d42a1a', hex: 0xff2a10, symbol: 'shield', desc: 'Endure far more punishment', power: true },
  quickhands: { name: 'QUICK HANDS', cost: 3000, color: '#2aa84a', hex: 0x30ff60, symbol: 'hand', desc: 'Reload nearly twice as fast', power: true },
  rapidfire: { name: 'RAPID FIRE', cost: 2000, color: '#e0a020', hex: 0xffb020, symbol: 'bullets', desc: 'Increased rate of fire', power: true },
  swiftstep: { name: 'SWIFT STEP', cost: 2000, color: '#2a8ad4', hex: 0x30a0ff, symbol: 'wing', desc: 'Move faster, sprint longer', power: true },
  secondwind: { name: 'SECOND WIND', cost: 500, color: '#20b8c8', hex: 0x20e0f0, symbol: 'heart', desc: 'Rise again once when downed', power: false },
  mule: { name: 'PACK MULE', cost: 4000, color: '#4a9a3a', hex: 0x70ff40, symbol: 'mule', desc: 'Carry a third weapon', power: true },
};

function chalkTexture(weaponId, cost) {
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  const spec = getSpec(weaponId);
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  const rects = [];
  for (const p of spec.parts) {
    if ((p[0] !== 'b' && p[0] !== 'c') || p[1] === 'dark' || p[1] === 'reddot' || p[1] === 'glass') continue;
    let x, y, w, h, rot = 0;
    if (p[0] === 'b') { const [, , , ph, pd, , py, pz, rx = 0] = p; w = pd; h = ph; x = -pz; y = -py; rot = rx; }
    else { const [, , r, len, , py, pz, axis = 'z'] = p; if (axis === 'z') { w = len; h = r * 2; } else if (axis === 'y') { w = r * 2; h = len; } else { w = r * 2; h = r * 2; } x = -pz; y = -py; }
    rects.push({ x, y, w, h, rot });
    minX = Math.min(minX, x - w / 2); maxX = Math.max(maxX, x + w / 2); minY = Math.min(minY, y - h / 2); maxY = Math.max(maxY, y + h / 2);
  }
  const sc = Math.min((W - 80) / (maxX - minX), (H - 90) / (maxY - minY));
  const ox = W / 2 - ((minX + maxX) / 2) * sc, oy = (H - 50) / 2 - ((minY + maxY) / 2) * sc + 4;
  g.strokeStyle = 'rgba(240,236,225,0.9)'; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(255,255,255,0.4)'; g.shadowBlur = 3;
  for (const r of rects) {
    for (let k = 0; k < 2; k++) {
      g.save();
      g.translate(ox + r.x * sc + rand(-1, 1), oy + r.y * sc + rand(-1, 1));
      g.rotate(r.rot);
      g.lineWidth = rand(1.6, 3);
      g.strokeRect((-r.w * sc) / 2, (-r.h * sc) / 2, r.w * sc, r.h * sc);
      g.restore();
    }
  }
  g.fillStyle = 'rgba(240,236,225,0.92)';
  g.font = 'bold 30px "Black Ops One", Impact'; g.textAlign = 'center';
  g.fillText(WEAPONS[weaponId].name, W / 2, H - 46);
  g.font = 'bold 26px Oswald, Impact';
  g.fillText(`${cost}`, W / 2, H - 14);
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) if (img.data[i + 3] > 0 && Math.random() < 0.25) img.data[i + 3] *= 0.4;
  g.putImageData(img, 0, 0);
  return canvasTex(c, true, false);
}

function perkSignTex(p) {
  return textPanel(512, 128, (g, w, h) => {
    g.fillStyle = '#080808'; g.fillRect(0, 0, w, h);
    g.fillStyle = p.color; g.font = 'bold 64px "Black Ops One", Impact'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = p.color; g.shadowBlur = 20;
    g.fillText(p.name, w / 2, h / 2 + 4);
  });
}

export class Machines {
  constructor(game) {
    this.game = game;
    this.L = game.level;
    this.M = game.materials;
    this.scene = game.scene;
    this.perks = [];
    this.wallbuys = [];
    const S = this.L.spots;
    for (const sp of S.perks) this.buildPerk(sp);
    for (const sp of S.wallbuys) this.buildWallbuy(sp);
    this.buildBox();
    this.buildPower(S.power);
    this.buildForge(S.forge);
  }

  buildPerk(sp) {
    const p = PERKS[sp.id];
    const T = this.game.textures;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ map: T.rustMetal.map, normalMap: T.rustMetal.normalMap, color: new THREE.Color(p.hex).multiplyScalar(0.55).add(new THREE.Color(0.15, 0.15, 0.15)), metalness: 0.7, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.85), bodyMat); body.position.y = 1.05; g.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.95), this.M.darkSteel); top.position.y = 2.15; g.add(top);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.95), this.M.darkSteel); base.position.y = 0.06; g.add(base);
    const iconTex = canvasTex(perkIcon(p.color, p.symbol), true, false);
    const logoMat = new THREE.MeshStandardMaterial({ map: iconTex, emissiveMap: iconTex, emissive: 0xffffff, emissiveIntensity: 0.15, transparent: true, roughness: 0.3 });
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), logoMat); logo.position.set(0, 1.35, 0.43); g.add(logo);
    const signTex = perkSignTex(p);
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.1 });
    const dk = this.M.darkSteel;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.1), [dk, dk, dk, dk, signMat, dk]);
    sign.position.set(0, 2.4, 0.2); g.add(sign);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.1), this.M.black); slot.position.set(0, 0.55, 0.42); g.add(slot);
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: p.hex, emissiveIntensity: 0.2 });
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.9, 0.04), stripeMat); st.position.set(s * 0.53, 1.05, 0.43); g.add(st); }
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8), stripeMat); b.position.set(-0.12 + i * 0.12, 0.58, 0.4); g.add(b); }
    g.position.set(sp.x, 0, sp.z); g.rotation.y = sp.rot;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    this.L.colBox({ x: sp.x, z: sp.z, rot: sp.rot }, 0, 0, 1.2, 0.95, 2.5);
    const front = new THREE.Vector3(Math.sin(sp.rot), 0, Math.cos(sp.rot));
    const light = null;
    this.perks.push({ id: sp.id, def: p, group: g, logoMat, signMat, stripeMat, light, pos: new THREE.Vector3(sp.x, 1, sp.z), front, bought: 0, on: !p.power, seed: Math.random() * 10 });
  }

  buildWallbuy(sp) {
    const def = WEAPONS[sp.weapon];
    const tex = chalkTexture(sp.weapon, def.cost);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), mat);
    m.position.set(sp.x, 1.6, sp.z); m.rotation.y = sp.rot;
    this.scene.add(m);
    this.wallbuys.push({ weapon: sp.weapon, def, mat, pos: new THREE.Vector3(sp.x, 1.6, sp.z), front: new THREE.Vector3(Math.sin(sp.rot), 0, Math.cos(sp.rot)) });
  }

  buildBox() {
    const T = this.game.textures;
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: T.wood.map, normalMap: T.wood.normalMap, color: 0x8a6a50, roughness: 0.7 });
    const runeTex = textPanel(512, 128, (c, w) => {
      c.fillStyle = '#000'; c.fillRect(0, 0, w, 128);
      c.strokeStyle = '#fff'; c.lineWidth = 4; c.shadowColor = '#fff'; c.shadowBlur = 8;
      for (let i = 0; i < 9; i++) { const x = 30 + i * 52; c.beginPath(); c.moveTo(x, 30); c.lineTo(x + rand(-14, 14), 64); c.lineTo(x + rand(-14, 14), 98); c.moveTo(x - 12, 64); c.lineTo(x + 12, rand(40, 90)); c.stroke(); }
    });
    this.runeMat = new THREE.MeshStandardMaterial({ map: wood.map, color: 0x6a5040, emissiveMap: runeTex, emissive: 0x40c8ff, emissiveIntensity: 2.5 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.75), [wood, wood, wood, wood, this.runeMat, this.runeMat]); base.position.y = 0.42; g.add(base);
    for (const s of [-1, 1]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.58, 0.78), this.M.darkSteel); band.position.set(s * 0.55, 0.42, 0); g.add(band); }
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.7, -0.375); g.add(lidPivot);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.16, 0.77), wood); lid.position.set(0, 0.08, 0.375); lidPivot.add(lid);
    for (const s of [-1, 1]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.79), this.M.darkSteel); band.position.set(s * 0.55, 0.08, 0.375); lidPivot.add(band); }
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.65), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x60d0ff, emissiveIntensity: 0 }));
    inner.position.y = 0.68; g.add(inner);
    for (const [x, z] of [[-0.7, -0.3], [0.7, -0.3], [-0.7, 0.3], [0.7, 0.3]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.12), this.M.darkSteel); l.position.set(x, 0.075, z); g.add(l); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.9, 40, 20, 1, true), this.M.cone(0x60c8ff, 0.2));
    beam.geometry.translate(0, 20, 0);
    const uv = beam.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    uv.needsUpdate = true;
    this.scene.add(beam);
    this.boxLight = { intensity: 0, position: new THREE.Vector3() };
    this.box = { group: g, lidPivot, inner, beam, state: 'idle', t: 0, loc: 0, uses: 0, display: null, result: null, collider: null, cycleT: 0 };
    this.placeBox(0);
  }
  placeBox(i) {
    const b = this.box, sp = this.L.spots.box[i];
    b.loc = i;
    b.group.position.set(sp.x, 0, sp.z); b.group.rotation.set(0, sp.rot, 0);
    b.beam.position.set(sp.x, 0, sp.z);
    b.front = new THREE.Vector3(Math.sin(sp.rot), 0, Math.cos(sp.rot));
    b.pos = new THREE.Vector3(sp.x, 0.8, sp.z);

    if (b.collider) b.collider.active = false;
    b.collider = this.L.colBox({ x: sp.x, z: sp.z, rot: sp.rot }, 0, 0, 1.65, 0.8, 0.9, { nav: false });
  }
  setDisplay(id, up = false) {
    const b = this.box;
    if (b.display) b.group.remove(b.display);
    const gm = buildGun(id, this.game.textures, up);
    gm.root.scale.setScalar(1.6);
    gm.root.rotation.y = Math.PI / 2;
    b.group.add(gm.root);
    b.display = gm.root;
  }

  useBox() {
    const g = this.game, b = this.box;
    if (b.state === 'idle') {
      if (!g.spend(950)) return;
      b.state = 'open'; b.t = 0; b.uses++; b.cycleT = 0;
      g.audio.boxOpen(); g.audio.boxJingle(4);
      const pool = BOX_POOL.filter((id) => g.weapons.has(id) < 0);
      const canMove = this.L.zones.some((z) => z.id > 0 && z.open);
      const skull = canMove && b.uses > 3 && Math.random() < Math.min(0.5, 0.12 + (b.uses - 3) * 0.06);
      b.result = skull ? 'skull' : pick(pool.length ? pool : BOX_POOL);
      g.stats.boxUses++;
    } else if (b.state === 'ready' && b.result !== 'skull') {
      g.weapons.give(b.result);
      g.audio.purchase();
      b.state = 'close'; b.t = 0;
      if (b.display) { b.group.remove(b.display); b.display = null; }
    }
  }

  buildPower(sp) {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.25), this.M.olive); panel.position.y = 1.4; g.add(panel);
    const hz = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.27), this.M.hazard); hz.position.y = 2.0; g.add(hz);
    const leverPivot = new THREE.Group(); leverPivot.position.set(0, 1.45, 0.14); g.add(leverPivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.06), this.M.steel); arm.position.y = 0.2; leverPivot.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.M.lampRed); knob.position.y = 0.44; leverPivot.add(knob);
    leverPivot.rotation.x = -0.6;
    this.powerLamp = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2010, emissiveIntensity: 4 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.powerLamp); lamp.position.set(0.32, 1.9, 0.14); g.add(lamp);
    for (const x of [-0.3, 0.3]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.5, 6), this.M.rubber); c.position.set(x, 4.3, 0); g.add(c); }
    g.position.set(sp.x, 0, sp.z + 0.12); g.rotation.y = sp.rot;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.power = { group: g, leverPivot, on: false, anim: 0, pos: new THREE.Vector3(sp.x, 1.4, sp.z), front: new THREE.Vector3(Math.sin(sp.rot), 0, Math.cos(sp.rot)) };
  }
  usePower() {
    const g = this.game;
    if (this.power.on) return;
    this.power.on = true;
    this.powerLamp.emissive.set(0x20ff40);
    g.audio.powerOn();
    g.level.setPower(true);
    for (const pk of this.perks) pk.on = true;
    if (g.level.poweredCones) for (const c of g.level.poweredCones) c.userData.base = c.userData.poweredBase;
    g.hud.banner('POWER RESTORED', 'PERK MACHINES AND THE FORGE ARE ONLINE', false, 4);
    g.flashLightning(1.2);
    g.effects.electric(this.power.pos.clone().addScaledVector(this.power.front, 0.3), 40);
    setTimeout(() => g.audio.announce('Power restored.'), 1200);
  }

  buildForge(sp) {
    const g = new THREE.Group();
    const T = this.game.textures;
    const iron = new THREE.MeshStandardMaterial({ map: T.rustMetal.map, normalMap: T.rustMetal.normalMap, color: 0x3a3a40, metalness: 0.9, roughness: 0.55 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.4), iron); base.position.y = 0.5; g.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), iron); top.position.y = 1.6; g.add(top);
    this.forgeGlow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5010, emissiveIntensity: 0.3 });
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.05), this.forgeGlow); mouth.position.set(0, 1.45, 0.6); g.add(mouth);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.5), this.M.steel); tray.position.set(0, 1.05, 0.85); g.add(tray);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.8, 10), iron); p.position.set(s * 0.75, 3.4, -0.3); g.add(p);
      const gear = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 6, 12), this.M.darkSteel); gear.position.set(s * 1.12, 1.6, 0); gear.rotation.y = Math.PI / 2; g.add(gear);
    }
    const hammerPivot = new THREE.Group(); hammerPivot.position.set(0, 2.3, -0.2); g.add(hammerPivot);
    const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), iron); hammer.position.set(0, 0, 0.75); hammerPivot.add(hammer);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), this.M.darkSteel); shaft.position.set(0, 0, 0.35); hammerPivot.add(shaft);
    const label = textPanel(512, 128, (c, w, h) => { c.fillStyle = '#100804'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff7a30'; c.shadowColor = '#ff5010'; c.shadowBlur = 18; c.font = 'bold 72px "Black Ops One", Impact'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('THE FORGE', w / 2, h / 2 + 4); });
    const lm = new THREE.MeshStandardMaterial({ map: label, emissiveMap: label, emissive: 0xffffff, emissiveIntensity: 0.15 });
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), lm); lab.position.set(0, 2.0, 0.61); g.add(lab);
    g.position.set(sp.x, 0, sp.z); g.rotation.y = sp.rot;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    this.L.colBox({ x: sp.x, z: sp.z, rot: sp.rot }, 0, 0, 2.4, 1.6, 3);
    const light = this.L.addLight({ pos: new THREE.Vector3(sp.x, 1.6, sp.z + 1.2), color: 0xff6020, intensity: 0, distance: 10, flicker: 'fire' });
    this.forge = { group: g, hammerPivot, labelMat: lm, light, state: 'idle', t: 0, slot: -1, pos: new THREE.Vector3(sp.x, 1.2, sp.z), front: new THREE.Vector3(Math.sin(sp.rot), 0, Math.cos(sp.rot)), display: null };
    this.forgeFire = { pos: new THREE.Vector3(sp.x, 1.3, sp.z + 0.55), scale: 0 };
    this.L.fires.push(this.forgeFire);
  }
  useForge() {
    const g = this.game, f = this.forge, w = g.weapons;
    if (f.state === 'idle') {
      const s = w.current;
      if (s.upgraded) return;
      if (!g.spend(5000)) return;
      f.state = 'working'; f.t = 0; f.slot = w.cur; f.weaponId = s.def.id;
      w.state = 'forging'; w.stateT = 0;
      g.audio.forge();
      if (f.display) f.group.remove(f.display);
      const gm = buildGun(s.def.id, g.textures, false);
      gm.root.scale.setScalar(1.4); gm.root.rotation.y = Math.PI / 2; gm.root.position.set(0, 1.15, 0.85);
      f.group.add(gm.root); f.display = gm.root;
    } else if (f.state === 'ready') {
      if (f.display) { f.group.remove(f.display); f.display = null; }
      const idx = w.has(f.weaponId);
      if (idx >= 0) w.upgradeCurrentTo(idx);
      else if (w.state === 'forging') { w.state = 'raise'; w.stateT = 0; }
      f.state = 'idle';
      g.audio.purchase();
      g.stats.upgrades++;
    }
  }

  getInteraction(p) {
    const g = this.game, pts = g.points;
    const pos = p.pos;
    const fwd = this._fwd || (this._fwd = new THREE.Vector3());
    g.camera.getWorldDirection(fwd);
    const near = (target, front, maxD = 2.0, dot = 0.3) => {
      const dx = pos.x - target.x, dz = pos.z - target.z;
      const d = Math.hypot(dx, dz);
      if (d > maxD) return false;
      if (front && dx * front.x + dz * front.z < 0) return false;
      const tl = d || 1;
      return (fwd.x * -dx + fwd.z * -dz) / tl > dot || d < 1.0;
    };
    const cost = (c) => (pts >= c ? `<b>[${c}]</b>` : `<span class="deny">[${c}]</span>`);
    const f = this.forge;
    if (f.state === 'ready' && near(f.pos, f.front, 2.8)) return { text: `Press <b>F</b> to take ${upgradeDef(WEAPONS[f.weaponId]).name}`, use: () => this.useForge(), always: true };
    for (const d of g.level.doors) {
      if (d.open) continue;
      if (near(d.pos, null, 2.6, 0.2)) return { text: `Press <b>F</b> to clear the way — ${d.label} ${cost(d.cost)}`, use: () => { if (g.spend(d.cost)) { g.level.openDoor(d); g.audio.doorOpen(d.pos.clone()); g.hud.banner(d.label.toUpperCase(), 'AREA UNSEALED', false, 2.5); } } };
    }
    for (const w of g.level.windows) {
      if (w.count >= 6) continue;
      if (!near(w.pos, w.normal, 2.3, 0.0)) continue;
      if (w.occupant && w.occupant.state === 'climbing') continue;
      return { text: 'Hold <b>F</b> to rebuild barrier', hold: true, win: w };
    }
    for (const pk of this.perks) {
      if (!near(pk.pos, pk.front, 1.9)) continue;
      const P = pk.def;
      if (p.perks.has(pk.id)) return { text: `${P.name} <span class="deny">— ACTIVE</span>` };
      if (pk.id === 'secondwind' && pk.bought >= 3) return { text: `${P.name} <span class="deny">— DEPLETED</span>` };
      if (!pk.on) return { text: `${P.name} <span class="deny">— REQUIRES POWER</span>` };
      return { text: `Press <b>F</b> for ${P.name} ${cost(P.cost)}<br><small>${P.desc}</small>`, use: () => this.buyPerk(pk) };
    }
    for (const wb of this.wallbuys) {
      if (!near(wb.pos, wb.front, 1.9)) continue;
      const idx = g.weapons.has(wb.weapon);
      if (idx >= 0) {
        const up = g.weapons.slots[idx].upgraded;
        const c = up ? 4500 : Math.floor(wb.def.cost / 2);
        return { text: `Press <b>F</b> for ${up ? 'Forged ' : ''}Ammo ${cost(c)}`, use: () => { if (g.spend(c)) { const s = g.weapons.slots[idx]; s.reserve = s.def.reserve; g.audio.purchase(); } } };
      }
      return { text: `Press <b>F</b> for ${wb.def.name} ${cost(wb.def.cost)}`, use: () => { if (g.spend(wb.def.cost)) { g.weapons.give(wb.weapon); g.audio.purchase(); } } };
    }
    const b = this.box;
    if (near(b.pos, b.front, 2.2)) {
      if (b.state === 'idle') return { text: `Press <b>F</b> to open the Reliquary ${cost(950)}`, use: () => this.useBox() };
      if (b.state === 'ready' && b.result !== 'skull') return { text: `Press <b>F</b> to take ${WEAPONS[b.result].name}`, use: () => this.useBox() };
    }
    const pw = this.power;
    if (!pw.on && near(pw.pos, pw.front, 2.0)) return { text: 'Press <b>F</b> to restore power', use: () => this.usePower() };
    if (near(f.pos, f.front, 2.8)) {
      if (!pw.on) return { text: 'THE FORGE <span class="deny">— REQUIRES POWER</span>' };
      if (f.state === 'idle') {
        if (g.weapons.current.upgraded) return { text: 'THE FORGE <span class="deny">— WEAPON ALREADY FORGED</span>' };
        return { text: `Press <b>F</b> to forge your weapon ${cost(5000)}`, use: () => this.useForge() };
      }
    }
    return null;
  }

  buyPerk(pk) {
    const g = this.game, p = g.player;
    if (!g.spend(pk.def.cost)) return;
    pk.bought++;
    g.weapons.drink(pk.def.hex);
    g.audio.jingle(pk.id.length * 7 + 3);
    const session = g.session;
    setTimeout(() => {
      if (g.session !== session) return;
      p.perks.add(pk.id);
      if (pk.id === 'ironhide') { p.maxHealth = 250; p.health = 250; }
      g.hud.setPerks(p.perks);
      g.hud.feed(`<b>${pk.def.name}</b> ACQUIRED`);
    }, 1500);
  }

  update(dt, t) {
    const g = this.game;
    for (const pk of this.perks) {
      const on = pk.on;
      const flick = on ? (Math.sin(t * 13 + pk.seed) > 0.97 ? 0.3 : 1) : 0;
      pk.logoMat.emissiveIntensity = on ? 1.6 * flick : 0.05;
      pk.signMat.emissiveIntensity = on ? 2.4 * flick : 0.05;
      pk.stripeMat.emissiveIntensity = on ? 3 * flick : 0.15;
    }
    for (const wb of this.wallbuys) wb.mat.emissiveIntensity = 0.2 + Math.sin(t * 2) * 0.05;
    const b = this.box;
    b.t += dt;
    b.beam.visible = b.state === 'idle';
    b.beam.material.uniforms.uOpacity.value = 0.18 + Math.sin(t * 2) * 0.05;
    this.runeMat.emissiveIntensity = 1.6 + Math.sin(t * 3) * 0.8;
    switch (b.state) {
      case 'idle': this.boxLight.intensity = 3; b.lidPivot.rotation.x = 0; b.inner.material.emissiveIntensity = 0; break;
      case 'open': {
        const k = Math.min(1, b.t / 0.5);
        b.lidPivot.rotation.x = -k * 1.9;
        b.inner.material.emissiveIntensity = k * 6;
        this.boxLight.intensity = 10 + Math.sin(t * 20) * 2;
        b.cycleT -= dt;
        if (b.cycleT <= 0 && b.t < 3.8) { b.cycleT = 0.06 + (b.t / 4) * 0.3; this.setDisplay(pick(BOX_POOL)); }
        if (b.display) b.display.position.set(0, 0.7 + smoothstep(0, 3.8, b.t) * 0.55, 0);
        if (b.t >= 4) {
          if (b.result === 'skull') {
            if (b.display) b.group.remove(b.display);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8d0b8, emissive: 0xff1000, emissiveIntensity: 0.6 }));
            skull.position.set(0, 1.3, 0); b.group.add(skull); b.display = skull;
            b.state = 'skull'; b.t = 0;
            g.audio.boxLaugh();
            g.addPoints(950, false);
            g.hud.banner('THE RELIQUARY FLEES', 'IT WILL APPEAR ELSEWHERE', true, 3);
          } else { this.setDisplay(b.result); b.display.position.set(0, 1.25, 0); b.state = 'ready'; b.t = 0; }
        }
        break;
      }
      case 'ready':
        if (b.display) { b.display.position.y = 1.25 - smoothstep(0, 12, b.t) * 0.5; b.display.rotation.y = Math.PI / 2 + Math.sin(t * 1.5) * 0.15; }
        if (b.t > 12) { if (b.display) { b.group.remove(b.display); b.display = null; } b.state = 'close'; b.t = 0; }
        break;
      case 'close': {
        const k = Math.min(1, b.t / 0.6);
        b.lidPivot.rotation.x = -(1 - k) * 1.9;
        b.inner.material.emissiveIntensity = (1 - k) * 6;
        if (k >= 1) { b.state = 'idle'; b.t = 0; }
        break;
      }
      case 'skull': {
        if (b.display) { b.display.position.y = 1.3 + b.t * 0.3; b.display.rotation.y += dt * 4; }
        if (b.t > 2) { b.group.position.y += dt * (b.t - 2) * 6; b.group.rotation.y += dt * (b.t - 2) * 5; }
        if (b.t > 4.5) {
          if (b.display) { b.group.remove(b.display); b.display = null; }
          b.group.position.y = 0;
          b.lidPivot.rotation.x = 0;
          const opts = this.L.spots.box.map((_, i) => i).filter((i) => i !== b.loc);
          this.placeBox(pick(opts));
          b.uses = 0; b.state = 'idle'; b.t = 0;
          g.audio.powerupSpawn(b.pos.clone());
        }
        break;
      }
    }
    const pw = this.power;
    if (pw.on && pw.anim < 1) { pw.anim = Math.min(1, pw.anim + dt * 2.5); pw.leverPivot.rotation.x = -0.6 + pw.anim * 1.6; }
    const f = this.forge;
    f.t += dt;
    const on = pw.on;
    this.forgeGlow.emissiveIntensity = on ? (f.state === 'working' ? 8 + Math.sin(t * 30) * 2 : 2.5 + Math.sin(t * 2) * 0.5) : 0.2;
    f.labelMat.emissiveIntensity = on ? 1.4 : 0.05;
    f.light.base = on ? (f.state === 'working' ? 40 : 12) : 0;
    this.forgeFire.scale = on ? (f.state === 'working' ? 0.8 : 0.35) : 0;
    if (f.state === 'working') {
      f.hammerPivot.rotation.x = -Math.abs(Math.sin((f.t * Math.PI) / 0.45)) * 0.9;
      if (f.display) {
        const k = Math.min(1, f.t / 1.2);
        f.display.position.set(0, 1.15 + Math.sin(k * Math.PI) * 0.1, 0.85 - k * 0.9);
        if (k >= 1) f.display.visible = false;
      }
      if (Math.random() < 0.3) g.effects.add.emit(f.pos.x + f.front.x * 0.7, 1.5, f.pos.z + f.front.z * 0.7, f.front.x * rand(1, 3) + rand(-1, 1), rand(1, 3), f.front.z * rand(1, 3) + rand(-1, 1), { life: rand(0.3, 0.8), size: rand(0.02, 0.05), color: [1, 0.6, 0.2], gravity: 9, bounce: 0.3 });
      if (f.t > 4) {
        f.state = 'ready'; f.t = 0;
        if (f.display) f.group.remove(f.display);
        const gm = buildGun(f.weaponId, g.textures, true);
        gm.root.scale.setScalar(1.4); gm.root.rotation.y = Math.PI / 2; gm.root.position.set(0, 1.15, 0.9);
        f.group.add(gm.root); f.display = gm.root;
        g.effects.electric(f.pos.clone().addScaledVector(f.front, 0.9).setY(1.3), 20);
      }
    } else if (f.state === 'ready') {
      f.hammerPivot.rotation.x = 0;
      if (f.display) f.display.rotation.y = Math.PI / 2 + Math.sin(t * 2) * 0.2;
      if (f.t > 20) this.useForge();
    } else f.hammerPivot.rotation.x = 0;
  }

  reset() {
    for (const pk of this.perks) { pk.bought = 0; pk.on = !pk.def.power; }
    this.power.on = false; this.power.anim = 0; this.power.leverPivot.rotation.x = -0.6; this.powerLamp.emissive.set(0xff2010);
    const b = this.box;
    if (b.display) { b.group.remove(b.display); b.display = null; }
    b.state = 'idle'; b.uses = 0; b.group.position.y = 0; b.lidPivot.rotation.x = 0;
    this.placeBox(0);
    const f = this.forge;
    if (f.display) { f.group.remove(f.display); f.display = null; }
    f.state = 'idle';
  }
}
