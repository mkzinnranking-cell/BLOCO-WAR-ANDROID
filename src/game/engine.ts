import * as THREE from "three";
import { audio } from "./audio";
import { computeStats, getWeapon, type EffStats, type WeaponDef } from "./data/weapons";
import { COS_MAP } from "./data/cosmetics";
import { MAP_MAP } from "./data/maps";
import { Bot, BOT_NAMES, PART_MULT, rayBox, type Actor, type Part } from "./entities/bots";
import { FX } from "./gfx/fx";
import { buildGrenadeModel, makeRig, mats, STYLE_FROM_COS, VB, type Rig } from "./gfx/models";
import { ViewModel } from "./gfx/viewmodel";
import { ModeCtl } from "./modes";
import { detectQuality } from "./save";
import type { EnemyKind, Equipment, GrenadeType, MatchConfig, MatchResult, QualityId, SaveData } from "./types";
import { angDiff, clamp, lerp, nextFrame, TAU } from "./util";
import { World, type Body, type Prop, type RayHit } from "./world/world";

// ------------------------------------------------------------------ public types
export interface Input {
  moveX: number; moveY: number; lookDX: number; lookDY: number;
  fire: boolean; ads: boolean; sprint: boolean;
  jump: boolean; reload: boolean; sw: boolean; melee: boolean; grenade: boolean; interact: boolean; ability: boolean;
}
export const newInput = (): Input => ({ moveX: 0, moveY: 0, lookDX: 0, lookDY: 0, fire: false, ads: false, sprint: false, jump: false, reload: false, sw: false, melee: false, grenade: false, interact: false, ability: false });

export interface HudState {
  hp: number; armor: number; ammo: number; reserve: number; wname: string; wcat: string; reloadP: number; grenades: number; gtype: GrenadeType;
  objective: string; objProg: string; timer: string; scoreA: number; scoreB: number; scoreLimit: number; mode: string; spread: number; ads: number; scoped: boolean;
  prompt: string | null; promptP: number; abilityCd: number; abilityName: string; fps: number; quality: string; hint: string | null;
  flags: { n: string; owner: number; p: number }[]; wave: number; stealth: boolean; prot: boolean; dead: boolean; respawnIn: number; sprintOn: boolean;
  cut: { who: string; text: string } | null; dialog: { who: string; text: string } | null; kills: number; hs: number; acc: number; canInteract: boolean;
  flashAmt: number; markerAng: number; markerDist: number; hasMarker: boolean; night: boolean; radar: boolean; ended: boolean; infAmmo: boolean; lowHp: boolean; boss: { name: string; p: number } | null;
}

export type GEvent =
  | { t: "hit"; head: boolean; kill: boolean }
  | { t: "dmg"; ang: number }
  | { t: "feed"; killer: string; victim: string; weapon: string; head: boolean; kt: number; vt: number; me: boolean }
  | { t: "banner"; text: string; sub?: string; kind?: "obj" | "info" | "alert" }
  | { t: "end"; result: MatchResult }
  | { t: "death"; checkpoint: boolean; respawn: boolean }
  | { t: "xp"; amount: number; why: string };

export interface Stats { kills: number; deaths: number; shots: number; hits: number; headshots: number; assists: number; weaponKills: Record<string, number>; score: number; objectives: number }

class WS { def: WeaponDef; st: EffStats; att: string[]; ammo: number; reserve: number; id: string;
  constructor(id: string, att: string[]) { this.id = id; this.def = getWeapon(id); this.att = att; this.st = computeStats(this.def, att); this.ammo = this.st.mag; this.reserve = this.st.reserve; } }

export class PlayerActor implements Actor, Body {
  id = 0; team = 0; isPlayer = true; alive = true; name = "Você";
  x = 0; y = 0; z = 0; vx = 0; vy = 0; vz = 0; onGround = true;
  yaw = 0; pitch = 0; hp = 100; armor = 0; maxHp = 100; prot = 0;
}
interface Grenade { type: GrenadeType; b: Body; mesh: THREE.Group; fuse: number; owner: Actor; spin: number; rocket?: boolean; dir?: THREE.Vector3; dmg?: number }
interface Pickup { x: number; z: number; type: "ammo" | "health" | "armor"; mesh: THREE.Object3D; t: number; respawn: number; active: boolean }
export interface Interact { id: number; type: "intel" | "captive" | "console" | "crate"; x: number; z: number; label: string; used: boolean; bot?: Bot; mesh?: THREE.Object3D }

const QP: Record<QualityId, { pr: number; shadow: number; fog: number; particles: number; maxBots: number; aa: boolean; rain: number; barrels: number; trees: number }> = {
  low: { pr: 1, shadow: 0, fog: 0.7, particles: 160, maxBots: 8, aa: false, rain: 0.35, barrels: 6, trees: 0.5 },
  med: { pr: 1.3, shadow: 1024, fog: 0.9, particles: 340, maxBots: 12, aa: true, rain: 0.7, barrels: 10, trees: 0.8 },
  high: { pr: 2, shadow: 2048, fog: 1, particles: 600, maxBots: 16, aa: true, rain: 1, barrels: 14, trees: 1 },
};
const EYE = 1.65;

export class Game {
  canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(75, 1, 0.05, 320);
  vm = new ViewModel(); world!: World; fx!: FX; audio = audio; save: SaveData; cfg!: MatchConfig;
  input = newInput(); player = new PlayerActor(); bots: Bot[] = []; mode!: ModeCtl;
  hud: HudState; stats: Stats = { kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, assists: 0, weaponKills: {}, score: 0, objectives: 0 };
  listeners = new Set<(e: GEvent) => void>();
  paused = true; ended = false; running = false; disposed = false; night = false; time = 0; matchTime = 0;
  pathBudget = 2; nextId = 1;
  quality: QualityId = "med"; resScale = 1; autoRes = false; fpsAcc = 0; fpsN = 0; fps = 60; lastT = 0; frameAcc = 0;
  ws: WS[] = []; cur = 0; meleeWS!: WS; gType: GrenadeType = "frag"; gCount = 3; equipment: Equipment = "medkit";
  cd = 0; reloadT = -1; reloadDur = 1; swT = -1; swTarget = 0; meleeT = -1; meleeHit = false; throwT = -1; throwDone = false; triggerHeld = false; interacting = -1;
  recoilBloom = 0; kickPitch = 0; kickYaw = 0; shake = 0; camRoll = 0; adsT = 0; stepD = 0; bobT = 0; flashAmt = 0; adrenT = 0; healT = 0; radarT = 0; abilityCd = 0; regenT = 0; hurtT = 99;
  grenades: Grenade[] = []; smokes: { x: number; y: number; z: number; r: number; t: number; e: number }[] = []; pickups: Pickup[] = []; interacts: Interact[] = []; pending: { t: number; x: number; y: number; z: number; r: number; d: number; owner: Actor | null }[] = [];
  beacons: THREE.Mesh[] = []; sun!: THREE.DirectionalLight; hemi!: THREE.HemisphereLight; flash!: THREE.SpotLight; sky!: THREE.Mesh;
  respawnT = 0; cutRig: Rig | null = null; cut: { lines: { who: string; text: string }[]; i: number; t: number; done: () => void } | null = null;
  dlgQ: { who: string; text: string; t: number }[] = []; dlgCur: { who: string; text: string; t: number } | null = null;
  tmpHit: RayHit = { t: 0, nx: 0, ny: 0, nz: 0, c: null };
  private qp = QP.med; private raf = 0;

