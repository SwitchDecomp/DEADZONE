import { perkIcon, powerupIcon } from '../core/textures.js';
import { PERKS } from '../world/machines.js';
import { rand } from '../core/utils.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.points = $('points'); this.pop = $('points-pop');
    this.mag = $('ammo-mag'); this.res = $('ammo-res'); this.wname = $('weapon-name');
    this.gren = $('grenades'); this.reloadHint = $('reload-hint');
    this.prompt = $('prompt'); this.promptText = $('prompt-text'); this.promptHold = $('prompt-hold');
    this.hit = $('hitmarker'); this.cross = $('crosshair');
    this.dmg = $('damage-overlay'); this.dirs = $('damage-dirs');
    this.bannerEl = $('banner'); this.zoneEl = $('zone-name');
    this.roundCanvas = $('round-canvas'); this.rctx = this.roundCanvas.getContext('2d');
    this.perksEl = $('perks'); this.puEl = $('powerups');
    this.flashEl = $('flash-overlay'); this.scopeEl = $('scope-overlay');
    this.killfeed = $('killfeed'); this.intel = $('intel');
    this.dmgLevel = 0; this.hitT = 0; this.flashV = 0;
    this.perkIcons = {};
    for (const [k, p] of Object.entries(PERKS)) this.perkIcons[k] = perkIcon(p.color, p.symbol).toDataURL();
    this.puIcons = {};
    for (const k of ['maxammo', 'instakill', 'double', 'nuke', 'carpenter']) this.puIcons[k] = powerupIcon(k).toDataURL();
    this.roundShown = 0; this.roundAnim = 0; this.roundTarget = 0;
    this.lastAmmo = ''; this.lastPrompt = null; this.lastPu = '';
  }
  show(v) { this.el.classList.toggle('show', v); }

  setPoints(p, delta) {
    this.points.textContent = p;
    if (delta) {
      const d = document.createElement('div');
      d.className = 'ppop' + (delta < 0 ? ' neg' : '');
      d.textContent = (delta > 0 ? '+' : '') + delta;
      d.style.setProperty('--dx', `${rand(-60, -10)}px`);
      d.style.bottom = `${rand(0, 20)}px`;
      this.pop.appendChild(d);
      setTimeout(() => d.remove(), 1000);
    }
  }
  setAmmo(mag, res, max, nades, reloading) {
    const key = `${mag}|${res}|${nades}|${reloading}`;
    if (key === this.lastAmmo) return;
    this.lastAmmo = key;
    this.mag.textContent = mag; this.res.textContent = res;
    const low = mag <= Math.ceil(max * 0.25);
    this.mag.classList.toggle('low', low);
    this.gren.innerHTML = '<i></i>'.repeat(Math.max(0, nades));
    const empty = res <= 0 && mag === 0;
    this.reloadHint.textContent = empty ? 'NO AMMO' : 'RELOAD';
    this.reloadHint.classList.toggle('show', empty || (low && !reloading && res > 0));
  }
  weaponName(n, up) { this.wname.textContent = n; this.wname.classList.toggle('up', !!up); }
  setPrompt(text, hold = -1) {
    if (!text) { if (this.lastPrompt !== null) { this.prompt.classList.remove('show'); this.lastPrompt = null; } return; }
    if (this.lastPrompt !== text) { this.promptText.innerHTML = text; this.lastPrompt = text; }
    this.prompt.classList.add('show');
    this.promptHold.style.display = hold >= 0 ? 'block' : 'none';
    if (hold >= 0) this.promptHold.firstElementChild.style.width = `${hold * 100}%`;
  }
  hitmarker(kill) { this.hit.classList.toggle('kill', !!kill); this.hitT = kill ? 0.35 : 0.2; }
  hurt(f) { this.dmgLevel = Math.min(1, this.dmgLevel + f * 1.6 + 0.2); }
  damageDir(ang) {
    const d = document.createElement('div');
    d.className = 'dmg-dir';
    d.style.transform = `rotate(${(-ang * 180) / Math.PI + 180}deg)`;
    this.dirs.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; }, 500);
    setTimeout(() => d.remove(), 1200);
  }
  banner(title, sub = '', red = false, dur = 3) {
    this.bannerEl.querySelector('.b-title').textContent = title;
    this.bannerEl.querySelector('.b-sub').textContent = sub;
    this.bannerEl.classList.toggle('red', red);
    this.bannerEl.style.opacity = title ? 1 : 0;
    clearTimeout(this.bannerTO);
    this.bannerTO = setTimeout(() => (this.bannerEl.style.opacity = 0), dur * 1000);
  }
  zone(name) {
    this.zoneEl.textContent = '▸ ' + name;
    this.zoneEl.classList.add('show');
    clearTimeout(this.zoneTO);
    this.zoneTO = setTimeout(() => this.zoneEl.classList.remove('show'), 3500);
  }
  feed(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    this.killfeed.appendChild(d);
    setTimeout(() => d.remove(), 3000);
    while (this.killfeed.children.length > 5) this.killfeed.firstChild.remove();
  }
  setPerks(perks) {
    this.perksEl.innerHTML = '';
    for (const p of perks) { const i = document.createElement('img'); i.src = this.perkIcons[p]; i.title = PERKS[p].name; this.perksEl.appendChild(i); }
  }
  setPowerups(active) {
    let html = '';
    for (const k of ['instakill', 'double']) {
      const t = active[k];
      if (t > 0) html += `<div class="pu ${t < 5 ? 'blink' : ''}"><img src="${this.puIcons[k]}"><span>${Math.ceil(t)}</span></div>`;
    }
    if (html !== this.lastPu) { this.puEl.innerHTML = html; this.lastPu = html; }
  }
  flash(v) { this.flashV = Math.max(this.flashV, v); }
  scope(on) { if (this.scoped !== on) { this.scoped = on; this.scopeEl.style.display = on ? 'block' : 'none'; } }
  downed(on) { $('downed').classList.toggle('show', on); }
  setIntel(show, data) {
    if (this.intelShown !== show) { this.intelShown = show; this.intel.classList.toggle('show', show); }
    if (!show) return;
    $('in-round').textContent = data.round; $('in-kills').textContent = data.kills; $('in-hs').textContent = data.headshots;
    $('in-rem').textContent = data.remaining; $('in-power').textContent = data.power ? 'ONLINE' : 'OFFLINE'; $('in-time').textContent = data.time;
  }

  setRound(n, animate = true) {
    if (!animate) { this.roundShown = n; this.roundAnim = 0; this.drawRound(n, 1, false); return; }
    this.roundTarget = n; this.roundAnim = 4.5;
  }
  drawRound(n, alpha, white) {
    const g = this.rctx, W = this.roundCanvas.width, H = this.roundCanvas.height;
    g.clearRect(0, 0, W, H);
    if (n <= 0) return;
    g.globalAlpha = Math.max(0, Math.min(1, alpha));
    const col = white ? '#f4ece0' : '#a8140c';
    g.fillStyle = col; g.strokeStyle = col;
    g.shadowColor = white ? 'rgba(255,255,255,0.6)' : 'rgba(255,30,10,0.55)'; g.shadowBlur = 16;
    if (n <= 5) {
      g.lineCap = 'round';
      for (let i = 0; i < Math.min(n, 4); i++) this.brush(g, 30 + i * 46, 30, 36 + i * 46, 175, 14, 7 + i);
      if (n === 5) this.brush(g, 10, 150, 200, 40, 13, 16);
    } else {
      g.font = 'bold 170px "Black Ops One", Impact';
      g.textBaseline = 'bottom';
      g.fillText(String(n), 8, H + 6);
    }
    g.globalAlpha = 1;
  }
  brush(g, x0, y0, x1, y1, w, seed) {
    let s = seed;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < 5; k++) {
      g.lineWidth = w * (0.5 + r() * 0.6);
      g.beginPath();
      g.moveTo(x0 + (r() - 0.5) * 6, y0 + (r() - 0.5) * 6);
      g.quadraticCurveTo((x0 + x1) / 2 + (r() - 0.5) * 14, (y0 + y1) / 2 + (r() - 0.5) * 10, x1 + (r() - 0.5) * 6, y1 + (r() - 0.5) * 6);
      g.stroke();
    }
    g.fillRect(x1 - 3, y1, 4, 10 + r() * 18);
  }

  update(dt) {
    if (this.hitT > 0) { this.hitT -= dt; this.hit.style.opacity = Math.min(1, this.hitT * 6); } else if (this.hit.style.opacity !== '0') this.hit.style.opacity = 0;
    const p = this.game.player;
    const low = p.alive ? 1 - p.health / p.maxHealth : 1;
    this.dmgLevel = Math.max(0, this.dmgLevel - dt * 0.9);
    this.dmg.style.opacity = Math.min(1, this.dmgLevel * 0.8 + low * 0.6).toFixed(3);
    if (this.flashV > 0) { this.flashV = Math.max(0, this.flashV - dt * 2.5); this.flashEl.style.opacity = this.flashV; }
    const w = this.game.weapons;
    const px = Math.max(3, (w.spreadNow * window.innerHeight) / (2 * Math.tan((this.game.camera.fov * Math.PI) / 360)));
    const c = this.cross.children;
    c[0].style.top = `${-px - 10}px`; c[1].style.top = `${px}px`; c[2].style.left = `${-px - 10}px`; c[3].style.left = `${px}px`;
    const hide = w.adsAmount > 0.5 || p.sprinting || w.state === 'drink' || !p.alive;
    this.cross.style.opacity = hide ? 0 : 1;
    if (this.roundAnim > 0) {
      this.roundAnim -= dt;
      const t = 4.5 - this.roundAnim;
      if (t < 1.2) this.drawRound(this.roundShown, 1, Math.floor(t * 6) % 2 === 0);
      else if (t < 2.2) this.drawRound(this.roundShown, 1 - (t - 1.2), true);
      else if (t < 3.2) { this.roundShown = this.roundTarget; this.drawRound(this.roundShown, t - 2.2, true); }
      else this.drawRound(this.roundShown, 1, t < 3.5);
    }
  }
}
