import * as THREE from "three";
import { audio } from "./audio";
import { CHALLENGES, MISSIONS, TUTORIAL, type Challenge, type Mission, type SpawnGroup } from "./data/campaign";
import { Bot, BOT_NAMES, type Actor } from "./entities/bots";
import type { Game, HudState } from "./engine";
import { VB } from "./gfx/models";
import { levelInfo } from "./save";
import type { EnemyKind, MatchResult } from "./types";
import { clamp, fmtTime } from "./util";
import type { Prop } from "./world/world";

interface Flag { x: number; z: number; cap: number; owner: number; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; name: string }
const FLAG_NAMES = ["A", "B", "C"];

export class ModeCtl {
  g: Game; kind: Game["cfg"]["kind"];
  mission: Mission | null = null; challenge: Challenge | null = null;
  oi = 0; ot = 0; okills = 0; ambushed = false; fxIdx = 0; waveT = 0; objDone = false; nextT = -1; rescued = 0; collected = false; boss: Bot | null = null;
  objProps: Prop[] = []; pts: { x: number; z: number }[] = []; checkpoint = { oi: 0, x: 0, z: 0, yaw: 0 }; detected = false; outroDone = false;
  tut = { look: 0, kills: 0, adsKills: 0, reloaded: false, switched: false, sprintT: 0, melee: false, grenade: false, interacted: false };
  score = [0, 0]; limit = 0; timeLeft = 0; flags: Flag[] = []; domTick = 0; domAssign = 0; dm = new Map<number, number>();
  wave = 0; waveToSpawn = 0; waveBreak = 5; waveActive = false; spawnT = 0;
  respawnQ: { t: number; team: number; kind: EnemyKind; name: string; ally: boolean; spot?: { x: number; z: number } }[] = [];
  chKills = 0; chHeads = 0; objText = ""; deathsAtStart = 0;

  constructor(g: Game) { this.g = g; this.kind = g.cfg.kind; }
  get world() { return this.g.world; }
  get maxBots() { return this.g.quality === "low" ? 8 : this.g.quality === "med" ? 12 : 16; }

  forcedWeapon(): string | null { return this.kind === "challenge" ? (CHALLENGES.find((c) => c.id === this.g.cfg.challengeId)?.weapon === "pistol" ? "p9" : null) : null; }

  // ------------------------------------------------------------------ init
  init() {
    const g = this.g; const cfg = g.cfg; const w = this.world; const p = g.player;
    if (this.forcedWeapon()) g.setupLoadout();
    p.name = g.save.name; p.hp = 100; p.alive = true;
    const teamMode = this.kind === "tdm" || this.kind === "dom";
    p.team = teamMode ? (cfg.teamPick ?? 0) : 0;
    const solo = !["dm", "tdm", "dom"].includes(this.kind);
    const sp = solo ? w.start : this.spawnPoint(p.team);
    p.x = sp.x; p.z = sp.z; p.yaw = (sp as { yaw?: number }).yaw ?? Math.atan2(sp.x, sp.z); p.y = 0; p.prot = solo ? 0 : 2.5;
    if (this.kind !== "tutorial") w.pickupSpots.slice(0, this.kind === "training" ? 0 : 8).forEach((s, i) => g.addPickup(s.x, s.z, (["ammo", "health", "armor", "ammo"] as const)[i % 4]));
    this.deathsAtStart = 0;
    const diffN = Math.min(cfg.bots, this.maxBots);
    if (this.kind === "campaign" || this.kind === "tutorial") {
      this.mission = this.kind === "tutorial" ? TUTORIAL : MISSIONS.find((m) => m.id === cfg.missionId) ?? MISSIONS[0];
      g.startCutscene(this.mission.intro, () => { g.banner(this.mission!.name, this.mission!.sub, "info"); this.startObjective(cfg.startObjective ?? 0); });
    } else if (this.kind === "dm") {
      this.limit = 20; this.timeLeft = 300;
      for (let i = 0; i < diffN; i++) { const s = this.spawnPoint(10 + i); const b = g.spawnBot(i % 5 === 4 ? "smg" : "grunt", 10 + i, s.x, s.z, { yaw: s.yaw }); b.prot = 2; b.goalOverride = null; }
      g.banner("DEATHMATCH", `Primeiro a ${this.limit} abates vence`, "info");
    } else if (teamMode) {
      this.limit = this.kind === "tdm" ? 30 : 100; this.timeLeft = this.kind === "tdm" ? 300 : 240;
      const allies = Math.min(diffN, cfg.allies ?? Math.floor(diffN / 2)), foes = diffN - allies;
      for (let i = 0; i < allies; i++) { const s = this.spawnPoint(p.team); const b = g.spawnBot(i % 3 === 2 ? "smg" : "grunt", p.team, s.x, s.z, { ally: false, yaw: s.yaw }); b.prot = 2; b.ally = false; }
      for (let i = 0; i < foes; i++) { const s = this.spawnPoint(1 - p.team); const b = g.spawnBot(i % 4 === 3 ? "shotgun" : i % 3 === 2 ? "smg" : "grunt", 1 - p.team, s.x, s.z, { yaw: s.yaw }); b.prot = 2; }
      if (this.kind === "dom") this.buildFlags();
      g.banner(this.kind === "tdm" ? "TEAM DEATHMATCH" : "DOMINAÇÃO", this.kind === "tdm" ? `Equipe ${p.team === 0 ? "AZUL" : "VERMELHA"} — ${this.limit} abates` : "Capture e segure os pontos A, B e C", "info");
    } else if (this.kind === "survival") {
      this.waveBreak = 4; this.wave = 0; g.banner("SOBREVIVÊNCIA", "Resista às ondas inimigas", "info");
    } else if (this.kind === "training") {
      w.targetSpots.forEach((s) => g.spawnBot("dummy", 1, s.x, s.z, { state: "dummy", yaw: 0 }));
      g.banner("TREINAMENTO", "Pratique tiro, recarga e granadas", "info");
    } else if (this.kind === "challenge") {
      this.challenge = CHALLENGES.find((c) => c.id === cfg.challengeId) ?? CHALLENGES[0]; this.timeLeft = this.challenge.time;
      if (this.challenge.kinds[0] === "dummy") w.targetSpots.forEach((s) => g.spawnBot("dummy", 1, s.x, s.z, { state: "dummy" }));
      else if (this.challenge.goal === "waves") { this.waveBreak = 3; }
      else for (let i = 0; i < Math.min(this.challenge.bots, this.maxBots); i++) this.spawnHostile(this.challenge.kinds[i % this.challenge.kinds.length], true);
      g.banner(this.challenge.name.toUpperCase(), this.challenge.desc, "info");
    }
  }

