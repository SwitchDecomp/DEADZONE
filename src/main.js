import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildTextures } from './core/textures.js';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { clamp, damp, lerp, rand, fmtTime } from './core/utils.js';
import { Post } from './render/post.js';
import { createSky } from './render/sky.js';
import { createMaterials } from './world/materials.js';
import { Level } from './world/level.js';
import { Machines } from './world/machines.js';
import { Effects } from './game/effects.js';
import { ZombieManager } from './game/zombies.js';
import { Player } from './game/player.js';
import { WeaponSystem } from './game/weapons.js';
import { Powerups } from './game/powerups.js';
import { RoundManager } from './game/rounds.js';
import { HUD } from './ui/hud.js';
import { prewarmZombies, buildZombie } from './game/zombieModel.js';
import { prewarmGuns } from './game/gunModels.js';

const $ = (id) => document.getElementById(id);
const DEFAULTS = { v: 2, sens: 1, adsSens: 0.85, fov: 80, vol: 0.8, music: 0.6, quality: 'medium', invert: false, grain: true, voice: true, bright: 1.3 };
const FOG_NORMAL = new THREE.Color(0x121820), FOG_RED = new THREE.Color(0x3a0806);
const MIST_NORMAL = new THREE.Color(0x4a5560), MIST_RED = new THREE.Color(0x902018);
const MOON_NORMAL = new THREE.Color(0x9ab0d8), MOON_RED = new THREE.Color(0xff5030);

