import * as THREE from "three";
import type { MapDef } from "../data/maps";
import { mats, VB } from "../gfx/models";
import { clamp, rng } from "../util";

export interface Collider { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; off?: boolean; stamp?: number; prop?: Prop }
export interface Body { x: number; y: number; z: number; vx: number; vy: number; vz: number; onGround: boolean }
export type PropKind = "barrel" | "vehicle" | "generator" | "tank" | "core";
export interface Prop {
  id: number; kind: PropKind; hp: number; maxHp: number; mesh: THREE.Object3D; x: number; y: number; z: number; r: number;
  c: Collider; dead: boolean; explosive: boolean; objective: boolean; name: string; wreck?: THREE.BufferGeometry; litMesh?: THREE.Mesh; glowMesh?: THREE.Mesh;
}
export interface RayHit { t: number; nx: number; ny: number; nz: number; c: Collider | null }
export interface Pt { x: number; z: number }
export interface BuildOpts { treeMul: number; barrels: number; progress: (p: number, label: string) => Promise<void> }

const GRAV = 22;
const CELL = 4;
let propId = 1;

export class World {
  def: MapDef; S: number;
  colliders: Collider[] = [];
  grid: Collider[][] = []; gw = 0; gmin = 0;
  stampId = 1;
  nav!: Uint8Array; nn = 0;
  props: Prop[] = [];
  start: Pt & { yaw: number } = { x: 0, z: 0, yaw: 0 };
  extract: Pt = { x: 0, z: 0 };
  pois: Pt[] = []; spawns: Pt[] = []; pickupSpots: Pt[] = []; domPoints: Pt[] = []; targetSpots: Pt[] = [];
  group = new THREE.Group();
  minimap!: HTMLCanvasElement;
  private tmp: Collider[] = [];
  private R: () => number;
  private occ: { x0: number; z0: number; x1: number; z1: number }[] = [];
  private doorPts: Pt[] = [];
  private lit = new VB(); private glow = new VB(); private barrelGeo: THREE.BufferGeometry | null = null;
  private opts!: BuildOpts;

  constructor(def: MapDef) { this.def = def; this.S = def.size; this.R = rng(def.seed); }

