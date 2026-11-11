import * as THREE from "three";
import { COS_MAP } from "../data/cosmetics";
import { getWeapon } from "../data/weapons";
import type { Cosmetics, GrenadeType } from "../types";
import { buildGrenadeModel, buildVMArm, buildWeaponModel, gunLeftHand, STYLE_FROM_COS } from "./models";

export interface VMState {
  ads: number; moving: number; sprint: boolean; reload: number; sw: number; melee: number; throwP: number; onGround: boolean; dt: number; time: number;
}
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class ViewModel {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  root = new THREE.Group();
  wGroup = new THREE.Group();
  weapon: THREE.Group | null = null;
  mag: THREE.Object3D | null = null;
  armL!: THREE.Object3D; armR!: THREE.Object3D;
  flash: THREE.Mesh;
  flashT = 0;
  flashLight: THREE.PointLight;
  gren: THREE.Group | null = null;
  kick = 0; kickX = 0; swayX = 0; swayY = 0;
  isMelee = false; adsY = -0.085; lh = 0.2; muzzle = new THREE.Vector3(0, 0.03, -0.6);
  adsX = 0;

  constructor() {
    this.scene.add(this.cam);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x554433, 1.5));
    const d = new THREE.DirectionalLight(0xfff0d8, 2.2); d.position.set(1, 2, 1.5); this.scene.add(d);
    this.root.add(this.wGroup); this.cam.add(this.root);
    const fm = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), fm);
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), fm); f2.rotation.y = Math.PI / 2; this.flash.add(f2);
    const f3 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.flash.add(f3);
    this.flash.visible = false; this.wGroup.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3); this.wGroup.add(this.flashLight);
  }

  setWeapon(id: string, cos: Cosmetics, att: string[]) {
    if (this.weapon) this.wGroup.remove(this.weapon);
    if (this.armL) this.wGroup.remove(this.armL);
    if (this.armR) this.wGroup.remove(this.armR);
    const def = getWeapon(id); this.isMelee = def.cat === "melee";
    this.weapon = buildWeaponModel(id, cos.camo, att); this.wGroup.add(this.weapon);
    this.mag = this.weapon.getObjectByName("mag") ?? null;
    this.muzzle.copy(this.weapon.userData.muzzle as THREE.Vector3);
    const st = STYLE_FROM_COS(cos); const gl = COS_MAP[cos.gloves].c;
    this.armR = buildVMArm(st.shirt, gl, st.vest); this.armL = buildVMArm(st.shirt, gl, st.vest);
    const set = (a: THREE.Object3D, hand: THREE.Vector3, dir: THREE.Vector3) => { a.position.copy(hand); a.lookAt(hand.clone().add(dir)); this.wGroup.add(a); };
    set(this.armR, new THREE.Vector3(0.0, this.isMelee ? 0 : -0.045, this.isMelee ? 0.03 : 0.045), new THREE.Vector3(0.35, -0.45, 1));
    this.lh = this.isMelee ? 0 : gunLeftHand(id) + 0.0;
    set(this.armL, new THREE.Vector3(0.0, def.cat === "pistol" ? -0.05 : -0.035, -this.lh + (def.cat === "pistol" ? 0.1 : 0.0)), new THREE.Vector3(-0.5, -0.4, 1));
    this.armL.visible = !this.isMelee;
    this.adsY = att.some((a) => ["reddot", "holo"].includes(a)) ? -0.098 : def.scope || att.includes("scope4") ? -0.1 : def.cat === "pistol" ? -0.082 : -0.088;
    this.adsX = 0;
    this.flash.position.copy(this.muzzle).add(new THREE.Vector3(0, 0, -0.04));
    this.flashLight.position.copy(this.flash.position);
  }
  showGrenade(type: GrenadeType | null) {
    if (this.gren) { this.wGroup.remove(this.gren); this.gren = null; }
    if (type) { this.gren = buildGrenadeModel(type, 1.2); this.gren.position.set(0.02, -0.07, 0.0); this.wGroup.add(this.gren); }
  }
  fire(power = 1) {
    this.kick = Math.min(1.6, this.kick + power); this.kickX = (Math.random() - 0.5) * power;
    this.flashT = 0.05; this.flash.visible = true; this.flash.rotation.z = Math.random() * 3; this.flash.scale.setScalar(0.8 + Math.random() * 0.8);
    this.flashLight.intensity = 3;
  }
  update(s: VMState, lookDX: number, lookDY: number) {
    const dt = s.dt; const g = this.wGroup;
    this.kick = Math.max(0, this.kick - dt * 9 - this.kick * dt * 6);
    this.swayX += (-lookDX * 0.0006 - this.swayX) * Math.min(1, dt * 8); this.swayY += (-lookDY * 0.0006 - this.swayY) * Math.min(1, dt * 8);
    const sx = Math.max(-0.05, Math.min(0.05, this.swayX)), sy = Math.max(-0.05, Math.min(0.05, this.swayY));
    const a = s.ads;
    const bobAmp = (s.onGround ? s.moving : 0) * (s.sprint ? 1.6 : 1) * (1 - a * 0.85);
    const bx = Math.sin(s.time * (s.sprint ? 11 : 8)) * 0.007 * bobAmp, by = Math.abs(Math.cos(s.time * (s.sprint ? 11 : 8))) * 0.009 * bobAmp;
    const breathe = Math.sin(s.time * 1.5) * 0.0015;
    let px = 0.165 * (1 - a) + this.adsX * a + bx + sx, py = -0.195 * (1 - a) + this.adsY * a + by + breathe + sy, pz = -0.37 * (1 - a) - 0.3 * a;
    let rx = 0, ry = 0, rz = 0;
    if (s.sprint && !this.isMelee) { const sp = 1 - a; px -= 0.05 * sp; py -= 0.05 * sp; rx += 0.25 * sp; ry += 0.55 * sp; rz -= 0.2 * sp; }
    // recoil
    pz += this.kick * 0.045 * (1 - a * 0.4); rx += this.kick * 0.07; ry += this.kickX * 0.02; py += this.kick * 0.008;
    // reload
    let lhOff = 0;
    if (s.reload >= 0) {
      const p = s.reload; const env = sm(0, 0.15, p) * (1 - sm(0.85, 1, p));
      rz += env * 0.55; rx -= env * 0.3; py -= env * 0.05; px -= env * 0.04; lhOff = sm(0.1, 0.35, p) * (1 - sm(0.7, 0.9, p));
      if (this.mag) {
        const out = sm(0.2, 0.35, p) * (1 - sm(0.45, 0.5, p)), inn = sm(0.5, 0.7, p);
        this.mag.visible = p < 0.3 || p > 0.52; this.mag.position.y = -0.25 * out - (1 - inn) * (p > 0.5 ? 0.18 : 0);
      } else { rx += Math.sin(p * Math.PI * 4) * 0.08 * env; }
    } else if (this.mag) { this.mag.visible = true; this.mag.position.y = 0; }
    // switch
    if (s.sw >= 0) { const e = Math.sin(s.sw * Math.PI); py -= e * 0.35; rx -= e * 0.6; }
    // melee
    if (s.melee >= 0) { const p = s.melee; const sw = Math.sin(p * Math.PI); px -= sw * 0.28 * (p < 0.5 ? 1 : 0.4); ry += (p < 0.5 ? sw * 1.1 : -sw * 0.6); rz += sw * 0.9; pz -= sw * 0.25; rx -= sw * 0.3; }
    // grenade throw
    if (this.gren) {
      const p = s.throwP;
      const e = Math.sin(Math.min(1, p) * Math.PI);
      py -= e * 0.28; rx -= e * 0.5;
      this.gren.visible = p >= 0 && p < 0.55;
      this.gren.position.set(0.13 + 0.0, -0.12 + Math.sin(p * 3.2) * 0.05 * 2 - sm(0.3, 0.52, p) * 0.0, -0.28 - sm(0.2, 0.52, p) * 0.35);
      this.gren.position.x -= (this.wGroup.position.x);
    }
    g.position.set(px, py, pz); g.rotation.set(rx, ry, rz);
    if (this.gren) { this.gren.position.sub(new THREE.Vector3(0, 0, 0)); }
    if (this.armL.visible) this.armL.position.set(0, this.armL.position.y, this.armL.position.z);
    // left hand moves during reload
    this.armL.children.forEach(() => { /* noop */ });
    this.armL.position.y = (this.isMelee ? 0 : (this.armL.userData.baseY ?? (this.armL.userData.baseY = this.armL.position.y))) - lhOff * 0.1;
    this.armL.position.z = (this.armL.userData.baseZ ?? (this.armL.userData.baseZ = this.armL.position.z)) + lhOff * 0.15 * (this.mag ? 1 : 0);
    // muzzle flash
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; } }
    // hide right arm when throwing
    this.armR.visible = !(this.gren && s.throwP >= 0 && s.throwP < 0.55 && false);
    // ads hides weapon bits? keep.
  }
  resize(aspect: number) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
}
