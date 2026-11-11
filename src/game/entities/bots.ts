import * as THREE from "three";
import type { Game } from "../engine";
import { getWeapon } from "../data/weapons";
import { charStyle, KIND_WEAPON, makeRig, type Rig } from "../gfx/models";
import type { Difficulty, EnemyKind } from "../types";
import { angDiff, clamp, pick } from "../util";

export interface Actor { id: number; team: number; isPlayer: boolean; alive: boolean; x: number; y: number; z: number; name: string }

export interface DiffP { hp: number; react: number; acc: number; dmg: number; vision: number; speed: number; flank: number; gren: number; cover: number; burst: number }
export const DIFFS: Record<Difficulty, DiffP> = {
  easy: { hp: 0.75, react: 1.1, acc: 0.3, dmg: 0.55, vision: 0.8, speed: 0.85, flank: 0.04, gren: 0.03, cover: 0.25, burst: 0.7 },
  normal: { hp: 1, react: 0.65, acc: 0.5, dmg: 0.8, vision: 1, speed: 1, flank: 0.18, gren: 0.1, cover: 0.5, burst: 1 },
  hard: { hp: 1.2, react: 0.4, acc: 0.72, dmg: 1, vision: 1.15, speed: 1.08, flank: 0.4, gren: 0.2, cover: 0.7, burst: 1.2 },
  extreme: { hp: 1.5, react: 0.22, acc: 0.88, dmg: 1.25, vision: 1.3, speed: 1.15, flank: 0.6, gren: 0.32, cover: 0.9, burst: 1.4 },
};
interface KindP { hp: number; speed: number; acc: number; shot: number; burst: [number, number]; vision: number; name: string; ideal: number; rate: number }
export const KINDS: Record<EnemyKind, KindP> = {
  grunt: { hp: 100, speed: 4.3, acc: 1, shot: 9, burst: [3, 6], vision: 48, name: "Soldado", ideal: 18, rate: 0.55 },
  smg: { hp: 80, speed: 5.2, acc: 0.9, shot: 6.5, burst: [5, 10], vision: 36, name: "Assaltante", ideal: 9, rate: 0.5 },
  shotgun: { hp: 130, speed: 4.7, acc: 0.9, shot: 42, burst: [1, 1], vision: 28, name: "Demolidor", ideal: 5, rate: 1 },
  sniper: { hp: 70, speed: 3.4, acc: 1.25, shot: 55, burst: [1, 1], vision: 95, name: "Atirador", ideal: 45, rate: 1 },
  heavy: { hp: 280, speed: 3.2, acc: 0.8, shot: 8, burst: [10, 18], vision: 48, name: "Pesado", ideal: 16, rate: 0.5 },
  commander: { hp: 800, speed: 4.1, acc: 1.1, shot: 13, burst: [4, 8], vision: 65, name: "Cmdt. Vargas", ideal: 14, rate: 0.6 },
  dummy: { hp: 60, speed: 0, acc: 0, shot: 0, burst: [1, 1], vision: 0, name: "Alvo", ideal: 0, rate: 1 },
};
export const BOT_NAMES = ["Falcão", "Raio", "Sombra", "Víbora", "Lobo", "Corvo", "Tigre", "Ghost", "Nômade", "Fênix", "Aço", "Trovão", "Cobra", "Titã", "Rastro", "Lince"];

export type BotState = "patrol" | "investigate" | "combat" | "chase" | "cover" | "flank" | "retreat" | "follow" | "captive" | "dummy";
export type Part = "head" | "body" | "arm" | "leg";