  constructor(canvas: HTMLCanvasElement, save: SaveData) {
    this.canvas = canvas; this.save = save;
    const q = save.settings.quality === "auto" ? detectQuality() : save.settings.quality;
    this.quality = q; this.qp = QP[q]; this.autoRes = save.settings.quality === "auto";
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.qp.aa, powerPreference: "high-performance", alpha: false });
    this.renderer.autoClear = false; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x000000);
    this.hud = this.blankHud();
    this.vm.scene.add(new THREE.Group());
  }
  blankHud(): HudState {
    return { hp: 100, armor: 0, ammo: 0, reserve: 0, wname: "", wcat: "", reloadP: -1, grenades: 0, gtype: "frag", objective: "", objProg: "", timer: "", scoreA: 0, scoreB: 0, scoreLimit: 0, mode: "", spread: 0, ads: 0, scoped: false, prompt: null, promptP: 0, abilityCd: 0, abilityName: "", fps: 60, quality: "", hint: null, flags: [], wave: 0, stealth: false, prot: false, dead: false, respawnIn: 0, sprintOn: false, cut: null, dialog: null, kills: 0, hs: 0, acc: 0, canInteract: false, flashAmt: 0, markerAng: 0, markerDist: 0, hasMarker: false, night: false, radar: false, ended: false, infAmmo: false, lowHp: false, boss: null };
  }
  on(fn: (e: GEvent) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit(e: GEvent) { this.listeners.forEach((f) => f(e)); }
  get settings() { return this.save.settings; }
  banner(text: string, sub?: string, kind: "obj" | "info" | "alert" = "info") { this.emit({ t: "banner", text, sub, kind }); }
  xp(amount: number, why: string) { this.emit({ t: "xp", amount, why }); }
  actors(): Actor[] { const a: Actor[] = [this.player]; for (const b of this.bots) if (b.alive) a.push(b); return a; }
  vib(ms: number) { const v = this.settings.vibration; if (v > 0 && navigator.vibrate) { try { navigator.vibrate(Math.round(ms * v)); } catch { /* */ } } }

  // ------------------------------------------------------------------ setup
  async start(cfg: MatchConfig, progress: (p: number, label: string) => void) {
    this.cfg = cfg; const def = MAP_MAP[cfg.mapId] ?? MAP_MAP.base; this.night = def.night;
    progress(0.02, "Iniciando motor gráfico");
    await nextFrame();
    const qp = this.qp; const s = this.settings;
    // renderer / light
    this.renderer.shadowMap.enabled = qp.shadow > 0 && s.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.Fog(def.fog, 8, def.fogFar * qp.fog * s.viewDist);
    this.camera.far = def.fogFar * qp.fog * s.viewDist + 60; this.camera.updateProjectionMatrix();
    this.hemi = new THREE.HemisphereLight(new THREE.Color(def.sky[0]).lerp(new THREE.Color("#ffffff"), 0.4), new THREE.Color(def.ground).multiplyScalar(0.6), def.amb * 1.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(def.sun, def.sunI * 1.5);
    this.sun.castShadow = this.renderer.shadowMap.enabled;
    if (this.sun.castShadow) { const sh = this.sun.shadow; sh.mapSize.set(qp.shadow, qp.shadow); const e = this.quality === "low" ? 20 : 30; sh.camera.left = -e; sh.camera.right = e; sh.camera.top = e; sh.camera.bottom = -e; sh.camera.near = 1; sh.camera.far = 140; sh.bias = -0.0006; sh.normalBias = 0.04; }
    this.scene.add(this.sun, this.sun.target);
    this.flash = new THREE.SpotLight(0xfff0d0, def.night ? 90 : 0, 38, 0.55, 0.5, 1.2); this.flash.position.set(0, 0, 0); this.flash.target.position.set(0, 0, -1);
    this.camera.add(this.flash, this.flash.target); this.scene.add(this.camera);
    this.sky = this.makeSky(def.sky[0], def.sky[1], def.sun, def.night); this.sky.scale.setScalar((this.camera.far * 0.85) / 280); this.scene.add(this.sky);
    // world
    this.world = new World(def);
    await this.world.build({ treeMul: qp.trees, barrels: qp.barrels, progress: async (p, l) => { progress(0.05 + p * 0.7, l); await nextFrame(); } });
    this.scene.add(this.world.group);
    this.fx = new FX(this.scene, Math.round(qp.particles * s.particles) + 40); this.fx.fogColor.set(def.fog);
    if (def.rain && s.effects) this.fx.setRain(true, qp.rain);
    // beacons
    const bm = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 40, 0.5), bm); m.visible = false; this.beacons.push(m); this.scene.add(m); }
    progress(0.78, "Carregando modelos de personagens");
    await nextFrame();
    const kinds: EnemyKind[] = ["grunt", "smg", "shotgun", "sniper", "heavy", "commander", "dummy"];
    for (let i = 0; i < kinds.length; i++) { new Bot(-1, kinds[i], 1, cfg.difficulty, "x", 0); if (i % 3 === 0) await nextFrame(); }
    progress(0.86, "Montando arsenal");
    // player & weapons
    this.setupLoadout();
    const hero = makeRig(STYLE_FROM_COS(this.save.cosmetics), this.ws[0].id, this.save.cosmetics.camo); hero.root.visible = false; this.cutRig = hero; this.scene.add(hero.root);
    audio.init(); audio.setVols(this.settings); audio.ambience(def.ambience, def.rain); audio.music("combat");
    progress(0.92, "Compilando shaders");
    this.resize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight);
    this.mode = new ModeCtl(this);
    this.mode.init();
    this.updateCamera(0);
    try { this.renderer.compile(this.scene, this.camera); } catch { /* */ }
    this.renderer.render(this.scene, this.camera);
    progress(1, "Pronto");
    await nextFrame();
    this.running = true; this.paused = false; this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setupLoadout() {
    const lo = this.save.loadout; const att = this.save.attach;
    let p = lo.primary, sec = lo.secondary;
    if (this.cfg.kind === "tutorial") { p = "falcon"; sec = "p9"; }
    const forced = this.mode?.forcedWeapon?.();
    if (forced) { p = forced; sec = forced; }
    this.ws = [new WS(p, Object.values(att[p] ?? {})), new WS(sec, Object.values(att[sec] ?? {}))];
    this.meleeWS = new WS(lo.melee, []);
    this.cur = 0; this.gType = lo.grenade; this.gCount = this.cfg.kind === "tutorial" ? 9 : 3; this.equipment = lo.equipment;
    this.vm.setWeapon(this.ws[0].id, this.save.cosmetics, this.ws[0].att);
  }

  makeSky(top: string, bot: string, sun: string, night: boolean) {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(top) }, bot: { value: new THREE.Color(bot) }, sun: { value: new THREE.Color(sun) }, sd: { value: new THREE.Vector3(0.5, 0.6, -0.4).normalize() }, night: { value: night ? 1 : 0 } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 top; uniform vec3 bot; uniform vec3 sun; uniform vec3 sd; uniform float night; varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = clamp(d.y*1.6+0.1,0.0,1.0); vec3 c = mix(bot, top, pow(h,0.8)); float s = max(dot(d, sd),0.0); c += sun * (pow(s,600.0)*3.0 + pow(s,12.0)*0.25) * (1.0-night*0.4); if(night>0.5){ vec3 q = floor(d*60.0); float r = fract(sin(dot(q,vec3(12.9898,78.233,37.719)))*43758.5453); c += vec3(step(0.995,r))*smoothstep(0.1,0.5,d.y)*0.8; } gl_FragColor = vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}",
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 14), mat); m.renderOrder = -10; m.frustumCulled = false; return m;
  }

  resize(w: number, h: number) {
    if (this.disposed) return;
    const pr = Math.min(window.devicePixelRatio || 1, this.qp.pr) * this.resScale;
    this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.vm.resize(w / Math.max(1, h));
  }

  // ------------------------------------------------------------------ loop
  loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const cap = this.settings.fpsCap;
    const minDt = cap >= 120 ? 0 : 1000 / cap - 2;
    if (now - this.lastT < minDt) return;
    let dt = (now - this.lastT) / 1000; this.lastT = now; dt = Math.min(dt, 0.05);
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 1) {
      this.fps = Math.round(this.fpsN / this.fpsAcc);
      if (this.autoRes && !this.paused) {
        const target = Math.min(60, cap);
        if (this.fps < target * 0.72 && this.resScale > 0.55) { this.resScale = Math.max(0.55, this.resScale - 0.1); this.resize(this.canvas.clientWidth, this.canvas.clientHeight); }
        else if (this.fps > target * 0.95 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); this.resize(this.canvas.clientWidth, this.canvas.clientHeight); }
      }
      this.fpsAcc = 0; this.fpsN = 0;
    }
    if (!this.paused) this.update(dt);
    this.render();
  };

  render() {
    const r = this.renderer;
    r.clear();
    this.sky.position.copy(this.camera.position);
    r.render(this.scene, this.camera);
    if (!this.hud.scoped && this.player.alive && !this.cut) { r.clearDepth(); r.render(this.vm.scene, this.vm.cam); }
  }

  update(dt: number) {
    this.time += dt; this.pathBudget = 3;
    const p = this.player;
    if (this.cut) { this.updateCutscene(dt); this.fx.update(dt, this.camera.position.x, this.camera.position.y, this.camera.position.z); this.syncHud(); return; }
    if (!this.ended) this.matchTime += dt;
    this.updateDialog(dt);
    if (p.alive && !this.ended) this.updatePlayer(dt); else { this.input.lookDX = this.input.lookDY = 0; this.clearPulses(); if (!p.alive) this.respawnTick(dt); }
    for (let i = this.bots.length - 1; i >= 0; i--) {
      const b = this.bots[i];
      if (!this.ended || !b.alive) b.update(dt, this);
      if (b.gone) { this.scene.remove(b.rig.root); this.bots.splice(i, 1); }
    }
    this.updateGrenades(dt); this.updatePickups(dt); this.updateSmokes(dt);
    for (let i = this.pending.length - 1; i >= 0; i--) { const e = this.pending[i]; e.t -= dt; if (e.t <= 0) { this.pending.splice(i, 1); this.explode(e.x, e.y, e.z, e.r, e.d, e.owner, "barrel"); } }
    for (const pr of this.world.props) if (pr.dead && pr.kind !== "barrel" && Math.random() < dt * 8) this.fx.fire(pr.x, 0.6 + Math.random() * 0.5, pr.z);
    if (!this.ended) this.mode.update(dt);
    this.updateCamera(dt);
    this.fx.update(dt, this.camera.position.x, this.camera.position.y, this.camera.position.z);
    audio.listener(p.x, p.y + EYE, p.z, p.yaw);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 0.35);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    this.syncHud();
  }

  clearPulses() { const i = this.input; i.jump = i.reload = i.sw = i.melee = i.grenade = i.interact = i.ability = false; }

  // ------------------------------------------------------------------ player
  get w(): WS { return this.ws[this.cur]; }
  updatePlayer(dt: number) {
    const p = this.player; const inp = this.input; const s = this.settings; const w = this.w;
    p.prot = Math.max(0, p.prot - dt); this.hurtT += dt;
    this.adrenT = Math.max(0, this.adrenT - dt); this.radarT = Math.max(0, this.radarT - dt);
    // look
    const adsK = lerp(1, s.adsSens / Math.sqrt(w.st.zoom), this.adsT);
    let k = 0.0042 * s.sens * adsK; let kAssist = 1;
    if (s.aimAssist > 0 && (inp.fire || this.adsT > 0.3)) { const a = this.aimAssist(dt); kAssist = a; }
    let dx = inp.lookDX * k * kAssist, dy = inp.lookDY * k * kAssist; inp.lookDX = inp.lookDY = 0;
    const lookDXpx = dx / (k || 1), lookDYpx = dy / (k || 1);
    p.yaw -= dx; p.pitch = clamp(p.pitch - dy * (s.invertY ? -1 : 1), -1.5, 1.5);
    this.mode.onLook(Math.abs(dx) + Math.abs(dy));
    // recoil recovery of visual kick
    this.kickPitch *= Math.max(0, 1 - dt * 9); this.kickYaw *= Math.max(0, 1 - dt * 9);
    this.recoilBloom = Math.max(0, this.recoilBloom - dt * 5);
    // ads
    const wantAds = inp.ads && this.reloadT < 0 && this.swT < 0 && this.meleeT < 0 && this.throwT < 0 && w.def.cat !== "melee";
    const adsRate = 1 / Math.max(0.06, w.st.adsTime);
    this.adsT = clamp(this.adsT + (wantAds ? adsRate : -adsRate * 1.4) * dt, 0, 1);
    if (!wantAds && inp.ads && (this.reloadT >= 0 || this.swT >= 0)) { /* keep toggle but visually off */ }
    // movement
    let mx = inp.moveX, my = inp.moveY; const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const moving = ml > 0.12;
    if (!moving || this.adsT > 0.5 || this.meleeT >= 0) inp.sprint = inp.sprint && moving && this.adsT < 0.5;
    if (inp.fire && inp.sprint) inp.sprint = false;
    if (my < -0.3) inp.sprint = false;
    const sprinting = inp.sprint && moving && my > 0.2;
    const base = sprinting ? 7.4 : 5.0;
    let spd = base * w.st.move * lerp(1, 0.55, this.adsT) * (this.adrenT > 0 ? 1.3 : 1);
    if (this.reloadT >= 0 && w.def.cat === "lmg") spd *= 0.8;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const tvx = (fx * my + rx * mx) * spd, tvz = (fz * my + rz * mx) * spd;
    const ac = Math.min(1, dt * (p.onGround ? 11 : 2.5));
    p.vx += (tvx - p.vx) * ac; p.vz += (tvz - p.vz) * ac;
    if (inp.jump && p.onGround) { p.vy = 7.3; this.mode.onJump(); }
    inp.jump = false;
    const wasGround = p.onGround; const vyPrev = p.vy;
    this.world.moveBody(p, 0.34, 1.8, dt);
    if (!wasGround && p.onGround && vyPrev < -6) { this.shake = Math.max(this.shake, 0.15); audio.step(undefined, true); }
    const sp = Math.hypot(p.vx, p.vz);
    this.mode.onMove(sp * dt, sprinting, dt);
    if (p.onGround && sp > 1) { this.stepD += sp * dt; if (this.stepD > (sprinting ? 2.0 : 2.5)) { this.stepD = 0; audio.step(undefined, sprinting); } }
    this.bobT += dt * sp;
    // weapons
    this.cd = Math.max(0, this.cd - dt);
    this.updateWeapons(dt, sprinting, moving);
    // regen
    if (this.hurtT > 5 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 6 * dt);
    if (this.healT > 0) { const h = Math.min(this.healT, dt); p.hp = Math.min(p.maxHp, p.hp + 20 * h); this.healT -= h; }
    // interact
    this.updateInteract(dt);
    // ability
    if (inp.ability) { inp.ability = false; this.useAbility(); }
    // vm
    const vmS = { ads: this.adsT, moving: moving ? Math.min(1, sp / 5) : 0, sprint: sprinting, reload: this.reloadT >= 0 ? clamp(this.reloadT / this.reloadDur, 0, 1) : -1, sw: this.swT >= 0 ? clamp(this.swT / 0.45, 0, 1) : -1, melee: this.meleeT >= 0 ? clamp(this.meleeT / 0.35, 0, 1) : -1, throwP: this.throwT >= 0 ? clamp(this.throwT / 0.7, 0, 1) : -1, onGround: p.onGround, dt, time: this.time };
    this.vm.update(vmS, lookDXpx, lookDYpx);
    this.camRoll += (-mx * 0.012 - this.camRoll) * Math.min(1, dt * 6);
    this.sprintOn = sprinting;
  }
  sprintOn = false;

  aimAssist(dt: number): number {
    const p = this.player; const s = this.settings.aimAssist; let best: Bot | null = null; let bd = 0.12;
    const fx = -Math.sin(p.yaw) * Math.cos(p.pitch), fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * Math.cos(p.pitch);
    for (const b of this.bots) {
      if (!b.alive || b.team === p.team || b.kind === "dummy" && false) continue;
      const dx = b.x - p.x, dy = b.y + 1.3 - (p.y + EYE), dz = b.z - p.z; const d = Math.hypot(dx, dy, dz); if (d > 45 || d < 1) continue;
      const dot = (dx * fx + dy * fy + dz * fz) / d; const ang = Math.acos(clamp(dot, -1, 1));
      if (ang < bd && this.world.los(p.x, p.y + EYE, p.z, b.x, b.y + 1.3, b.z)) { bd = ang; best = b; }
    }
    if (!best) return 1;
    const dx = best.x - p.x, dy = best.y + 1.35 - (p.y + EYE), dz = best.z - p.z;
    const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz));
    const pull = s * 2.2 * dt * (bd < 0.05 ? 1 : 0.5);
    p.yaw += angDiff(p.yaw, ty) * pull; p.pitch += (tp - p.pitch) * pull;
    return 1 - s * 0.4;
  }

  updateWeapons(dt: number, sprinting: boolean, moving: boolean) {
    const inp = this.input; const w = this.w;
    // switching
    if (inp.sw && this.swT < 0 && this.reloadT < 0 && this.throwT < 0 && this.meleeT < 0) { inp.sw = false; this.swT = 0; this.swTarget = 1 - this.cur; audio.reload(1); this.mode.onSwitch(); }
    inp.sw = false;
    if (this.swT >= 0) {
      const prev = this.swT; this.swT += dt;
      if (prev < 0.225 && this.swT >= 0.225) { this.cur = this.swTarget; this.vm.setWeapon(this.w.id, this.save.cosmetics, this.w.att); this.vm.showGrenade(null); audio.reload(0); }
      if (this.swT >= 0.45) this.swT = -1;
    }
    // reload
    if (inp.reload) { inp.reload = false; this.startReload(); }
    if (this.reloadT >= 0) {
      const prev = this.reloadT; this.reloadT += dt; const d = this.reloadDur;
      if (prev < d * 0.15 && this.reloadT >= d * 0.15) audio.reload(0);
      if (prev < d * 0.5 && this.reloadT >= d * 0.5) audio.reload(1);
      if (this.reloadT >= d) { this.reloadT = -1; this.finishReload(); audio.reload(2); }
    }
    // melee
    if (inp.melee && this.meleeT < 0 && this.throwT < 0 && this.reloadT < 0 && this.swT < 0) { inp.melee = false; this.startMelee(); }
    inp.melee = false;
    if (this.meleeT >= 0) {
      this.meleeT += dt;
      if (!this.meleeHit && this.meleeT > 0.14) { this.meleeHit = true; this.doMelee(); }
      if (this.meleeT >= 0.35) { this.meleeT = -1; this.vm.setWeapon(this.w.id, this.save.cosmetics, this.w.att); }
    }
    // grenade
    if (inp.grenade && this.throwT < 0 && this.meleeT < 0 && this.swT < 0 && (this.gCount > 0)) { inp.grenade = false; this.throwT = 0; this.throwDone = false; this.reloadT = -1; this.vm.showGrenade(this.gType); audio.whoosh(); }
    inp.grenade = false;
    if (this.throwT >= 0) {
      this.throwT += dt;
      if (!this.throwDone && this.throwT > 0.38) { this.throwDone = true; this.throwPlayerGrenade(); }
      if (this.throwT >= 0.7) { this.throwT = -1; this.vm.showGrenade(null); }
    }
    // fire
    const busy = this.reloadT >= 0 || this.swT >= 0 || this.meleeT >= 0 || this.throwT >= 0 || sprinting;
    if (inp.fire && !busy && w.def.cat !== "melee") {
      if (w.st.auto || !this.triggerHeld) this.tryFire();
      this.triggerHeld = true;
    } else if (!inp.fire) this.triggerHeld = false;
    if (inp.fire && w.def.cat === "melee" && this.meleeT < 0 && !this.triggerHeld) { this.triggerHeld = true; this.startMelee(); }
    void moving;
  }

  get infAmmo() { return this.cfg.kind === "training" || this.cfg.kind === "tutorial"; }
  startReload() {
    const w = this.w;
    if (w.def.cat === "melee" || this.reloadT >= 0 || this.swT >= 0 || this.throwT >= 0) return;
    if (w.ammo >= w.st.mag || (w.reserve <= 0 && !this.infAmmo)) return;
    this.reloadT = 0; this.reloadDur = w.st.reload; this.input.sprint = false; this.mode.onReload();
  }
  finishReload() {
    const w = this.w; const need = w.st.mag - w.ammo; const take = this.infAmmo ? need : Math.min(need, w.reserve);
    w.ammo += take; if (!this.infAmmo) w.reserve -= take;
  }
  tryFire() {
    const w = this.w;
    if (this.cd > 0) return;
    if (w.ammo <= 0) { audio.empty(); this.cd = 0.25; if (w.reserve > 0 || this.infAmmo) this.startReload(); return; }
    this.cd = 60 / w.st.rpm; w.ammo--; this.stats.shots += w.st.pellets > 1 ? 1 : 1;
    const p = this.player; const st = w.st;
    const moving = Math.hypot(p.vx, p.vz) > 1.5;
    const spreadDeg = (lerp(st.spread, st.adsSpread, this.adsT) * (moving ? 1.35 : 1) * (p.onGround ? 1 : 2) + this.recoilBloom * st.recoil * 0.25);
    const ox = p.x, oy = p.y + EYE, oz = p.z;
    const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const upx = -Math.sin(p.yaw) * -Math.sin(p.pitch), upy = Math.cos(p.pitch), upz = -Math.cos(p.yaw) * -Math.sin(p.pitch);
    const mz = this.muzzleWorld();
    const tracerCol = COS_MAP[this.save.cosmetics.tracer]?.c ?? "#ffd36b";
    let anyHit = false, anyHead = false, anyKill = false;
    if (w.def.projectile) {
      this.spawnRocket(ox + fx * 0.8, oy + fy * 0.8 - 0.1, oz + fz * 0.8, fx, fy, fz, st.dmg);
      audio.shot("launcher", 1); this.fx.smoke(mz.x, mz.y, mz.z, 6, 1.2, 0xaaaaaa, 1.2);
    } else {
      for (let i = 0; i < st.pellets; i++) {
        const sa = (spreadDeg * Math.PI) / 180; const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * Math.tan(sa);
        let dx = fx + (rx * Math.cos(a) + upx * Math.sin(a)) * r, dy = fy + upy * Math.sin(a) * r, dz = fz + (rz * Math.cos(a) + upz * Math.sin(a)) * r;
        const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        const h = this.castRay(ox, oy, oz, dx, dy, dz, st.maxRange, p);
        const ex = ox + dx * h.t, ey = oy + dy * h.t, ez = oz + dz * h.t;
        if (i < 3) this.fx.tracer(mz.x, mz.y, mz.z, ex, ey, ez, tracerCol, 0.02);
        if (h.actor) {
          const head = h.part === "head"; const fall = h.t <= st.range ? 1 : Math.max(0.35, 1 - ((h.t - st.range) / Math.max(1, st.maxRange - st.range)) * 0.65);
          const dmg = st.dmg * fall * (head ? st.head : PART_MULT[h.part!]);
          const killed = this.damageActor(h.actor, dmg, head, p, w.id, dx, dz);
          anyHit = true; anyHead = anyHead || head; anyKill = anyKill || killed;
        } else if (h.prop) { anyHit = true; this.damageProp(h.prop, st.dmg * st.pellets > 1 ? st.dmg * 1.5 : st.dmg, p); this.fx.sparks(ex, ey, ez, h.nx, h.ny, h.nz, 4); }
        else if (h.t < st.maxRange - 0.1) {
          this.fx.sparks(ex, ey, ez, h.nx, h.ny, h.nz, 3); this.fx.decal(ex, ey, ez, h.nx, h.ny, h.nz); if (Math.random() < 0.6) this.fx.dust(ex, ey, ez, 1);
          if (i === 0) audio.impact({ x: ex, y: ey, z: ez });
        }
      }
      audio.shot(w.def.snd, st.noise); this.noise(p.x, p.z, 60 * st.noise, p.team);
    }
    if (anyHit) { this.stats.hits++; this.mode.onPlayerHit(anyHead, anyKill, w.id, this.adsT); this.emit({ t: "hit", head: anyHead, kill: anyKill }); if (this.settings.hitmarker) audio.hit(anyHead, anyKill); this.vib(anyKill ? 25 : 10); }
    // recoil
    const kick = st.recoil * (0.5 + Math.random() * 0.5) * (1 - this.adsT * 0.3) * 0.0105;
    p.pitch = clamp(p.pitch + kick, -1.5, 1.5); this.kickPitch += kick * 0.8;
    const ky = (Math.random() - 0.5) * st.recoilH * 0.0105 * 2; p.yaw += ky;
    this.recoilBloom = Math.min(4, this.recoilBloom + 1);
    this.vm.fire(Math.min(1.4, 0.5 + st.recoil * 0.12)); this.shake = Math.max(this.shake, Math.min(0.35, st.recoil * 0.04));
    this.fx.flash(mz.x, mz.y, mz.z, 0.4); this.fx.lightAt(mz.x, mz.y, mz.z, 0xffb060, 6, 0.06);
    this.vib(st.recoil > 3 ? 35 : 12);
    this.mode.onShot();
    if (w.ammo <= 0 && (w.reserve > 0 || this.infAmmo)) setTimeout(() => { if (!this.paused && this.reloadT < 0 && this.w.ammo <= 0) this.startReload(); }, 250);
  }
  muzzleWorld(): THREE.Vector3 {
    const p = this.player; const cp = Math.cos(p.pitch);
    const fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp; const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const m = this.vm.muzzle; const a = this.adsT;
    const forward = -m.z + 0.35, right = 0.16 * (1 - a), down = 0.18 * (1 - a) - m.y;
    return new THREE.Vector3(p.x + fx * forward + rx * right, p.y + EYE + fy * forward - down, p.z + fz * forward + rz * right);
  }

  startMelee() { this.meleeT = 0; this.meleeHit = false; this.reloadT = -1; this.input.sprint = false; this.vm.setWeapon(this.meleeWS.id, this.save.cosmetics, []); audio.shot("melee", 1); }
  doMelee() {
    const p = this.player; const mw = this.meleeWS; const reach = mw.def.reach ?? 2.2;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let hit = false;
    for (const b of this.bots) {
      if (!b.alive || b.team === p.team) continue;
      const dx = b.x - p.x, dz = b.z - p.z; const d = Math.hypot(dx, dz); if (d > reach + 0.4 || Math.abs(b.y - p.y) > 1.5) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.55) continue;
      const behind = !b.target && Math.abs(angDiff(b.yaw, Math.atan2(-dx, -dz))) > 2.2 ? 1 : 0;
      const head = Math.random() < 0.15;
      const killed = this.damageActor(b, behind ? 9999 : mw.st.dmg * (head ? 1.5 : 1), head, p, mw.id, fx, fz);
      hit = true; this.stats.hits++; this.emit({ t: "hit", head, kill: killed }); if (this.settings.hitmarker) audio.hit(head, killed); this.vib(30);
      this.mode.onPlayerHit(head, killed, mw.id, 0); this.mode.onMelee();
      break;
    }
    for (const pr of this.world.props) { if (pr.dead || pr.kind === "core") continue; if (Math.hypot(pr.x - p.x, pr.z - p.z) < reach + pr.r) { this.damageProp(pr, mw.st.dmg, p); hit = true; break; } }
    if (!hit) this.mode.onMelee();
    if (hit) this.fx.hitPuff(p.x + fx * reach, p.y + 1.3, p.z + fz * reach, 4);
  }

  // ------------------------------------------------------------------ rays & damage
  castRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, shooter: Actor) {
    const out = { t: maxT, actor: null as Actor | null, part: null as Part | null, prop: null as Prop | null, nx: 0, ny: 1, nz: 0 };
    if (this.world.raycast(ox, oy, oz, dx, dy, dz, maxT, this.tmpHit)) {
      out.t = this.tmpHit.t; out.nx = this.tmpHit.nx; out.ny = this.tmpHit.ny; out.nz = this.tmpHit.nz;
      if (this.tmpHit.c?.prop) out.prop = this.tmpHit.c.prop;
    }
    for (const b of this.bots) {
      if (!b.alive || b.team === shooter.team || b === shooter) continue;
      const h = b.rayHit(ox, oy, oz, dx, dy, dz, out.t);
      if (h && h.t < out.t) { out.t = h.t; out.actor = b; out.part = h.part; out.prop = null; }
    }
    const p = this.player;
    if (shooter !== p && p.alive && p.team !== shooter.team && p.prot <= 0) {
      const th = rayBox(ox, oy, oz, dx, dy, dz, p.x - 0.22, p.y + 1.45, p.z - 0.22, p.x + 0.22, p.y + 1.85, p.z + 0.22);
      const tb = rayBox(ox, oy, oz, dx, dy, dz, p.x - 0.34, p.y, p.z - 0.34, p.x + 0.34, p.y + 1.45, p.z + 0.34);
      const t = th >= 0 && (tb < 0 || th < tb) ? th : tb;
      if (t >= 0 && t < out.t) { out.t = t; out.actor = p; out.part = th >= 0 && t === th ? "head" : "body"; out.prop = null; }
    }
    return out;
  }
  canSee(x: number, ey: number, z: number, a: Actor): boolean {
    const ty = a.y + (a.isPlayer ? 1.3 : 1.2);
    if (!this.world.los(x, ey, z, a.x, ty, a.z)) { if (!this.world.los(x, ey, z, a.x, a.y + 1.7, a.z)) return false; }
    // smoke
    for (const s of this.smokes) {
      const dx = a.x - x, dz = a.z - z; const l2 = dx * dx + dz * dz || 1; const t = clamp(((s.x - x) * dx + (s.z - z) * dz) / l2, 0, 1);
      const cx = x + dx * t, cz = z + dz * t; if (Math.hypot(cx - s.x, cz - s.z) < s.r * 0.85) return false;
    }
    return true;
  }
  noise(x: number, z: number, r: number, team: number) { for (const b of this.bots) b.hear(x, z, r, team); }
  onBotAlert(b: Bot) { this.mode.onBotAlert(b); }

  damageProp(p: Prop, dmg: number, by: Actor | null) {
    const destroyed = this.world.damageProp(p, dmg);
    if (destroyed) this.onPropDestroyed(p, by);
  }
  onPropDestroyed(p: Prop, by: Actor | null) {
    if (p.kind === "barrel") { this.pending.push({ t: 0.08, x: p.x, y: 0.5, z: p.z, r: 6.5, d: 130, owner: by }); }
    else { const big = p.kind === "tank" ? 1.8 : p.kind === "vehicle" ? 1.5 : 1.2; this.explode(p.x, 1, p.z, 7 * big, 100, by, "target"); this.shake = Math.max(this.shake, 0.8); this.mode.onPropDestroyed(p); }
  }

  damageActor(a: Actor, dmg: number, head: boolean, src: Actor | null, weapon: string, dx = 0, dz = 0): boolean {
    if (!a.alive) return false;
    if (a.isPlayer) { this.hurtPlayer(dmg, src ? src.x : a.x - dx, src ? src.z : a.z - dz, head, src, weapon); return !this.player.alive; }
    const b = a as Bot;
    if (b.prot > 0 || dmg <= 0) return false;
    b.hp -= dmg; b.hurt(this, src);
    const cx = b.x, cy = b.y + (head ? 1.7 : 1.2), cz = b.z;
    if (b.kind === "dummy") this.fx.hitPuff(cx, cy, cz, 4); else if (this.settings.blood) this.fx.blood(cx, cy, cz, dx, dz, head ? 8 : 5); else this.fx.hitPuff(cx, cy, cz, 3);
    if (b.hp <= 0) { this.killBot(b, src, head, weapon, dx, dz); return true; }
    return false;
  }
  killBot(b: Bot, killer: Actor | null, head: boolean, weapon: string, dx: number, dz: number) {
    b.die(); b.vx = dx * 2; b.vz = dz * 2;
    if (b.state === "captive") b.state = "patrol";
    const me = killer === this.player;
    if (me) {
      this.stats.kills++; if (head) this.stats.headshots++; this.stats.weaponKills[weapon] = (this.stats.weaponKills[weapon] ?? 0) + 1; this.stats.score += 100 + (head ? 50 : 0);
      this.xp(10 + (head ? 5 : 0), head ? "Tiro na cabeça" : "Abate");
    }
    for (const id of b.assist) if (id === 0 && !me) this.stats.assists++;
    this.emit({ t: "feed", killer: killer?.name ?? "—", victim: b.name, weapon, head, kt: killer?.team ?? -1, vt: b.team, me });
    if (b.kind !== "dummy" && !b.ally) { const r = Math.random(); if (r < 0.22) this.addPickup(b.x, b.z, "ammo", true); else if (r < 0.3) this.addPickup(b.x, b.z, "health", true); }
    if (b.kind === "dummy") this.fx.dust(b.x, 0.3, b.z, 3, 0xdddddd);
    this.mode.onBotKilled(b, killer, head, weapon);
  }
  hurtPlayer(amount: number, sx: number, sz: number, head: boolean, src: Actor | null, weapon: string) {
    const p = this.player; if (!p.alive || p.prot > 0 || this.ended) return;
    const ab = Math.min(p.armor, amount * 0.6); p.armor -= ab; p.hp -= amount - ab; this.hurtT = 0;
    const ang = Math.atan2(-(sx - p.x), -(sz - p.z)); // world angle toward source
    this.emit({ t: "dmg", ang: angDiff(p.yaw, ang) });
    audio.hurt(); this.vib(40); this.shake = Math.max(this.shake, Math.min(0.5, amount * 0.02));
    this.mode.onPlayerHurt(amount);
    if (p.hp <= 0) {
      p.hp = 0; p.alive = false; this.stats.deaths++; this.input.fire = false; this.input.ads = false; this.input.sprint = false;
      this.emit({ t: "feed", killer: src?.name ?? "—", victim: p.name, weapon, head, kt: src?.team ?? -1, vt: 0, me: false });
      if (src && !src.isPlayer) { (src as Bot).target = null; }
      this.mode.onPlayerDeath(src);
    }
  }
  respawnTick(dt: number) { if (this.respawnT > 0) { this.respawnT -= dt; if (this.respawnT <= 0 && this.mode.autoRespawn()) this.respawnPlayer(); } }
  respawnPlayer(at?: { x: number; z: number; yaw?: number }) {
    const p = this.player; const sp = at ?? this.mode.spawnPoint(0);
    p.x = sp.x; p.z = sp.z; p.y = 0; p.vx = p.vy = p.vz = 0; p.hp = p.maxHp; p.armor = this.cfg.kind === "campaign" ? p.armor : 0; p.alive = true; p.prot = 2.5; this.hurtT = 99;
    p.yaw = sp.yaw ?? Math.atan2(-(0 - sp.x), -(0 - sp.z)); p.pitch = 0;
    this.ws.forEach((w) => { w.ammo = w.st.mag; w.reserve = Math.max(w.reserve, Math.floor(w.st.reserve * 0.6)); });
    this.gCount = Math.max(this.gCount, 2); this.reloadT = -1; this.swT = -1; this.throwT = -1; this.meleeT = -1; this.adsT = 0;
    this.vm.setWeapon(this.w.id, this.save.cosmetics, this.w.att);
  }

  // ------------------------------------------------------------------ bots interface
  botFire(b: Bot, tgt: Actor, d: number) {
    const w = getWeapon(b.weaponId);
    const f = [-Math.sin(b.yaw), -Math.cos(b.yaw)]; const r = [Math.cos(b.yaw), -Math.sin(b.yaw)]; const sc = b.scale;
    const mx = b.x + f[0] * 0.95 * sc + r[0] * 0.14, my = b.y + 1.3 * sc, mz = b.z + f[1] * 0.95 * sc + r[1] * 0.14;
    const headAim = Math.random() < 0.12 * b.dp.acc;
    const ax = tgt.x, ay = tgt.y + (headAim ? 1.65 : 1.15), az = tgt.z;
    let dx = ax - mx, dy = ay - my, dz = az - mz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const acc = clamp(b.dp.acc * b.kp.acc, 0.1, 1.4);
    const deg = (1.6 + d * 0.045 + b.panic * 2.5) * (1.7 - acc) * (b.state === "combat" ? 1 : 1.5) * (b.stun > 0 ? 4 : 1);
    const pellets = b.kind === "shotgun" ? 6 : 1; const sa = (deg * Math.PI) / 180;
    let hitSomething = false;
    for (let i = 0; i < pellets; i++) {
      let px = dx + (Math.random() - 0.5) * 2 * sa * (pellets > 1 ? 2.2 : 1), py = dy + (Math.random() - 0.5) * 2 * sa, pz = dz + (Math.random() - 0.5) * 2 * sa;
      const pl = Math.hypot(px, py, pz); px /= pl; py /= pl; pz /= pl;
      const h = this.castRay(mx, my, mz, px, py, pz, 140, b);
      const ex = mx + px * h.t, ey = my + py * h.t, ez = mz + pz * h.t;
      if (i < 2) this.fx.tracer(mx, my, mz, ex, ey, ez, b.team === 0 ? 0x6ac4ff : 0xff6a3a, 0.025);
      if (h.actor) {
        hitSomething = true;
        let dmg = b.kp.shot * b.dp.dmg * (h.part === "head" ? 1.6 : PART_MULT[h.part!]); if (b.kind === "shotgun") dmg = (b.kp.shot / 4.5) * b.dp.dmg * (h.t < 14 ? 1 : 0.3);
        if (b.kind === "sniper" || b.kind === "shotgun") { /* full */ } else dmg *= h.t > 45 ? 0.7 : 1;
        this.damageActor(h.actor, dmg, h.part === "head", b, b.weaponId, px, pz);
      } else if (h.prop) this.damageProp(h.prop, b.kp.shot * 0.8, b);
      else { this.fx.sparks(ex, ey, ez, h.nx, h.ny, h.nz, 2); if (Math.random() < 0.5) this.fx.decal(ex, ey, ez, h.nx, h.ny, h.nz); }
    }
    void hitSomething;
    this.fx.flash(mx, my, mz, 0.3);
    audio.shot(w.snd, 0.9, { x: mx, y: my, z: mz });
    this.noise(b.x, b.z, 45, b.team);
    if (tgt.isPlayer) { const near = d < 10 ? 0.04 : 0; this.shake = Math.max(this.shake, near); }
  }
  botGrenade(b: Bot, tgt: Actor) {
    const dx = tgt.x - b.x, dz = tgt.z - b.z; const d = Math.hypot(dx, dz) || 1; const v = Math.sqrt(d * 17.6) * 1.05;
    const c = Math.SQRT1_2; this.throwGrenade(b, b.x, b.y + 1.6, b.z, (dx / d) * v * c, v * c, (dz / d) * v * c, "frag");
  }

  // ------------------------------------------------------------------ grenades / explosions
  throwPlayerGrenade() {
    const p = this.player; const cp = Math.cos(p.pitch + 0.2);
    const fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch + 0.2), fz = -Math.cos(p.yaw) * cp; const v = 16;
    if (!this.infAmmo || this.cfg.kind !== "tutorial") this.gCount--;
    this.throwGrenade(p, p.x + fx * 0.5, p.y + EYE - 0.1, p.z + fz * 0.5, fx * v + p.vx * 0.5, fy * v + 1.5, fz * v + p.vz * 0.5, this.gType);
    this.mode.onGrenade();
  }
  throwGrenade(owner: Actor, x: number, y: number, z: number, vx: number, vy: number, vz: number, type: GrenadeType) {
    const mesh = buildGrenadeModel(type, 1.6); mesh.position.set(x, y, z); this.scene.add(mesh);
    const fuse = type === "frag" ? 2.5 : type === "smoke" ? 1.3 : 1.6;
    this.grenades.push({ type, b: { x, y, z, vx, vy, vz, onGround: false }, mesh, fuse, owner, spin: Math.random() * 6 });
  }
  spawnRocket(x: number, y: number, z: number, dx: number, dy: number, dz: number, dmg: number) {
    const vb = new VB(); vb.box(0, 0, 0, 0.14, 0.14, 0.45, "#6a7a4a"); vb.box(0, 0, 0.3, 0.1, 0.1, 0.1, "#ffb040", undefined, 0);
    const mesh = new THREE.Mesh(vb.geometry(), mats().lit); mesh.position.set(x, y, z); mesh.lookAt(x + dx, y + dy, z + dz);
    const g = new THREE.Group(); g.add(mesh); this.scene.add(g);
    this.grenades.push({ type: "frag", b: { x, y, z, vx: dx * 42, vy: dy * 42, vz: dz * 42, onGround: false }, mesh: g, fuse: 5, owner: this.player, spin: 0, rocket: true, dir: new THREE.Vector3(dx, dy, dz), dmg });
  }
  updateGrenades(dt: number) {
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]; g.fuse -= dt;
      if (g.rocket) {
        const b = g.b; const step = 42 * dt; const d = g.dir!;
        let boom = g.fuse <= 0;
        const h = this.castRay(b.x, b.y, b.z, d.x, d.y, d.z, step + 0.3, g.owner);
        if (h.t < step + 0.25 && (h.actor || h.prop || this.tmpHit.c || h.ny > 0.5)) boom = true;
        b.x += d.x * step; b.y += d.y * step; b.z += d.z * step; g.mesh.position.set(b.x, b.y, b.z);
        if (Math.random() < 0.8) this.fx.smoke(b.x - d.x * 0.5, b.y - d.y * 0.5, b.z - d.z * 0.5, 1, 0.5, 0xbbbbbb, 0.7);
        this.fx.spawn(b.x - d.x * 0.3, b.y - d.y * 0.3, b.z - d.z * 0.3, 0, 0, 0, 0.12, 0.2, 0.05, 0xffd060, 0xff5010);
        if (boom) { this.scene.remove(g.mesh); this.grenades.splice(i, 1); this.explode(b.x, b.y, b.z, 6, g.dmg ?? 150, g.owner, "boom40"); }
        continue;
      }
      const bounced = this.world.moveSphere(g.b, 0.1, dt);
      if (bounced && Math.hypot(g.b.vx, g.b.vy, g.b.vz) > 2) audio.bounce({ x: g.b.x, y: g.b.y, z: g.b.z });
      g.spin += dt * 10; g.mesh.position.set(g.b.x, g.b.y, g.b.z); g.mesh.rotation.set(g.spin * 0.6, g.spin, 0);
      if (g.type === "smoke" && g.fuse < 0.3 && g.fuse > 0) this.fx.smoke(g.b.x, g.b.y, g.b.z, 1, 0.5);
      if (g.fuse <= 0) {
        this.scene.remove(g.mesh); this.grenades.splice(i, 1);
        const { x, y, z } = g.b;
        if (g.type === "frag") this.explode(x, y, z, 7, 130, g.owner, "frag");
        else if (g.type === "smoke") { this.smokes.push({ x, y, z, r: 5, t: 14, e: 0 }); audio.shot("pistol", 0.2, { x, y, z }); this.fx.smoke(x, y + 0.3, z, 14, 2.2, 0xcfd4d8, 4); }
        else this.flashbang(x, y, z, g.owner);
      }
    }
  }
  updateSmokes(dt: number) {
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i]; s.t -= dt; s.e -= dt;
      if (s.e <= 0 && s.t > 2) { s.e = 0.18; this.fx.smoke(s.x + (Math.random() - 0.5) * 3, s.y + Math.random() * 1.5, s.z + (Math.random() - 0.5) * 3, 1, 2.6, 0xcfd4d8, 3.5); }
      if (s.t <= 0) this.smokes.splice(i, 1);
    }
  }
  flashbang(x: number, y: number, z: number, owner: Actor) {
    this.fx.lightAt(x, y + 0.5, z, 0xffffff, 40, 0.3); this.fx.spawn(x, y, z, 0, 0, 0, 0.2, 4, 7, 0xffffff, 0xffffcc); audio.explosion({ x, y, z }, 0.3);
    const p = this.player;
    if (this.world.los(x, y, z, p.x, p.y + 1.5, p.z) || Math.hypot(p.x - x, p.z - z) < 4) {
      const d = Math.hypot(p.x - x, p.z - z); const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const dot = ((x - p.x) * fx + (z - p.z) * fz) / (d || 1);
      if (d < 22) this.flashAmt = Math.min(1.4, Math.max(this.flashAmt, (1 - d / 22) * (dot > -0.2 ? 1.5 : 0.5)));
    }
    for (const b of this.bots) { if (!b.alive || b.team === owner.team) continue; const d = Math.hypot(b.x - x, b.z - z); if (d < 20 && this.world.los(x, y, z, b.x, b.y + 1.5, b.z)) b.stun = 4 * (1 - d / 24); }
  }
  explode(x: number, y: number, z: number, radius: number, dmg: number, owner: Actor | null, weapon: string) {
    this.fx.explosion(x, y, z, radius / 6, this.settings.effects ? 1 : 0.5);
    audio.explosion({ x, y, z }, radius / 6); this.noise(x, z, 70, owner?.team ?? -1);
    this.fx.decal(x, 0.02, z, 0, 1, 0);
    const p = this.player; const dp = Math.hypot(p.x - x, p.y + 1 - y, p.z - z);
    this.shake = Math.max(this.shake, 1.2 * Math.max(0, 1 - dp / (radius * 3)));
    for (const a of this.actors()) {
      const d = Math.hypot(a.x - x, a.y + 1 - y, a.z - z); if (d > radius) continue;
      if (!this.world.los(x, Math.max(0.4, y), z, a.x, a.y + 1, a.z) && d > 1.5) continue;
      const k = 1 - d / radius; let amount = dmg * k * k * 1.2 + dmg * 0.1 * k;
      if (a === owner && a.isPlayer) amount *= 0.5; else if (a.team === owner?.team && owner && a !== owner && !a.isPlayer) continue;
      if (a.isPlayer) { this.hurtPlayer(amount, x, z, false, owner, weapon); const l = d || 1; p.vx += ((p.x - x) / l) * 8 * k; p.vz += ((p.z - z) / l) * 8 * k; if (p.onGround) p.vy = 4 * k; }
      else this.damageActor(a, amount, false, owner, weapon, (a.x - x) / (d || 1), (a.z - z) / (d || 1));
    }
    for (const pr of this.world.props) {
      if (pr.dead) continue; const d = Math.hypot(pr.x - x, pr.z - z); if (d > radius + pr.r) continue;
      this.damageProp(pr, dmg * (1 - Math.min(1, d / (radius + pr.r))) * 1.6 + 8, owner);
    }
  }

  // ------------------------------------------------------------------ pickups / interactables
  addPickup(x: number, z: number, type: Pickup["type"], temp = false) {
    const col = type === "ammo" ? "#e8c43a" : type === "health" ? "#3ad46a" : "#3a9aff";
    const vb = new VB(); vb.box(0, 0.2, 0, 0.5, 0.35, 0.35, "#2a2d31"); vb.box(0, 0.2, 0, 0.52, 0.12, 0.37, col, undefined, 0);
    if (type === "health") { vb.box(0, 0.4, 0, 0.3, 0.06, 0.1, "#fff", undefined, 0); vb.box(0, 0.4, 0, 0.1, 0.06, 0.3, "#fff", undefined, 0); }
    const g = new THREE.Group(); g.add(new THREE.Mesh(vb.geometry(), mats().lit));
    const gv = new VB(); gv.box(0, 1.2, 0, 0.08, 2.4, 0.08, col, undefined, 0); g.add(new THREE.Mesh(gv.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })));
    g.position.set(x, 0.3, z); this.scene.add(g);
    this.pickups.push({ x, z, type, mesh: g, t: temp ? 25 : -1, respawn: 0, active: true });
  }
  updatePickups(dt: number) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      if (!k.active) { k.respawn -= dt; if (k.respawn <= 0) { k.active = true; k.mesh.visible = true; } continue; }
      k.mesh.rotation.y += dt * 1.8; k.mesh.position.y = 0.3 + Math.sin(this.time * 2 + k.x) * 0.08;
      if (k.t > 0) { k.t -= dt; if (k.t <= 0) { this.scene.remove(k.mesh); this.pickups.splice(i, 1); continue; } }
      if (!p.alive || Math.hypot(p.x - k.x, p.z - k.z) > 1.3) continue;
      let ok = false;
      if (k.type === "ammo") { for (const w of this.ws) if (w.reserve < w.st.reserve * 1.5) { w.reserve = Math.min(Math.floor(w.st.reserve * 1.5), w.reserve + Math.ceil(w.st.mag * 2)); ok = true; } if (this.gCount < 3) { this.gCount++; ok = true; } }
      if (k.type === "health" && p.hp < p.maxHp) { p.hp = Math.min(p.maxHp, p.hp + 45); ok = true; }
      if (k.type === "armor" && p.armor < 50) { p.armor = 50; ok = true; }
      if (ok) { audio.pickup(); this.vib(15); if (k.t > 0) { this.scene.remove(k.mesh); this.pickups.splice(i, 1); } else { k.active = false; k.respawn = 25; k.mesh.visible = false; } }
    }
  }
  addInteract(type: Interact["type"], x: number, z: number, label: string, bot?: Bot): Interact {
    const it: Interact = { id: this.nextId++, type, x, z, label, used: false, bot };
    if (type === "intel" || type === "console") {
      const vb = new VB(); vb.box(0, 0.5, 0, 0.5, 0.08, 0.38, type === "intel" ? "#e8c43a" : "#3aff9a", undefined, 0); vb.box(0, 0.58, 0, 0.4, 0.04, 0.3, "#fff6c0", undefined, 0);
      const g = new THREE.Group(); g.add(new THREE.Mesh(vb.geometry(), mats().glow)); const gv = new VB(); gv.box(0, 1.5, 0, 0.1, 3, 0.1, type === "intel" ? "#ffd23a" : "#3aff9a", undefined, 0);
      g.add(new THREE.Mesh(gv.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));
      g.position.set(x, type === "console" ? 0.9 : 0.4, z); this.scene.add(g); it.mesh = g;
    }
    this.interacts.push(it); return it;
  }
  nearInteract(): Interact | null {
    const p = this.player; let best: Interact | null = null; let bd = 2.8;
    for (const it of this.interacts) { if (it.used) continue; const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < bd) { bd = d; best = it; } }
    return best;
  }
  updateInteract(dt: number) {
    const n = this.nearInteract(); const inp = this.input;
    if (inp.interact) { inp.interact = false; if (n && this.interacting < 0) { this.interacting = 0; this.mode.onInteractStart(); } }
    if (this.interacting >= 0) {
      if (!n) this.interacting = -1;
      else { this.interacting += dt; if (this.interacting >= 0.8) { this.interacting = -1; n.used = true; if (n.mesh) this.scene.remove(n.mesh); audio.ui("ok"); this.mode.onInteract(n); } }
    }
  }
  useAbility() {
    if (this.abilityCd > 0) { audio.ui("deny"); return; }
    const p = this.player; const e = this.equipment;
    if (e === "medkit") { this.healT = 3; this.abilityCd = 35; this.banner("Kit médico", "Recuperando vida", "info"); }
    if (e === "adrenaline") { this.adrenT = 8; this.abilityCd = 40; this.banner("Adrenalina", "Velocidade aumentada", "info"); }
    if (e === "radar") { this.radarT = 9; this.abilityCd = 30; this.banner("Pulso de radar", "Inimigos revelados", "info"); }
    if (e === "armor") { p.armor = 50; this.abilityCd = 60; this.banner("Placa de armadura", "+50 de armadura", "info"); }
    this.mode.onAbility(); audio.pickup(); this.vib(30);
  }

  // ------------------------------------------------------------------ beacons / dialog / cutscene
  setBeacon(i: number, pt: { x: number; z: number } | null, color = 0xffd23a) {
    const b = this.beacons[i]; if (!b) return;
    if (!pt) { b.visible = false; return; }
    b.visible = true; b.position.set(pt.x, 20, pt.z); (b.material as THREE.MeshBasicMaterial).color.setHex(color);
  }
  dialog(lines: { who: string; text: string }[]) { for (const l of lines) this.dlgQ.push({ ...l, t: 2.6 + l.text.length * 0.045 }); }
  updateDialog(dt: number) {
    if (this.dlgCur) { this.dlgCur.t -= dt; if (this.dlgCur.t <= 0) this.dlgCur = null; }
    if (!this.dlgCur && this.dlgQ.length) { this.dlgCur = this.dlgQ.shift()!; audio.voice(this.dlgCur.text); audio.beep(); }
  }
  startCutscene(lines: { who: string; text: string }[], done: () => void) {
    if (!lines.length) { done(); return; }
    this.cut = { lines, i: 0, t: 0, done }; if (this.cutRig) { this.cutRig.root.visible = true; this.cutRig.root.position.set(this.player.x, this.player.y, this.player.z); this.cutRig.root.rotation.y = this.player.yaw; this.cutRig.armR.rotation.set(0.7, 0.25, 0); this.cutRig.armL.rotation.set(0.9, -0.35, 0); }
    audio.voice(lines[0].text); audio.beep();
  }
  skipCutscene() { if (!this.cut) return; const d = this.cut.done; this.cut = null; if (this.cutRig) this.cutRig.root.visible = false; d(); }
  updateCutscene(dt: number) {
    const c = this.cut!; c.t += dt; const L = c.lines[c.i];
    const dur = 2.8 + L.text.length * 0.045;
    if (c.t > dur) { c.i++; c.t = 0; if (c.i >= c.lines.length) { this.skipCutscene(); return; } audio.voice(c.lines[c.i].text); audio.beep(); }
    const p = this.player; const a = this.time * 0.25 + p.yaw; const r = 4.5;
    this.camera.position.set(p.x + Math.sin(a) * r, p.y + 1.8 + Math.sin(this.time * 0.3) * 0.2, p.z + Math.cos(a) * r);
    this.camera.lookAt(p.x, p.y + 1.5, p.z); this.camera.fov = 55; this.camera.updateProjectionMatrix();
    if (this.cutRig) { this.cutRig.root.position.set(p.x, p.y, p.z); this.cutRig.torso.position.y = 0.86 + Math.sin(this.time * 1.6) * 0.01; this.cutRig.head.rotation.y = Math.sin(this.time * 0.5) * 0.3; }
  }

  // ------------------------------------------------------------------ bots spawn
  spawnBot(kind: EnemyKind, team: number, x: number, z: number, opts: { alert?: boolean; name?: string; state?: Bot["state"]; stealth?: boolean; ally?: boolean; yaw?: number } = {}): Bot {
    const id = this.nextId++; const name = opts.name ?? (kind === "dummy" ? "Alvo" : kind === "commander" ? "Cmdt. Vargas" : BOT_NAMES[id % BOT_NAMES.length]);
    const b = new Bot(id, kind, team, this.cfg.difficulty, name, id % 4);
    b.place(x, z, 0); b.yaw = opts.yaw ?? Math.random() * TAU; b.stealth = !!opts.stealth; b.ally = !!opts.ally; b.prot = 0;
    if (opts.alert) { b.hunt = true; b.alerted = true; }
    if (opts.state) b.state = opts.state; else if (opts.ally) b.state = "follow";
    this.scene.add(b.rig.root); this.bots.push(b); b.spawnSpot = { x, z };
    if (b.state === "captive") b.rig.root.traverse((o) => { void o; });
    return b;
  }
  aliveBots(filter?: (b: Bot) => boolean) { return this.bots.filter((b) => b.alive && (!filter || filter(b))); }
  clearEntities() {
    for (const b of this.bots) this.scene.remove(b.rig.root); this.bots = [];
    for (const g of this.grenades) this.scene.remove(g.mesh); this.grenades = [];
    for (const k of this.pickups) this.scene.remove(k.mesh); this.pickups = [];
    for (const it of this.interacts) if (it.mesh) this.scene.remove(it.mesh); this.interacts = [];
    this.smokes = []; this.pending = []; this.beacons.forEach((b) => (b.visible = false)); this.fx.clear();
  }

  // ------------------------------------------------------------------ camera & HUD
  updateCamera(dt: number) {
    const p = this.player; const cam = this.camera; const w = this.w;
    const sh = this.shake; const sx = (Math.random() - 0.5) * sh * 0.05, sy = (Math.random() - 0.5) * sh * 0.05;
    const bob = p.onGround ? Math.sin(this.bobT * 2.2) * 0.02 * Math.min(1, Math.hypot(p.vx, p.vz) / 5) * (1 - this.adsT) : 0;
    const eye = p.alive ? EYE : 0.5;
    cam.position.set(p.x, p.y + eye + bob, p.z);
    cam.rotation.order = "YXZ"; cam.rotation.set(p.pitch + this.kickPitch * 0.6 + sy, p.yaw + sx, this.camRoll + (p.alive ? 0 : 0.7));
    const base = 75 + (this.sprintOn ? 6 : 0); const zoomFov = (2 * Math.atan(Math.tan((base * Math.PI) / 360) / w.st.zoom) * 180) / Math.PI;
    const fov = lerp(base, zoomFov, this.adsT);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // sun follows
    const sd = new THREE.Vector3(0.5, 0.8, -0.35).normalize();
    this.sun.position.set(p.x + sd.x * 60, sd.y * 60, p.z + sd.z * 60); this.sun.target.position.set(p.x, 0, p.z);
    (this.sky.material as THREE.ShaderMaterial).uniforms.sd.value.copy(sd);
    void dt;
  }
  syncHud() {
    const h = this.hud; const p = this.player; const w = this.w;
    h.hp = Math.ceil(p.hp); h.armor = Math.ceil(p.armor); h.ammo = w.def.cat === "melee" ? 0 : w.ammo; h.reserve = w.reserve; h.infAmmo = this.infAmmo;
    h.wname = w.def.name; h.wcat = w.def.cat; h.reloadP = this.reloadT >= 0 ? this.reloadT / this.reloadDur : -1;
    h.grenades = this.gCount; h.gtype = this.gType; h.ads = this.adsT; h.scoped = this.adsT > 0.85 && w.st.zoom >= 2.8 && this.swT < 0 && this.reloadT < 0;
    h.spread = lerp(w.st.spread, w.st.adsSpread, this.adsT) + this.recoilBloom * 0.4 + (Math.hypot(p.vx, p.vz) > 1.5 ? 1 : 0);
    h.fps = this.fps; h.quality = this.settings.quality === "auto" ? `AUTO (${this.quality.toUpperCase()} • ${Math.round(this.resScale * 100)}%)` : this.quality.toUpperCase();
    h.prot = p.prot > 0; h.dead = !p.alive; h.respawnIn = Math.max(0, this.respawnT); h.sprintOn = this.input.sprint;
    h.kills = this.stats.kills; h.hs = this.stats.headshots; h.acc = this.stats.shots ? this.stats.hits / this.stats.shots : 0;
    h.flashAmt = Math.min(1, this.flashAmt); h.night = this.night; h.radar = this.radarT > 0; h.ended = this.ended; h.lowHp = p.hp < 30 && p.alive;
    const cd = this.equipment === "medkit" ? 35 : this.equipment === "adrenaline" ? 40 : this.equipment === "radar" ? 30 : 60;
    h.abilityCd = this.abilityCd > 0 ? this.abilityCd / cd : 0; h.abilityName = { medkit: "Kit Médico", adrenaline: "Adrenalina", radar: "Radar", armor: "Armadura" }[this.equipment];
    const n = this.nearInteract(); h.canInteract = !!n; h.prompt = n ? n.label : null; h.promptP = this.interacting >= 0 ? this.interacting / 0.8 : 0;
    h.cut = this.cut ? this.cut.lines[this.cut.i] : null; h.dialog = this.dlgCur ? { who: this.dlgCur.who, text: this.dlgCur.text } : null;
    this.mode.fillHud(h);
    // marker arrow
    const m = this.mode.markerPoint();
    if (m) { const dx = m.x - p.x, dz = m.z - p.z; h.hasMarker = true; h.markerDist = Math.hypot(dx, dz); h.markerAng = angDiff(p.yaw, Math.atan2(-dx, -dz)); } else h.hasMarker = false;
  }

  minimapData() {
    const p = this.player; const radar = this.radarT > 0;
    return {
      x: p.x, z: p.z, yaw: p.yaw, S: this.world.S, img: this.world.minimap, night: this.night,
      foes: this.bots.filter((b) => b.alive && b.team !== p.team && (radar || b.shown > 0 || (b.kind === "dummy" && this.cfg.kind !== "campaign"))).map((b) => ({ x: b.x, z: b.z })),
      allies: this.bots.filter((b) => b.alive && b.team === p.team).map((b) => ({ x: b.x, z: b.z })),
      markers: this.mode.markers(), flags: this.mode.flagPoints(),
    };
  }

  // ------------------------------------------------------------------ result
  finish(win: boolean, title?: string, sub?: string) {
    if (this.ended) return; this.ended = true;
    const r = this.mode.buildResult(win, title, sub);
    this.input.fire = false; this.input.ads = false;
    this.emit({ t: "end", result: r });
  }
  pause(v: boolean) { this.paused = v; if (v) { this.input.fire = false; audio.music("off"); } else { this.lastT = performance.now(); audio.music("combat"); } }
  restartCheckpoint() { this.mode.restartCheckpoint(); }
  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); audio.music("off"); audio.stopAmbience();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
