// Grid-based flow field navigation for the horde
export class NavGrid {
  constructor(minX, minZ, maxX, maxZ, cell = 0.5) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    this.blocked = new Uint8Array(this.w * this.h);
    this.dist = new Int32Array(this.w * this.h).fill(-1);
    this.queue = new Int32Array(this.w * this.h);
    this.target = -1;
  }
  cx(x) { return Math.floor((x - this.minX) / this.cell); }
  cz(z) { return Math.floor((z - this.minZ) / this.cell); }
  idx(x, z) {
    const i = this.cx(x), j = this.cz(z);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  build(colliders, zones, pad = 0.32) {
    const { w, h, cell } = this;
    this.blocked.fill(1);
    for (const zn of zones) {
      const [x0, z0, x1, z1] = zn.rect;
      for (let j = this.cz(z0); j <= this.cz(z1); j++) for (let i = this.cx(x0); i <= this.cx(x1); i++) {
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        const px = this.minX + (i + 0.5) * cell, pz = this.minZ + (j + 0.5) * cell;
        if (px > x0 && px < x1 && pz > z0 && pz < z1) this.blocked[j * w + i] = 0;
      }
    }
    for (const c of colliders) {
      if (!c.active || !c.nav || c.minY > 1.6 || c.maxY < 0.3) continue;
      const i0 = Math.max(0, this.cx(c.minX - pad)), i1 = Math.min(w - 1, this.cx(c.maxX + pad));
      const j0 = Math.max(0, this.cz(c.minZ - pad)), j1 = Math.min(h - 1, this.cz(c.maxZ + pad));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = this.minX + (i + 0.5) * cell, pz = this.minZ + (j + 0.5) * cell;
        if (px > c.minX - pad && px < c.maxX + pad && pz > c.minZ - pad && pz < c.maxZ + pad) this.blocked[j * w + i] = 1;
      }
    }
    this.target = -1;
  }
  nearestFree(i) {
    if (i < 0) return -1;
    if (!this.blocked[i]) return i;
    const { w, h } = this;
    const ci = i % w, cj = (i / w) | 0;
    for (let r = 1; r < 8; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const k = nj * w + ni;
        if (!this.blocked[k]) return k;
      }
    }
    return -1;
  }
  compute(x, z, force = false) {
    const t = this.nearestFree(this.idx(x, z));
    if (t < 0 || (t === this.target && !force)) return;
    this.target = t;
    const { w, h, dist, queue, blocked } = this;
    dist.fill(-1);
    let head = 0, tail = 0;
    dist[t] = 0; queue[tail++] = t;
    while (head < tail) {
      const c = queue[head++];
      const ci = c % w, cj = (c / w) | 0, d = dist[c] + 1;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
        const k = nj * w + ni;
        if (blocked[k] || dist[k] >= 0) continue;
        if (di && dj && (blocked[cj * w + ni] || blocked[nj * w + ci])) continue;
        dist[k] = d; queue[tail++] = k;
      }
    }
  }
  // returns direction (x,z) along descending distance field
  dir(x, z, out) {
    let i = this.idx(x, z);
    out.x = 0; out.z = 0; out.d = -1;
    if (i < 0) return out;
    if (this.blocked[i] || this.dist[i] < 0) {
      const f = this.nearestFree(i);
      if (f < 0) return out;
      const fx = this.minX + ((f % this.w) + 0.5) * this.cell, fz = this.minZ + (((f / this.w) | 0) + 0.5) * this.cell;
      const dx = fx - x, dz = fz - z, l = Math.hypot(dx, dz) || 1;
      out.x = dx / l; out.z = dz / l; out.d = this.dist[f];
      return out;
    }
    const { w, h, dist, blocked } = this;
    const ci = i % w, cj = (i / w) | 0;
    let best = dist[i], bi = -1, bj = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const k = nj * w + ni;
      if (blocked[k] || dist[k] < 0) continue;
      if (di && dj && (blocked[cj * w + ni] || blocked[nj * w + ci])) continue;
      if (dist[k] < best) { best = dist[k]; bi = ni; bj = nj; }
    }
    out.d = dist[i];
    if (bi < 0) return out;
    const tx = this.minX + (bi + 0.5) * this.cell, tz = this.minZ + (bj + 0.5) * this.cell;
    const dx = tx - x, dz = tz - z, l = Math.hypot(dx, dz) || 1;
    out.x = dx / l; out.z = dz / l;
    return out;
  }
  los(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz);
    const steps = Math.ceil(l / (this.cell * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const i = this.idx(x0 + dx * t, z0 + dz * t);
      if (i < 0 || this.blocked[i]) return false;
    }
    return true;
  }
  isFree(x, z) { const i = this.idx(x, z); return i >= 0 && !this.blocked[i]; }
}
