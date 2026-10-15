export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
    this.locked = false;
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || (e.ctrlKey && e.code !== 'ControlLeft')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // clamp spikes from some browsers
      const dx = Math.max(-300, Math.min(300, e.movementX || 0));
      const dy = Math.max(-300, Math.min(300, e.movementY || 0));
      this.mouse.dx += dx; this.mouse.dy += dy;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    // accumulate wheel distance so trackpad inertia / tiny deltas don't spam weapon switches
    this.wheelAcc = 0; this.wheelT = 0;
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      const now = performance.now();
      if (now - this.wheelT > 250) this.wheelAcc = 0;
      this.wheelT = now;
      this.wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      if (Math.abs(this.wheelAcc) >= 80) { this.mouse.wheel += Math.sign(this.wheelAcc); this.wheelAcc = 0; }
    }, { passive: true });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }
  lock() {
    try {
      const p = this.el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.el.requestPointerLock());
    } catch (e) { this.el.requestPointerLock(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.leftPressed = false; this.mouse.wheel = 0;
  }
}
