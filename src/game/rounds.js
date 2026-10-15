import { clamp, rand } from '../core/utils.js';

export class RoundManager {
  constructor(game) { this.game = game; this.reset(); }
  reset() {
    this.round = 0;
    this.state = 'pre';
    this.timer = 3.5;
    this.toSpawn = 0; this.spawned = 0; this.killed = 0; this.total = 0;
    this.spawnT = 0;
    this.red = false;
    this.brutes = 0;
    this.lastKillPos = null;
  }
  health(n) { return n < 10 ? 150 + 100 * (n - 1) : Math.round(950 * Math.pow(1.1, n - 9)); }
  count(n) { return Math.round(6 + 2.5 * (n - 1) + 0.15 * (n - 1) * (n - 1)); }
  get remaining() { return this.total - this.killed; }

  start(n) {
    const g = this.game;
    this.round = n;
    this.red = n % 5 === 0;
    this.total = this.red ? Math.round(8 + n * 1.1) : this.count(n);
    this.brutes = !this.red && n >= 7 && (n % 4 === 3 || n >= 14) ? 1 + Math.floor((n - 7) / 8) : 0;
    this.total += this.brutes;
    this.toSpawn = this.total;
    this.spawned = 0; this.killed = 0;
    this.spawnT = 1.5;
    this.state = 'active';
    g.powerups.dropsThisRound = 0;
    g.hud.setRound(n);
    g.audio.roundStart(this.red);
    g.audio.setMusicState(true, this.red ? 1 : clamp(n / 15, 0, 0.6));
    g.setRedFog(this.red);
    if (this.red) { g.hud.banner('THE RED FOG', `ROUND ${n} — THEY HUNT`, true, 4); setTimeout(() => g.audio.announce('The red fog rises.'), 1500); }
    else if (n === 1) g.hud.banner('SURVIVE', 'HOLD CHECKPOINT DELTA', false, 3.5);
    g.boardsRebuiltRound = 0;
    if (n > 1) g.weapons.grenadeCount = Math.min(4, g.weapons.grenadeCount + 2);
  }

  end() {
    const g = this.game;
    this.state = 'intermission';
    this.timer = this.red ? 12 : 9;
    g.audio.roundEnd();
    g.audio.setMusicState(false, 0);
    if (this.red) {
      const p = this.lastKillPos || g.player.pos.clone().add({ x: 1.5, y: 0, z: 0 });
      g.powerups.drop(p, 'maxammo');
      g.setRedFog(false);
    }
    g.stats.round = this.round;
  }

  pickType() {
    const n = this.round;
    if (this.red) return { type: 'sprinter', speed: rand(4.4, 5.0) };
    const pSprint = clamp((n - 5) * 0.1, 0, 0.7);
    const pRun = clamp((n - 2) * 0.18, 0, 0.9);
    if (Math.random() < pSprint) return { type: 'sprinter', speed: rand(4.2, 4.8) };
    if (Math.random() < pRun) return { type: 'runner', speed: rand(2.4, 3.1) };
    return { type: 'walker', speed: rand(0.95, 1.35) };
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'pre' || this.state === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this.start(this.round + 1);
      return;
    }
    const alive = g.zombies.aliveCount;
    const maxAlive = g.quality === 'low' ? 16 : 24;
    this.spawnT -= dt;
    if (this.toSpawn > 0 && this.spawnT <= 0 && alive < maxAlive) {
      this.spawnT = Math.max(0.35, 2.0 - this.round * 0.1) * (this.red ? 0.6 : 1) * rand(0.7, 1.3);
      const hp = this.health(this.round) * (this.red ? 0.85 : 1);
      if (this.brutes > 0 && this.spawned >= Math.floor(this.total * 0.35)) {
        this.brutes--;
        const z = g.zombies.spawn('brute', hp * 9 + 2000, 1.6, true);
        g.hud.banner('BRUTE', 'SOMETHING BIG IS COMING', true, 2.5);
        g.audio.zombieVoice(z.pos.clone().setY(2), 'scream', 0.45);
        g.shake(0.3);
      } else {
        const t = this.pickType();
        g.zombies.spawn(t.type, hp, t.speed);
      }
      this.toSpawn--; this.spawned++;
    }
    if (this.toSpawn <= 0 && alive === 0) this.end();
  }

  onKill(z) {
    this.killed++;
    this.lastKillPos = z.pos.clone();
  }
}