  buildFlags() {
    const g = this.g;
    this.world.domPoints.forEach((pt, i) => {
      const vb = new VB(); vb.box(0, 2.2, 0, 0.18, 4.4, 0.18, "#444"); vb.box(0, 0.06, 0, 8, 0.1, 8, "#ffffff", undefined, 0);
      const mat = new THREE.MeshBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.55 });
      const mv = new VB(); mv.box(0.9, 3.7, 0, 1.6, 1, 0.06, "#ffffff", undefined, 0);
      const ring = new VB(); ring.box(0, 0.04, 0, 9, 0.04, 9, "#ffffff", undefined, 0);
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.4, 0.2), new THREE.MeshStandardMaterial({ color: 0x333333 })); pole.position.y = 2.2; grp.add(pole);
      const banner = new THREE.Mesh(mv.geometry(), mat); grp.add(banner);
      const zone = new THREE.Mesh(ring.geometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, depthWrite: false })); grp.add(zone);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.25, 40, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = 20; grp.add(beam);
      grp.position.set(pt.x, 0, pt.z); g.scene.add(grp);
      this.flags.push({ x: pt.x, z: pt.z, cap: 0, owner: -1, mesh: banner, mat, name: FLAG_NAMES[i] });
      (grp.userData as { mats: THREE.MeshBasicMaterial[] }).mats = [mat, zone.material as THREE.MeshBasicMaterial, beam.material as THREE.MeshBasicMaterial];
      banner.userData.grp = grp;
    });
  }

  // ------------------------------------------------------------------ spawning helpers
  spawnPoint(team: number): { x: number; z: number; yaw: number } {
    const g = this.g; const enemies = g.actors().filter((a) => a.alive && a.team !== team);
    const scored = this.world.spawns.map((s) => ({ s, d: enemies.length ? Math.min(...enemies.map((e) => Math.hypot(e.x - s.x, e.z - s.z))) : 99 + Math.random() * 10 + (Math.random() * 5) }));
    scored.sort((a, b) => b.d - a.d);
    const pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
    return { x: pick.x, z: pick.z, yaw: Math.atan2(pick.x, pick.z) };
  }
  resolve(at: number | "extract" | "start" | "near" | undefined, radius = 0): { x: number; z: number } {
    const w = this.world; const g = this.g; let b: { x: number; z: number };
    if (at === "extract") b = w.extract; else if (at === "start") b = w.start;
    else if (at === "near") {
      b = w.nearestWalkable(g.player.x + 20, g.player.z);
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, r = (radius || 20) * (0.7 + Math.random() * 0.5);
        const x = clamp(g.player.x + Math.cos(a) * r, -w.S + 3, w.S - 3), z = clamp(g.player.z + Math.sin(a) * r, -w.S + 3, w.S - 3);
        if (w.walkable(x, z) && !w.los(g.player.x, 1.6, g.player.z, x, 1.6, z)) { b = { x, z }; break; }
      }
      return b;
    } else b = w.pois[((at ?? 0) % Math.max(1, w.pois.length) + w.pois.length) % Math.max(1, w.pois.length)] ?? w.start;
    return b;
  }
  spawnGroup(grp: SpawnGroup, forceAlert = false) {
    const g = this.g; const base = this.resolve(grp.at, grp.radius ?? 20); const out: Bot[] = [];
    for (let i = 0; i < grp.count; i++) {
      if (g.aliveBots((b) => b.team === 1).length >= this.maxBots) break;
      const r = grp.at === "near" ? 3 : grp.radius ?? 5;
      const pt = this.world.nearestWalkable(base.x + (Math.random() - 0.5) * r * 2, base.z + (Math.random() - 0.5) * r * 2);
      const kind = grp.kinds[Math.floor(Math.random() * grp.kinds.length)];
      out.push(g.spawnBot(kind, 1, pt.x, pt.z, { alert: grp.alert || forceAlert || this.kind === "tutorial", stealth: !!this.mission?.stealth }));
    }
    return out;
  }
  spawnHostile(kind: EnemyKind, alert: boolean) {
    const g = this.g; let s = this.spawnPoint(1); const p = g.player;
    for (let i = 0; i < 6 && Math.hypot(s.x - p.x, s.z - p.z) < 22; i++) s = this.spawnPoint(1);
    return g.spawnBot(kind, 1, s.x, s.z, { alert });
  }
  removeProp(p: Prop) { p.c.off = true; this.world.group.remove(p.mesh); this.world.props = this.world.props.filter((q) => q !== p); }

  // ------------------------------------------------------------------ campaign objectives
  startObjective(i: number) {
    const g = this.g; const m = this.mission!; const o = m.objectives[i]; const w = this.world;
    this.oi = i; this.ot = 0; this.okills = 0; this.ambushed = false; this.fxIdx = 0; this.objDone = false; this.nextT = -1; this.rescued = 0; this.collected = false; this.boss = null;
    this.waveT = o.waves?.every ?? 0; this.pts = []; this.objText = o.text;
    g.beacons.forEach((b) => (b.visible = false));
    if (o.dlg) g.dialog(o.dlg);
    const resolveAt = () => this.resolve(o.at);
    switch (o.type) {
      case "tut": {
        if (o.tut === "move") { const p = resolveAt(); this.pts = [p]; g.setBeacon(0, p); }
        if (o.tut === "shoot" || o.tut === "ads") { this.tut.kills = 0; this.tut.adsKills = 0; if (!g.bots.some((b) => b.alive && b.kind === "dummy")) w.targetSpots.forEach((s) => g.spawnBot("dummy", 1, s.x, s.z, { state: "dummy" })); }
        if (o.tut === "reload") { const wp = g.w; wp.ammo = Math.min(wp.ammo, Math.max(1, wp.st.mag - 6)); }
        if (o.tut === "sprint") this.tut.sprintT = 0;
        if (o.tut === "interact") { const p = resolveAt(); this.pts = [p]; g.addInteract("console", p.x, p.z, "Usar console"); g.setBeacon(0, p, 0x3aff9a); }
        if (o.tut === "grenade") { g.gCount = Math.max(g.gCount, 3); }
        break;
      }
      case "kill": case "survive": case "boss": {
        const bots: Bot[] = [];
        for (const grp of o.spawns ?? []) { bots.push(...this.spawnGroup(grp)); this.pts.push(this.resolve(grp.at, grp.radius)); }
        if (o.type === "boss") this.boss = bots.find((b) => b.kind === "commander") ?? null;
        if (o.type === "kill") this.pts = this.pts.filter((_, k) => k < 1);
        break;
      }
      case "reach": {
        const p = resolveAt(); this.pts = [p]; g.setBeacon(0, p);
        for (const grp of o.spawns ?? []) this.spawnGroup(grp);
        break;
      }
      case "destroy": {
        const p = w.nearestWalkable(resolveAt().x, resolveAt().z); const th = w.def.theme;
        const kind = th === "port" ? "vehicle" : th === "factory" ? "generator" : th === "industrial" ? "tank" : th === "lab" ? "core" : "vehicle";
        const prop = w.addTarget(kind, p.x, p.z); this.objProps = [prop]; this.pts = [p]; g.setBeacon(0, p, 0xff4a3a);
        for (const grp of o.spawns ?? []) this.spawnGroup(grp);
        break;
      }
      case "collect": {
        const p = resolveAt(); this.pts = [p]; g.addInteract("intel", p.x, p.z, "Pegar documento"); g.setBeacon(0, p);
        for (const grp of o.spawns ?? []) this.spawnGroup(grp);
        break;
      }
      case "rescue": {
        const n = o.n ?? 3;
        for (let k = 0; k < n; k++) {
          const p = w.nearestWalkable(this.resolve((typeof o.at === "number" ? o.at : 3) + k * 2).x, this.resolve((typeof o.at === "number" ? o.at : 3) + k * 2).z);
          const b = g.spawnBot("grunt", 0, p.x, p.z, { state: "captive", ally: true, name: ["Sd. Alves", "Sd. Duarte", "Cb. Nunes", "Sd. Pires"][k % 4] });
          g.addInteract("captive", p.x, p.z, "Libertar prisioneiro", b); this.pts.push(p); g.setBeacon(k, p, 0x3a9aff);
        }
        for (const grp of o.spawns ?? []) this.spawnGroup(grp);
        break;
      }
    }
    this.checkpoint = { oi: i, x: g.player.x, z: g.player.z, yaw: g.player.yaw };
    if (i > 0) g.banner("CHECKPOINT", "Progresso salvo", "info");
  }

  restartCheckpoint() {
    const g = this.g; const cp = this.checkpoint;
    for (const p of this.objProps) this.removeProp(p); this.objProps = [];
    g.clearEntities(); g.ended = false; g.respawnPlayer({ x: cp.x, z: cp.z, yaw: cp.yaw });
    g.player.armor = 0;
    if (this.kind === "survival" || this.kind === "challenge") return;
    this.startObjective(cp.oi);
  }

  completeObjective() {
    const g = this.g; const m = this.mission!;
    this.objDone = true; g.stats.objectives++; g.stats.score += 500;
    g.banner("OBJETIVO CONCLUÍDO", this.objText, "obj"); audio.ui("complete"); g.xp(50, "Objetivo concluído"); g.vib(60);
    g.beacons.forEach((b) => (b.visible = false));
    this.nextT = 2.4; void m;
  }

  tutDone(o: { tut?: string; n?: number; seconds?: number }): boolean {
    const t = this.tut; const g = this.g;
    switch (o.tut) {
      case "move": return this.pts[0] ? Math.hypot(this.pts[0].x - g.player.x, this.pts[0].z - g.player.z) < 2.8 : false;
      case "look": return t.look >= (o.n ?? 160);
      case "shoot": return t.kills >= (o.n ?? 4);
      case "ads": return t.adsKills >= (o.n ?? 2);
      case "reload": return t.reloaded;
      case "switch": return t.switched;
      case "sprint": return t.sprintT >= (o.seconds ?? 3);
      case "melee": return t.melee;
      case "grenade": return t.grenade;
      case "interact": return t.interacted;
    }
    return false;
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    const g = this.g; const p = g.player;
    // bot respawn queue
    for (let i = this.respawnQ.length - 1; i >= 0; i--) {
      const q = this.respawnQ[i]; q.t -= dt; if (q.t > 0) continue; this.respawnQ.splice(i, 1);
      if (q.spot) { g.spawnBot(q.kind, q.team, q.spot.x, q.spot.z, { state: "dummy" }); continue; }
      const s = this.spawnPoint(q.team); const b = g.spawnBot(q.kind, q.team, s.x, s.z, { name: q.name, yaw: s.yaw, alert: this.kind === "survival" || this.kind === "challenge" });
      b.prot = 2.5; b.ally = q.ally;
    }
    switch (this.kind) {
      case "campaign": case "tutorial": this.updateMission(dt); break;
      case "dm": case "tdm": case "dom": this.updateMatch(dt); break;
      case "survival": this.updateSurvival(dt); break;
      case "training": g.hud.objective = "Treino livre"; break;
      case "challenge": this.updateChallenge(dt); break;
    }
    void p;
  }

  updateMission(dt: number) {
    const g = this.g; const m = this.mission; if (!m || g.cut) return; const o = m.objectives[this.oi]; if (!o) return;
    this.ot += dt; const p = g.player;
    if (this.nextT >= 0) {
      this.nextT -= dt;
      if (this.nextT < 0) {
        if (this.oi + 1 < m.objectives.length) this.startObjective(this.oi + 1);
        else if (!this.outroDone) { this.outroDone = true; g.startCutscene(m.outro, () => g.finish(true)); }
      }
      return;
    }
    // scripted fx
    while (o.fx && this.fxIdx < o.fx.length && this.ot >= o.fx[this.fxIdx].t) {
      const e = o.fx[this.fxIdx++]; const pt = e.explode === "near" ? this.resolve("near", 16) : this.resolve(e.explode as number);
      g.explode(pt.x, 0, pt.z, 6, 30, null, "event"); g.shake = Math.max(g.shake, e.shake ?? 0.6);
    }
    // ambush
    if (o.ambush && !this.ambushed) {
      let trig = false;
      if (o.type === "reach") trig = !!this.pts[0] && Math.hypot(this.pts[0].x - p.x, this.pts[0].z - p.z) < 30;
      else if (o.type === "kill") trig = this.okills >= (o.n ?? 4) / 2;
      else trig = this.ot > 12;
      if (trig) { this.ambushed = true; o.ambush.forEach((grp) => this.spawnGroup(grp, true)); g.banner("EMBOSCADA!", "Inimigos se aproximam", "alert"); audio.alarm(); }
    }
    // waves
    if (o.waves && this.ot >= this.waveT) { this.waveT += o.waves.every; if (g.aliveBots((b) => b.team === 1).length < this.maxBots - 1) { this.spawnGroup(o.waves.group, true); g.banner("REFORÇOS!", "Novos inimigos chegando", "alert"); audio.alarm(); } }
    // completion
    let done = false;
    switch (o.type) {
      case "tut": done = this.tutDone(o); break;
      case "kill": {
        done = this.okills >= (o.n ?? 1);
        if (!done && g.aliveBots((b) => b.team === 1 && b.kind !== "dummy").length === 0 && this.ot > 3) { this.spawnGroup({ kinds: ["grunt", "smg"], count: Math.min(3, (o.n ?? 1) - this.okills), at: "near", radius: 22, alert: true }, true); }
        break;
      }
      case "reach": done = !!this.pts[0] && Math.hypot(this.pts[0].x - p.x, this.pts[0].z - p.z) < 3.5; break;
      case "survive": done = this.ot >= (o.seconds ?? 30); break;
      case "destroy": done = this.objProps.length > 0 && this.objProps.every((q) => q.dead); break;
      case "collect": done = this.collected; break;
      case "rescue": done = this.rescued >= (o.n ?? 3); break;
      case "boss": done = !!this.boss && !this.boss.alive; break;
    }
    if (done && !this.objDone) this.completeObjective();
    // bot alive reaffirm: allies teleport if far
    for (const b of g.bots) if (b.ally && b.alive && b.state !== "captive" && Math.hypot(b.x - p.x, b.z - p.z) > 60) { const pt = this.world.nearestWalkable(p.x + 4, p.z + 4); b.x = pt.x; b.z = pt.z; }
    // sprint time
  }

  updateMatch(dt: number) {
    const g = this.g; const p = g.player;
    this.timeLeft -= dt;
    if (this.kind === "dom") this.updateDom(dt);
    if (this.timeLeft <= 0) { this.endMatch(); return; }
    if (this.kind === "dm") { const top = Math.max(0, ...this.dm.values()); if ((this.dm.get(0) ?? 0) >= this.limit || top >= this.limit) this.endMatch(); }
    else if (this.score[0] >= this.limit || this.score[1] >= this.limit) this.endMatch();
    void p;
  }
  endMatch() {
    const g = this.g;
    let win = false;
    if (this.kind === "dm") { const mine = this.dm.get(0) ?? 0; const top = Math.max(0, ...[...this.dm.entries()].filter(([k]) => k !== 0).map(([, v]) => v)); win = mine >= top && mine > 0; }
    else win = this.score[0] > this.score[1];
    g.finish(win, win ? "VITÓRIA" : "DERROTA", this.kind === "dm" ? `${this.dm.get(0) ?? 0} abates` : `${this.score[0]} x ${this.score[1]}`);
  }
  updateDom(dt: number) {
    const g = this.g; const p = g.player; const mine = p.team;
    for (const f of this.flags) {
      let a = 0, b = 0;
      for (const ac of g.actors()) { if (!ac.alive) continue; if (Math.hypot(ac.x - f.x, ac.z - f.z) < 5) { if (ac.team === mine) a++; else b++; } }
      if (a > 0 && b === 0) f.cap = Math.min(1, f.cap + dt * 0.22 * Math.min(3, a)); else if (b > 0 && a === 0) f.cap = Math.max(-1, f.cap - dt * 0.22 * Math.min(3, b));
      if (f.cap >= 1) f.owner = 0; else if (f.cap <= -1) f.owner = 1; else if (f.owner === 0 && f.cap < 0.05) f.owner = -1; else if (f.owner === 1 && f.cap > -0.05) f.owner = -1;
      const col = f.owner === 0 ? 0x3a9aff : f.owner === 1 ? 0xff4a3a : f.cap > 0.05 ? 0x7ac0ff : f.cap < -0.05 ? 0xff8a7a : 0xaaaaaa;
      const grp = f.mesh.userData.grp as THREE.Group; (grp.userData.mats as THREE.MeshBasicMaterial[]).forEach((m) => m.color.setHex(col));
    }
    this.domTick -= dt; if (this.domTick <= 0) { this.domTick = 2; for (const f of this.flags) if (f.owner >= 0) this.score[f.owner]++; }
    this.domAssign -= dt;
    if (this.domAssign <= 0) {
      this.domAssign = 4;
      for (const b of g.bots) {
        if (!b.alive || b.target) continue; const rel = b.team === mine ? 0 : 1;
        const want = this.flags.filter((f) => f.owner !== rel); const list = want.length ? want : this.flags;
        const f = list[(b.id + Math.floor(this.g.time / 20)) % list.length]; b.goalOverride = { x: f.x + (Math.random() - 0.5) * 3, z: f.z + (Math.random() - 0.5) * 3 };
      }
    }
  }
  updateSurvival(dt: number) {
    const g = this.g; const alive = g.aliveBots((b) => b.team === 1).length;
    if (!this.waveActive) {
      this.waveBreak -= dt;
      if (this.waveBreak <= 0) this.startWave();
    } else {
      if (this.waveToSpawn > 0) { this.spawnT -= dt; if (this.spawnT <= 0 && alive < this.maxBots - 1) { this.spawnT = 1.2; this.spawnHostile(this.waveKind(), true); this.waveToSpawn--; } }
      else if (alive === 0) {
        this.waveActive = false; this.waveBreak = 8; g.banner(`ONDA ${this.wave} CONCLUÍDA`, "Reabasteça! Próxima onda em instantes", "obj"); audio.ui("complete");
        g.stats.score += this.wave * 200; g.xp(this.wave * 15, "Onda concluída");
        const pp = g.player; const a = this.world.nearestWalkable(pp.x + 3, pp.z); g.addPickup(a.x, a.z, "ammo", true); const b = this.world.nearestWalkable(pp.x - 3, pp.z); g.addPickup(b.x, b.z, "health", true);
        if (this.kind === "survival" && this.wave >= 10) g.finish(true, "VITÓRIA", "Você sobreviveu a 10 ondas!");
        if (this.kind === "challenge" && this.challenge && this.wave >= this.challenge.n) g.finish(true, "DESAFIO CONCLUÍDO", this.challenge.name);
      }
    }
  }
  waveKind(): EnemyKind {
    const w = this.wave; const r = Math.random();
    if (w >= 6 && r < 0.15) return "heavy"; if (w >= 4 && r < 0.3) return "sniper"; if (w >= 3 && r < 0.5) return "shotgun"; return r < 0.6 ? "grunt" : "smg";
  }
  startWave() { this.wave++; this.waveActive = true; this.waveToSpawn = Math.min(26, 3 + this.wave * 2); this.spawnT = 0; this.g.banner(`ONDA ${this.wave}`, `${this.waveToSpawn} inimigos`, "alert"); audio.alarm(); }
  updateChallenge(dt: number) {
    const g = this.g; const c = this.challenge!;
    this.timeLeft -= dt;
    if (c.goal === "waves") this.updateSurvival(dt);
    if (c.goal === "kills" && this.chKills >= c.n) g.finish(true, "DESAFIO CONCLUÍDO", c.name);
    if (c.goal === "headshots" && this.chHeads >= c.n) g.finish(true, "DESAFIO CONCLUÍDO", c.name);
    if (this.timeLeft <= 0) g.finish(false, "TEMPO ESGOTADO", c.name);
  }

  // ------------------------------------------------------------------ events from engine
  onLook(a: number) { this.tut.look += (a * 180) / Math.PI; }
  onJump() { /* */ }
  onMove(_d: number, sprinting: boolean, dt: number) { if (sprinting) this.tut.sprintT += dt; }
  onSwitch() { this.tut.switched = true; }
  onReload() { this.tut.reloaded = true; }
  onShot() { /* */ }
  onMelee() { this.tut.melee = true; }
  onGrenade() { this.tut.grenade = true; }
  onAbility() { /* */ }
  onPlayerHit(_h: boolean, _k: boolean, _w: string, _ads: number) { /* */ }
  onPlayerHurt(_a: number) { /* */ }
  onBotAlert(b: Bot) {
    if (this.mission?.stealth && !this.detected && b.team === 1) { this.detected = true; this.g.banner("DETECTADO!", "A furtividade foi perdida", "alert"); audio.alarm(); }
  }
  onPropDestroyed(_p: Prop) { /* handled in completion check */ }
  onInteractStart() { /* */ }
  onInteract(it: { type: string; bot?: Bot }) {
    if (it.type === "console") this.tut.interacted = true;
    if (it.type === "intel") this.collected = true;
    if (it.type === "captive" && it.bot) {
      const b = it.bot; b.state = "follow"; b.ally = true; this.rescued++; const r = b.rig;
      r.torso.position.y = 0.86; r.legL.position.set(-0.13, 0.86, 0); r.legR.position.set(0.13, 0.86, 0); r.torso.rotation.x = 0; r.armL.rotation.set(0, 0, 0); r.armR.rotation.set(0, 0, 0); if (r.weapon) r.weapon.visible = true;
      this.objText = this.mission!.objectives[this.oi].text.replace(/\(\d\/\d\)/, `(${this.rescued}/${this.mission!.objectives[this.oi].n})`);
      this.g.banner("Prisioneiro libertado", `${this.rescued}/${this.mission!.objectives[this.oi].n}`, "info"); this.g.setBeacon(this.g.interacts.filter((i) => i.type === "captive").indexOf(this.g.interacts.find((i) => i.bot === b)!), null);
    }
  }
  onBotKilled(b: Bot, killer: Actor | null, head: boolean, _w: string) {
    const g = this.g; const me = killer === g.player;
    if (b.ally && b.team === 0 && this.kind === "campaign") { /* ally lost */ }
    if (this.kind === "campaign" || this.kind === "tutorial") {
      if (b.team === 1 && b.kind !== "dummy") this.okills++;
      if (b.kind === "dummy") { if (me) { this.tut.kills++; if (g.adsT > 0.5) this.tut.adsKills++; } if (b.spawnSpot) this.respawnQ.push({ t: 1.8, team: 1, kind: "dummy", name: "Alvo", ally: false, spot: b.spawnSpot }); }
      return;
    }
    if (this.kind === "training") { if (b.spawnSpot) this.respawnQ.push({ t: 1.8, team: 1, kind: "dummy", name: "Alvo", ally: false, spot: b.spawnSpot }); return; }
    if (this.kind === "dm") {
      if (killer) this.dm.set(killer.id, (this.dm.get(killer.id) ?? 0) + 1);
      this.respawnQ.push({ t: 3, team: b.team, kind: b.kind, name: b.name, ally: false });
    } else if (this.kind === "tdm" || this.kind === "dom") {
      if (killer && killer.team !== b.team) { const rel = killer.team === g.player.team ? 0 : 1; if (this.kind === "tdm") this.score[rel]++; }
      this.respawnQ.push({ t: 3, team: b.team, kind: b.kind, name: b.name, ally: false });
    } else if (this.kind === "challenge") {
      const c = this.challenge!;
      if (me) { this.chKills++; if (head) this.chHeads++; }
      if (b.kind === "dummy" && b.spawnSpot) this.respawnQ.push({ t: 1.2, team: 1, kind: "dummy", name: "Alvo", ally: false, spot: b.spawnSpot });
      else if (c.goal !== "waves") this.respawnQ.push({ t: 2, team: 1, kind: b.kind, name: b.name, ally: false });
    }
  }
  autoRespawn() { return !(this.kind === "campaign" || this.kind === "tutorial" || this.kind === "survival" || (this.kind === "challenge" && this.challenge?.goal === "waves")); }
  onPlayerDeath(src: Actor | null) {
    const g = this.g;
    if (this.kind === "dm") { if (src) this.dm.set(src.id, (this.dm.get(src.id) ?? 0) + 1); }
    if (this.kind === "tdm" && src && src.team !== g.player.team) this.score[1]++;
    if (this.kind === "campaign" || this.kind === "tutorial") { g.emit({ t: "death", checkpoint: true, respawn: false }); return; }
    if (this.kind === "survival") { g.emit({ t: "death", checkpoint: false, respawn: false }); setTimeout(() => g.finish(false, "DERROTA", `Você caiu na onda ${this.wave}`), 1800); return; }
    if (this.kind === "challenge" && this.challenge?.goal === "waves") { setTimeout(() => g.finish(false, "DESAFIO FALHOU", this.challenge!.name), 1500); return; }
    g.respawnT = 3; g.emit({ t: "death", checkpoint: false, respawn: true });
  }

  // ------------------------------------------------------------------ hud & markers
  markerPoint(): { x: number; z: number } | null {
    if (this.kind === "campaign" || this.kind === "tutorial") {
      if (this.g.cut || this.objDone) return null; const p = this.g.player;
      const o = this.mission?.objectives[this.oi]; if (!o) return null;
      if (o.type === "rescue") { const c = this.g.interacts.filter((i) => !i.used && i.type === "captive"); return c.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0] ?? null; }
      if (o.type === "kill" || o.type === "boss" || o.type === "survive") return null;
      return this.pts[0] ?? null;
    }
    if (this.kind === "dom") { const p = this.g.player; return this.flags.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).find((f) => f.owner !== 0) ?? null; }
    return null;
  }
  markers(): { x: number; z: number; c: string }[] {
    if (this.kind === "campaign" || this.kind === "tutorial") {
      if (this.objDone || this.g.cut) return [];
      const o = this.mission?.objectives[this.oi];
      if (o?.type === "rescue") return this.g.interacts.filter((i) => !i.used && i.type === "captive").map((i) => ({ x: i.x, z: i.z, c: "#3a9aff" }));
      if (o?.type === "kill" || o?.type === "boss" || o?.type === "survive") return [];
      return this.pts.map((p) => ({ ...p, c: "#ffd23a" }));
    }
    return [];
  }
  flagPoints() { return this.flags.map((f) => ({ x: f.x, z: f.z, owner: f.owner, n: f.name })); }

  fillHud(h: HudState) {
    const g = this.g; h.mode = this.kind; h.stealth = !!this.mission?.stealth && !this.detected; h.hint = null; h.boss = null; h.flags = []; h.wave = 0; h.timer = ""; h.scoreA = h.scoreB = h.scoreLimit = 0; h.objProg = "";
    const p = g.player;
    if (this.kind === "campaign" || this.kind === "tutorial") {
      const o = this.mission?.objectives[this.oi]; h.objective = this.objText || o?.text || "";
      if (o) {
        if (o.type === "kill") h.objProg = `${Math.min(this.okills, o.n ?? 0)}/${o.n}`;
        if (o.type === "survive") h.objProg = fmtTime((o.seconds ?? 0) - this.ot);
        if (o.type === "rescue") h.objProg = `${this.rescued}/${o.n}`;
        if (o.type === "tut" && !this.objDone) {
          if (o.tut === "shoot") h.objProg = `${Math.min(this.tut.kills, o.n ?? 4)}/${o.n}`;
          if (o.tut === "ads") h.objProg = `${Math.min(this.tut.adsKills, o.n ?? 2)}/${o.n}`;
          if (o.tut === "look") h.objProg = `${Math.min(100, Math.round((this.tut.look / (o.n ?? 160)) * 100))}%`;
          if (o.tut === "sprint") h.objProg = `${Math.min(o.seconds ?? 3, this.tut.sprintT).toFixed(0)}/${o.seconds}s`;
          h.hint = o.hint ?? null;
        }
        if (o.type === "destroy" && this.objProps[0]) h.objProg = `${Math.max(0, Math.round((this.objProps[0].hp / this.objProps[0].maxHp) * 100))}%`;
        if (o.type === "boss" && this.boss?.alive) h.boss = { name: this.boss.name, p: this.boss.hp / this.boss.maxHp };
      }
      h.timer = fmtTime(g.matchTime);
    } else if (this.kind === "dm") {
      h.objective = `Deathmatch — primeiro a ${this.limit}`; h.scoreA = this.dm.get(0) ?? 0; h.scoreB = Math.max(0, ...[...this.dm.entries()].filter(([k]) => k !== 0).map(([, v]) => v)); h.scoreLimit = this.limit; h.timer = fmtTime(this.timeLeft);
    } else if (this.kind === "tdm") { h.objective = "Team Deathmatch"; h.scoreA = this.score[0]; h.scoreB = this.score[1]; h.scoreLimit = this.limit; h.timer = fmtTime(this.timeLeft); }
    else if (this.kind === "dom") { h.objective = "Capture os pontos A, B e C"; h.scoreA = this.score[0]; h.scoreB = this.score[1]; h.scoreLimit = this.limit; h.timer = fmtTime(this.timeLeft); h.flags = this.flags.map((f) => ({ n: f.name, owner: f.owner, p: f.cap })); }
    else if (this.kind === "survival") { h.objective = this.waveActive ? `Onda ${this.wave} — elimine os inimigos` : `Próxima onda em ${Math.ceil(this.waveBreak)}s`; h.wave = this.wave; h.objProg = this.waveActive ? `${g.aliveBots((b) => b.team === 1).length + this.waveToSpawn} restantes` : ""; h.timer = fmtTime(g.matchTime); }
    else if (this.kind === "training") { h.objective = "Treino livre — use o menu de pausa para sair"; h.timer = fmtTime(g.matchTime); }
    else if (this.kind === "challenge" && this.challenge) {
      const c = this.challenge; h.objective = c.desc; h.timer = fmtTime(this.timeLeft);
      h.objProg = c.goal === "kills" ? `${this.chKills}/${c.n}` : c.goal === "headshots" ? `${this.chHeads}/${c.n}` : `Onda ${this.wave}/${c.n}`;
    }
    void p;
  }

  // ------------------------------------------------------------------ results
  rank(): string {
    const g = this.g; const m = this.mission; if (!m) return "C";
    const st = g.stats; const acc = st.shots ? st.hits / st.shots : 0; const hsr = st.kills ? st.headshots / st.kills : 0;
    const pts = Math.min(acc / 0.45, 1) * 30 + clamp(m.par / Math.max(30, g.matchTime), 0, 1) * 25 + Math.max(0, 25 - st.deaths * 9) + Math.min(hsr / 0.35, 1) * 20 + (this.detected ? 0 : this.mission?.stealth ? 5 : 0);
    return pts >= 85 ? "S" : pts >= 70 ? "A" : pts >= 55 ? "B" : pts >= 40 ? "C" : "D";
  }
  buildResult(win: boolean, title?: string, sub?: string): MatchResult {
    const g = this.g; const st = g.stats; const save = g.save; const extra: string[] = [];
    let xp = st.kills * 10 + st.headshots * 5 + st.objectives * 50; let credits = st.kills * 4; let rank: string | undefined;
    const kind = this.kind; let score = st.score;
    if ((kind === "campaign" || kind === "tutorial") && this.mission) {
      const m = this.mission;
      if (win) {
        rank = kind === "campaign" ? this.rank() : "A"; const mult = { S: 1.5, A: 1.25, B: 1, C: 0.8, D: 0.6 }[rank] ?? 1;
        const first = kind === "campaign" ? !save.campaign[m.id] : !save.tutorialDone;
        xp += Math.round(m.xp * mult); credits += Math.round(m.credits * mult * (first ? 1 : 0.5));
        if (!first) extra.push("Missão repetida: recompensa de créditos reduzida");
        if (this.detected) extra.push("Furtividade perdida");
        score += Math.round(m.par * 3) + (rank === "S" ? 2000 : rank === "A" ? 1200 : 600);
      } else { xp = Math.round(xp * 0.5); credits = Math.round(credits * 0.5); }
      extra.push(`Objetivos concluídos: ${st.objectives}/${m.objectives.length}`);
    } else if (kind === "challenge" && this.challenge) {
      const c = this.challenge; if (win) { const first = !save.challenges[c.id]?.done; xp += c.xp; credits += Math.round(c.reward * (first ? 1 : 0.3)); if (!first) extra.push("Desafio repetido: recompensa reduzida"); }
      score = Math.max(score, this.chKills * 100 + this.chHeads * 150 + this.wave * 300);
    } else if (kind === "training") { xp = Math.min(60, st.kills * 2); credits = 0; }
    else { xp += win ? 150 : 40; credits += win ? 150 : 30; if (kind === "survival") { xp += this.wave * 30; credits += this.wave * 25; extra.push(`Onda alcançada: ${this.wave}`); } }
    const lv = levelInfo(save.xp).level; void lv;
    return {
      win, kind, title: title ?? (win ? "MISSÃO CONCLUÍDA" : "MISSÃO FALHOU"), sub: sub ?? this.mission?.name ?? "", kills: st.kills, deaths: st.deaths, assists: st.assists,
      accuracy: st.shots ? st.hits / st.shots : 0, headshots: st.headshots, time: g.matchTime, xp, credits, rank, score, missionId: this.mission?.id || undefined, challengeId: this.challenge?.id,
      shots: st.shots, hits: st.hits, weaponKills: st.weaponKills, extra,
    };
  }
}
export { BOT_NAMES };
