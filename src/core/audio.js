import { rand, pick, clamp } from './utils.js';

// Fully procedural WebAudio sound design
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = 1;
    this.musicVol = 0.6;
    this.voice = true;
    this.activeVoices = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.25;
    this.out = ctx.createGain(); this.out.gain.value = this.master;
    this.comp.connect(this.out); this.out.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.comp);
    this.music = ctx.createGain(); this.music.gain.value = this.musicVol * 0.5; this.music.connect(this.comp);
    this.amb = ctx.createGain(); this.amb.gain.value = 0.7; this.amb.connect(this.comp);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.8, 2.6);
    this.revOut = ctx.createGain(); this.revOut.gain.value = 0.55;
    this.reverb.connect(this.revOut); this.revOut.connect(this.comp);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 1; this.revSend.connect(this.reverb);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this._startAmbience();
  }

  _impulse(dur, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = rate * dur;
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
    return buf;
  }

  setVolumes(master, music) {
    this.master = master; this.musicVol = music;
    if (!this.ctx) return;
    this.out.gain.setTargetAtTime(master, this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.05);
  }

  get t() { return this.ctx.currentTime; }

  updateListener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = this._fwd || (this._fwd = { x: 0, y: 0, z: -1 });
    const e = cam.matrixWorld.elements;
    f.x = -e[8]; f.y = -e[9]; f.z = -e[10];
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02); L.forwardY.setTargetAtTime(f.y, t, 0.02); L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, e[4], e[5], e[6]);
    }
  }

  // destination with optional 3D panning & reverb send
  _dest(pos, rev = 0.25, bus) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = 2.5; p.rolloffFactor = 1.1; p.maxDistance = 80;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
      else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(bus || this.sfx);
    } else g.connect(bus || this.sfx);
    if (rev > 0) {
      const s = ctx.createGain(); s.gain.value = rev;
      g.connect(s); s.connect(this.revSend);
    }
    return g;
  }

  _env(g, t, peak, attack, decay, hold = 0) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + decay);
  }

  noise({ dur = 0.2, type = 'lowpass', freq = 1000, freqEnd, q = 1, gain = 0.5, attack = 0.002, pos, rev = 0.25, delay = 0, rate = 1, brown = false, bus, hold = 0 }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.playbackRate.value = rate;
    src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur + hold);
    const g = ctx.createGain();
    this._env(g, t, gain, attack, dur, hold);
    src.connect(f); f.connect(g); g.connect(this._dest(pos, rev, bus));
    src.start(t, Math.random() * 1.5); src.stop(t + attack + hold + dur + 0.05);
    return src;
  }

  tone({ freq = 440, freqEnd, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.002, pos, rev = 0.25, delay = 0, detune = 0, bus, hold = 0, filter }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(10, freqEnd), t + attack + hold + dur);
    const g = ctx.createGain();
    this._env(g, t, gain, attack, dur, hold);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(this._dest(pos, rev, bus));
    o.start(t); o.stop(t + attack + hold + dur + 0.05);
    return o;
  }

  fm({ freq = 220, ratio = 1.4, index = 400, dur = 2, gain = 0.3, delay = 0, rev = 0.6, pos, bus }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = freq; mod.frequency.value = freq * ratio;
    mg.gain.setValueAtTime(index, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    this._env(g, t, gain, 0.005, dur);
    car.connect(g); g.connect(this._dest(pos, rev, bus));
    car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
  }

  // ---------------- WEAPONS ----------------
  gunshot(kind, upgraded = false) {
    if (!this.ctx) return;
    const P = {
      pistol: { crack: 2600, body: 900, thump: 150, g: 0.55, len: 0.12, tail: 0.35 },
      smg: { crack: 3200, body: 1100, thump: 130, g: 0.45, len: 0.09, tail: 0.3 },
      shotgun: { crack: 1800, body: 600, thump: 90, g: 0.9, len: 0.32, tail: 0.6 },
      ar: { crack: 2400, body: 800, thump: 110, g: 0.6, len: 0.14, tail: 0.45 },
      burst: { crack: 2800, body: 900, thump: 120, g: 0.55, len: 0.12, tail: 0.4 },
      lmg: { crack: 2000, body: 700, thump: 95, g: 0.7, len: 0.16, tail: 0.5 },
      sniper: { crack: 3500, body: 500, thump: 70, g: 1.0, len: 0.4, tail: 0.9 },
    }[kind];
    if (kind === 'volt') { this.voltShot(upgraded); return; }
    const r = rand(0.92, 1.08);
    this.noise({ dur: P.len * 0.5, type: 'bandpass', freq: P.crack * r, q: 0.8, gain: P.g * 0.9, rev: P.tail * 0.5 });
    this.noise({ dur: P.len, type: 'lowpass', freq: P.body * r, freqEnd: 200, q: 0.7, gain: P.g, rev: P.tail });
    this.tone({ freq: P.thump * r, freqEnd: 35, dur: P.len * 1.2, type: 'sine', gain: P.g * 0.9, rev: 0.1 });
    this.noise({ dur: P.tail * 1.4, type: 'lowpass', freq: 500, freqEnd: 80, gain: P.g * 0.18, attack: 0.01, delay: 0.02, rev: 0.8, brown: true });
    if (upgraded) {
      this.tone({ freq: 1400 * r, freqEnd: 180, dur: 0.18, type: 'square', gain: 0.07, rev: 0.4, filter: 3000 });
      this.tone({ freq: 700 * r, freqEnd: 90, dur: 0.25, type: 'sawtooth', gain: 0.05, rev: 0.5, filter: 1800 });
    }
    // mechanical
    this.noise({ dur: 0.03, type: 'highpass', freq: 5000, gain: 0.08, delay: 0.03, rev: 0 });
  }

  voltShot(up) {
    this.tone({ freq: 90, freqEnd: 40, dur: 0.4, type: 'sawtooth', gain: 0.35, rev: 0.5, filter: 1200 });
    this.tone({ freq: 2200, freqEnd: 300, dur: 0.35, type: 'square', gain: 0.1, rev: 0.6, filter: 5000 });
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.05, type: 'bandpass', freq: rand(2000, 6000), q: 3, gain: 0.35, delay: i * 0.04 + rand(0, 0.02), rev: 0.4 });
    this.noise({ dur: 0.5, type: 'highpass', freq: 3000, gain: 0.12, rev: 0.6 });
    if (up) this.tone({ freq: 3000, freqEnd: 600, dur: 0.5, type: 'sine', gain: 0.1, rev: 0.8 });
  }

  zap(pos) {
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.04, type: 'bandpass', freq: rand(2500, 7000), q: 4, gain: 0.4, delay: i * 0.05, pos, rev: 0.3 });
  }

  dryFire() { this.noise({ dur: 0.02, type: 'highpass', freq: 3000, gain: 0.25, rev: 0.05 }); this.tone({ freq: 1800, dur: 0.03, type: 'square', gain: 0.04, rev: 0 }); }
  magOut() { this.noise({ dur: 0.04, type: 'bandpass', freq: 2200, q: 2, gain: 0.3, rev: 0.1 }); this.noise({ dur: 0.08, type: 'bandpass', freq: 900, q: 1.5, gain: 0.2, delay: 0.05, rev: 0.1 }); }
  magIn() { this.noise({ dur: 0.05, type: 'bandpass', freq: 1400, q: 2, gain: 0.4, rev: 0.1 }); this.tone({ freq: 220, freqEnd: 120, dur: 0.05, type: 'triangle', gain: 0.2, rev: 0 }); this.noise({ dur: 0.02, type: 'highpass', freq: 4000, gain: 0.25, delay: 0.06, rev: 0.05 }); }
  bolt() { this.noise({ dur: 0.04, type: 'bandpass', freq: 3000, q: 3, gain: 0.35, rev: 0.1 }); this.tone({ freq: 2600, dur: 0.05, type: 'triangle', gain: 0.06 }); this.noise({ dur: 0.05, type: 'bandpass', freq: 2000, q: 2, gain: 0.35, delay: 0.12, rev: 0.1 }); }
  pump() { this.noise({ dur: 0.08, type: 'bandpass', freq: 1200, q: 1.5, gain: 0.45, rev: 0.15 }); this.noise({ dur: 0.07, type: 'bandpass', freq: 1700, q: 2, gain: 0.45, delay: 0.16, rev: 0.15 }); }
  shellIn() { this.noise({ dur: 0.04, type: 'bandpass', freq: 1800, q: 2.5, gain: 0.35, rev: 0.05 }); this.tone({ freq: 400, freqEnd: 250, dur: 0.04, type: 'triangle', gain: 0.1 }); }
  weaponRaise() { this.noise({ dur: 0.12, type: 'bandpass', freq: 1500, freqEnd: 3000, q: 1, gain: 0.12, rev: 0.05 }); this.noise({ dur: 0.03, type: 'highpass', freq: 3500, gain: 0.15, delay: 0.1 }); }
  shell(delay = 0.25) { this.tone({ freq: rand(3500, 4500), dur: 0.08, type: 'sine', gain: 0.03, delay, rev: 0.1 }); this.tone({ freq: rand(3000, 4000), dur: 0.05, type: 'sine', gain: 0.02, delay: delay + 0.09, rev: 0.1 }); }

  // ---------------- IMPACTS / FEEDBACK ----------------
  hitFlesh(pos) {
    this.noise({ dur: 0.08, type: 'lowpass', freq: 700, gain: 0.5, pos, rev: 0.05 });
    this.noise({ dur: 0.1, type: 'bandpass', freq: 1200, freqEnd: 400, q: 3, gain: 0.25, pos, delay: 0.01, rev: 0.05 });
  }
  hitmarker(kill) {
    this.tone({ freq: kill ? 1800 : 2600, dur: 0.04, type: 'triangle', gain: 0.07, rev: 0 });
    if (kill) this.tone({ freq: 900, dur: 0.06, type: 'triangle', gain: 0.05, delay: 0.02, rev: 0 });
  }
  headshot(pos) {
    this.noise({ dur: 0.06, type: 'highpass', freq: 2500, gain: 0.35, pos, rev: 0.05 });
    this.noise({ dur: 0.18, type: 'lowpass', freq: 500, gain: 0.6, pos, rev: 0.1 });
    this.tone({ freq: 3200, dur: 0.06, type: 'sine', gain: 0.05, rev: 0 });
  }
  gore(pos) {
    this.noise({ dur: 0.35, type: 'bandpass', freq: 600, freqEnd: 150, q: 2, gain: 0.6, pos, rev: 0.15 });
    this.noise({ dur: 0.15, type: 'lowpass', freq: 300, gain: 0.7, pos, rev: 0.1 });
  }
  ricochet(pos) {
    if (Math.random() < 0.6) this.noise({ dur: 0.05, type: 'bandpass', freq: rand(2500, 4500), q: 2, gain: 0.18, pos, rev: 0.2 });
    else this.tone({ freq: rand(2500, 4000), freqEnd: rand(800, 1500), dur: 0.25, type: 'sine', gain: 0.05, pos, rev: 0.3 });
  }
  footstep(surface = 'concrete', sprint = false, crouch = false) {
    const g = (sprint ? 0.28 : 0.18) * (crouch ? 0.4 : 1);
    if (surface === 'metal') {
      this.noise({ dur: 0.08, type: 'bandpass', freq: rand(900, 1300), q: 2, gain: g, rev: 0.2 });
      this.tone({ freq: rand(280, 350), dur: 0.15, type: 'triangle', gain: g * 0.15, rev: 0.3 });
    } else if (surface === 'wet') {
      this.noise({ dur: 0.1, type: 'lowpass', freq: rand(350, 500), gain: g, rev: 0.1 });
      this.noise({ dur: 0.12, type: 'bandpass', freq: rand(2000, 3500), q: 1, gain: g * 0.5, delay: 0.01, rev: 0.05 });
    } else if (surface === 'tile') {
      this.noise({ dur: 0.06, type: 'bandpass', freq: rand(1400, 1900), q: 1.5, gain: g * 0.8, rev: 0.35 });
      this.noise({ dur: 0.07, type: 'lowpass', freq: 400, gain: g * 0.7, rev: 0.2 });
    } else {
      this.noise({ dur: 0.09, type: 'lowpass', freq: rand(450, 650), gain: g, rev: 0.15 });
      this.noise({ dur: 0.04, type: 'bandpass', freq: rand(1800, 2600), q: 1, gain: g * 0.4, rev: 0.1 });
    }
  }
  land(h) { this.noise({ dur: 0.18, type: 'lowpass', freq: 300, gain: clamp(0.2 + h * 0.1, 0.2, 0.6), rev: 0.2 }); this.noise({ dur: 0.06, type: 'bandpass', freq: 1800, gain: 0.12 }); }
  hurt() {
    this.noise({ dur: 0.25, type: 'lowpass', freq: 400, gain: 0.7, rev: 0.1 });
    this.tone({ freq: rand(140, 170), freqEnd: 90, dur: 0.25, type: 'sawtooth', gain: 0.12, rev: 0.1, filter: 900 });
  }
  heartbeat(vol = 0.5) {
    this.tone({ freq: 55, freqEnd: 35, dur: 0.12, type: 'sine', gain: vol, rev: 0 });
    this.tone({ freq: 50, freqEnd: 32, dur: 0.14, type: 'sine', gain: vol * 0.75, delay: 0.24, rev: 0 });
  }
  tinnitus(dur = 2) { this.tone({ freq: 4200, dur, type: 'sine', gain: 0.03, attack: 0.02, rev: 0 }); }
  knifeSwing() { this.noise({ dur: 0.18, type: 'bandpass', freq: 800, freqEnd: 3000, q: 1.5, gain: 0.3, rev: 0.05 }); }
  knifeHit(pos) { this.noise({ dur: 0.1, type: 'lowpass', freq: 600, gain: 0.7, pos, rev: 0.05 }); this.noise({ dur: 0.15, type: 'bandpass', freq: 900, freqEnd: 300, q: 4, gain: 0.4, pos, rev: 0.05 }); }
  pin() { this.tone({ freq: 3200, dur: 0.06, type: 'triangle', gain: 0.08 }); this.noise({ dur: 0.03, type: 'highpass', freq: 5000, gain: 0.15, delay: 0.08 }); }
  bounce(pos) { this.tone({ freq: rand(1500, 2200), dur: 0.08, type: 'triangle', gain: 0.12, pos, rev: 0.2 }); this.noise({ dur: 0.04, type: 'bandpass', freq: 1000, gain: 0.2, pos }); }
  explosion(pos) {
    this.noise({ dur: 1.6, type: 'lowpass', freq: 1800, freqEnd: 60, gain: 1.2, pos, rev: 0.7 });
    this.tone({ freq: 70, freqEnd: 22, dur: 1.0, type: 'sine', gain: 1.0, pos, rev: 0.3 });
    this.noise({ dur: 0.15, type: 'highpass', freq: 2000, gain: 0.5, pos, rev: 0.4 });
    for (let i = 0; i < 10; i++) this.noise({ dur: 0.05, type: 'bandpass', freq: rand(800, 3000), q: 2, gain: 0.15, delay: 0.1 + Math.random() * 0.8, pos, rev: 0.4 });
  }
  thunder(dist = 1) {
    const d = 0.3 + dist * 1.5;
    this.noise({ dur: 0.4, type: 'lowpass', freq: 2500, freqEnd: 300, gain: 0.35 / (0.5 + dist), delay: d, rev: 0.8, bus: this.amb });
    this.noise({ dur: 3.5, type: 'lowpass', freq: 400, freqEnd: 40, gain: 0.9, attack: 0.1, delay: d + 0.1, rev: 1, brown: true, bus: this.amb });
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.8, type: 'lowpass', freq: 200, gain: 0.5, attack: 0.15, delay: d + 0.4 + i * rand(0.3, 0.7), brown: true, rev: 1, bus: this.amb });
  }

  // ---------------- ZOMBIES ----------------
  zombieVoice(pos, kind = 'groan', pitch = 1) {
    if (!this.ctx || this.activeVoices > 7) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = kind === 'scream' ? rand(0.6, 1.1) : kind === 'attack' ? rand(0.35, 0.6) : kind === 'death' ? rand(0.7, 1.1) : rand(0.9, 1.8);
    const base = (kind === 'scream' ? rand(170, 260) : kind === 'attack' ? rand(110, 150) : rand(70, 115)) * pitch;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    if (kind === 'scream') { o.frequency.linearRampToValueAtTime(base * 1.6, t + dur * 0.3); o.frequency.linearRampToValueAtTime(base * 0.8, t + dur); }
    else if (kind === 'death') o.frequency.exponentialRampToValueAtTime(base * 0.4, t + dur);
    else { o.frequency.linearRampToValueAtTime(base * rand(0.8, 1.25), t + dur * 0.5); o.frequency.linearRampToValueAtTime(base * rand(0.6, 0.9), t + dur); }
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = rand(5, 14); lg.gain.value = base * rand(0.06, 0.18);
    lfo.connect(lg); lg.connect(o.frequency);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    f1.frequency.setValueAtTime(rand(400, 700) * (kind === 'scream' ? 1.6 : 1), t);
    f1.frequency.linearRampToValueAtTime(rand(300, 900), t + dur);
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6; f2.frequency.value = rand(1000, 1600);
    const g = ctx.createGain(); const gain = kind === 'scream' ? 0.7 : kind === 'attack' ? 0.7 : 0.55;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.08); g.gain.setValueAtTime(gain * 0.8, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const dest = this._dest(pos, 0.35);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(dest);
    // breath noise
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = rand(800, 1500); nf.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(kind === 'scream' ? 0.45 : 0.25, t + 0.05); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(nf); nf.connect(ng); ng.connect(dest);
    o.start(t); lfo.start(t); n.start(t, Math.random()); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05); n.stop(t + dur + 0.05);
    this.activeVoices++;
    o.onended = () => this.activeVoices--;
  }
  swipe(pos) { this.noise({ dur: 0.2, type: 'bandpass', freq: 500, freqEnd: 2000, q: 1, gain: 0.35, pos, rev: 0.05 }); }
  boardTear(pos) {
    this.noise({ dur: 0.25, type: 'bandpass', freq: 700, freqEnd: 300, q: 2, gain: 0.6, pos, rev: 0.3 });
    for (let i = 0; i < 5; i++) this.noise({ dur: 0.03, type: 'bandpass', freq: rand(1500, 3000), q: 3, gain: 0.4, delay: rand(0, 0.2), pos, rev: 0.2 });
  }
  boardRepair(pos) {
    this.noise({ dur: 0.06, type: 'lowpass', freq: 900, gain: 0.5, pos, rev: 0.2 });
    this.noise({ dur: 0.06, type: 'lowpass', freq: 1000, gain: 0.5, pos, delay: 0.15, rev: 0.2 });
    this.tone({ freq: 300, dur: 0.06, type: 'triangle', gain: 0.1, pos, delay: 0.15 });
  }
  rise(pos) { this.noise({ dur: 0.9, type: 'lowpass', freq: 400, gain: 0.5, pos, rev: 0.2, brown: true, attack: 0.1 }); }
  bruteSlam(pos) { this.explosion(pos); }

  // ---------------- UI / GAME ----------------
  purchase() {
    this.tone({ freq: 1320, dur: 0.12, type: 'triangle', gain: 0.15, rev: 0.2 });
    this.tone({ freq: 1980, dur: 0.35, type: 'sine', gain: 0.15, delay: 0.08, rev: 0.3 });
    this.noise({ dur: 0.1, type: 'highpass', freq: 5000, gain: 0.1 });
  }
  denied() { this.tone({ freq: 110, dur: 0.25, type: 'square', gain: 0.08, rev: 0, filter: 600 }); this.tone({ freq: 104, dur: 0.25, type: 'square', gain: 0.08, rev: 0, filter: 600, delay: 0.02 }); }
  uiClick() { this.tone({ freq: 900, dur: 0.04, type: 'triangle', gain: 0.06, rev: 0 }); }
  uiHover() { this.tone({ freq: 1500, dur: 0.02, type: 'sine', gain: 0.025, rev: 0 }); }
  doorOpen(pos) {
    this.noise({ dur: 1.4, type: 'lowpass', freq: 600, freqEnd: 120, gain: 0.7, attack: 0.05, pos, rev: 0.5, brown: true });
    this.noise({ dur: 0.5, type: 'bandpass', freq: 400, gain: 0.4, delay: 1.0, pos, rev: 0.5 });
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.08, type: 'bandpass', freq: rand(500, 1500), q: 2, gain: 0.3, delay: rand(0.2, 1.4), pos, rev: 0.4 });
  }
  powerOn() {
    this.noise({ dur: 0.6, type: 'lowpass', freq: 300, gain: 1, rev: 0.6, brown: true });
    this.tone({ freq: 40, freqEnd: 60, dur: 3, type: 'sawtooth', gain: 0.25, attack: 0.5, filter: 400, rev: 0.6 });
    this.tone({ freq: 120, dur: 3, type: 'sawtooth', gain: 0.08, attack: 1.5, filter: 800, rev: 0.6 });
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.06, type: 'bandpass', freq: rand(2000, 5000), q: 3, gain: 0.3, delay: 0.3 + i * 0.12, rev: 0.4 });
    this.fm({ freq: 110, ratio: 2.01, index: 300, dur: 4, gain: 0.25, delay: 0.8 });
  }
  jingle(seed = 1) {
    const scale = [0, 3, 5, 7, 10, 12, 15];
    let s = seed;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 8; i++) {
      const n = scale[Math.floor(r() * scale.length)];
      const f = 330 * Math.pow(2, n / 12);
      this.tone({ freq: f, dur: 0.25, type: 'square', gain: 0.05, delay: i * 0.16, rev: 0.4, filter: 2500 });
      this.tone({ freq: f / 2, dur: 0.25, type: 'triangle', gain: 0.07, delay: i * 0.16, rev: 0.3 });
    }
  }
  drink() {
    for (let i = 0; i < 3; i++) this.noise({ dur: 0.12, type: 'bandpass', freq: 500, freqEnd: 300, q: 4, gain: 0.35, delay: 0.3 + i * 0.28, rev: 0.05 });
    this.noise({ dur: 0.05, type: 'highpass', freq: 3000, gain: 0.2, rev: 0.1 });
  }
  boxJingle(dur = 4) {
    const mel = [12, 15, 19, 24, 22, 19, 15, 17, 14, 19, 12, 15, 19, 24, 27, 24];
    const step = dur / mel.length;
    mel.forEach((n, i) => {
      const f = 523 * Math.pow(2, n / 12);
      this.tone({ freq: f, dur: 0.6, type: 'sine', gain: 0.08, delay: i * step, rev: 0.6 });
      this.tone({ freq: f * 2.01, dur: 0.3, type: 'sine', gain: 0.025, delay: i * step, rev: 0.6 });
    });
  }
  boxOpen() { this.noise({ dur: 0.5, type: 'bandpass', freq: 600, freqEnd: 300, q: 2, gain: 0.4, rev: 0.4 }); this.tone({ freq: 140, freqEnd: 90, dur: 0.6, type: 'triangle', gain: 0.15, rev: 0.4 }); }
  boxLaugh() {
    for (let i = 0; i < 5; i++) this.tone({ freq: 160 - i * 8, dur: 0.18, type: 'sawtooth', gain: 0.15, delay: i * 0.22, rev: 0.8, filter: 900 });
    this.noise({ dur: 2, type: 'lowpass', freq: 200, gain: 0.5, attack: 0.3, delay: 0.5, brown: true, rev: 0.9 });
  }
  forge() {
    for (let i = 0; i < 8; i++) this.noise({ dur: 0.15, type: 'bandpass', freq: rand(400, 1200), q: 2, gain: 0.5, delay: i * 0.45, rev: 0.6 });
    for (let i = 0; i < 8; i++) this.tone({ freq: 1200 + rand(-200, 200), dur: 0.6, type: 'sine', gain: 0.06, delay: i * 0.45 + 0.02, rev: 0.7 });
    this.tone({ freq: 55, dur: 3.5, type: 'sawtooth', gain: 0.2, attack: 0.4, filter: 300, rev: 0.6 });
    this.fm({ freq: 220, ratio: 1.41, index: 500, dur: 3, gain: 0.2, delay: 3.4 });
  }
  powerupSpawn(pos) { for (let i = 0; i < 6; i++) this.tone({ freq: 800 + i * 220, dur: 0.3, type: 'sine', gain: 0.06, delay: i * 0.05, pos, rev: 0.6 }); }
  powerupLoop(pos) { this.tone({ freq: rand(1200, 1800), dur: 0.4, type: 'sine', gain: 0.03, pos, rev: 0.5 }); }
  powerupGrab() {
    [0, 4, 7, 12, 16].forEach((n, i) => this.tone({ freq: 440 * Math.pow(2, n / 12), dur: 0.5, type: 'triangle', gain: 0.12, delay: i * 0.06, rev: 0.7 }));
    this.noise({ dur: 0.8, type: 'highpass', freq: 4000, freqEnd: 8000, gain: 0.08, rev: 0.7 });
  }
  roundStart(red = false) {
    if (!this.ctx) return;
    const base = red ? 98 : 110;
    for (let i = 0; i < 3; i++) this.fm({ freq: base, ratio: 1.41, index: 380, dur: 4, gain: 0.3, delay: i * 1.3, rev: 0.9, bus: this.music });
    this.tone({ freq: base / 2, dur: 5, type: 'sawtooth', gain: 0.12, attack: 1.5, filter: 300, rev: 0.8, bus: this.music });
    this.tone({ freq: base * 0.75, dur: 5, type: 'sawtooth', gain: 0.07, attack: 2, filter: 400, rev: 0.8, detune: 8, bus: this.music });
    if (red) this.noise({ dur: 4, type: 'bandpass', freq: 300, freqEnd: 1200, q: 2, gain: 0.25, attack: 2, rev: 1, bus: this.music });
  }
  roundEnd() {
    if (!this.ctx) return;
    [0, 3, 7, 10, 14].forEach((n, i) => {
      const f = 146.8 * Math.pow(2, n / 12);
      this.tone({ freq: f, dur: 3.5, type: 'sawtooth', gain: 0.05, attack: 1.2, filter: 1100, rev: 1, detune: rand(-10, 10), delay: i * 0.08, bus: this.music });
      this.tone({ freq: f, dur: 3.5, type: 'sawtooth', gain: 0.05, attack: 1.2, filter: 900, rev: 1, detune: rand(-14, 14), delay: i * 0.08, bus: this.music });
    });
    this.fm({ freq: 73.4, ratio: 1.41, index: 250, dur: 5, gain: 0.25, delay: 0.2, bus: this.music });
  }
  gameOver() {
    [0, 1, 6, 7].forEach((n, i) => this.tone({ freq: 65 * Math.pow(2, n / 12), dur: 6, type: 'sawtooth', gain: 0.1, attack: 2, filter: 500, rev: 1, delay: i * 0.4, bus: this.music }));
    this.fm({ freq: 55, ratio: 1.41, index: 400, dur: 6, gain: 0.35, bus: this.music });
  }

  announce(text) {
    if (!this.voice || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = 0.1; u.rate = 0.78; u.volume = clamp(this.master, 0, 1);
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => /en/i.test(x.lang) && /male|david|daniel|google uk english male/i.test(x.name)) || voices.find((x) => /en/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }

  // ---------------- AMBIENCE & MUSIC ----------------
  _loopNoise(bus, type, freq, q, gain, brown = false) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = brown ? this.brownBuf : this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(bus); src.start();
    return { src, f, g };
  }

  _startAmbience() {
    const ctx = this.ctx;
    this.wind = this._loopNoise(this.amb, 'bandpass', 400, 0.8, 0.12, true);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 250; lfo.connect(lg); lg.connect(this.wind.f.frequency); lfo.start();
    const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain();
    lfo2.frequency.value = 0.11; lg2.gain.value = 0.06; lfo2.connect(lg2); lg2.connect(this.wind.g.gain); lfo2.start();
    this.rain = this._loopNoise(this.amb, 'highpass', 1800, 0.4, 0.05);
    this.rainLow = this._loopNoise(this.amb, 'lowpass', 600, 0.5, 0.06);
    // music drone
    this.drone = [];
    const freqs = [55, 55.4, 82.4, 110.2];
    this.droneFilter = ctx.createBiquadFilter(); this.droneFilter.type = 'lowpass'; this.droneFilter.frequency.value = 260; this.droneFilter.Q.value = 3;
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0.0;
    this.droneFilter.connect(this.droneGain); this.droneGain.connect(this.music);
    const dl = ctx.createOscillator(), dg = ctx.createGain(); dl.frequency.value = 0.05; dg.gain.value = 120; dl.connect(dg); dg.connect(this.droneFilter.frequency); dl.start();
    freqs.forEach((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.05;
      o.connect(g); g.connect(this.droneFilter); o.start();
      this.drone.push(o);
    });
    this.nextNote = 4;
    this.intensity = 0;
  }

  setIndoor(indoor) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rain.g.gain.setTargetAtTime(indoor ? 0.012 : 0.05, t, 0.4);
    this.rain.f.frequency.setTargetAtTime(indoor ? 900 : 1800, t, 0.4);
    this.rainLow.g.gain.setTargetAtTime(indoor ? 0.08 : 0.05, t, 0.4);
  }

  setMusicState(active, intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(active ? 0.22 + intensity * 0.25 : 0.12, t, 1.5);
    this.intensity = intensity;
    this.drone.forEach((o, i) => o.detune.setTargetAtTime(intensity > 0.5 ? (i % 2 ? 30 : -30) : 0, t, 2));
  }

  update(dt) {
    if (!this.ctx) return;
    this.nextNote -= dt;
    if (this.nextNote <= 0) {
      this.nextNote = rand(5, 12) * (1 - this.intensity * 0.5);
      const scale = [0, 1, 3, 5, 7, 8, 10];
      const n = pick(scale) + pick([0, 12, 24]);
      const f = 220 * Math.pow(2, n / 12);
      this.tone({ freq: f, dur: 3, type: 'sine', gain: 0.05, attack: 0.01, rev: 1, bus: this.music });
      this.tone({ freq: f * 2.76, dur: 1.2, type: 'sine', gain: 0.012, attack: 0.01, rev: 1, bus: this.music });
      if (Math.random() < 0.4) this.tone({ freq: f * 1.5, dur: 3, type: 'sine', gain: 0.03, delay: 0.4, rev: 1, bus: this.music });
    }
  }
}
