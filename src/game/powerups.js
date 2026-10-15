import * as THREE from 'three';
import { powerupIcon, canvasTex } from '../core/textures.js';
import { rand } from '../core/utils.js';

const NAMES = { maxammo: 'MAX AMMO', instakill: 'INSTA-KILL', double: 'DOUBLE POINTS', nuke: 'KABOOM', carpenter: 'CARPENTER' };
const VOICE = { maxammo: 'Max ammo!', instakill: 'Insta kill!', double: 'Double points!', nuke: 'Kaboom!', carpenter: 'Carpenter!' };

export class Powerups {
  constructor(game) {
    this.game = game;
    this.tex = {};
    for (const k of Object.keys(NAMES)) this.tex[k] = canvasTex(powerupIcon(k), true, false);
    this.glowTex = game.textures.glow;
    this.items = [];
    this.reset();
  }
  reset() {
    for (const it of this.items) this.game.scene.remove(it.group);
    this.items = [];
    this.active = { instakill: 0, double: 0 };
    this.dropsThisRound = 0;
    this.bag = [];
  }
  nextType() {
    if (!this.bag.length) {
      this.bag = ['maxammo', 'instakill', 'double', 'nuke', 'carpenter', 'double', 'instakill', 'maxammo'];
      for (let i = this.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]]; }
    }
    return this.bag.pop();
  }
  tryDrop(pos) {
    if (this.dropsThisRound >= 4) return;
    if (Math.random() < 0.028 + Math.min(0.01, this.game.rounds.round * 0.001)) this.drop(pos);
  }
  drop(pos, type) {
    type = type || this.nextType();
    if (type === 'carpenter' && this.game.level.windows.every((w) => w.count >= 6)) type = 'maxammo';
    this.dropsThisRound++;
    const g = new THREE.Group();
    const mat = new THREE.SpriteMaterial({ map: this.tex[type], color: new THREE.Color(1.6, 3.2, 1.8), transparent: true, depthWrite: false });
    const s = new THREE.Sprite(mat); s.scale.set(0.75, 0.75, 1); g.add(s);
    const gm = new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(0.3, 1.4, 0.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Sprite(gm); glow.scale.set(2.2, 2.2, 1); g.add(glow);
    g.position.set(pos.x, 1.1, pos.z);
    this.game.scene.add(g);
    this.items.push({ type, group: g, t: 0, mat, gm });
    this.game.audio.powerupSpawn(g.position.clone());
  }
  grab(it) {
    const g = this.game;
    const type = it.type;
    g.audio.powerupGrab();
    g.audio.announce(VOICE[type]);
    g.hud.banner(NAMES[type], '', false, 2);
    g.hud.flash(0.15);
    switch (type) {
      case 'maxammo': g.weapons.refillAll(); break;
      case 'instakill': this.active.instakill = 30; break;
      case 'double': this.active.double = 30; break;
      case 'nuke': {
        g.hud.flash(0.9);
        g.shake(0.6);
        g.audio.explosion(g.player.pos.clone().add(new THREE.Vector3(0, 10, 0)));
        const session = g.session;
        const zs = g.zombies.zombies.filter((z) => z.alive);
        zs.forEach((z, i) => setTimeout(() => {
          if (!z.alive || g.session !== session) return;
          z.hp = 0;
          z.die(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize(), false, { kind: 'nuke' });
          g.effects.fireP.emit(z.pos.x, 1, z.pos.z, 0, 1, 0, { life: 0.5, size: 1.2, sizeEnd: 2, color: [1, 0.6, 0.2], colorEnd: [0.4, 0.05, 0] });
        }, 200 + i * 60));
        g.addPoints(400, false);
        break;
      }
      case 'carpenter': g.level.repairAll(); g.addPoints(200, false); g.audio.boardRepair(g.player.pos.clone()); break;
    }
  }
  update(dt) {
    const g = this.game, p = g.player.pos;
    for (const k of ['instakill', 'double']) if (this.active[k] > 0) this.active[k] = Math.max(0, this.active[k] - dt);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      const gp = it.group.position;
      gp.y = 1.1 + Math.sin(it.t * 2.4) * 0.12;
      it.mat.rotation = Math.sin(it.t * 1.5) * 0.15;
      it.gm.opacity = 0.6 + Math.sin(it.t * 5) * 0.2;
      it.group.visible = !(it.t > 18 && Math.floor(it.t * (it.t > 23 ? 8 : 4)) % 2 === 0);
      if (Math.random() < dt * 8) g.effects.add.emit(gp.x + rand(-0.3, 0.3), gp.y - 0.3, gp.z + rand(-0.3, 0.3), 0, rand(0.3, 0.8), 0, { life: 1, size: 0.04, color: [0.4, 1, 0.5] });
      if (Math.floor(it.t * 1.2) !== Math.floor((it.t - dt) * 1.2)) g.audio.powerupLoop(gp.clone());
      if (Math.hypot(p.x - gp.x, p.z - gp.z) < 1.3 && g.player.alive) { this.grab(it); g.scene.remove(it.group); this.items.splice(i, 1); continue; }
      if (it.t > 27) { g.scene.remove(it.group); this.items.splice(i, 1); }
    }
    g.hud.setPowerups(this.active);
  }
}