export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  let t0 = 0, t1 = 1e9;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; } else { let a = (x0 - ox) / dx, b = (x1 - ox) / dx; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; } else { let a = (y0 - oy) / dy, b = (y1 - oy) / dy; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; } else { let a = (z0 - oz) / dz, b = (z1 - oz) / dz; if (a > b) { const t = a; a = b; b = t; } if (a > t0) t0 = a; if (b < t1) t1 = b; }
  return t0 <= t1 ? t0 : -1;
}
const PARTS: { p: Part; b: number[] }[] = [
  { p: "head", b: [-0.21, 1.47, -0.21, 0.21, 1.9, 0.21] },
  { p: "body", b: [-0.29, 0.85, -0.2, 0.29, 1.47, 0.22] },
  { p: "arm", b: [-0.5, 0.9, -0.6, -0.29, 1.5, 0.15] },
  { p: "arm", b: [0.29, 0.9, -0.6, 0.5, 1.5, 0.15] },
  { p: "leg", b: [-0.26, 0, -0.2, 0.26, 0.85, 0.2] },
];
export const PART_MULT: Record<Part, number> = { head: 1, body: 1, arm: 0.7, leg: 0.75 };

export class Bot implements Actor {
  id: number; team: number; isPlayer = false; alive = true; name: string; kind: EnemyKind;
  x = 0; y = 0; z = 0; vx = 0; vy = 0; vz = 0; onGround = true;
  yaw = 0; hp: number; maxHp: number; state: BotState = "patrol"; rig: Rig; scale: number;
  kp: KindP; dp: DiffP; weaponId: string;
  target: Actor | null = null; lastX = 0; lastZ = 0; seenT = 99; aware = 0; hunt = false; stealth = false; alerted = false;
  path: number[] | null = null; pi = 0; repathT = 0; goalX = 0; goalZ = 0; hasGoal = false;
  cd = 0; ammo = 20; mag = 20; reloadT = 0; burst = 0; burstPause = 0; aimT = 0; strafe = 1; strafeT = 0;
  prot = 0; stun = 0; flinch = 0; t = 0; percT = Math.random() * 0.2; waitT = 0; stateT = 0; combatT = 0; hurtT = 99; gT = 6 + Math.random() * 8;
  ph = 0; deadT = 0; gone = false; speedNow = 0; stuckT = 0; sx = 0; sz = 0; lastHitBy: Actor | null = null; assist = new Set<number>();
  home = { x: 0, z: 0 }; spawnSpot: { x: number; z: number } | null = null; goalOverride: { x: number; z: number } | null = null; ally = false; shown = 0; hitAng = 0; muzzleT = 0;
  panic = 0;