class Game {
  constructor() {
    this.state = 'loading';
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('deadzone.settings') || '{}'); } catch (e) { saved = {}; }
    this.settings = { ...DEFAULTS, ...saved };
    if (saved.v !== 2) { this.settings.quality = 'medium'; this.settings.v = 2; }
    this.quality = this.settings.quality;
    try { this.best = JSON.parse(localStorage.getItem('deadzone.best') || '{"round":0,"kills":0}'); } catch (e) { this.best = { round: 0, kills: 0 }; }
    this.time = 0;
    this.trauma = 0;
    this.shakeOffset = new THREE.Vector3();
    this.redK = 0; this.redTarget = 0;
    this.lightningT = rand(6, 14); this.flashK = 0;
    this.holdT = 0;
    this.points = 500;
    this.session = 0;
    this.stats = this.freshStats();
    this._lc = new THREE.Color(); this._vmCol = new THREE.Color(); this._mist = new THREE.Color();
  }

  freshStats() { return { kills: 0, headshots: 0, shots: 0, hits: 0, earned: 0, time: 0, round: 0, boxUses: 0, upgrades: 0 }; }

  async init() {
    const progress = (p, txt) => { $('load-fill').style.width = `${Math.round(p * 100)}%`; $('load-text').textContent = txt; };
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false }));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = this.settings.bright;
    r.outputColorSpace = THREE.SRGBColorSpace;
    $('app').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG_NORMAL.clone(), 0.032);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 700);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.01, 10);

    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env; this.scene.environmentIntensity = 0.1;
    this.vmScene.environment = env; this.vmScene.environmentIntensity = 0.35;

    progress(0.01, 'LOADING TYPEFACES');
    try { await Promise.race([document.fonts.ready, new Promise((res) => setTimeout(res, 2000))]); } catch (e) { /* ignore */ }
    this.textures = await buildTextures((p, t) => progress(p * 0.85, t));
    progress(0.88, 'CONSTRUCTING SITE 9');
    await new Promise((res) => setTimeout(res, 20));

    this.materials = createMaterials(this.textures);
    this.sky = createSky();
    this.scene.add(this.sky);
    this.setupLights();
    this.level = new Level(this);
    this.level.build();
    this.machines = new Machines(this);
    this.level.nav.build(this.level.colliders, this.level.zones);
    this.level.snapshotLights();
    progress(0.92, 'RAISING THE DEAD');
    await new Promise((res) => setTimeout(res, 20));
    prewarmZombies(this.textures);
    prewarmGuns();
    progress(0.96, 'ARMING');
    await new Promise((res) => setTimeout(res, 20));

    this.audio = new AudioEngine();
    this.audio.voice = this.settings.voice;
    this.input = new Input(r.domElement);
    this.effects = new Effects(this);
    this.zombies = new ZombieManager(this);
    this.player = new Player(this);
    this.hud = new HUD(this);
    this.powerups = new Powerups(this);
    this.rounds = new RoundManager(this);
    this.weapons = new WeaponSystem(this);
    this.post = new Post(r, this.scene, this.camera, this.vmScene, this.vmCamera);
    this.applySettings();
    this.setupUI();

    window.addEventListener('resize', () => this.resize());
    this.input.onLockChange = (locked) => this.onLock(locked);
    this.resize();

    progress(1, 'COMPILING SHADERS');
    await new Promise((res) => setTimeout(res, 20));
    this.setupMenuScene();
    // warm up shader programs (skinned zombies, every weapon model) to avoid in-game hitches
    const warm = [buildZombie(this.textures, 'walker'), buildZombie(this.textures, 'brute')];
    warm.forEach((w, i) => { w.root.position.set(i * 2, 0, -3); this.scene.add(w.root); });
    const ids = ['pistol', 'smg', 'shotgun', 'ar', 'burst', 'lmg', 'sniper', 'volt'];
    const vms = [];
    for (const id of ids) for (const up of [false, true]) { const m = this.weapons.model(id, up); this.weapons.holder.add(m.root); vms.push(m.root); }
    this.vmScene.visible = true;
    try { r.compile(this.scene, this.camera); r.compile(this.vmScene, this.vmCamera); } catch (e) { /* ignore */ }
    this.vmScene.visible = false;
    warm.forEach((w) => { this.scene.remove(w.root); w.mesh.skeleton.dispose(); });
    for (const v of vms) if (v !== this.weapons.gm.root) this.weapons.holder.remove(v);

    $('loading').classList.remove('show');
    this.showScreen('menu');
    this.state = 'menu';
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this.frame());
  }

  setupLights() {
    const moon = (this.moon = new THREE.DirectionalLight(0x9ab0d8, 0.55));
    moon.position.set(28, 52, -36);
    moon.target.position.set(0, 0, 0);
    moon.castShadow = true;
    const sc = moon.shadow.camera;
    sc.left = -46; sc.right = 46; sc.top = 46; sc.bottom = -46; sc.near = 10; sc.far = 140;
    moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.04;
    moon.shadow.mapSize.set(2048, 2048);
    this.scene.add(moon); this.scene.add(moon.target);
    this.hemi = new THREE.HemisphereLight(0x36435a, 0x0c0b0a, 0.6);
    this.scene.add(this.hemi);
    this.vmHemi = new THREE.HemisphereLight(0x6070a0, 0x151210, 1.3);
    this.vmScene.add(this.vmHemi);
    this.vmKey = new THREE.DirectionalLight(0xffffff, 0.9);
    this.vmKey.position.set(0.6, 1, 0.4);
    this.vmScene.add(this.vmKey);
    this.vmRim = new THREE.DirectionalLight(0x8090c0, 0.6);
    this.vmRim.position.set(-1, 0.4, -0.5);
    this.vmScene.add(this.vmRim);
  }

  // ---------------- SETTINGS / UI ----------------
  applySettings() {
    const s = this.settings;
    this.quality = s.quality;
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = s.quality === 'low' ? Math.min(dpr, 1) * 0.75 : s.quality === 'medium' ? Math.min(dpr, 1) : s.quality === 'high' ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
    const shadows = s.quality !== 'low';
    if (this.renderer.shadowMap.enabled !== shadows) {
      this.renderer.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true)); });
    }
    const ms = s.quality === 'ultra' ? 4096 : 2048;
    if (this.moon.shadow.mapSize.x !== ms) {
      this.moon.shadow.mapSize.set(ms, ms);
      if (this.moon.shadow.map) { this.moon.shadow.map.dispose(); this.moon.shadow.map = null; }
    }
    if (this.level.truckLight) this.level.truckLight.light.castShadow = s.quality === 'ultra';
    this.renderer.toneMappingExposure = s.bright;
    if (this._q !== s.quality) { this._q = s.quality; this.post.setQuality(s.quality); }
    this.post.u.uGrain.value = s.grain ? 0.05 : 0;
    this.audio.setVolumes(s.vol, s.music);
    this.audio.voice = s.voice;
    if (this.state !== 'playing') { this.camera.fov = this.settings.fov; }
    this.resize();
    try { localStorage.setItem('deadzone.settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  setupUI() {
    const s = this.settings;
    const bind = (id, key, fmt = (v) => v, parse = parseFloat) => {
      const el = $(id), val = $('val-' + id.slice(4));
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!s[key]; else el.value = s[key];
      if (val) val.textContent = fmt(s[key]);
      el.addEventListener('input', () => {
        s[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
        if (val) val.textContent = fmt(s[key]);
        this.applySettings();
      });
    };
    bind('set-sens', 'sens', (v) => (+v).toFixed(2));
    bind('set-adssens', 'adsSens', (v) => (+v).toFixed(2));
    bind('set-fov', 'fov', (v) => v);
    bind('set-bright', 'bright', (v) => (+v).toFixed(2));
    bind('set-vol', 'vol', (v) => Math.round(v * 100));
    bind('set-music', 'music', (v) => Math.round(v * 100));
    bind('set-quality', 'quality', () => '', (v) => v);
    bind('set-invert', 'invert');
    bind('set-grain', 'grain');
    bind('set-voice', 'voice');
    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('mouseenter', () => { if (this.audio.ctx) this.audio.uiHover(); });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const first = !this.audio.ctx;
        this.audio.init();
        if (first) { this.audio.setVolumes(s.vol, s.music); this.audio.setMusicState(false, 0); }
        this.audio.uiClick();
        this.action(b.dataset.action);
      });
    });
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.locked) this.input.lock();
    });
    $('click-to-play').style.pointerEvents = 'none';
    this.updateBest();
  }

  updateBest() {
    $('menu-best').innerHTML = this.best.round ? `LONGEST SURVIVAL: <b>ROUND ${this.best.round}</b> &nbsp;·&nbsp; MOST KILLS: <b>${this.best.kills}</b>` : 'NO RECORD — THE DEAD ARE WAITING';
  }

  showScreen(id) {
    for (const s of ['menu', 'settings', 'controls', 'pause', 'gameover']) $(s).classList.toggle('show', s === id);
  }

  action(a) {
    switch (a) {
      case 'play': this.startGame(); break;
      case 'settings': this.backTo = this.state === 'paused' ? 'pause' : 'menu'; this.showScreen('settings'); break;
      case 'controls': this.backTo = this.state === 'paused' ? 'pause' : 'menu'; this.showScreen('controls'); break;
      case 'back': this.showScreen(this.backTo || 'menu'); this.backTo = null; break;
      case 'resume': this.resume(); break;
      case 'quit': case 'menu': this.toMenu(); break;
    }
  }

  onLock(locked) {
    if (!locked && this.state === 'playing') this.pause();
  }
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.showScreen('pause');
    $('click-to-play').style.display = 'none'; this._wasLocked = undefined;
    if (this.audio.ctx) this.audio.ctx.suspend();
  }
  resume() {
    this.state = 'playing';
    this.showScreen(null);
    if (this.audio.ctx) this.audio.ctx.resume();
    this.input.lock();
  }

  // ---------------- MENU SCENE ----------------
  setupMenuScene() {
    this.godMode = true;
    this.zombies.clear();
    this.player.reset({ x: 0, z: -2, yaw: 0 });
    this.menuT = 0;
    this.menuSpawnT = 0.5;
    this.hud.show(false);
    this.vmScene.visible = false;
    this.resetPost();
  }

  resetPost() {
    const u = this.post.u;
    u.uDesat.value = 0; u.uBlur.value = 0; u.uDamage.value = 0; u.uLow.value = 0;
    this.camera.rotation.set(0, 0, 0);
  }

  updateMenu(dt) {
    this.menuT += dt;
    const t = this.menuT * 0.05;
    const cam = this.camera;
    cam.position.set(Math.sin(t) * 9.5, 2.3 + Math.sin(t * 2.3) * 0.4, Math.cos(t) * 9.5 - 1);
    cam.lookAt(0, 1.3, -1.5);
    if (cam.fov !== 62) { cam.fov = 62; cam.updateProjectionMatrix(); }
    this.menuSpawnT -= dt;
    if (this.menuSpawnT <= 0 && this.zombies.aliveCount < 7) {
      this.menuSpawnT = rand(2, 4);
      const type = Math.random() < 0.15 ? 'runner' : 'walker';
      const z = this.zombies.spawn(type, 200, type === 'runner' ? 2.2 : rand(0.8, 1.2), true);
      z.attackCd = 1e9;
    }
    this.player.pos.set(Math.sin(this.menuT * 0.1) * 3, 0, -2 + Math.cos(this.menuT * 0.13) * 3);
    this.zombies.update(dt);
  }

  // ---------------- GAME FLOW ----------------
  startGame() {
    this.session++;
    this.audio.init();
    this.zombies.clear();
    this.effects.clear();
    this.level.resetState();
    this.machines.reset();
    this.powerups.reset();
    this.rounds.reset();
    this.player.reset(this.level.spots.start);
    this.weapons.reset();
    this.points = 500;
    this.hud.setPoints(500);
    this.hud.setPerks(this.player.perks);
    this.hud.setRound(0, false);
    this.hud.downed(false);
    this.hud.banner('', '');
    this.stats = this.freshStats();
    this.godMode = false;
    this.setRedFog(false); this.redK = 0;
    this.vmScene.visible = true;
    this.weapons.root.visible = true;
    this.hud.show(true);
    this.showScreen(null);
    this.state = 'playing';
    this._wasLocked = undefined;
    this.deathT = 0;
    this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix();
    this.resetPost();
    this.input.lock();
    this.audio.setMusicState(false, 0);
    this.hud.zone(this.level.zones[0].name);
  }

  toMenu() {
    this.session++;
    this.state = 'menu';
    if (this.audio.ctx) this.audio.ctx.resume();
    this.input.unlock();
    $('click-to-play').style.display = 'none';
    this.effects.clear();
    this.level.resetState();
    this.machines.reset();
    this.powerups.reset();
    this.setRedFog(false);
    this.setupMenuScene();
    this.showScreen('menu');
    this.updateBest();
  }

  onPlayerDeath() {
    this.state = 'dying';
    this.deathT = 0;
    this.audio.gameOver();
    this.hud.setPrompt(null);
    this.stats.round = this.rounds.round;
  }

  showGameOver() {
    this.state = 'gameover';
    this.input.unlock();
    this.hud.show(false);
    $('click-to-play').style.display = 'none';
    const s = this.stats;
    $('go-rounds').textContent = `YOU SURVIVED ${s.round} ROUND${s.round === 1 ? '' : 'S'}`;
    const acc = s.shots ? Math.min(100, Math.round((s.hits / s.shots) * 100)) : 0;
    $('go-stats').innerHTML = [
      ['KILLS', s.kills], ['HEADSHOTS', s.headshots], ['POINTS EARNED', s.earned],
      ['TIME SURVIVED', fmtTime(s.time)], ['ACCURACY', acc + '%'], ['WEAPONS FORGED', s.upgrades],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    if (s.round > this.best.round || (s.round === this.best.round && s.kills > this.best.kills)) {
      this.best = { round: s.round, kills: s.kills };
      try { localStorage.setItem('deadzone.best', JSON.stringify(this.best)); } catch (e) { /* ignore */ }
      $('go-rounds').textContent += ' — NEW RECORD';
    }
    this.showScreen('gameover');
  }

  // ---------------- ECONOMY ----------------
  addPoints(n, allowDouble = true) {
    if (allowDouble && this.powerups.active.double > 0) n *= 2;
    this.points += n;
    this.stats.earned += n;
    this.hud.setPoints(this.points, n);
  }
  spend(c) {
    if (this.points < c) { this.audio.denied(); return false; }
    this.points -= c;
    this.hud.setPoints(this.points, -c);
    return true;
  }

  // ---------------- COMBAT ----------------
  hitZombie(z, dmg, part, point, dir, src, sub) {
    if (!z.alive) return;
    const res = z.damage(dmg, part, point, dir, src, sub);
    if (this.state === 'menu') return;
    this.stats.hits++;
    this.hud.hitmarker(res.killed);
    this.audio.hitmarker(res.killed);
    if (!res.killed && src.kind !== 'explosion' && src.kind !== 'volt') this.addPoints(10);
  }
  onZombieKilled(z, head, src) {
    if (this.state === 'menu') return;
    this.stats.kills++;
    if (head) this.stats.headshots++;
    this.rounds.onKill(z);
    if (src.kind === 'nuke') return;
    let pts = src.kind === 'melee' ? 130 : head ? 100 : 60;
    if (z.type === 'brute') { pts = 500; this.hud.feed('<b>BRUTE</b> SLAIN +500'); this.powerups.drop(z.pos.clone()); }
    this.addPoints(pts);
    if (z.type !== 'brute') this.powerups.tryDrop(z.pos);
  }
  explode(pos, radius, dmg, src) {
    if (src.small) this.effects.smallExplosion(pos); else this.effects.explosion(pos, radius / 6);
    this.audio.explosion(pos);
    const pd = pos.distanceTo(this.player.pos);
    this.shake(clamp(1.2 - pd / (radius * 3), 0, 1) * (src.small ? 0.3 : 1));
    if (!src.small && pd < radius * 2) this.hud.flash(clamp(0.5 - pd / (radius * 4), 0, 0.5));
    for (const z of this.zombies.zombies.slice()) {
      if (!z.alive) continue;
      const d = z.pos.distanceTo(pos);
      if (d > radius) continue;
      const dir = z.pos.clone().sub(pos).setY(0.3).normalize();
      this.hitZombie(z, dmg * (1 - (d / radius) * 0.6), 'torso', z.pos.clone().setY(1), dir, src);
      if (z.alive) z.impulse.addScaledVector(dir, 3);
    }
    if (src.grenade && pd < radius * 0.7 && this.player.alive) this.player.damage(Math.round(45 * (1 - pd / (radius * 0.7))) + 10, pos);
  }

  shake(a) { this.trauma = Math.min(1, this.trauma + a); }
  setRedFog(on) { this.redTarget = on ? 1 : 0; }
  flashLightning(k = 1) { this.flashK = Math.max(this.flashK, k); this.hud.flash(0.05 * k); }

  // ---------------- LOOP ----------------
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio || 1);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
    if (this.post) this.post.setSize(w, h, this.pixelRatio || 1);
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const st = this.state;
    if (st === 'paused') { this.post.render(0); this.input.endFrame(); return; }
    this.time += dt;
    this.updateAtmosphere(dt);
    if (st === 'menu') this.updateMenu(dt);
    else if (st === 'gameover') { this.zombies.update(dt); }
    else if (st === 'playing') {
      const locked = this.input.locked;
      if (locked !== this._wasLocked) { this._wasLocked = locked; $('click-to-play').style.display = locked ? 'none' : 'block'; }
      if (locked) this.updatePlaying(dt);
    } else if (st === 'dying') {
      this.deathT += dt;
      const p = this.player;
      p.eye = damp(p.eye, 0.25, 2, dt);
      this.camera.position.y = p.pos.y + p.eye;
      this.camera.rotation.z = damp(this.camera.rotation.z, 0.8, 2, dt);
      this.camera.rotation.x = damp(this.camera.rotation.x, 0.4, 2, dt);
      this.weapons.root.position.y -= dt * 0.6;
      this.zombies.update(dt);
      this.hud.update(dt);
      this.post.u.uDesat.value = Math.min(1, this.deathT / 2);
      this.post.u.uDamage.value = Math.min(1, this.deathT);
      if (this.deathT > 3.5) this.showGameOver();
    }
    this.effects.update(dt, this.camera);
    this.level.update(dt, this.time);
    this.machines.update(dt, this.time);
    this.zombies.postUpdate();
    if (this.audio.ctx) { this.audio.updateListener(this.camera); this.audio.update(dt); }
    this.sky.position.copy(this.camera.position);
    this.post.render(dt);
    this.input.endFrame();
  }

  updateAtmosphere(dt) {
    this.redK = damp(this.redK, this.redTarget, 0.8, dt);
    const fog = this.scene.fog;
    fog.color.copy(FOG_NORMAL).lerp(FOG_RED, this.redK);
    fog.density = lerp(0.032, 0.05, this.redK);
    this.sky.material.uniforms.uRed.value = this.redK;
    this.sky.material.uniforms.uTime.value = this.time;
    this.post.u.uRed.value = this.redK;
    this.effects.setFogColor(this._mist.copy(MIST_NORMAL).lerp(MIST_RED, this.redK));
    this.moon.color.copy(MOON_NORMAL).lerp(MOON_RED, this.redK);
    this.lightningT -= dt;
    if (this.lightningT <= 0) {
      this.lightningT = rand(12, 28);
      const dist = rand(0.2, 1);
      this.flashK = 1.5 - dist;
      setTimeout(() => (this.flashK = Math.max(this.flashK, 1.1 - dist)), 120);
      setTimeout(() => (this.flashK = Math.max(this.flashK, 0.7 - dist * 0.5)), 260);
      if (this.audio.ctx && this.state !== 'paused') this.audio.thunder(dist);
    }
    this.flashK = Math.max(0, this.flashK - dt * 4);
    const fk = this.flashK;
    this.sky.material.uniforms.uFlash.value = fk;
    this.hemi.intensity = 0.6 + fk * 2.5;
    this.moon.intensity = 0.55 + fk * 3;
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const tr = this.trauma * this.trauma, t = this.time * 30;
    this.shakeOffset.set(Math.sin(t * 1.1) * 0.035 * tr, Math.sin(t * 0.9 + 3) * 0.035 * tr, Math.sin(t * 1.3 + 5) * 0.05 * tr);
  }

  updatePlaying(dt) {
    const p = this.player, input = this.input, w = this.weapons;
    this.stats.time += dt;
    p.update(dt, input, this.settings);
    w.update(dt, input);
    this.rounds.update(dt);
    this.zombies.update(dt);
    this.powerups.update(dt);
    this.hud.update(dt);
    const fov = this.settings.fov / lerp(1, w.zoom, w.adsAmount);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const vfov = lerp(54, 40, w.adsAmount);
    if (Math.abs(this.vmCamera.fov - vfov) > 0.01) { this.vmCamera.fov = vfov; this.vmCamera.updateProjectionMatrix(); }
    const c = this.level.sampleLight(this.camera.position, this._lc);
    const lum = Math.max(c.r, c.g, c.b);
    if (lum > 0.0001) this._vmCol.setRGB(c.r / lum, c.g / lum, c.b / lum); else this._vmCol.setRGB(0.6, 0.65, 0.8);
    this.vmKey.color.lerp(this._vmCol, Math.min(1, dt * 6));
    this.vmKey.intensity = damp(this.vmKey.intensity, clamp(0.7 + lum * 0.3, 0.7, 3) + this.flashK * 1.5, 6, dt);
    this.vmHemi.intensity = 1.3 + this.flashK * 1.5;
    this.vmRim.color.copy(this.moon.color);
    const low = p.alive ? 1 - p.health / p.maxHealth : 1;
    this.post.u.uDamage.value = damp(this.post.u.uDamage.value, this.hud.dmgLevel * 0.8, 10, dt);
    this.post.u.uLow.value = low > 0.55 ? (low - 0.55) / 0.45 : 0;
    this.post.u.uDesat.value = p.downed ? 0.85 : low * 0.45;
    this.post.u.uBlur.value = p.downed ? 1 : 0;
    const covered = this.level.isCovered(p.pos.x, p.pos.z);
    if (covered !== this._covered) { this._covered = covered; this.audio.setIndoor(covered); }
    this.handleInteraction(dt);
    this.hud.setIntel(input.down('Tab'), {
      round: this.rounds.round, kills: this.stats.kills, headshots: this.stats.headshots,
      remaining: Math.max(0, this.rounds.remaining), power: this.level.power, time: fmtTime(this.stats.time),
    });
  }

  handleInteraction(dt) {
    const p = this.player, input = this.input, w = this.weapons;
    if (!p.alive || p.downed) { this.hud.setPrompt(null); return; }
    const it = this.machines.getInteraction(p);
    if (!it) { this.hud.setPrompt(null); this.holdT = 0; return; }
    if (it.hold) {
      if (input.down('KeyF')) {
        this.holdT += dt;
        if (this.holdT >= 0.6) {
          this.holdT = 0;
          if (this.level.repairBoard(it.win)) {
            this.audio.boardRepair(it.win.pos.clone().setY(1.5));
            if ((this.boardsRebuiltRound || 0) < 50) { this.addPoints(10); this.boardsRebuiltRound = (this.boardsRebuiltRound || 0) + 1; }
            if (it.win.occupant && it.win.occupant.state === 'tearing') it.win.occupant.tearT += 0.6;
          }
        }
      } else this.holdT = 0;
      this.hud.setPrompt(it.text, this.holdT / 0.6);
      return;
    }
    this.holdT = 0;
    this.hud.setPrompt(it.text);
    if (input.hit('KeyF') && it.use && (it.always || (!w.busy() && w.state !== 'forging'))) it.use();
  }
}

const game = new Game();
window.__deadzone = game;
game.init().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'FAILED TO INITIALIZE: ' + e.message;
});