  // ------------------------------------------------------------ colliders & grid
  private cellIdx(x: number) { return clamp(Math.floor((x - this.gmin) / CELL), 0, this.gw - 1); }
  addCollider(c: Collider) {
    this.colliders.push(c);
    const x0 = this.cellIdx(c.minX), x1 = this.cellIdx(c.maxX), z0 = this.cellIdx(c.minZ), z1 = this.cellIdx(c.maxZ);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.grid[z * this.gw + x].push(c);
  }
  private query(minX: number, minZ: number, maxX: number, maxZ: number): Collider[] {
    const out = this.tmp; out.length = 0; const id = ++this.stampId;
    const x0 = this.cellIdx(minX), x1 = this.cellIdx(maxX), z0 = this.cellIdx(minZ), z1 = this.cellIdx(maxZ);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const l = this.grid[z * this.gw + x];
      for (let i = 0; i < l.length; i++) { const c = l[i]; if (c.off || c.stamp === id) continue; c.stamp = id; out.push(c); }
    }
    return out;
  }

  moveBody(b: Body, r: number, h: number, dt: number, step = 0.55) {
    const lim = this.S + 0.2 - r;
    // X
    let nx = b.x + b.vx * dt;
    let cs = this.query(nx - r - 0.01, b.z - r - 0.01, nx + r + 0.01, b.z + r + 0.01);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (nx + r > c.minX && nx - r < c.maxX && b.z + r > c.minZ && b.z - r < c.maxZ && b.y < c.maxY - 0.001 && b.y + h > c.minY + 0.001) {
        if (c.maxY - b.y <= step && b.onGround && c.maxY + h <= 2.5) b.y = c.maxY;
        else { nx = b.vx > 0 ? c.minX - r - 0.001 : c.maxX + r + 0.001; b.vx = 0; }
      }
    }
    b.x = clamp(nx, -lim, lim);
    // Z
    let nz = b.z + b.vz * dt;
    cs = this.query(b.x - r - 0.01, nz - r - 0.01, b.x + r + 0.01, nz + r + 0.01);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (b.x + r > c.minX && b.x - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ && b.y < c.maxY - 0.001 && b.y + h > c.minY + 0.001) {
        if (c.maxY - b.y <= step && b.onGround && c.maxY + h <= 2.5) b.y = c.maxY;
        else { nz = b.vz > 0 ? c.minZ - r - 0.001 : c.maxZ + r + 0.001; b.vz = 0; }
      }
    }
    b.z = clamp(nz, -lim, lim);
    // Y
    b.vy -= GRAV * dt;
    let ny = b.y + b.vy * dt; const prevY = b.y; b.onGround = false;
    if (ny <= 0) { ny = 0; if (b.vy < 0) b.vy = 0; b.onGround = true; }
    cs = this.query(b.x - r, b.z - r, b.x + r, b.z + r);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (b.x + r > c.minX && b.x - r < c.maxX && b.z + r > c.minZ && b.z - r < c.maxZ) {
        if (b.vy <= 0 && prevY >= c.maxY - 0.06 && ny < c.maxY) { ny = c.maxY; b.vy = 0; b.onGround = true; }
        else if (b.vy > 0 && prevY + h <= c.minY + 0.06 && ny + h > c.minY) { ny = c.minY - h; b.vy = 0; }
      }
    }
    b.y = ny;
  }

  /** Bouncing sphere (grenades). Returns true if bounced. */
  moveSphere(p: Body, r: number, dt: number, bounce = 0.45): boolean {
    let hit = false;
    const test = (x: number, y: number, z: number) => {
      if (y - r < 0) return true;
      const cs = this.query(x - r, z - r, x + r, z + r);
      for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ && y + r > c.minY && y - r < c.maxY) return true; }
      return false;
    };
    p.vy -= GRAV * 0.8 * dt;
    let nx = p.x + p.vx * dt; if (test(nx, p.y, p.z)) { p.vx *= -bounce; p.vz *= 0.8; nx = p.x; hit = true; } p.x = nx;
    let nz = p.z + p.vz * dt; if (test(p.x, p.y, nz)) { p.vz *= -bounce; p.vx *= 0.8; nz = p.z; hit = true; } p.z = nz;
    let ny = p.y + p.vy * dt;
    if (test(p.x, ny, p.z)) { if (Math.abs(p.vy) > 2) hit = true; p.vy *= -bounce; p.vx *= 0.75; p.vz *= 0.75; ny = p.y; if (Math.abs(p.vy) < 1) p.vy = 0; p.onGround = true; } else p.onGround = false;
    p.y = Math.max(r, ny);
    p.x = clamp(p.x, -this.S, this.S); p.z = clamp(p.z, -this.S, this.S);
    return hit;
  }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: RayHit): boolean {
    let best = maxT; let hc: Collider | null = null; let hnx = 0, hny = 0, hnz = 0; let found = false;
    if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; found = true; hnx = 0; hny = 1; hnz = 0; } }
    const id = ++this.stampId; const gm = this.gmin;
    let gx = Math.floor((ox - gm) / CELL), gz = Math.floor((oz - gm) / CELL);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tmx = dx !== 0 ? ((gx + (dx > 0 ? 1 : 0)) * CELL + gm - ox) / dx : Infinity;
    let tmz = dz !== 0 ? ((gz + (dz > 0 ? 1 : 0)) * CELL + gm - oz) / dz : Infinity;
    let iter = 0;
    while (iter++ < 200) {
      if (gx >= 0 && gz >= 0 && gx < this.gw && gz < this.gw) {
        const l = this.grid[gz * this.gw + gx];
        for (let i = 0; i < l.length; i++) {
          const c = l[i]; if (c.off || c.stamp === id) continue; c.stamp = id;
          let t0 = 0, t1 = best; let nxx = 0, nyy = 0, nzz = 0;
          // X slab
          if (dx !== 0) {
            const a = (c.minX - ox) / dx, b = (c.maxX - ox) / dx; const lo = Math.min(a, b), hi = Math.max(a, b);
            if (lo > t0) { t0 = lo; nxx = dx > 0 ? -1 : 1; nyy = 0; nzz = 0; } if (hi < t1) t1 = hi;
          } else if (ox < c.minX || ox > c.maxX) continue;
          if (dy !== 0) {
            const a = (c.minY - oy) / dy, b = (c.maxY - oy) / dy; const lo = Math.min(a, b), hi = Math.max(a, b);
            if (lo > t0) { t0 = lo; nxx = 0; nyy = dy > 0 ? -1 : 1; nzz = 0; } if (hi < t1) t1 = hi;
          } else if (oy < c.minY || oy > c.maxY) continue;
          if (dz !== 0) {
            const a = (c.minZ - oz) / dz, b = (c.maxZ - oz) / dz; const lo = Math.min(a, b), hi = Math.max(a, b);
            if (lo > t0) { t0 = lo; nxx = 0; nyy = 0; nzz = dz > 0 ? -1 : 1; } if (hi < t1) t1 = hi;
          } else if (oz < c.minZ || oz > c.maxZ) continue;
          if (t0 <= t1 && t0 > 0 && t0 < best) { best = t0; hc = c; hnx = nxx; hny = nyy; hnz = nzz; found = true; }
        }
      }
      if (Math.min(tmx, tmz) > best) break;
      if (tmx < tmz) { gx += sx; tmx += tdx; } else { gz += sz; tmz += tdz; }
      if (gx < -1 || gz < -1 || gx > this.gw || gz > this.gw) break;
    }
    if (found) { out.t = best; out.nx = hnx; out.ny = hny; out.nz = hnz; out.c = hc; }
    return found;
  }
  private _rh: RayHit = { t: 0, nx: 0, ny: 0, nz: 0, c: null };
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az; const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return !this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.15, this._rh);
  }

  // ------------------------------------------------------------ navigation
  private ni(x: number) { return clamp(Math.floor(x + this.S), 0, this.nn - 1); }
  walkable(x: number, z: number) { return this.nav[this.ni(z) * this.nn + this.ni(x)] === 0; }
  private markNav(c: Collider) {
    if (c.maxY < 0.45 || c.minY > 1.7) return;
    const m = 0.38;
    const x0 = this.ni(c.minX - m), x1 = this.ni(c.maxX + m), z0 = this.ni(c.minZ - m), z1 = this.ni(c.maxZ + m);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      // cell center test against expanded box
      const cx = x - this.S + 0.5, cz = z - this.S + 0.5;
      if (cx > c.minX - m - 0.5 + 0.0 && cx < c.maxX + m + 0.5 && cz > c.minZ - m - 0.5 && cz < c.maxZ + m + 0.5) this.nav[z * this.nn + x] = 1;
    }
  }
  nearestWalkable(x: number, z: number): Pt {
    if (this.walkable(x, z)) return { x, z };
    for (let r = 1; r < 25; r++) {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r, pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (Math.abs(px) < this.S - 1 && Math.abs(pz) < this.S - 1 && this.walkable(px, pz)) return { x: px, z: pz };
      }
    }
    return { x, z };
  }
  private navLine(x0: number, z0: number, x1: number, z1: number) {
    const d = Math.hypot(x1 - x0, z1 - z0); const n = Math.ceil(d / 0.5);
    for (let i = 1; i < n; i++) { const t = i / n; if (!this.walkable(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  }
  private g!: Float32Array; private par!: Int32Array; private vis!: Uint32Array; private visId = 0; private heap: number[] = []; private heapF!: Float32Array;
  findPath(x0: number, z0: number, x1: number, z1: number, maxExp = 5000): number[] | null {
    const n = this.nn;
    if (!this.g) { this.g = new Float32Array(n * n); this.par = new Int32Array(n * n); this.vis = new Uint32Array(n * n); this.heapF = new Float32Array(n * n); }
    const s = this.nearestWalkable(x0, z0), e = this.nearestWalkable(x1, z1);
    const si = this.ni(s.z) * n + this.ni(s.x), ei = this.ni(e.z) * n + this.ni(e.x);
    if (si === ei) return [e.x, e.z];
    const id = ++this.visId; const heap = this.heap; heap.length = 0;
    const ex = ei % n, ez = (ei / n) | 0;
    const hf = (i: number) => { const dx = Math.abs((i % n) - ex), dz = Math.abs(((i / n) | 0) - ez); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const push = (i: number, f: number) => {
      this.heapF[i] = f; heap.push(i); let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (this.heapF[heap[p]] <= f) break; heap[k] = heap[p]; k = p; }
      heap[k] = i;
    };
    const pop = () => {
      const top = heap[0]; const last = heap.pop()!;
      if (heap.length) {
        let k = 0; const f = this.heapF[last]; const L = heap.length;
        for (;;) { let c = 2 * k + 1; if (c >= L) break; if (c + 1 < L && this.heapF[heap[c + 1]] < this.heapF[heap[c]]) c++; if (this.heapF[heap[c]] >= f) break; heap[k] = heap[c]; k = c; }
        heap[k] = last;
      }
      return top;
    };
    this.g[si] = 0; this.par[si] = -1; this.vis[si] = id; push(si, hf(si));
    const closed = new Set<number>(); let exp = 0; let found = false;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (heap.length && exp++ < maxExp) {
      const cur = pop(); if (closed.has(cur)) continue; closed.add(cur);
      if (cur === ei) { found = true; break; }
      const cx = cur % n, cz = (cur / n) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k]; if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = nz * n + nx; if (this.nav[ni]) continue;
        if (k >= 4 && (this.nav[cz * n + nx] || this.nav[nz * n + cx])) continue;
        const ng = this.g[cur] + (k >= 4 ? 1.414 : 1);
        if (this.vis[ni] !== id || ng < this.g[ni]) { this.vis[ni] = id; this.g[ni] = ng; this.par[ni] = cur; push(ni, ng + hf(ni)); }
      }
    }
    if (!found) return null;
    const pts: number[] = []; let c = ei;
    while (c !== -1) { pts.push((c % n) - this.S + 0.5, ((c / n) | 0) - this.S + 0.5); c = this.par[c]; }
    pts.reverse();
    // smooth
    const out: number[] = []; let ax = pts[0], az = pts[1]; let i = 0; const cnt = pts.length / 2;
    while (i < cnt - 1) {
      let j = cnt - 1;
      while (j > i + 1 && !this.navLine(ax, az, pts[j * 2], pts[j * 2 + 1])) j--;
      out.push(pts[j * 2], pts[j * 2 + 1]); ax = pts[j * 2]; az = pts[j * 2 + 1]; i = j;
    }
    out[out.length - 2] = e.x; out[out.length - 1] = e.z;
    return out;
  }

  // ------------------------------------------------------------ dynamic props
  damageProp(p: Prop, dmg: number): boolean {
    if (p.dead) return false;
    p.hp -= dmg;
    if (p.hp > 0) return false;
    p.dead = true; p.c.off = true;
    if (p.kind === "barrel") p.mesh.visible = false;
    else if (p.litMesh && p.wreck) { p.litMesh.geometry = p.wreck; if (p.glowMesh) p.glowMesh.visible = false; p.c.off = false; p.c.maxY = 1.0; }
    return true;
  }
  addBarrel(x: number, z: number, explosive = true) {
    if (!this.barrelGeo) {
      const v = new VB();
      v.box(0, 0.45, 0, 0.6, 0.9, 0.6, "#b3322a"); v.box(0, 0.2, 0, 0.64, 0.06, 0.64, "#3a1512", undefined, 0); v.box(0, 0.7, 0, 0.64, 0.06, 0.64, "#3a1512", undefined, 0);
      v.box(0, 0.92, 0, 0.5, 0.04, 0.5, "#d8c04a", undefined, 0); v.box(0, 0.5, -0.31, 0.2, 0.2, 0.01, "#ffcc33", undefined, 0);
      this.barrelGeo = v.geometry();
    }
    const m = new THREE.Mesh(this.barrelGeo, mats().lit); m.position.set(x, 0, z); m.castShadow = true; m.rotation.y = this.R() * 6;
    this.group.add(m);
    const c: Collider = { minX: x - 0.31, maxX: x + 0.31, minZ: z - 0.31, maxZ: z + 0.31, minY: 0, maxY: 0.95 };
    const p: Prop = { id: propId++, kind: "barrel", hp: 25, maxHp: 25, mesh: m, x, y: 0, z, r: 0.35, c, dead: false, explosive, objective: false, name: "Barril" };
    c.prop = p; this.addCollider(c); this.props.push(p); return p;
  }
  addTarget(kind: Exclude<PropKind, "barrel">, x: number, z: number): Prop {
    const build = (charred: boolean) => {
      const L = new VB(), G = new VB(); const k = (c: string, d: string) => (charred ? d : c);
      let hw = 1.5, hd = 1.5, hh = 2, hp = 400, name = "Alvo";
      if (kind === "vehicle") {
        hw = 2.6; hd = 1.3; hh = 2.0; hp = 520; name = "Veículo Blindado";
        L.box(0, 0.75, 0, 5, 0.9, 2.4, k("#4a5240", "#1a1a1a")); L.box(0.2, 1.4, 0, 3, 0.55, 2.0, k("#586148", "#202020")); L.box(-0.3, 1.9, 0, 1.4, 0.45, 1.4, k("#4a5240", "#161616"));
        L.box(1.9, 1.95, 0, 2.2, 0.14, 0.16, k("#2a2d2a", "#111"));
        for (const wx of [-1.8, -0.6, 0.6, 1.8]) for (const wz of [-1.28, 1.28]) L.box(wx, 0.4, wz, 0.8, 0.8, 0.28, "#16171a");
        L.box(2.55, 0.8, 0, 0.1, 0.5, 1.8, k("#3a4130", "#101010")); if (!charred) { G.box(2.52, 1.0, -0.7, 0.08, 0.14, 0.3, "#ffe9a0"); G.box(2.52, 1.0, 0.7, 0.08, 0.14, 0.3, "#ffe9a0"); G.box(0, 2.2, 0, 0.1, 0.1, 0.1, "#ff3030"); }
      } else if (kind === "generator") {
        hw = 1.6; hd = 1.1; hh = 2.0; hp = 320; name = "Gerador";
        L.box(0, 1.0, 0, 3.2, 2, 2.2, k("#d4801c", "#1a1816")); L.box(0, 2.05, 0, 3.3, 0.12, 2.3, k("#3a3d42", "#111"));
        for (let i = -1; i <= 1; i++) L.box(i * 0.9, 1.0, -1.11, 0.6, 1.2, 0.06, k("#2a2c30", "#0c0c0c"));
        L.box(1.3, 2.6, 0.6, 0.35, 1.2, 0.35, "#2a2c30"); if (!charred) { G.box(-1.3, 1.5, -1.12, 0.3, 0.3, 0.05, "#3aff6a"); G.box(-1.3, 1.1, -1.12, 0.3, 0.3, 0.05, "#ff3a2a"); }
      } else if (kind === "tank") {
        hw = 2.2; hd = 2.2; hh = 5; hp = 450; name = "Tanque de Combustível";
        L.box(0, 2.5, 0, 4.2, 5, 4.2, k("#9aa3a8", "#1c1c1c")); L.box(0, 5.1, 0, 3.6, 0.3, 3.6, k("#7b8387", "#111"));
        for (const y of [1, 2.5, 4]) L.box(0, y, 0, 4.3, 0.15, 4.3, k("#c9472b", "#0f0f0f"), undefined, 0);
        L.box(2.2, 2.5, 0, 0.12, 4.6, 0.3, "#555a5e"); if (!charred) G.box(0, 5.4, 0, 0.3, 0.3, 0.3, "#ff3030");
      } else {
        hw = 0.9; hd = 0.9; hh = 3.2; hp = 500; name = "Núcleo do Vértice";
        L.box(0, 0.2, 0, 2.2, 0.4, 2.2, k("#2a3238", "#111")); L.box(0, 3.1, 0, 1.6, 0.25, 1.6, k("#2a3238", "#111"));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.box(sx * 0.85, 1.6, sz * 0.85, 0.16, 3, 0.16, k("#3a444c", "#111"));
        if (!charred) { G.box(0, 1.7, 0, 0.9, 2.2, 0.9, "#2ad4ff"); G.box(0, 1.7, 0, 1.2, 0.12, 1.2, "#b9f6ff"); G.box(0, 2.3, 0, 1.2, 0.12, 1.2, "#b9f6ff"); G.box(0, 1.1, 0, 1.2, 0.12, 1.2, "#b9f6ff"); }
      }
      return { L, G, hw, hd, hh, hp, name };
    };
    const a = build(false), b = build(true);
    const grp = new THREE.Group(); const m = mats();
    const lm = new THREE.Mesh(a.L.geometry(), m.lit); lm.castShadow = true; grp.add(lm);
    let gm: THREE.Mesh | undefined; if (!a.G.empty) { gm = new THREE.Mesh(a.G.geometry(), m.glow); grp.add(gm); }
    grp.position.set(x, 0, z); this.group.add(grp);
    const c: Collider = { minX: x - a.hw, maxX: x + a.hw, minZ: z - a.hd, maxZ: z + a.hd, minY: 0, maxY: a.hh };
    const p: Prop = { id: propId++, kind, hp: a.hp, maxHp: a.hp, mesh: grp, x, y: a.hh / 2, z, r: Math.max(a.hw, a.hd), c, dead: false, explosive: false, objective: true, name: a.name, wreck: b.L.geometry(), litMesh: lm, glowMesh: gm };
    c.prop = p; this.addCollider(c); this.props.push(p);
    // block nav
    this.markNav(c);
    return p;
  }

  // ------------------------------------------------------------ generation
  private S_(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: string, coll = true) {
    this.lit.box(cx, y0 + h / 2, cz, w, h, d, color);
    if (coll) this.addCollider({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: y0, maxY: y0 + h });
  }
  private G_(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: string) { this.glow.box(cx, y0 + h / 2, cz, w, h, d, color, undefined, 0.02); }
  private C_(cx: number, y0: number, cz: number, w: number, h: number, d: number) { this.addCollider({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, minY: y0, maxY: y0 + h }); }
  private rf(a: number, b: number) { return a + this.R() * (b - a); }
  private ri(a: number, b: number) { return Math.floor(this.rf(a, b + 1)); }
  private free(x: number, z: number, r: number) {
    if (Math.abs(x) > this.S - 2.5 || Math.abs(z) > this.S - 2.5) return false;
    if (Math.hypot(x - this.start.x, z - this.start.z) < 6 || Math.hypot(x - this.extract.x, z - this.extract.z) < 6) return false;
    for (const o of this.occ) if (x + r > o.x0 && x - r < o.x1 && z + r > o.z0 && z - r < o.z1) return false;
    for (const d of this.doorPts) if (Math.hypot(x - d.x, z - d.z) < r + 2.2) return false;
    return true;
  }
  private reserve(x: number, z: number, hw: number, hd: number) { this.occ.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd }); }

  // --- props
  private crate(x: number, z: number, big = false) {
    const s = big ? 1.6 : 1.0; const cols = ["#8a6a3c", "#6e5530", "#7a7e46", "#5d6a74"];
    const col = cols[this.ri(0, 3)];
    this.S_(x, 0, z, s, s, s, col); this.lit.box(x, s / 2, z, s + 0.04, 0.08, s + 0.04, "#3a2c16", undefined, 0); this.lit.box(x, s - 0.04, z, s + 0.04, 0.08, s + 0.04, "#3a2c16", undefined, 0);
    if (this.R() < 0.5) this.S_(x + this.rf(-0.1, 0.1), s, z + this.rf(-0.1, 0.1), s * 0.8, s * 0.8, s * 0.8, cols[this.ri(0, 3)]);
  }
  private barrier(x: number, z: number, rot: boolean) {
    const w = rot ? 0.7 : 3, d = rot ? 3 : 0.7;
    this.S_(x, 0, z, w, 1.1, d, "#a2a5a8"); this.S_(x, 0, z, w + (rot ? 0.3 : 0), 0.25, d + (rot ? 0 : 0.3), "#8a8d90");
    this.lit.box(x, 1.1, z, rot ? 0.5 : 2.8, 0.06, rot ? 2.8 : 0.5, "#c9ccd0", undefined, 0.02);
  }
  private sandbags(x: number, z: number, rot: boolean) {
    const w = rot ? 0.8 : 3.2, d = rot ? 3.2 : 0.8;
    this.S_(x, 0, z, w, 0.5, d, "#a8966a"); this.S_(x, 0.5, z, w * 0.9, 0.45, d * 0.9, "#9a8860");
    for (let i = -3; i <= 3; i++) this.lit.box(rot ? x : x + i * 0.45, 0.5, rot ? z + i * 0.45 : z, rot ? 0.82 : 0.02, 0.5, rot ? 0.02 : 0.82, "#6f6244", undefined, 0);
  }
  private lamp(x: number, z: number) {
    this.S_(x, 0, z, 0.2, 5, 0.2, "#3a3d42"); this.lit.box(x + 0.5, 5, z, 1.1, 0.12, 0.2, "#3a3d42");
    this.G_(x + 0.9, 4.88, z, 0.4, 0.14, 0.25, this.def.night ? "#ffd98a" : "#d8d8c0");
  }
  private sign(x: number, z: number, rot: number) {
    this.S_(x, 0, z, 0.15, 2.4, 0.15, "#555a5e"); this.lit.box(x, 2.3, z, 1.5, 0.9, 0.08, this.def.accent, [0, rot, 0]); this.lit.box(x, 2.3, z, 1.2, 0.2, 0.1, "#f2f2f2", [0, rot, 0], 0);
  }
  private tree(x: number, z: number, big = 1) {
    const h = this.rf(3.2, 4.5) * big;
    this.S_(x, 0, z, 0.55, h, 0.55, "#5a4028");
    const g = ["#2f6a2c", "#3a7a34", "#2a5e28"];
    for (let i = 0; i < 4; i++) { const w = (3.4 - i * 0.75) * big; this.lit.box(x + this.rf(-0.15, 0.15), h - 0.4 + i * 0.95 * big, z + this.rf(-0.15, 0.15), w, 1.05 * big, w, this.def.theme === "desert" ? "#6a8a3c" : g[i % 3]); }
  }
  private pine(x: number, z: number) {
    const h = this.rf(4, 5.5);
    this.S_(x, 0, z, 0.5, h, 0.5, "#4a3320");
    for (let i = 0; i < 5; i++) { const w = 3.2 - i * 0.6; this.lit.box(x, 1.4 + i * 1.0, z, w, 0.9, w, i % 2 ? "#1f5a2e" : "#2a6a36"); }
  }
  private rock(x: number, z: number, s: number) {
    const c = this.def.theme === "desert" ? ["#a89068", "#8f7a55"] : ["#7d8084", "#6a6d71"];
    this.lit.box(x, s * 0.35, z, s, s * 0.7, s * 0.9, c[0], [0, this.R() * 3, 0.05]); this.lit.box(x + s * 0.3, s * 0.2, z + s * 0.2, s * 0.6, s * 0.4, s * 0.6, c[1], [0, this.R() * 3, 0]);
    this.C_(x, 0, z, s * 0.9, s * 0.65, s * 0.85);
  }
  private bush(x: number, z: number) { this.lit.box(x, 0.35, z, this.rf(0.8, 1.4), 0.7, this.rf(0.8, 1.4), this.def.theme === "desert" ? "#8a8a4a" : "#3a7a30", [0, this.R() * 3, 0]); }
  private cactus(x: number, z: number) { this.S_(x, 0, z, 0.4, 2, 0.4, "#4a8a3c"); this.lit.box(x + 0.4, 1.2, z, 0.5, 0.3, 0.3, "#4a8a3c"); this.lit.box(x + 0.55, 1.6, z, 0.28, 0.8, 0.28, "#4a8a3c"); }
  private vehicle(x: number, z: number, rot: boolean, kind: "car" | "truck" | "jeep") {
    const colors = ["#7a2a2a", "#2a4a6a", "#8a8a8a", "#5a6a3a", "#9a7a2a"];
    const col = this.def.theme === "city" ? "#6a5a4a" : colors[this.ri(0, colors.length - 1)];
    const L = kind === "truck" ? 6 : 4.2, W = 2.1;
    const bx = (cx: number, y0: number, w: number, h: number, d: number, c: string) => this.lit.box(x + (rot ? cx * 0 + 0 : cx), y0 + h / 2, z + (rot ? cx : 0), rot ? d : w, h, rot ? w : d, c);
    // build along x (rot=false) or z (rot=true) using bx with local along-axis offset
    const along = (o: number, y0: number, len: number, h: number, wid: number, c: string) => {
      if (rot) this.lit.box(x, y0 + h / 2, z + o, wid, h, len, c); else this.lit.box(x + o, y0 + h / 2, z, len, h, wid, c);
    };
    void bx;
    if (kind === "truck") { along(-1, 0.5, 4, 1.2, 2.2, "#555c4a"); along(-1, 1.7, 4, 0.1, 2.3, "#4a5040"); along(2.1, 0.5, 1.6, 1.7, 2.1, col); along(2.5, 1.5, 0.8, 0.7, 1.9, "#26343e"); }
    else if (kind === "jeep") { along(0, 0.5, 3.6, 0.8, 2.0, col); along(-0.3, 1.3, 1.6, 0.7, 1.8, "#232b2f"); along(1.4, 1.3, 0.05, 0.6, 1.8, "#26343e"); }
    else { along(0, 0.45, L, 0.7, W, col); along(-0.2, 1.15, 2.2, 0.65, 1.8, "#232b2f"); along(-0.2, 1.15, 2.0, 0.65, 1.85, col); }
    for (const o of kind === "truck" ? [-2.4, 0, 2.2] : [-1.3, 1.3]) for (const s of [-1, 1]) { if (rot) this.lit.box(x + s * 1.05, 0.35, z + o, 0.3, 0.7, 0.7, "#141414"); else this.lit.box(x + o, 0.35, z + s * 1.05, 0.7, 0.7, 0.3, "#141414"); }
    const lx = rot ? 2.2 : (kind === "truck" ? 3.4 : 2.6), lz = rot ? (kind === "truck" ? 3.4 : 2.6) : 2.2;
    this.C_(x, 0, z, rot ? 2.3 : lx * 1.7 + 1, kind === "truck" ? 2.2 : 1.5, rot ? lz * 1.7 + 1 : 2.3);
  }
  private container(x: number, z: number, rot: boolean, level = 0) {
    const cols = ["#b5382a", "#2a5a8a", "#c9902a", "#3a6a4a", "#7a7a80", "#8a3a6a"];
    const c = cols[this.ri(0, cols.length - 1)]; const w = rot ? 2.5 : 6.1, d = rot ? 6.1 : 2.5; const y0 = level * 2.6;
    this.S_(x, y0, z, w, 2.6, d, c);
    for (let i = -2; i <= 2; i++) this.lit.box(rot ? x + (i * 0.0) : x + i * 1.1, y0 + 1.3, rot ? z + i * 1.1 : z, rot ? w + 0.06 : 0.12, 2.5, rot ? 0.12 : d + 0.06, new THREE.Color(c).multiplyScalar(0.8).getStyle(), undefined, 0.02);
    this.lit.box(x, y0 + 2.62, z, w * 0.98, 0.06, d * 0.98, "#222", undefined, 0);
  }
  private desk(x: number, z: number, rot: number) {
    this.S_(x, 0, z, 1.5, 0.78, 0.8, "#6a5236"); this.lit.box(x, 0.8, z, 1.55, 0.05, 0.85, "#3a2c1c", undefined, 0);
    this.lit.box(x, 1.05, z - 0.1, 0.5, 0.35, 0.06, "#15181c"); this.G_(x, 0.9, z - 0.14, 0.44, 0.3, 0.02, this.def.theme === "lab" ? "#2ad4c8" : "#6ab4ff");
    void rot;
  }
  private shelf(x: number, z: number, alongX: boolean) {
    const w = alongX ? 2.4 : 0.6, d = alongX ? 0.6 : 2.4;
    this.S_(x, 0, z, w, 1.9, d, "#3a3f44");
    for (let i = 0; i < 4; i++) this.lit.box(x, 0.4 + i * 0.45, z, w + 0.02, 0.05, d + 0.02, "#555a60", undefined, 0);
    for (let i = 0; i < 6; i++) this.lit.box(x + (alongX ? this.rf(-1, 1) : 0), 0.7 + this.ri(0, 2) * 0.45, z + (alongX ? 0 : this.rf(-1, 1)), 0.35, 0.3, 0.35, ["#8a6a3c", "#6a7a8a", "#a05a3a"][i % 3]);
  }
  private machine(x: number, z: number, rot: boolean) {
    const w = rot ? 1.8 : 3.2, d = rot ? 3.2 : 1.8;
    this.S_(x, 0, z, w, 1.5, d, "#4a5258"); this.lit.box(x, 1.6, z, w * 0.7, 0.4, d * 0.7, this.def.accent); this.lit.box(x, 1.95, z, w * 0.3, 0.5, d * 0.3, "#2a2e32");
    this.G_(x + (rot ? 0.91 : 0), 1.0, z + (rot ? 0 : 0.91), 0.3, 0.2, 0.05, "#3aff6a");
  }
  private labTable(x: number, z: number, alongX: boolean) {
    const w = alongX ? 2.6 : 1, d = alongX ? 1 : 2.6;
    this.S_(x, 0, z, w, 0.9, d, "#dfe4e8"); this.lit.box(x, 0.92, z, w + 0.05, 0.05, d + 0.05, "#2a3036", undefined, 0);
    this.G_(x - (alongX ? 0.6 : 0), 0.98, z - (alongX ? 0 : 0.6), 0.5, 0.3, 0.04, "#2ad4c8"); this.lit.box(x + (alongX ? 0.6 : 0), 1.05, z + (alongX ? 0 : 0.6), 0.2, 0.25, 0.2, "#8fe4ff", undefined, 0);
  }
  private rack(x: number, z: number, alongX: boolean) {
    const w = alongX ? 1.6 : 0.9, d = alongX ? 0.9 : 1.6;
    this.S_(x, 0, z, w, 2.2, d, "#23272c");
    for (let i = 0; i < 6; i++) this.G_(x + (alongX ? 0 : (w / 2 + 0.01)), 0.3 + i * 0.33, z + (alongX ? (d / 2 + 0.01) : 0), alongX ? 1.2 : 0.02, 0.06, alongX ? 0.02 : 1.2, i % 2 ? "#2ad4c8" : "#3aff6a");
  }
  private bed(x: number, z: number) { this.S_(x, 0, z, 2, 0.5, 1, "#6a4a3a"); this.lit.box(x, 0.55, z, 1.9, 0.12, 0.95, "#c8c8d0"); this.lit.box(x - 0.8, 0.7, z, 0.4, 0.15, 0.7, "#e8e8f0"); }
  private tent(x: number, z: number) {
    const c = this.def.theme === "desert" ? "#b8a070" : "#56633a";
    this.lit.box(x - 0.7, 1.0, z, 2.1, 0.1, 3.4, c, [0, 0, 0.8]); this.lit.box(x + 0.7, 1.0, z, 2.1, 0.1, 3.4, c, [0, 0, -0.8]);
    this.C_(x, 0, z, 2.6, 1.8, 3.4); this.lit.box(x, 0.05, z, 2.6, 0.04, 3.4, "#2a2a22", undefined, 0);
  }
  private tower(x: number, z: number) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.S_(x + sx * 1.5, 0, z + sz * 1.5, 0.3, 7, 0.3, "#5a4a34");
    this.S_(x, 7, z, 4.2, 0.3, 4.2, "#6a5a40"); for (const s of [-1, 1]) { this.S_(x + s * 2, 7.3, z, 0.15, 1, 4.2, "#6a5a40"); this.S_(x, 7.3, z + s * 2, 4.2, 1, 0.15, "#6a5a40"); }
    this.lit.box(x, 9.2, z, 4.6, 0.25, 4.6, "#3a3a30"); for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.lit.box(x + sx * 2, 8.4, z + sz * 2, 0.15, 1.7, 0.15, "#5a4a34");
    this.G_(x, 7.5, z + 2.05, 0.6, 0.3, 0.05, this.def.night ? "#ff4a3a" : "#ffe9a0");
  }
  private pipeRun(x: number, z: number, len: number, alongX: boolean) {
    for (let i = 0; i <= len / 4; i++) { const px = alongX ? x + i * 4 - len / 2 : x, pz = alongX ? z : z + i * 4 - len / 2; this.S_(px, 0, pz, 0.3, 3.2, 0.3, "#4a4f55"); }
    this.lit.box(x, 3.3, z, alongX ? len : 0.7, 0.7, alongX ? 0.7 : len, "#8a8f94"); this.lit.box(x, 3.3, z, alongX ? len : 0.8, 0.12, alongX ? 0.8 : len, this.def.accent, undefined, 0);
  }
  private hazardStripe(x: number, z: number, w: number, d: number) {
    for (let i = 0; i < 6; i++) this.lit.box(x - w / 2 + (i + 0.5) * (w / 6), 0.015, z, w / 6, 0.02, d, i % 2 ? "#e0b81a" : "#222", undefined, 0);
  }
  private helipad(x: number, z: number) {
    this.lit.box(x, 0.03, z, 11, 0.06, 11, "#4a4d52", undefined, 0.02); this.lit.box(x, 0.07, z, 1.2, 0.02, 7, "#e8e8e8", undefined, 0); this.lit.box(x, 0.07, z, 1.2, 0.02, 7, "#e8e8e8", [0, Math.PI / 2, 0], 0); this.lit.box(x, 0.07, z, 7, 0.02, 1.2, "#e8e8e8", undefined, 0);
  }
  private well(x: number, z: number) { this.S_(x, 0, z, 1.6, 0.9, 1.6, "#8a8a82"); this.lit.box(x, 1.4, z, 0.1, 1.0, 0.1, "#5a4028"); this.lit.box(x + 0.7, 1.4, z, 0.1, 1.0, 0.1, "#5a4028"); this.lit.box(x + 0.35, 2.0, z, 1.2, 0.1, 1.0, "#5a4028"); }
  private crops(x: number, z: number, w: number, d: number) { for (let i = 0; i < Math.floor(w / 1.2); i++) this.lit.box(x - w / 2 + 0.6 + i * 1.2, 0.2, z, 0.7, 0.4, d, i % 2 ? "#8a9a34" : "#5a8a2a", undefined, 0.08); }
  private fence(x0: number, z0: number, x1: number, z1: number, color = "#6a5236") {
    const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.ceil(L / 2.5);
    for (let i = 0; i <= n; i++) { const t = i / n; this.lit.box(x0 + (x1 - x0) * t, 0.6, z0 + (z1 - z0) * t, 0.12, 1.2, 0.12, color); }
    const ax = (x0 + x1) / 2, az = (z0 + z1) / 2; const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    this.lit.box(ax, 0.9, az, horiz ? L : 0.06, 0.08, horiz ? 0.06 : L, color, undefined, 0); this.lit.box(ax, 0.5, az, horiz ? L : 0.06, 0.08, horiz ? 0.06 : L, color, undefined, 0);
    this.C_(ax, 0, az, horiz ? L : 0.2, 1.2, horiz ? 0.2 : L);
  }

  // --- buildings
  private bays(n: number, winProb: number): string[] { const b: string[] = []; for (let i = 0; i < n; i++) b.push(this.R() < winProb ? "w" : "s"); return b; }
  private wall(axis: "x" | "z", a0: number, len: number, c: number, th: number, h: number, bays: string[], color: string, trim: string) {
    const bw = len / bays.length;
    bays.forEach((t, i) => {
      const p = a0 + bw * (i + 0.5);
      const bx = (y0: number, hh: number, w = bw, off = 0, col = color) => axis === "x" ? this.S_(p + off, y0, c, w, hh, th, col) : this.S_(c, y0, p + off, th, hh, w, col);
      if (t === "s") bx(0, h);
      else if (t === "w") {
        bx(0, 0.95); bx(2.3, h - 2.3); bx(0.95, 1.35, 0.35, -bw / 2 + 0.175); bx(0.95, 1.35, 0.35, bw / 2 - 0.175);
        if (axis === "x") this.lit.box(p, 0.97, c, bw - 0.1, 0.06, th + 0.16, trim, undefined, 0); else this.lit.box(c, 0.97, p, th + 0.16, 0.06, bw - 0.1, trim, undefined, 0);
        if (this.def.night || this.def.theme === "lab" || (this.def.theme === "city" && this.R() < 0.3)) { if (axis === "x") this.G_(p, 1.1, c, bw - 0.7, 1.1, 0.04, this.def.theme === "lab" ? "#9af4ff" : "#ffd98a"); else this.G_(c, 1.1, p, 0.04, 1.1, bw - 0.7, this.def.theme === "lab" ? "#9af4ff" : "#ffd98a"); }
      } else if (t === "d") {
        bx(2.5, h - 2.5); bx(0, 2.5, 0.3, -bw / 2 + 0.15, trim); bx(0, 2.5, 0.3, bw / 2 - 0.15, trim);
        this.doorPts.push(axis === "x" ? { x: p, z: c } : { x: c, z: p });
      }
    });
  }
  building(cx: number, cz: number, w: number, d: number, h: number, o: { wall: string; roof: string; trim: string; interior: string; winProb?: number; pitched?: boolean; doors?: number }) {
    const th = 0.35; const nx = Math.max(2, Math.round(w / 2.6)), nz = Math.max(2, Math.round(d / 2.6));
    const sides = [this.bays(nx, o.winProb ?? 0.45), this.bays(nx, o.winProb ?? 0.45), this.bays(nz, o.winProb ?? 0.45), this.bays(nz, o.winProb ?? 0.45)];
    const nd = o.doors ?? 2; const order = [0, 1, 2, 3].sort(() => this.R() - 0.5);
    for (let k = 0; k < nd; k++) { const s = sides[order[k % 4]]; const bi = this.ri(1, s.length - 2 < 1 ? 1 : s.length - 2); s[Math.min(bi, s.length - 1)] = "d"; if (s.length > 3 && k >= 1) s[bi] = "d"; }
    this.wall("x", cx - w / 2, w, cz - d / 2, th, h, sides[0], o.wall, o.trim);
    this.wall("x", cx - w / 2, w, cz + d / 2, th, h, sides[1], o.wall, o.trim);
    this.wall("z", cz - d / 2 + th, d - 2 * th, cx - w / 2, th, h, sides[2].slice(0, Math.max(2, nz - 0)).slice(0, nz), o.wall, o.trim);
    this.wall("z", cz - d / 2 + th, d - 2 * th, cx + w / 2, th, h, sides[3], o.wall, o.trim);
    // roof
    if (o.pitched) {
      const ang = 0.55; const half = d / 2 + 0.6; const len = half / Math.cos(ang);
      this.lit.box(cx, h + Math.sin(ang) * len * 0.5 + 0.05, cz - half / 2, w + 0.8, 0.18, len, o.roof, [-ang, 0, 0]);
      this.lit.box(cx, h + Math.sin(ang) * len * 0.5 + 0.05, cz + half / 2, w + 0.8, 0.18, len, o.roof, [ang, 0, 0]);
      this.lit.box(cx, h, cz, w + 0.4, 0.3, d + 0.4, "#2a2018", undefined, 0);
      this.lit.box(cx, h + Math.sin(ang) * len + 0.05, cz, w + 0.9, 0.18, 0.4, "#3a2a22", undefined, 0);
      this.C_(cx, h, cz, w + 0.6, 0.3, d + 0.6);
    } else {
      this.S_(cx, h, cz, w + 0.5, 0.3, d + 0.5, o.roof);
      for (const s of [-1, 1]) { this.lit.box(cx, h + 0.6, cz + s * (d / 2 + 0.2), w + 0.5, 0.6, 0.18, o.wall); this.lit.box(cx + s * (w / 2 + 0.2), h + 0.6, cz, 0.18, 0.6, d + 0.5, o.wall); }
      if (this.R() < 0.7) { this.lit.box(cx + this.rf(-w / 4, w / 4), h + 0.7, cz + this.rf(-d / 4, d / 4), 1.6, 0.8, 1.2, "#8a8f94"); this.lit.box(cx + this.rf(-w / 4, w / 4), h + 1.4, cz + this.rf(-d / 4, d / 4), 0.2, 0.9, 0.2, "#444"); }
    }
    this.lit.box(cx, 0.04, cz, w - 0.6, 0.08, d - 0.6, o.interior === "lab" ? "#d4dade" : o.interior === "factory" ? "#6a6e72" : "#8a7a64", undefined, 0.04);
    for (let ix = -1; ix <= 1; ix += 2) if (w > 7) this.G_(cx + ix * w / 4, h - 0.12, cz, 1.8, 0.06, 0.5, o.interior === "lab" ? "#d8fbff" : "#fff2cf");
    // partition
    if (w > 10 && d > 7 && this.R() < 0.8) {
      const px = cx + this.rf(-w / 6, w / 6); const gap = 2.4; const zA = cz - d / 2 + th, zB = cz + d / 2 - th; const gc = cz + this.rf(-d / 6, d / 6);
      this.S_(px, 0, (zA + gc - gap / 2) / 2, 0.25, h, gc - gap / 2 - zA, o.wall); this.S_(px, 0, (zB + gc + gap / 2) / 2, 0.25, h, zB - (gc + gap / 2), o.wall); this.S_(px, 2.5, gc, 0.25, h - 2.5, gap, o.wall);
      this.doorPts.push({ x: px, z: gc });
    }
    // interior props
    const inner = (fn: (x: number, z: number) => void, n: number) => {
      for (let i = 0; i < n; i++) {
        const x = cx + this.rf(-w / 2 + 1.6, w / 2 - 1.6), z = cz + this.rf(-d / 2 + 1.6, d / 2 - 1.6);
        if (this.doorPts.every((p) => Math.hypot(p.x - x, p.z - z) > 3.2) && Math.hypot(x - cx, z - cz) > 1.6 + (i % 2) * 0.5) fn(x, z);
      }
    };
    switch (o.interior) {
      case "office": inner((x, z) => this.desk(x, z, 0), 3); inner((x, z) => this.shelf(x, z, this.R() < 0.5), 2); break;
      case "house": inner((x, z) => this.bed(x, z), 1); inner((x, z) => this.desk(x, z, 0), 1); inner((x, z) => this.crate(x, z), 1); break;
      case "lab": inner((x, z) => this.labTable(x, z, this.R() < 0.5), 3); inner((x, z) => this.rack(x, z, this.R() < 0.5), 2); break;
      case "factory": inner((x, z) => this.machine(x, z, this.R() < 0.5), 4); inner((x, z) => this.crate(x, z, true), 1); break;
      case "barracks": inner((x, z) => this.bed(x, z), 3); inner((x, z) => this.crate(x, z), 2); inner((x, z) => this.shelf(x, z, true), 1); break;
      default: inner((x, z) => this.crate(x, z), 3);
    }
    this.pois.push({ x: cx, z: cz });
    this.reserve(cx, cz, w / 2 + 1.2, d / 2 + 1.2);
  }

  // --- lots
  private lot(type: string, lx: number, lz: number, half: number) {
    const th = this.def.theme; const d = this.def; const R = this.R;
    const bOpts = (interior: string, extra: object = {}) => ({ wall: d.wall, roof: d.roof, trim: d.accent, interior, ...extra });
    const scatter = (n: number, fn: (x: number, z: number) => void, r = 1.5) => {
      for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) { const x = lx + this.rf(-half, half), z = lz + this.rf(-half, half); if (this.free(x, z, r)) { fn(x, z); this.reserve(x, z, r, r); i++; } }
    };
    const interior = th === "lab" ? "lab" : th === "factory" ? "factory" : th === "village" ? "house" : th === "base" || th === "night" ? "barracks" : th === "city" ? "office" : "empty";
    switch (type) {
      case "building": {
        const w = this.rf(Math.min(9, half * 1.4), half * 2 - 1), dd = this.rf(Math.min(8, half * 1.2), half * 2 - 2);
        const hgt = th === "factory" || th === "industrial" ? 5 : th === "lab" ? 3.4 : 3.3;
        this.building(lx + this.rf(-1, 1), lz + this.rf(-1, 1), w, dd, hgt, bOpts(interior, { pitched: th === "village" || th === "forest", winProb: th === "factory" ? 0.2 : 0.45 }));
        scatter(5, (x, z) => { const r = R(); if (r < 0.4) this.crate(x, z); else if (r < 0.6) this.addBarrel(x, z, R() < 0.6); else if (r < 0.8) this.lamp(x, z); else this.sandbags(x, z, R() < 0.5); });
        break;
      }
      case "twin": {
        const w = half * 0.9, dd = half * 0.9;
        this.building(lx - half * 0.5, lz - half * 0.5, w, dd, 3.2, bOpts(interior, { pitched: th === "village", doors: 2 }));
        this.building(lx + half * 0.5, lz + half * 0.5, w, dd * 0.9, 3.2, bOpts(interior, { pitched: th === "village", doors: 2 }));
        scatter(4, (x, z) => { if (R() < 0.5) this.crate(x, z); else this.barrier(x, z, R() < 0.5); });
        break;
      }
      case "containers": {
        const rows = 3; for (let r = 0; r < rows; r++) {
          const rot = lz % 2 === 0 ? false : true;
          for (let k = 0; k < 3; k++) {
            if (R() < 0.2) continue;
            const along = -half + 3.5 + k * 6.6; const across = -half + 2.5 + r * 6.6;
            const x = lx + (rot ? across : along), z = lz + (rot ? along : across);
            if (!this.free(x, z, 3.2)) continue;
            this.container(x, z, rot, 0); if (R() < 0.5) this.container(x, z, rot, 1);
          }
        }
        this.reserve(lx, lz, half, half);
        break;
      }
      case "industrial": {
        const px = lx + this.rf(-half / 2, half / 2), pz = lz + this.rf(-half / 2, half / 2);
        this.S_(px, 0, pz, 5, 7, 5, "#a2a9ad"); for (const y of [1.5, 3.5, 5.5]) this.lit.box(px, y, pz, 5.15, 0.2, 5.15, this.def.accent, undefined, 0); this.lit.box(px, 7.2, pz, 4.4, 0.4, 4.4, "#7b8387"); this.lit.box(px + 2.6, 3.5, pz, 0.14, 7, 0.4, "#555a5e");
        this.reserve(px, pz, 3.2, 3.2);
        this.pipeRun(lx, lz - half + 1.5, half * 1.6, true);
        if (this.R() < 0.7) { this.S_(lx + half * 0.6, 0, lz + half * 0.55, 2, 11, 2, "#6a6e72"); this.lit.box(lx + half * 0.6, 10.7, lz + half * 0.55, 2.3, 0.6, 2.3, "#c9472b"); this.reserve(lx + half * 0.6, lz + half * 0.55, 1.6, 1.6); }
        scatter(8, (x, z) => { const r = R(); if (r < 0.35) this.crate(x, z, R() < 0.3); else if (r < 0.65) this.addBarrel(x, z, true); else if (r < 0.85) this.barrier(x, z, R() < 0.5); else this.machine(x, z, R() < 0.5); }, 1.8);
        break;
      }
      case "camp": {
        scatter(3, (x, z) => this.tent(x, z), 2.4); scatter(4, (x, z) => { if (R() < 0.5) this.crate(x, z); else this.addBarrel(x, z, R() < 0.5); });
        scatter(2, (x, z) => this.sandbags(x, z, R() < 0.5), 2);
        if (th === "forest" || th === "desert") scatter(3, (x, z) => { this.S_(x, 0, z, 1, 0.3, 1, "#2a1c12"); this.G_(x, 0.3, z, 0.5, 0.45, 0.5, "#ff7a1a"); }, 1.2);
        break;
      }
      case "open": {
        if (th === "forest") { scatter(14, (x, z) => (R() < 0.55 ? this.pine(x, z) : this.tree(x, z)), 2); scatter(5, (x, z) => this.rock(x, z, this.rf(1.2, 2.4)), 1.8); scatter(6, (x, z) => this.bush(x, z), 1); }
        else if (th === "desert") { scatter(6, (x, z) => this.rock(x, z, this.rf(1.5, 3.2)), 2); scatter(5, (x, z) => this.cactus(x, z), 1); scatter(3, (x, z) => { this.S_(x, 0, z, 4, this.rf(1, 2), 0.5, "#cdb184"); }, 2.5); }
        else { scatter(6, (x, z) => (R() < 0.5 ? this.tree(x, z) : this.rock(x, z, 1.6)), 2); scatter(4, (x, z) => this.crate(x, z), 1.5); }
        break;
      }
      default: { // yard / plaza
        scatter(Math.round(7 * (th === "lab" ? 0.4 : 1)), (x, z) => {
          const r = R();
          if (r < 0.28) this.crate(x, z, R() < 0.3); else if (r < 0.46) this.barrier(x, z, R() < 0.5); else if (r < 0.6) this.sandbags(x, z, R() < 0.5);
          else if (r < 0.74) this.vehicle(x, z, R() < 0.5, th === "base" || th === "desert" ? (R() < 0.5 ? "jeep" : "truck") : "car");
          else if (r < 0.86) this.addBarrel(x, z, R() < 0.7); else if (r < 0.93) this.lamp(x, z); else this.sign(x, z, this.rf(0, 3));
        }, 2);
        if (th === "village") { scatter(1, (x, z) => this.well(x, z), 2); scatter(2, (x, z) => this.crops(x, z, 7, 6), 4); scatter(1, (x, z) => { this.fence(x - 4, z, x + 4, z); this.fence(x + 4, z, x + 4, z + 5); }, 5); }
        if (th === "base") this.helipad(lx, lz);
      }
    }
  }

  // ------------------------------------------------------------ full build
  async build(opts: BuildOpts): Promise<void> {
    this.opts = opts; const { S, def } = this; const R = this.R; const th = def.theme;
    this.gmin = -S - 8; this.gw = Math.ceil((2 * S + 16) / CELL) + 1;
    this.grid = Array.from({ length: this.gw * this.gw }, () => []);
    this.nn = Math.ceil(2 * S); this.nav = new Uint8Array(this.nn * this.nn);
    await opts.progress(0.02, "Terreno");
    // ground tiles (top quads only)
    const T = 2; const lots = th === "range" ? 1 : Math.max(3, Math.round((S * 2) / 22)); const lw = (S * 2) / lots;
    const gv = this.lit; const roadsOn = !["forest", "desert"].includes(th);
    const quad = (cx: number, cz: number, w: number, color: THREE.Color, y = 0) => {
      const b = gv.count; const h = w / 2;
      gv.pos.push(cx - h, y, cz - h, cx + h, y, cz - h, cx + h, y, cz + h, cx - h, y, cz + h);
      for (let i = 0; i < 4; i++) { gv.nor.push(0, 1, 0); gv.col.push(color.r, color.g, color.b); }
      gv.uv.push(0, 0, T, 0, T, T, 0, T);
      gv.idx.push(b, b + 2, b + 1, b, b + 3, b + 2); gv.count += 4;
    };
    const c1 = new THREE.Color(def.ground), c2 = new THREE.Color(def.ground2), cr = new THREE.Color(def.road), tmp = new THREE.Color();
    for (let x = -S; x < S; x += T) for (let z = -S; z < S; z += T) {
      const cx = x + T / 2, cz = z + T / 2; let col: THREE.Color;
      const u = (cx + S) % lw, v = (cz + S) % lw; const du = Math.min(u, lw - u), dv = Math.min(v, lw - v);
      const onRoad = roadsOn && th !== "range" && (du < 2.6 || dv < 2.6) && !(th === "lab" && R() < 0.0);
      if (onRoad) { col = tmp.copy(cr).multiplyScalar(0.92 + R() * 0.16); if ((du < 0.7 || dv < 0.7) && (Math.floor(cx + cz) % 6 < 3) && (th === "city" || th === "base" || th === "industrial" || th === "port")) col = tmp.set("#c9b34a"); }
      else col = tmp.copy(R() < 0.5 ? c1 : c2).multiplyScalar(0.9 + R() * 0.2);
      quad(cx, cz, T, col);
    }
    // under-ground slab (so the world never shows holes)
    this.lit.box(0, -0.6, 0, 2 * S + 4, 1, 2 * S + 4, def.ground2, undefined, 0);
    // perimeter + backdrop
    await opts.progress(0.08, "Perímetro");
    const wallCol = th === "forest" ? "#5a4a34" : th === "desert" ? "#b49a68" : def.wall;
    const wh = th === "forest" ? 4 : 3.2;
    for (const [x, z, w, d] of [[0, -S - 0.5, 2 * S + 2, 1], [0, S + 0.5, 2 * S + 2, 1], [-S - 0.5, 0, 1, 2 * S + 2], [S + 0.5, 0, 1, 2 * S + 2]] as number[][]) {
      this.S_(x, 0, z, w, wh, d, wallCol); this.lit.box(x, wh + 0.1, z, w + 0.2, 0.2, d + 0.2, th === "desert" ? "#9a8458" : "#3a3d42", undefined, 0.02);
      this.C_(x, 0, z, w, 14, d);
    }
    if (th === "forest") for (let i = 0; i < 70; i++) { const e = R() * 4 | 0; const t = this.rf(-S + 2, S - 2); const o = S - this.rf(1.2, 4); const x = e < 2 ? t : e === 2 ? -o : o, z = e < 2 ? (e === 0 ? -o : o) : t; this.tree(x, z, 1.3); }
    if (th === "port") this.lit.box(0, -0.8, S + 40, 2 * S + 160, 1, 80, "#1f5f8f", undefined, 0.03);
    const back = th === "city" || th === "industrial" || th === "factory" || th === "base" || th === "night";
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2; const r = S * 1.45 + this.rf(10, 40);
      const hh = back ? this.rf(12, 40) : this.rf(14, 45); const ww = this.rf(10, 26);
      const col = back ? (th === "night" ? "#0d1522" : "#7c858c") : th === "desert" ? "#c49a60" : th === "port" ? "#6a8a9a" : "#4c6a58";
      if (th === "port" && Math.sin(a) > 0.3) continue;
      this.lit.box(Math.cos(a) * r, hh / 2 - 1, Math.sin(a) * r, ww, hh, ww, new THREE.Color(col).multiplyScalar(0.85 + R() * 0.3).getStyle(), [0, a, 0], 0.02);
    }
    // layout
    this.start = { x: -S + 8, z: -S + 8, yaw: Math.atan2(1, 1) * 0 + Math.atan2(-1, -1) };
    this.extract = { x: S - 8, z: S - 8 };
    this.start.yaw = Math.atan2(-(S - 8 + S - 8), -(S - 8 + S - 8)); // look at map center-ish diagonal
    this.start.yaw = Math.atan2(-1, -1);
    if (th === "range") await this.buildRange(); else {
      const weights: Record<string, [string, number][]> = {
        base: [["building", 3], ["twin", 1], ["yard", 3], ["camp", 1], ["open", 1]],
        city: [["building", 5], ["twin", 3], ["yard", 2]],
        port: [["containers", 5], ["building", 2], ["yard", 2]],
        forest: [["open", 6], ["camp", 2], ["building", 1]],
        desert: [["open", 3], ["camp", 3], ["building", 2], ["yard", 1]],
        factory: [["building", 4], ["industrial", 2], ["yard", 1]],
        lab: [["building", 6], ["yard", 1]],
        village: [["twin", 4], ["yard", 2], ["open", 2]],
        industrial: [["industrial", 5], ["building", 2], ["yard", 2], ["containers", 1]],
        night: [["building", 3], ["yard", 3], ["camp", 1], ["industrial", 1]],
      };
      const wl = weights[th] ?? weights.base; const tot = wl.reduce((a, b) => a + b[1], 0);
      const pickType = () => { let r = R() * tot; for (const [t, w] of wl) { if ((r -= w) < 0) return t; } return "yard"; };
      const half = lw / 2 - 3.4; let n = 0;
      for (let i = 0; i < lots; i++) for (let j = 0; j < lots; j++) {
        const lx = -S + (i + 0.5) * lw, lz = -S + (j + 0.5) * lw; n++;
        const isStart = i === 0 && j === 0, isEnd = i === lots - 1 && j === lots - 1;
        let type = isStart || isEnd ? "open" : pickType();
        if (th === "port" && !(isStart || isEnd) && j % 2 === 1) type = "containers";
        if (isStart || isEnd) { if (th !== "forest" && th !== "desert") type = "yard"; }
        this.lot(type, lx, lz, half);
        if (n % 2 === 0) await opts.progress(0.1 + 0.55 * (n / (lots * lots)), "Construindo mapa");
      }
      // lampposts along roads
      if (th !== "forest" && th !== "desert" && th !== "village") for (let k = 1; k < lots; k++) for (let m = 0; m < lots; m++) {
        const bx = -S + k * lw + 3.2, bz = -S + (m + 0.5) * lw; if (this.free(bx, bz, 1)) this.lamp(bx, bz);
        const cx = -S + (m + 0.5) * lw, cz = -S + k * lw + 3.2; if (this.free(cx, cz, 1)) this.lamp(cx, cz);
      }
      if (th === "base" || th === "night") { this.tower(-S + 4, S - 5); this.tower(S - 5, -S + 4); }
      // scattered barrels
      for (let i = 0, tries = 0; i < opts.barrels && tries < 80; tries++) { const x = this.rf(-S + 4, S - 4), z = this.rf(-S + 4, S - 4); if (this.free(x, z, 1.2)) { this.addBarrel(x, z, true); this.reserve(x, z, 0.8, 0.8); i++; } }
      // extra trees outside forest
      if (th === "village" || th === "base" || th === "desert") for (let i = 0; i < Math.round(14 * opts.treeMul); i++) { const x = this.rf(-S + 3, S - 3), z = this.rf(-S + 3, S - 3); if (this.free(x, z, 2.2)) { if (th === "desert") this.cactus(x, z); else this.tree(x, z); this.reserve(x, z, 1.5, 1.5); } }
    }
    await opts.progress(0.7, "Navegação");
    // meshes
    const m = mats();
    const lm = new THREE.Mesh(this.lit.geometry(), m.lit); lm.castShadow = true; lm.receiveShadow = true; this.group.add(lm);
    if (!this.glow.empty) this.group.add(new THREE.Mesh(this.glow.geometry(), m.glow));
    this.lit = new VB(); this.glow = new VB();
    // sky clouds
    if (!def.night) {
      const cv = new VB(); for (let i = 0; i < 14; i++) { const x = this.rf(-120, 120), z = this.rf(-120, 120); for (let k = 0; k < 4; k++) cv.box(x + this.rf(-8, 8), 70 + this.rf(-2, 2), z + this.rf(-6, 6), this.rf(10, 22), 3, this.rf(8, 14), "#ffffff", undefined, 0.02); }
      this.group.add(new THREE.Mesh(cv.geometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })));
    }
    for (const c of this.colliders) if (!c.prop) this.markNav(c);
    await opts.progress(0.8, "Pontos de interesse");
    this.finalizePoints();
    this.buildMinimap();
    await opts.progress(0.9, "Finalizando");
  }

  private async buildRange() {
    const S = this.S;
    this.start = { x: 0, z: S - 8, yaw: 0 };
    this.extract = { x: S - 7, z: -S + 8 };
    // firing line & lanes
    this.S_(0, 0, S - 14, 2 * S - 8, 1.0, 0.6, "#6a6e72"); // counter wall with gaps made below
    this.lit.box(0, 1.05, S - 14, 2 * S - 8, 0.08, 0.7, "#3a3d42", undefined, 0);
    for (let i = 0; i < 6; i++) { const x = -10 + i * 4; this.targetSpots.push({ x, z: -S + 12 }); this.lit.box(x, 0.04, -S + 12, 2.2, 0.08, 1.2, this.def.accent, undefined, 0); this.S_(x, 0, -S + 8, 0.3, 2.4, 0.3, "#444", false); }
    for (let i = 0; i < 6; i++) { this.pois.push({ x: -10 + i * 4, z: -S + 12 }); }
    this.pois.push({ x: 0, z: S - 20 }); // 6: move marker
    for (let i = 0; i < 5; i++) { // obstacle yard
      const x = -S + 8 + i * 9, z = 4 + (i % 2) * 5;
      if (i % 3 === 0) this.crate(x, z, true); else if (i % 3 === 1) this.sandbags(x, z, i % 2 === 0); else this.barrier(x, z, i % 2 === 0);
      this.pois.push({ x: x + 2, z: z + 3 });
    }
    this.pois.push({ x: -S + 7, z: S - 10 }); // 12: console
    this.pois.push({ x: S - 8, z: -4 });
    this.S_(-S + 7, 0, S - 8, 1.4, 1.1, 0.9, "#3a3f46"); this.G_(-S + 7, 1.1, S - 8.1, 1.0, 0.5, 0.05, "#3aff9a");
    this.crate(S - 6, S - 8, true); this.crate(S - 9, S - 6, false); this.addBarrel(-S + 3, -4, true); this.addBarrel(S - 4, 8, true);
    this.building(S - 11, 0, 8, 7, 3.2, { wall: this.def.wall, roof: this.def.roof, trim: this.def.accent, interior: "barracks" });
    this.tower(-S + 6, -S + 6);
    this.sign(-6, S - 10, 0.3); this.sign(6, S - 10, -0.3); this.lamp(-S + 5, S - 14); this.lamp(S - 5, S - 14);
    this.hazardStripe(0, S - 12.5, 12, 1.2);
    await this.opts.progress(0.6, "Campo de treino");
  }

  private finalizePoints() {
    const S = this.S; const R = this.R;
    const fix = (p: Pt) => this.nearestWalkable(p.x, p.z);
    const st = fix(this.start); this.start.x = st.x; this.start.z = st.z;
    const ex = fix(this.extract); this.extract = ex;
    if (this.def.theme !== "range") {
      this.pois = this.pois.map(fix).sort((a, b) => Math.hypot(a.x - this.start.x, a.z - this.start.z) - Math.hypot(b.x - this.start.x, b.z - this.start.z));
      // add open-field points so every map has many POIs
      for (let i = 0; i < 12; i++) {
        const p = fix({ x: this.rf(-S + 6, S - 6), z: this.rf(-S + 6, S - 6) });
        if (this.pois.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 8)) this.pois.push(p);
      }
      this.pois.sort((a, b) => Math.hypot(a.x - this.start.x, a.z - this.start.z) - Math.hypot(b.x - this.start.x, b.z - this.start.z));
      this.pois = this.pois.filter((p) => Math.hypot(p.x - this.start.x, p.z - this.start.z) > 7);
    } else this.pois = this.pois.map(fix);
    for (let i = 0; i < 40 && this.spawns.length < 16; i++) {
      const p = fix({ x: this.rf(-S + 5, S - 5), z: this.rf(-S + 5, S - 5) });
      if (this.walkable(p.x, p.z) && this.spawns.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 12)) this.spawns.push(p);
    }
    this.spawns.push(this.start, this.extract);
    for (let i = 0; i < 10; i++) this.pickupSpots.push(fix({ x: this.rf(-S + 5, S - 5), z: this.rf(-S + 5, S - 5) }));
    this.domPoints = [fix({ x: 0, z: 0 }), fix({ x: -S * 0.55, z: S * 0.5 }), fix({ x: S * 0.55, z: -S * 0.5 })];
    void R;
  }

  private buildMinimap() {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256; const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#0e1418"; ctx.fillRect(0, 0, 256, 256);
    const k = 256 / (2 * this.S + 8); const off = this.S + 4;
    for (const c of this.colliders) {
      if (c.minY > 2.2 || c.maxY < 0.8 || c.maxX - c.minX > 2 * this.S) continue;
      const tall = c.maxY > 2;
      ctx.fillStyle = tall ? "#8d9aa3" : "#4f5c64";
      ctx.fillRect((c.minX + off) * k, (c.minZ + off) * k, Math.max(1, (c.maxX - c.minX) * k), Math.max(1, (c.maxZ - c.minZ) * k));
    }
    this.minimap = cv;
  }

  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && !m.userData.keep) m.geometry.dispose(); });
  }
}
