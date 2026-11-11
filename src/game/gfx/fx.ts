import * as THREE from "three";

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _c0 = new THREE.Color();
const _c1 = new THREE.Color();
const ID_Q = new THREE.Quaternion();

export class FX {
  scene: THREE.Scene;
  N: number;
  inst: THREE.InstancedMesh;
  alive: Uint8Array;
  px: Float32Array; py: Float32Array; pz: Float32Array; vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; max: Float32Array; s0: Float32Array; s1: Float32Array; grav: Float32Array; drag: Float32Array;
  c0: Float32Array; c1: Float32Array; rot: Float32Array;
  next = 0;
  tracers: { mesh: THREE.Mesh; t: number; mat: THREE.MeshBasicMaterial }[] = [];
  tIdx = 0;
  decals: THREE.Mesh[] = []; dIdx = 0;
  light: THREE.PointLight; lightT = 0; lightI = 0;
  rain: THREE.LineSegments | null = null; rainPos!: Float32Array; rainN = 0;
  fogColor = new THREE.Color("#888");

  constructor(scene: THREE.Scene, n: number) {
    this.scene = scene; this.N = n;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
    this.inst.frustumCulled = false; this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.setColorAt(0, _c.set(0xffffff));
    scene.add(this.inst);
    const f = (k = 1) => new Float32Array(n * k);
    this.alive = new Uint8Array(n);
    this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f(); this.life = f(); this.max = f(); this.s0 = f(); this.s1 = f(); this.grav = f(); this.drag = f();
    this.c0 = f(3); this.c1 = f(3); this.rot = f();
    for (let i = 0; i < n; i++) { _m.compose(_p.set(0, -999, 0), ID_Q, _s.set(0, 0, 0)); this.inst.setMatrixAt(i, _m); }
    // tracers
    const tg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(tg, mat); mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh); this.tracers.push({ mesh, t: 0, mat });
    }
    // decals
    const dg = new THREE.PlaneGeometry(0.16, 0.16); const dm = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
    for (let i = 0; i < 48; i++) { const d = new THREE.Mesh(dg, dm); d.visible = false; scene.add(d); this.decals.push(d); }
    this.light = new THREE.PointLight(0xffaa55, 0, 22, 1.6); scene.add(this.light);
  }

  setRain(on: boolean, amount: number) {
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; }
    if (!on) return;
    this.rainN = Math.floor(500 * amount) + 60; this.rainPos = new Float32Array(this.rainN * 6);
    for (let i = 0; i < this.rainN; i++) { const x = (Math.random() - 0.5) * 36, y = Math.random() * 18, z = (Math.random() - 0.5) * 36; this.rainPos.set([x, y, z, x, y - 0.7, z], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false; this.scene.add(this.rain);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, col0: number, col1: number, grav = 0, drag = 0) {
    const i = this.next; this.next = (this.next + 1) % this.N;
    this.alive[i] = 1; this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.grav[i] = grav; this.drag[i] = drag;
    _c0.set(col0); _c1.set(col1);
    this.c0[i * 3] = _c0.r; this.c0[i * 3 + 1] = _c0.g; this.c0[i * 3 + 2] = _c0.b; this.c1[i * 3] = _c1.r; this.c1[i * 3 + 1] = _c1.g; this.c1[i * 3 + 2] = _c1.b;
    this.rot[i] = Math.random() * 3;
  }
  rnd = (a: number) => (Math.random() - 0.5) * 2 * a;
  sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, n = 5) {
    for (let i = 0; i < n; i++) this.spawn(x, y, z, nx * 3 + this.rnd(3), ny * 3 + this.rnd(3) + 1, nz * 3 + this.rnd(3), 0.25 + Math.random() * 0.25, 0.04, 0.01, 0xffe9a0, 0xff7a1a, 14, 0.5);
    this.spawn(x, y, z, nx * 0.4, ny * 0.4 + 0.2, nz * 0.4, 0.5, 0.1, 0.35, 0x8a8a84, 0x4a4a48, -0.5, 1);
  }
  dust(x: number, y: number, z: number, n = 4, col = 0xb8a98a) {
    for (let i = 0; i < n; i++) this.spawn(x + this.rnd(0.2), y, z + this.rnd(0.2), this.rnd(1), Math.random() * 1.2, this.rnd(1), 0.6 + Math.random() * 0.5, 0.15, 0.5, col, 0x7a7466, -0.5, 1.5);
  }
  smoke(x: number, y: number, z: number, n = 3, size = 1.2, col = 0x8a8a8a, life = 2) {
    for (let i = 0; i < n; i++) this.spawn(x + this.rnd(0.3), y, z + this.rnd(0.3), this.rnd(0.5), 0.8 + Math.random(), this.rnd(0.5), life * (0.7 + Math.random() * 0.6), size * 0.3, size, col, 0x555555, -0.2, 0.8);
  }
  blood(x: number, y: number, z: number, dx: number, dz: number, n = 6) {
    for (let i = 0; i < n; i++) this.spawn(x, y, z, dx * 2 + this.rnd(1.5), 1 + Math.random() * 2, dz * 2 + this.rnd(1.5), 0.5 + Math.random() * 0.3, 0.07, 0.03, 0xaa1515, 0x550808, 14, 0.3);
  }
  hitPuff(x: number, y: number, z: number, n = 4) {
    for (let i = 0; i < n; i++) this.spawn(x, y, z, this.rnd(2), Math.random() * 2, this.rnd(2), 0.4, 0.07, 0.02, 0xdddddd, 0x999999, 10, 0.5);
  }
  flash(x: number, y: number, z: number, size = 0.5) { this.spawn(x, y, z, 0, 0, 0, 0.05, size, size * 0.4, 0xfff2b0, 0xffb040); }
  explosion(x: number, y: number, z: number, scale = 1, quality = 1) {
    const n = Math.floor(24 * quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, up = Math.random() * 0.8; const sp = (3 + Math.random() * 6) * scale;
      this.spawn(x, y + 0.3, z, Math.cos(a) * sp * (1 - up * 0.5), up * sp * 1.2 + 1, Math.sin(a) * sp * (1 - up * 0.5), 0.5 + Math.random() * 0.5, 0.6 * scale, 1.8 * scale, 0xffd060, 0xc03010, -1, 2.2);
    }
    for (let i = 0; i < n; i++) this.spawn(x + this.rnd(1), y + 0.5, z + this.rnd(1), this.rnd(2) * scale, 2 + Math.random() * 3, this.rnd(2) * scale, 1.2 + Math.random() * 1.2, 0.8 * scale, 2.8 * scale, 0x3a3a3a, 0x6a6a6a, -0.8, 1);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, sp = (6 + Math.random() * 8) * scale; this.spawn(x, y + 0.3, z, Math.cos(a) * sp, 4 + Math.random() * 7, Math.sin(a) * sp, 0.7 + Math.random() * 0.6, 0.09, 0.04, 0xffcc55, 0xff4a10, 18, 0.2); }
    for (let i = 0; i < n / 2; i++) this.spawn(x + this.rnd(1.5), y, z + this.rnd(1.5), this.rnd(5) * scale, Math.random() * 6, this.rnd(5) * scale, 1 + Math.random(), 0.2, 0.1, 0x5a5a52, 0x3a3a34, 18, 0.1);
    this.lightAt(x, y + 1.2, z, 0xff9040, 14 * scale, 0.5);
  }
  fire(x: number, y: number, z: number) {
    this.spawn(x + this.rnd(0.4), y, z + this.rnd(0.4), this.rnd(0.3), 1.4 + Math.random(), this.rnd(0.3), 0.6 + Math.random() * 0.3, 0.35, 0.08, 0xffc040, 0xd03a10, 0, 0.5);
    if (Math.random() < 0.4) this.spawn(x + this.rnd(0.4), y + 0.5, z + this.rnd(0.4), this.rnd(0.3), 1.2, this.rnd(0.3), 1.6, 0.3, 0.9, 0x303030, 0x606060, 0, 0.3);
  }
  lightAt(x: number, y: number, z: number, color: number, intensity: number, dur: number) {
    this.light.position.set(x, y, z); this.light.color.set(color); this.lightI = intensity; this.lightT = dur; this.lightD = dur;
  }
  lightD = 0.1;
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number | string = 0xffd36b, w = 0.025) {
    const t = this.tracers[this.tIdx]; this.tIdx = (this.tIdx + 1) % this.tracers.length;
    const dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz); if (len < 0.5) return;
    t.mesh.visible = true; t.mesh.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    t.mesh.lookAt(bx, by, bz); t.mesh.scale.set(w, w, len);
    t.mat.color.set(color); t.mat.opacity = 0.9; t.t = 0.07;
  }
  decal(x: number, y: number, z: number, nx: number, ny: number, nz: number) {
    const d = this.decals[this.dIdx]; this.dIdx = (this.dIdx + 1) % this.decals.length;
    d.visible = true; d.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012); d.lookAt(x + nx, y + ny, z + nz); d.rotateZ(Math.random() * 3);
  }

  update(dt: number, cx: number, cy: number, cz: number) {
    const inst = this.inst; const fc = this.fogColor;
    for (let i = 0; i < this.N; i++) {
      if (!this.alive[i]) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.alive[i] = 0; _m.compose(_p.set(0, -999, 0), ID_Q, _s.set(0, 0, 0)); inst.setMatrixAt(i, _m); continue; }
      const k = 1 - this.life[i] / this.max[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= d; this.vz[i] *= d; this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.02 && this.grav[i] > 5) { this.py[i] = 0.02; this.vy[i] *= -0.3; this.vx[i] *= 0.5; this.vz[i] *= 0.5; }
      const sz = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const a = k * 0.9;
      _c.setRGB(this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * k, this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * k, this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * k);
      if (this.grav[i] < 1 && this.s1[i] > this.s0[i] && k > 0.6) _c.lerp(fc, (k - 0.6) * 1.8 * a);
      _q.setFromAxisAngle(_p.set(0.3, 1, 0.2).normalize(), this.rot[i] + k * 2);
      _m.compose(_p.set(this.px[i], this.py[i], this.pz[i]), _q, _s.set(sz, sz, sz)); inst.setMatrixAt(i, _m); inst.setColorAt(i, _c);
    }
    inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    for (const t of this.tracers) if (t.mesh.visible) { t.t -= dt; t.mat.opacity = Math.max(0, t.t / 0.07) * 0.9; if (t.t <= 0) t.mesh.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = this.lightI * Math.max(0, this.lightT / this.lightD); } else this.light.intensity = 0;
    if (this.rain) {
      const p = this.rainPos; const fall = 28 * dt;
      for (let i = 0; i < this.rainN; i++) {
        const o = i * 6; p[o + 1] -= fall; p[o + 4] -= fall;
        if (p[o + 1] < cy - 2) { const x = cx + (Math.random() - 0.5) * 36, z = cz + (Math.random() - 0.5) * 36, y = cy + 14 + Math.random() * 4; p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = x - 0.1; p[o + 4] = y - 0.7; p[o + 5] = z; }
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
  }
  clear() {
    for (let i = 0; i < this.N; i++) { this.alive[i] = 0; _m.compose(_p.set(0, -999, 0), ID_Q, _s.set(0, 0, 0)); this.inst.setMatrixAt(i, _m); }
    this.inst.instanceMatrix.needsUpdate = true; this.decals.forEach((d) => (d.visible = false)); this.tracers.forEach((t) => (t.mesh.visible = false));
  }
}