  constructor(id: number, kind: EnemyKind, team: number, diff: Difficulty, name: string, variant: number) {
    this.id = id; this.kind = kind; this.team = team; this.name = name; this.kp = KINDS[kind]; this.dp = DIFFS[diff];
    this.weaponId = KIND_WEAPON[kind]; this.scale = 1;
    const style = charStyle(kind, team, variant);
    this.rig = makeRig(style, this.weaponId);
    this.maxHp = Math.round(this.kp.hp * (kind === "dummy" ? 1 : this.dp.hp)); this.hp = this.maxHp;
    this.scale = style.scale ?? 1;
    const w = this.weaponId ? getWeapon(this.weaponId) : null;
    this.mag = w ? w.mag : 0; this.ammo = this.mag;
    this.rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  }
  get eyeY() { return this.y + 1.7 * this.scale; }
  place(x: number, z: number, y = 0) { this.x = x; this.z = z; this.y = y; this.home = { x, z }; this.sync(); }
  sync() { this.rig.root.position.set(this.x, this.y, this.z); this.rig.root.rotation.y = this.yaw; }

  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): { t: number; part: Part } | null {
    if (!this.alive) return null;
    const dxp = ox - this.x, dyp = oy - this.y, dzp = oz - this.z;
    if (dxp * dxp + dzp * dzp > (maxT + 3) * (maxT + 3) && false) return null;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw); const k = 1 / this.scale;
    // rotate by -yaw
    const lox = (dxp * c - dzp * s) * k, loz = (dxp * s + dzp * c) * k, loy = dyp * k;
    const ldx = (dx * c - dz * s) * k, ldz = (dx * s + dz * c) * k, ldy = dy * k;
    let best = -1; let bp: Part = "body";
    for (const pt of PARTS) {
      const t = rayBox(lox, loy, loz, ldx, ldy, ldz, pt.b[0], pt.b[1], pt.b[2], pt.b[3], pt.b[4], pt.b[5]);
      if (t >= 0 && (best < 0 || t < best)) { best = t; bp = pt.p; }
    }
    return best >= 0 && best <= maxT ? { t: best, part: bp } : null;
  }

  hurt(g: Game, from: Actor | null) {
    this.hurtT = 0; this.flinch = 0.18; this.panic = Math.min(1, this.panic + 0.4);
    if (from && from.team !== this.team) {
      this.lastHitBy = from; this.assist.add(from.id);
      if (!this.target || !this.target.alive || this.seenT > 1) { this.target = from; this.lastX = from.x; this.lastZ = from.z; this.seenT = 0.5; this.aware = 1; this.alerted = true; }
      if (this.state === "patrol" || this.state === "investigate") this.setState("combat");
    }
    void g;
  }
  setState(s: BotState) { if (this.state !== s) { this.state = s; this.stateT = 0; } }
  die() {
    this.alive = false; this.deadT = 0; this.state = "patrol"; this.vx = this.vz = 0;
  }

  // ----------------------------------------------------------------- AI
  update(dt: number, g: Game) {
    if (!this.alive) { this.updateDeath(dt); return; }
    this.t += dt; this.stateT += dt; this.prot = Math.max(0, this.prot - dt); this.cd -= dt; this.stun = Math.max(0, this.stun - dt); this.flinch = Math.max(0, this.flinch - dt);
    this.hurtT += dt; this.shown = Math.max(0, this.shown - dt); this.panic = Math.max(0, this.panic - dt * 0.3); this.muzzleT = Math.max(0, this.muzzleT - dt);
    if (this.kind === "dummy" || this.state === "captive") { this.animate(dt, g); return; }
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.ammo = this.mag; }
    this.seenT += dt;
    this.percT -= dt;
    if (this.percT <= 0) { this.percT = 0.14 + Math.random() * 0.08; this.perceive(g, 0.18); }
    if (this.target && !this.target.alive) { this.target = null; this.setState(this.ally ? "follow" : "patrol"); }

    let moveX = 0, moveZ = 0; let speed = 0; let faceTarget = false;
    const tgt = this.target; const sp = this.kp.speed * this.dp.speed * (this.ally ? 1.1 : 1);
    if (tgt && this.stun <= 0) {
      const dx = tgt.x - this.x, dz = tgt.z - this.z; const d = Math.hypot(dx, dz);
      const visible = this.seenT < 0.5;
      if (this.state === "patrol" || this.state === "investigate" || this.state === "follow") this.setState(visible ? "combat" : "chase");
      if (this.state === "combat") {
        this.combatT += dt;
        if (!visible) this.setState("chase");
        else {
          faceTarget = true; this.aimT += dt;
          this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = 0.8 + Math.random() * 1.7; this.strafe = Math.random() < 0.5 ? 1 : -1; }
          const ideal = this.kp.ideal; const nx = dx / (d || 1), nz = dz / (d || 1);
          if (d > ideal + 5) { moveX = nx; moveZ = nz; speed = sp; if (!g.world.los(this.x, this.y + 1.5, this.z, tgt.x, tgt.y + 1.2, tgt.z)) this.goPath(g, tgt.x, tgt.z, dt); }
          else if (d < ideal - 4) { moveX = -nx; moveZ = -nz; speed = sp * 0.7; }
          else { moveX = -nz * this.strafe; moveZ = nx * this.strafe; speed = sp * (this.kind === "heavy" ? 0.3 : 0.55); }
          this.tryShoot(g, tgt, d, dt);
          // decisions
          if (this.hurtT < 0.6 && Math.random() < dt * 1.2 * this.dp.cover && this.hp < this.maxHp * 0.85 && this.kind !== "commander") { if (this.findCover(g, tgt)) this.setState("cover"); }
          else if (this.hp < this.maxHp * 0.25 && this.kind !== "heavy" && this.kind !== "commander" && Math.random() < dt * 0.8 * this.dp.cover) { if (this.findCover(g, tgt, true)) this.setState("retreat"); }
          else if (this.combatT > 5 && Math.random() < dt * 0.15 * this.dp.flank && this.kind !== "sniper") { if (this.findFlank(g, tgt)) { this.setState("flank"); this.combatT = 0; } }
          else if (this.ammo <= 0 && this.reloadT <= 0) this.startReload(g);
          this.gT -= dt;
          if (this.gT <= 0) { this.gT = 7 + Math.random() * 10; if (d > 10 && d < 32 && Math.random() < this.dp.gren) g.botGrenade(this, tgt); }
        }
      } else if (this.state === "chase") {
        if (visible) this.setState("combat");
        else {
          const arrived = Math.hypot(this.lastX - this.x, this.lastZ - this.z) < 2;
          if (arrived && this.seenT > 4) { this.setState("investigate"); this.target = null; this.waitT = 2.5; }
          else { if (this.reloadT <= 0 && this.ammo < this.mag * 0.5) this.startReload(g); this.goPath(g, this.lastX, this.lastZ, dt); speed = sp * 1.05; moveX = this.sx; moveZ = this.sz; }
        }
      } else if (this.state === "cover" || this.state === "retreat") {
        const arrived = this.goPath(g, this.goalX, this.goalZ, dt); speed = sp * (this.state === "retreat" ? 1.15 : 1); moveX = this.sx; moveZ = this.sz;
        if (arrived) { speed = 0; if (this.reloadT <= 0 && this.ammo < this.mag * 0.8) this.startReload(g); if (visible && this.state === "cover") { faceTarget = true; this.tryShoot(g, tgt, d, dt * 0.5); } }
        if (this.stateT > (this.state === "retreat" ? 6 : 2.8 + Math.random())) this.setState("combat");
      } else if (this.state === "flank") {
        const arrived = this.goPath(g, this.goalX, this.goalZ, dt); speed = sp * 1.1; moveX = this.sx; moveZ = this.sz;
        if (visible && d < 25) { faceTarget = true; this.tryShoot(g, tgt, d, dt * 0.6); }
        if (arrived || this.stateT > 9) this.setState("combat");
      }
    } else if (!tgt || this.stun > 0) {
      if (this.state === "combat" || this.state === "chase" || this.state === "cover" || this.state === "flank" || this.state === "retreat") this.setState("patrol");
      if (this.state === "investigate") {
        const arrived = this.goPath(g, this.lastX, this.lastZ, dt); speed = sp * 0.8; moveX = this.sx; moveZ = this.sz;
        if (arrived) { speed = 0; this.waitT -= dt; this.yaw += dt * 1.2; if (this.waitT <= 0) this.setState("patrol"); }
        else this.waitT = 2.5;
      } else if (this.ally && this.state !== "patrol") {
        const p = g.player; const d = Math.hypot(p.x - this.x, p.z - this.z);
        if (d > 7) { this.goPath(g, p.x + Math.sin(this.id) * 3, p.z + Math.cos(this.id) * 3, dt); speed = sp * (d > 14 ? 1.2 : 0.8); moveX = this.sx; moveZ = this.sz; }
        if (this.ammo < this.mag * 0.4 && this.reloadT <= 0) this.startReload(g);
      } else {
        // patrol / hunt
        const goal = this.goalOverride ?? (this.hunt ? { x: g.player.x, z: g.player.z } : null);
        if (goal) { const arrived = this.goPath(g, goal.x, goal.z, dt, this.hunt ? 2.5 : 1.2); speed = sp * (this.hunt ? 1 : 0.8); moveX = this.sx; moveZ = this.sz; if (arrived) speed = 0; }
        else if (this.waitT > 0) { this.waitT -= dt; this.yaw += Math.sin(this.t * 0.8) * dt * 0.8; }
        else {
          if (!this.hasGoal) { const near = g.world.pois.filter((p) => Math.hypot(p.x - this.x, p.z - this.z) < 35); const p = near.length ? pick(near) : { x: this.home.x + (Math.random() - 0.5) * 20, z: this.home.z + (Math.random() - 0.5) * 20 }; this.goalX = p.x; this.goalZ = p.z; this.hasGoal = true; this.path = null; }
          const arrived = this.goPath(g, this.goalX, this.goalZ, dt, 1.5); speed = sp * 0.5; moveX = this.sx; moveZ = this.sz;
          if (arrived) { this.hasGoal = false; this.waitT = 1.5 + Math.random() * 3; }
        }
        if (this.ammo < this.mag * 0.5 && this.reloadT <= 0) this.startReload(g);
      }
    }

    // velocity & yaw
    const ml = Math.hypot(moveX, moveZ);
    const wantX = ml > 0.01 ? (moveX / ml) * speed : 0, wantZ = ml > 0.01 ? (moveZ / ml) * speed : 0;
    const acc = Math.min(1, dt * 9);
    this.vx += (wantX - this.vx) * acc; this.vz += (wantZ - this.vz) * acc;
    // separation
    for (const a of g.actors()) { if (a === this || !a.alive) continue; const ax = this.x - a.x, az = this.z - a.z; const dd = ax * ax + az * az; if (dd < 0.9 && dd > 0.0001) { const q = Math.sqrt(dd); this.vx += (ax / q) * (1 - q / 0.95) * 3; this.vz += (az / q) * (1 - q / 0.95) * 3; } }
    if (this.kind === "heavy") { this.vx *= 0.97; this.vz *= 0.97; }
    this.speedNow = Math.hypot(this.vx, this.vz);
    let wantYaw = this.yaw;
    if (faceTarget && tgt) wantYaw = Math.atan2(-(tgt.x - this.x), -(tgt.z - this.z));
    else if (this.speedNow > 0.4) wantYaw = Math.atan2(-this.vx, -this.vz);
    else if (this.state === "chase") wantYaw = Math.atan2(-(this.lastX - this.x), -(this.lastZ - this.z));
    this.yaw += clamp(angDiff(this.yaw, wantYaw), -dt * (faceTarget ? 9 : 5), dt * (faceTarget ? 9 : 5));
    // stuck handling
    this.stuckT += dt;
    if (this.stuckT > 0.9) {
      const moved = Math.hypot(this.x - this.sx0, this.z - this.sz0);
      if (speed > 0.5 && moved < 0.3) { this.path = null; this.repathT = 0; if (this.onGround) this.vy = 7; }
      this.sx0 = this.x; this.sz0 = this.z; this.stuckT = 0;
    }
    g.world.moveBody(this, 0.38, 1.8 * this.scale, dt);
    this.animate(dt, g);
  }
  sx0 = 0; sz0 = 0;

  perceive(g: Game, dtp: number) {
    if (this.stun > 0) return;
    let best: Actor | null = null; let bd = 1e9;
    const vis = this.kp.vision * this.dp.vision * (this.stealth && !this.alerted ? 0.55 : 1) * (g.night ? 0.8 : 1);
    for (const a of g.actors()) {
      if (!a.alive || a.team === this.team) continue;
      if (a.isPlayer && g.player.prot > 0) continue;
      if (!a.isPlayer && (a as Bot).state === "captive") continue;
      const dx = a.x - this.x, dz = a.z - this.z; const d = Math.hypot(dx, dz);
      if (d > vis) continue;
      const ang = Math.abs(angDiff(this.yaw, Math.atan2(-dx, -dz)));
      const fov = this.alerted || this.state === "combat" || this.state === "chase" ? Math.PI : 1.25;
      if (ang > fov && d > 6) continue;
      if (!g.canSee(this.x, this.eyeY, this.z, a)) continue;
      if (d < bd) { bd = d; best = a; }
    }
    if (best) {
      const rate = dtp / (this.dp.react * (this.stealth && !this.alerted ? 1.8 : 1)) * (1 + (1 - bd / vis) * 2.5) * (this.alerted ? 2 : 1);
      this.aware += rate;
      if (this.aware >= 1 || (this.target === best)) {
        if (this.target !== best) { this.aimT = 0; if (!this.alerted) g.onBotAlert(this); this.alerted = true; }
        this.target = best; this.seenT = 0; this.lastX = best.x; this.lastZ = best.z;
      }
    } else this.aware = Math.max(0, this.aware - dtp * 0.5);
  }

  hear(x: number, z: number, r: number, team: number) {
    if (!this.alive || team === this.team || this.kind === "dummy" || this.state === "captive") return;
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > r) return;
    if (!this.target && (this.state === "patrol" || this.state === "investigate")) { this.lastX = x; this.lastZ = z; this.waitT = 2.5; this.path = null; this.setState("investigate"); this.aware = Math.max(this.aware, 0.5); if (d < r * 0.5) this.alerted = true; }
  }

  startReload(g: Game) { if (this.reloadT > 0) return; this.reloadT = (getWeapon(this.weaponId).reload || 2) * 0.9; g.audio.reload(1, { x: this.x, y: this.y + 1, z: this.z }); }

  tryShoot(g: Game, tgt: Actor, d: number, dt: number) {
    if (this.reloadT > 0 || this.stun > 0) return;
    if (this.ammo <= 0) { this.startReload(g); return; }
    const need = this.dp.react * 0.6;
    if (this.aimT < need) return;
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    if (this.cd > 0) return;
    const w = getWeapon(this.weaponId);
    this.cd = 60 / (w.rpm * this.kp.rate * (w.cat === "sniper" ? 1 : 1)) * (this.kind === "shotgun" ? 1.4 : 1);
    if (this.kind === "sniper") this.cd = 2.2 / this.dp.burst;
    if (this.burst <= 0) this.burst = Math.round((this.kp.burst[0] + Math.random() * (this.kp.burst[1] - this.kp.burst[0])) * this.dp.burst);
    this.burst--; this.ammo--;
    if (this.burst <= 0) this.burstPause = (0.5 + Math.random() * 1.1) / this.dp.burst;
    g.botFire(this, tgt, d);
    this.muzzleT = 0.06; this.shown = 3;
  }

  findCover(g: Game, tgt: Actor, far = false): boolean {
    let best: { x: number; z: number } | null = null; let bs = -1e9;
    const R = far ? 22 : 11;
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.283, r = 4 + Math.random() * R; const x = this.x + Math.cos(a) * r, z = this.z + Math.sin(a) * r;
      if (Math.abs(x) > g.world.S - 2 || Math.abs(z) > g.world.S - 2 || !g.world.walkable(x, z)) continue;
      const hidden = !g.world.los(x, 1.5, z, tgt.x, tgt.y + 1.4, tgt.z);
      const score = (hidden ? 20 : 0) - r * 0.5 + (far ? Math.hypot(x - tgt.x, z - tgt.z) * 0.3 : 0);
      if (score > bs) { bs = score; best = { x, z }; }
    }
    if (best && bs > 5) { this.goalX = best.x; this.goalZ = best.z; this.path = null; return true; }
    return false;
  }
  findFlank(g: Game, tgt: Actor): boolean {
    const dx = tgt.x - this.x, dz = tgt.z - this.z; const d = Math.hypot(dx, dz) || 1; const side = Math.random() < 0.5 ? 1 : -1;
    const x = tgt.x + (-dz / d) * 14 * side + (dx / d) * 2, z = tgt.z + (dx / d) * 14 * side + (dz / d) * 2;
    const p = g.world.nearestWalkable(clamp(x, -g.world.S + 2, g.world.S - 2), clamp(z, -g.world.S + 2, g.world.S - 2));
    this.goalX = p.x; this.goalZ = p.z; this.path = null; return true;
  }

  /** follow path toward (x,z); sets this.sx/sz steering; returns true if arrived. */
  goPath(g: Game, x: number, z: number, dt: number, tol = 1.2): boolean {
    this.repathT -= dt;
    const dd = Math.hypot(x - this.x, z - this.z);
    if (dd < tol) { this.sx = this.sz = 0; return true; }
    if ((!this.path || this.repathT <= 0 || Math.hypot(x - this.pgx, z - this.pgz) > 4) && g.pathBudget > 0) {
      g.pathBudget--; this.path = g.world.findPath(this.x, this.z, x, z); this.pi = 0; this.pgx = x; this.pgz = z; this.repathT = 1.5 + Math.random();
    }
    if (this.path && this.pi * 2 < this.path.length) {
      let wx = this.path[this.pi * 2], wz = this.path[this.pi * 2 + 1];
      while (Math.hypot(wx - this.x, wz - this.z) < 0.8 && (this.pi + 1) * 2 < this.path.length) { this.pi++; wx = this.path[this.pi * 2]; wz = this.path[this.pi * 2 + 1]; }
      const l = Math.hypot(wx - this.x, wz - this.z) || 1; this.sx = (wx - this.x) / l; this.sz = (wz - this.z) / l;
    } else { const l = dd || 1; this.sx = (x - this.x) / l; this.sz = (z - this.z) / l; }
    return false;
  }
  pgx = 0; pgz = 0;

  // ----------------------------------------------------------------- animation
  animate(dt: number, g: Game) {
    const r = this.rig; const root = r.root;
    root.position.set(this.x, this.y, this.z); root.rotation.y = this.yaw;
    const spd = this.speedNow; this.ph += dt * (2 + spd * 1.9);
    const sw = Math.sin(this.ph) * Math.min(1, spd / 3.5) * 0.85;
    if (this.state === "captive") {
      r.legL.rotation.x = -1.35; r.legR.rotation.x = -1.35; r.torso.position.y = 0.46; r.legL.position.y = 0.42; r.legR.position.y = 0.42; r.legL.position.z = -0.1; r.legR.position.z = -0.1;
      r.armL.rotation.set(0.25, 0, 0); r.armR.rotation.set(0.25, 0, 0); r.head.rotation.x = 0.35 + Math.sin(this.t) * 0.03; r.torso.rotation.x = 0.1;
      if (r.weapon) r.weapon.visible = false;
      r.armL.rotation.z = 0.5; r.armR.rotation.z = -0.5; r.armL.rotation.y = 0.4; r.armR.rotation.y = -0.4;
      return;
    }
    if (this.kind === "dummy") { root.rotation.y = this.yaw; return; }
    r.legL.rotation.x = sw; r.legR.rotation.x = -sw;
    r.torso.position.y = 0.86 + Math.abs(Math.cos(this.ph)) * 0.025 * Math.min(1, spd / 3);
    r.torso.rotation.x = Math.min(0.2, spd * 0.03) + (this.flinch > 0 ? -0.25 * (this.flinch / 0.18) : 0);
    r.torso.rotation.y = this.flinch > 0 ? 0.25 * (this.flinch / 0.18) : 0;
    const aiming = this.state === "combat" || this.state === "cover" || this.state === "flank" || this.alerted;
    const reloading = this.reloadT > 0;
    const pitch = this.target ? clamp(Math.atan2(this.target.y + 1.2 - (this.y + 1.45), Math.hypot(this.target.x - this.x, this.target.z - this.z)), -0.5, 0.5) : 0;
    if (r.weapon) {
      if (this.state === "patrol" || this.state === "investigate") { r.armR.rotation.set(0.7 + sw * 0.1, 0.25, 0); r.armL.rotation.set(0.9, -0.35, 0); r.weapon.rotation.x = -0.2; }
      else { r.armR.rotation.set(1.25 + pitch, 0.38, 0); r.armL.rotation.set(1.38 + pitch, -0.5, 0); r.weapon.rotation.x = pitch; }
      if (reloading) { r.armL.rotation.set(0.7, -0.2, 0); r.weapon.rotation.x = -0.35; }
      if (this.muzzleT > 0) r.weapon.position.z = -0.5 + 0.04; else r.weapon.position.z = -0.5;
    }
    r.head.rotation.x = -pitch * 0.5; void aiming;
    void g;
  }

  updateDeath(dt: number) {
    this.deadT += dt; const r = this.rig;
    const k = Math.min(1, this.deadT * 4); const e = 1 - (1 - k) * (1 - k);
    r.root.rotation.x = e * 1.5; r.root.position.y = this.y + 0.12 * e - Math.max(0, this.deadT - 5) * 0.5;
    r.legL.rotation.x = 0.3 * e; r.legR.rotation.x = -0.2 * e; r.armL.rotation.z = -0.8 * e; r.armR.rotation.z = 0.8 * e;
    r.root.position.x = this.x; r.root.position.z = this.z; r.root.rotation.y = this.yaw;
    if (this.deadT > 7) this.gone = true;
  }
}
