import * as THREE from "three";
import { COS_MAP } from "../data/cosmetics";
import { getWeapon } from "../data/weapons";
import type { Cosmetics, EnemyKind, GrenadeType } from "../types";

// ---------------------------------------------------------------- voxel builder
const FACES: { n: number[]; a: number[]; b: number[] }[] = [
  { n: [1, 0, 0], a: [0, 0, -1], b: [0, 1, 0] },
  { n: [-1, 0, 0], a: [0, 0, 1], b: [0, 1, 0] },
  { n: [0, 1, 0], a: [1, 0, 0], b: [0, 0, -1] },
  { n: [0, -1, 0], a: [1, 0, 0], b: [0, 0, 1] },
  { n: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0] },
  { n: [0, 0, -1], a: [-1, 0, 0], b: [0, 1, 0] },
];
const _c = new THREE.Color();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class VB {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  count = 0;
  box(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: string | number, rot?: [number, number, number], jitter = 0.05) {
    _c.set(color as THREE.ColorRepresentation);
    const hasRot = !!rot && (rot[0] || rot[1] || rot[2]);
    if (hasRot) { _e.set(rot![0], rot![1], rot![2], "YXZ"); _m.makeRotationFromEuler(_e); }
    const sz = [w, h, d];
    for (let fi = 0; fi < 6; fi++) {
      const f = FACES[fi];
      const sa = Math.abs(f.a[0]) * w + Math.abs(f.a[1]) * h + Math.abs(f.a[2]) * d;
      const sb = Math.abs(f.b[0]) * w + Math.abs(f.b[1]) * h + Math.abs(f.b[2]) * d;
      const shade = 1 + (Math.random() - 0.5) * jitter * 2 + (fi === 2 ? 0.04 : fi === 3 ? -0.1 : 0);
      const base = this.count;
      const nv = hasRot ? _v.set(f.n[0], f.n[1], f.n[2]).applyMatrix4(_m).clone() : null;
      for (let k = 0; k < 4; k++) {
        const ka = k === 1 || k === 2 ? 0.5 : -0.5;
        const kb = k >= 2 ? 0.5 : -0.5;
        let x = (f.n[0] * 0.5 + f.a[0] * ka + f.b[0] * kb) * sz[0];
        let y = (f.n[1] * 0.5 + f.a[1] * ka + f.b[1] * kb) * sz[1];
        let z = (f.n[2] * 0.5 + f.a[2] * ka + f.b[2] * kb) * sz[2];
        if (hasRot) { _v.set(x, y, z).applyMatrix4(_m); x = _v.x; y = _v.y; z = _v.z; }
        this.pos.push(x + cx, y + cy, z + cz);
        if (nv) this.nor.push(nv.x, nv.y, nv.z); else this.nor.push(f.n[0], f.n[1], f.n[2]);
        this.uv.push((ka + 0.5) * sa, (kb + 0.5) * sb);
        this.col.push(Math.min(1, _c.r * shade), Math.min(1, _c.g * shade), Math.min(1, _c.b * shade));
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      this.count += 4;
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65000 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  get empty() { return this.count === 0; }
}

// ---------------------------------------------------------------- materials
let _mats: { lit: THREE.MeshStandardMaterial; metal: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial } | null = null;
export function mats() {
  if (_mats) return _mats;
  const cv = document.createElement("canvas"); cv.width = cv.height = 16;
  const ctx = cv.getContext("2d")!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = 214 + Math.floor(Math.random() * 42);
    ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  _mats = {
    lit: new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.88, metalness: 0.04 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.42, metalness: 0.35 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
  };
  return _mats;
}

// ---------------------------------------------------------------- character
export interface CharStyle {
  tone: string; shirt: string; pants: string; vest: string; accent: string;
  helmet: "standard" | "boonie" | "beret" | "tactical" | "balaclava" | "heavy" | "cap" | "none";
  helmetC: string; pack: "none" | "assault" | "medic" | "radio"; packC: string; packC2?: string;
  gloves: string; boots: string; scale?: number; goggles?: boolean; beard?: boolean; coat?: boolean; bulk?: number; target?: boolean; hair?: string;
}

export const STYLE_FROM_COS = (c: Cosmetics): CharStyle => {
  const sk = COS_MAP[c.skin], he = COS_MAP[c.helmet], pk = COS_MAP[c.pack], gl = COS_MAP[c.gloves];
  return {
    tone: "#d9a67a", shirt: sk.c, pants: sk.c2 ?? "#333", vest: sk.c3 ?? "#222", accent: "#2f7fb5",
    helmet: (he.id.replace("helm_", "") as CharStyle["helmet"]), helmetC: he.c,
    pack: pk.id.replace("pack_", "") as CharStyle["pack"], packC: pk.c, packC2: pk.c2, gloves: gl.c, boots: "#1c1a18", hair: "#3b2a1c",
  };
};

const TEAM_PALETTES = [
  { shirt: "#2f5f8a", pants: "#26384d", vest: "#1d2a3a", accent: "#4fb4ff", helmetC: "#2f4258" }, // 0 blue allies
  { shirt: "#3b3f45", pants: "#2b2e33", vest: "#1f2226", accent: "#d02d2d", helmetC: "#2d3034" }, // 1 red legion
  { shirt: "#6a5a2f", pants: "#473d22", vest: "#2e2814", accent: "#e8c437", helmetC: "#4a4224" },
  { shirt: "#4d3a68", pants: "#322648", vest: "#201832", accent: "#c07dff", helmetC: "#382b50" },
  { shirt: "#2e6a58", pants: "#1f4538", vest: "#16312a", accent: "#4dffc2", helmetC: "#24493e" },
  { shirt: "#7a4a2a", pants: "#4d2f1b", vest: "#331f12", accent: "#ff9a4a", helmetC: "#553420" },
  { shirt: "#5a5a5a", pants: "#3a3a3a", vest: "#242424", accent: "#ffffff", helmetC: "#444" },
  { shirt: "#6a2f55", pants: "#472038", vest: "#2e1424", accent: "#ff5fb8", helmetC: "#4d2040" },
  { shirt: "#3d6a2f", pants: "#2a4720", vest: "#1d3016", accent: "#9aff5f", helmetC: "#2e4f24" },
];
export const KIND_WEAPON: Record<EnemyKind, string> = { grunt: "falcon", smg: "hornet", shotgun: "hammer", sniper: "longbow", heavy: "titan", commander: "vanguard", dummy: "" };

export function charStyle(kind: EnemyKind, team: number, variant = 0): CharStyle {
  const pal = TEAM_PALETTES[team === 0 ? 0 : team === 1 ? 1 : 2 + ((team + variant) % (TEAM_PALETTES.length - 2))];
  const tones = ["#e0b48a", "#c58c63", "#8d5a3a", "#f0c9a0", "#a8714b"];
  const base: CharStyle = {
    tone: tones[(team * 3 + variant) % tones.length], shirt: pal.shirt, pants: pal.pants, vest: pal.vest, accent: pal.accent,
    helmet: "standard", helmetC: pal.helmetC, pack: "none", packC: pal.vest, gloves: "#1b1b1d", boots: "#17140f", hair: ["#2a1d12", "#5a3a1a", "#111", "#7a5a2a"][variant % 4],
  };
  switch (kind) {
    case "grunt": return { ...base, pack: variant % 2 ? "assault" : "none", goggles: variant % 3 === 0 };
    case "smg": return { ...base, helmet: "balaclava", helmetC: "#18191b", goggles: true, pack: "radio" };
    case "shotgun": return { ...base, helmet: "balaclava", helmetC: "#222", vest: "#14161a", bulk: 1.08, pack: "assault", beard: false };
    case "sniper": return { ...base, shirt: "#4a5a30", pants: "#394526", vest: "#2d3820", helmet: "boonie", helmetC: "#4f6034", pack: "assault", packC: "#3a4a28", beard: true };
    case "heavy": return { ...base, helmet: "heavy", helmetC: "#1c1d20", scale: 1.16, bulk: 1.25, pack: "assault", packC: "#2b2c30", vest: "#16171a" };
    case "commander": return { ...base, shirt: "#2a2326", pants: "#1d1a1c", vest: "#3b1316", helmet: "cap", helmetC: "#1a1214", accent: "#e8c437", coat: true, beard: true, pack: "none", scale: 1.08, gloves: "#0d0d0e" };
    case "dummy": return { ...base, shirt: "#e8e8e8", pants: "#d9d9d9", vest: "#d9482a", accent: "#d9482a", helmet: "none", helmetC: "#fff", target: true, tone: "#c7a77e", gloves: "#d9482a" };
  }
}

interface CharGeos { head: THREE.BufferGeometry; torso: THREE.BufferGeometry; armL: THREE.BufferGeometry; armR: THREE.BufferGeometry; legL: THREE.BufferGeometry; legR: THREE.BufferGeometry }
const charCache = new Map<string, CharGeos>();

function buildArm(s: CharStyle, side: 1 | -1): THREE.BufferGeometry {
  const v = new VB(); const b = s.bulk ?? 1;
  v.box(0, 0.03, 0, 0.21 * b, 0.1, 0.23 * b, s.vest);
  v.box(side * 0.015, 0.05, 0, 0.1, 0.03, 0.16 * b, s.accent, undefined, 0);
  v.box(0, -0.16, 0, 0.16 * b, 0.3, 0.17 * b, s.shirt);
  v.box(0, -0.31, 0, 0.18 * b, 0.07, 0.19 * b, s.vest);
  v.box(0, -0.47, 0, 0.15 * b, 0.26, 0.16 * b, s.shirt);
  v.box(0, -0.4, 0, 0.165 * b, 0.025, 0.175 * b, s.pants, undefined, 0);
  v.box(0, -0.63, 0, 0.16 * b, 0.12, 0.17 * b, s.gloves);
  v.box(0, -0.6, -0.065, 0.14, 0.04, 0.04, s.gloves, undefined, 0.15);
  if (side === 1 && !s.target) v.box(0.085 * b, -0.2, 0, 0.012, 0.09, 0.14, s.accent, undefined, 0); // armband
  return v.geometry();
}
function buildLeg(s: CharStyle, side: 1 | -1): THREE.BufferGeometry {
  const v = new VB(); const b = s.bulk ?? 1;
  v.box(0, -0.2, 0, 0.215 * b, 0.42, 0.235 * b, s.pants);
  v.box(0, -0.43, -0.125, 0.2, 0.13, 0.05, s.vest);
  v.box(0, -0.58, 0, 0.185 * b, 0.28, 0.205 * b, s.pants);
  v.box(0, -0.7, 0, 0.2 * b, 0.05, 0.22 * b, s.vest, undefined, 0.02);
  v.box(0, -0.76, -0.025, 0.215 * b, 0.16, 0.3, s.boots);
  v.box(0, -0.84, -0.035, 0.225 * b, 0.05, 0.32, "#0c0b0a", undefined, 0);
  v.box(side * 0.125 * b, -0.27, 0, 0.04, 0.15, 0.15, s.pants === "#333" ? "#222" : s.vest);
  if (side === 1 && !s.target) { v.box(0.12, -0.3, 0.02, 0.05, 0.2, 0.1, "#1b1c1f"); v.box(0.12, -0.2, 0.02, 0.06, 0.03, 0.11, s.accent, undefined, 0); }
  return v.geometry();
}
function buildTorso(s: CharStyle): THREE.BufferGeometry {
  const v = new VB(); const b = s.bulk ?? 1;
  v.box(0, 0.04, 0, 0.5 * b, 0.12, 0.28 * b, s.pants);
  v.box(0, 0.04, 0, 0.52 * b, 0.05, 0.3 * b, "#16130f", undefined, 0);
  v.box(0, 0.04, -0.155 * b, 0.07, 0.05, 0.02, s.accent, undefined, 0);
  v.box(0, 0.37, 0, 0.52 * b, 0.5, 0.3 * b, s.shirt);
  if (s.coat) { v.box(0, -0.12, 0, 0.54, 0.34, 0.31, s.shirt); v.box(0, -0.12, -0.16, 0.12, 0.34, 0.02, s.accent, undefined, 0); }
  if (s.target) {
    v.box(0, 0.4, -0.16, 0.34, 0.34, 0.02, "#d9482a", undefined, 0); v.box(0, 0.4, -0.17, 0.22, 0.22, 0.02, "#ffffff", undefined, 0); v.box(0, 0.4, -0.18, 0.1, 0.1, 0.02, "#d9482a", undefined, 0);
    return v.geometry();
  }
  v.box(0, 0.39, -0.01, 0.5 * b, 0.4, 0.34 * b, s.vest);
  v.box(0, 0.42, -0.19 * b, 0.4 * b, 0.3, 0.05, s.vest === "#1d2a3a" ? "#2c3f55" : "#34383e");
  v.box(0, 0.42, 0.18 * b, 0.4 * b, 0.3, 0.05, "#2a2d31");
  for (let i = -1; i <= 1; i++) { v.box(i * 0.115, 0.22, -0.21 * b, 0.1, 0.12, 0.06, "#23262a"); v.box(i * 0.115, 0.285, -0.21 * b, 0.1, 0.02, 0.065, s.accent, undefined, 0); }
  v.box(-0.16 * b, 0.55, -0.01, 0.1, 0.07, 0.36 * b, s.vest);
  v.box(0.16 * b, 0.55, -0.01, 0.1, 0.07, 0.36 * b, s.vest);
  v.box(-0.22 * b, 0.45, -0.17, 0.06, 0.1, 0.04, "#111", undefined, 0); // radio mic
  v.box(0, 0.62, 0, 0.24, 0.08, 0.2, s.shirt);
  v.box(0, 0.54, -0.2 * b, 0.08, 0.07, 0.03, s.accent, undefined, 0);
  // backpack
  const pk = s.pack;
  if (pk === "assault") {
    v.box(0, 0.4, 0.26 * b, 0.38, 0.44, 0.2, s.packC); v.box(-0.22, 0.28, 0.26, 0.07, 0.18, 0.14, s.packC); v.box(0.22, 0.28, 0.26, 0.07, 0.18, 0.14, s.packC);
    v.box(0, 0.68, 0.27, 0.4, 0.09, 0.09, "#6b5a3a"); v.box(0, 0.4, 0.37, 0.3, 0.16, 0.03, "#23262a");
  } else if (pk === "medic") {
    v.box(0, 0.4, 0.26 * b, 0.38, 0.44, 0.2, s.packC); v.box(0, 0.4, 0.365, 0.2, 0.06, 0.02, s.packC2 ?? "#c0272d", undefined, 0); v.box(0, 0.4, 0.365, 0.06, 0.2, 0.02, s.packC2 ?? "#c0272d", undefined, 0);
  } else if (pk === "radio") {
    v.box(0, 0.35, 0.25 * b, 0.3, 0.32, 0.14, s.packC); v.box(0.1, 0.78, 0.28, 0.025, 0.4, 0.025, "#111", undefined, 0); v.box(-0.08, 0.35, 0.33, 0.1, 0.08, 0.02, "#3cff7a", undefined, 0);
  }
  return v.geometry();
}
function buildHead(s: CharStyle): THREE.BufferGeometry {
  const v = new VB();
  const skin = s.tone; const dark = new THREE.Color(skin).multiplyScalar(0.75).getStyle();
  const mask = s.helmet === "balaclava" || s.helmet === "heavy";
  v.box(0, -0.02, 0, 0.14, 0.1, 0.14, mask ? s.helmetC : skin);
  v.box(0, 0.2, 0, 0.34, 0.34, 0.34, mask ? s.helmetC : skin);
  // face
  if (!mask || s.helmet === "balaclava") {
    if (s.helmet === "balaclava") v.box(0, 0.22, -0.172, 0.28, 0.07, 0.01, skin, undefined, 0.02);
    else {
      v.box(-0.075, 0.22, -0.172, 0.07, 0.05, 0.015, "#f4f4f4", undefined, 0); v.box(0.075, 0.22, -0.172, 0.07, 0.05, 0.015, "#f4f4f4", undefined, 0);
      v.box(-0.065, 0.22, -0.18, 0.035, 0.045, 0.012, "#1a2a3a", undefined, 0); v.box(0.085, 0.22, -0.18, 0.035, 0.045, 0.012, "#1a2a3a", undefined, 0);
      v.box(-0.075, 0.27, -0.175, 0.085, 0.022, 0.015, s.hair ?? "#2a1d12", undefined, 0); v.box(0.075, 0.27, -0.175, 0.085, 0.022, 0.015, s.hair ?? "#2a1d12", undefined, 0);
      v.box(0, 0.16, -0.19, 0.055, 0.08, 0.05, dark);
      v.box(0, 0.08, -0.175, 0.11, 0.02, 0.012, "#5a2a2a", undefined, 0);
      v.box(-0.19, 0.18, 0, 0.04, 0.08, 0.06, dark); v.box(0.19, 0.18, 0, 0.04, 0.08, 0.06, dark);
    }
    if (s.beard) v.box(0, 0.07, -0.16, 0.24, 0.1, 0.05, s.hair ?? "#222", undefined, 0.05);
    if (s.goggles) { v.box(0, 0.23, -0.185, 0.3, 0.08, 0.03, "#111", undefined, 0); v.box(-0.075, 0.23, -0.2, 0.1, 0.06, 0.012, "#ff9a2a", undefined, 0); v.box(0.075, 0.23, -0.2, 0.1, 0.06, 0.012, "#ff9a2a", undefined, 0); }
  }
  const hc = s.helmetC;
  switch (s.helmet) {
    case "standard":
      v.box(0, 0.36, 0, 0.4, 0.12, 0.4, hc); v.box(0, 0.3, 0.1, 0.4, 0.2, 0.2, hc); v.box(0, 0.31, -0.2, 0.36, 0.035, 0.05, hc);
      v.box(-0.2, 0.22, -0.02, 0.025, 0.14, 0.02, "#222", undefined, 0); v.box(0.2, 0.22, -0.02, 0.025, 0.14, 0.02, "#222", undefined, 0);
      v.box(0, 0.4, -0.12, 0.1, 0.05, 0.08, s.accent, undefined, 0.03); v.box(0, 0.37, -0.19, 0.12, 0.06, 0.04, "#1a1a1a");
      break;
    case "boonie":
      v.box(0, 0.33, 0, 0.56, 0.03, 0.56, hc); v.box(0, 0.4, 0, 0.36, 0.1, 0.36, hc); v.box(0, 0.37, 0, 0.375, 0.03, 0.375, "#2d2a1c", undefined, 0);
      break;
    case "beret":
      v.box(0.03, 0.38, 0, 0.42, 0.07, 0.4, hc); v.box(-0.04, 0.34, 0.02, 0.36, 0.05, 0.36, hc); v.box(0.02, 0.43, 0, 0.04, 0.04, 0.04, hc); v.box(-0.12, 0.37, -0.2, 0.06, 0.06, 0.02, "#e8c437", undefined, 0);
      break;
    case "tactical":
      v.box(0, 0.36, 0, 0.4, 0.12, 0.4, hc); v.box(0, 0.3, 0.1, 0.4, 0.2, 0.2, hc);
      v.box(0, 0.3, -0.2, 0.32, 0.1, 0.05, "#35d6ff", undefined, 0);
      v.box(-0.22, 0.2, 0, 0.07, 0.12, 0.14, "#15171a"); v.box(0.22, 0.2, 0, 0.07, 0.12, 0.14, "#15171a"); v.box(0.24, 0.1, -0.08, 0.02, 0.1, 0.02, "#111");
      v.box(0.12, 0.43, 0, 0.02, 0.1, 0.02, "#111", undefined, 0);
      break;
    case "heavy":
      v.box(0, 0.36, 0, 0.44, 0.16, 0.44, hc); v.box(0, 0.24, 0.12, 0.44, 0.3, 0.2, hc); v.box(0, 0.2, -0.2, 0.34, 0.12, 0.04, "#ff3a2a", undefined, 0);
      v.box(0, 0.08, -0.2, 0.22, 0.1, 0.05, "#2a2c30"); v.box(0, 0.08, -0.23, 0.14, 0.02, 0.012, "#0a0a0a", undefined, 0);
      break;
    case "cap":
      v.box(0, 0.37, 0, 0.4, 0.1, 0.4, hc); v.box(0, 0.33, -0.22, 0.38, 0.03, 0.14, "#0d0a0b"); v.box(0, 0.37, -0.205, 0.08, 0.07, 0.015, s.accent, undefined, 0);
      break;
    case "balaclava":
      v.box(0, 0.4, 0, 0.37, 0.05, 0.37, hc, undefined, 0.02);
      break;
    case "none":
      v.box(0, 0.38, 0, 0.36, 0.06, 0.36, s.hair ?? "#222"); v.box(0, 0.3, 0.14, 0.36, 0.16, 0.08, s.hair ?? "#222");
      break;
  }
  if (!["standard", "boonie", "beret", "tactical", "heavy", "cap", "balaclava", "none"].includes(s.helmet)) v.box(0, 0.38, 0, 0.36, 0.06, 0.36, s.hair ?? "#222");
  return v.geometry();
}

function getCharGeos(s: CharStyle): CharGeos {
  const key = JSON.stringify(s);
  let g = charCache.get(key);
  if (!g) {
    g = { head: buildHead(s), torso: buildTorso(s), armL: buildArm(s, -1), armR: buildArm(s, 1), legL: buildLeg(s, -1), legR: buildLeg(s, 1) };
    charCache.set(key, g);
  }
  return g;
}

export interface Rig {
  root: THREE.Group; torso: THREE.Group; head: THREE.Group; armL: THREE.Group; armR: THREE.Group; legL: THREE.Group; legR: THREE.Group;
  weapon: THREE.Group | null; muzzle: THREE.Vector3; meshes: THREE.Mesh[];
}
export function makeRig(style: CharStyle, weaponId: string, camo = "camo_none"): Rig {
  const g = getCharGeos(style); const m = mats();
  const mk = (geo: THREE.BufferGeometry) => { const me = new THREE.Mesh(geo, m.lit); me.castShadow = true; return me; };
  const root = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  const grp = (geo: THREE.BufferGeometry, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const gr = new THREE.Group(); gr.position.set(x, y, z); const me = mk(geo); gr.add(me); meshes.push(me); parent.add(gr); gr.rotation.order = "YXZ"; return gr;
  };
  const b = style.bulk ?? 1;
  const legL = grp(g.legL, -0.13 * b, 0.86, 0, root), legR = grp(g.legR, 0.13 * b, 0.86, 0, root);
  const torso = grp(g.torso, 0, 0.86, 0, root);
  const head = grp(g.head, 0, 0.64, 0, torso);
  const armL = grp(g.armL, -0.37 * b, 0.56, 0, torso), armR = grp(g.armR, 0.37 * b, 0.56, 0, torso);
  let weapon: THREE.Group | null = null; const muzzle = new THREE.Vector3(0, 0.05, -0.8);
  if (weaponId) {
    weapon = buildWeaponModel(weaponId, camo, [], true);
    weapon.position.set(0.1, 0.38, -0.5); torso.add(weapon);
    muzzle.copy(weapon.userData.muzzle as THREE.Vector3);
  }
  root.scale.setScalar(style.scale ?? 1);
  return { root, torso, head, armL, armR, legL, legR, weapon, muzzle, meshes };
}

// ---------------------------------------------------------------- weapons
interface GunSpec {
  recL: number; recH: number; recW: number; hand: number; bar: number; stock: number;
  mag: "box" | "curve" | "drum" | "pistol" | "none"; magH: number; magW?: number;
  sight?: "iron" | "scope" | "none"; tube?: boolean; pump?: boolean; revolver?: boolean; launcher?: boolean; bipod?: boolean; slide?: boolean; handleCarry?: boolean; lh?: number;
}
const SPEC: Record<string, GunSpec> = {
  p9: { recL: 0.17, recH: 0.045, recW: 0.032, hand: 0, bar: 0.02, stock: 0, mag: "pistol", magH: 0.1, sight: "iron", slide: true, lh: 0.02 },
  mag50: { recL: 0.12, recH: 0.06, recW: 0.036, hand: 0.02, bar: 0.17, stock: 0, mag: "none", magH: 0, sight: "iron", revolver: true, lh: 0.02 },
  hornet: { recL: 0.26, recH: 0.07, recW: 0.04, hand: 0.1, bar: 0.05, stock: 0.1, mag: "box", magH: 0.17, magW: 0.035, sight: "iron", lh: 0.2 },
  mamba: { recL: 0.22, recH: 0.07, recW: 0.042, hand: 0.08, bar: 0.04, stock: 0.04, mag: "box", magH: 0.22, magW: 0.032, sight: "iron", lh: 0.16 },
  falcon: { recL: 0.3, recH: 0.075, recW: 0.042, hand: 0.2, bar: 0.1, stock: 0.2, mag: "curve", magH: 0.16, sight: "iron", handleCarry: true, lh: 0.3 },
  vanguard: { recL: 0.34, recH: 0.082, recW: 0.046, hand: 0.18, bar: 0.12, stock: 0.22, mag: "box", magH: 0.14, magW: 0.04, sight: "scope", lh: 0.34 },
  longbow: { recL: 0.3, recH: 0.07, recW: 0.04, hand: 0.26, bar: 0.34, stock: 0.26, mag: "box", magH: 0.05, magW: 0.035, sight: "scope", lh: 0.4 },
  hammer: { recL: 0.28, recH: 0.07, recW: 0.045, hand: 0.1, bar: 0.34, stock: 0.24, mag: "none", magH: 0, sight: "iron", tube: true, pump: true, lh: 0.38 },
  titan: { recL: 0.38, recH: 0.09, recW: 0.055, hand: 0.2, bar: 0.22, stock: 0.2, mag: "drum", magH: 0.13, sight: "iron", bipod: true, handleCarry: true, lh: 0.4 },
  boom40: { recL: 0.2, recH: 0.1, recW: 0.1, hand: 0.1, bar: 0.4, stock: 0.1, mag: "none", magH: 0, sight: "iron", launcher: true, lh: 0.3 },
};
export const gunLeftHand = (id: string) => SPEC[id]?.lh ?? 0.2;
const wcache = new Map<string, THREE.Group>();

export function buildWeaponModel(id: string, camo = "camo_none", att: string[] = [], forRig = false): THREE.Group {
  const key = `${id}|${camo}|${att.join(",")}`;
  const c = wcache.get(key);
  if (c) return c.clone(true);
  const def = getWeapon(id); const m = mats(); const co = COS_MAP[camo] ?? COS_MAP.camo_none;
  const group = new THREE.Group(); const vb = new VB(); const mb = new VB();
  const dark = "#25282e", mid = "#3a3f47", body = co.id === "camo_none" ? "#2e323a" : co.c, wood = co.id === "camo_none" ? "#4a3a2b" : (co.c2 ?? co.c);
  let muzzleZ = -0.5;
  if (def.cat === "melee") {
    const mach = id === "machete";
    vb.box(0, 0, 0.04, 0.034, 0.04, 0.14, "#1d1d20"); vb.box(0, 0, 0.0, 0.035, 0.034, 0.02, "#8a8f96"); vb.box(0, 0, -0.01, 0.015, 0.075, 0.02, "#6c7077");
    const bl = mach ? 0.42 : 0.22; const bw = mach ? 0.075 : 0.05;
    mb.box(0, 0, -0.02 - bl / 2, 0.012, bw, bl, mach ? "#aeb4ba" : "#c3c8ce", undefined, 0.03);
    mb.box(0, -bw / 2 + 0.008, -0.02 - bl / 2, 0.014, 0.012, bl, "#e8ecef", undefined, 0);
    mb.box(0, 0.0, -0.02 - bl + 0.0, 0.012, bw * 0.6, 0.025, "#c3c8ce", [0.3, 0, 0], 0.03);
    muzzleZ = -0.3;
    const mesh = new THREE.Mesh(vb.geometry(), m.lit); const mesh2 = new THREE.Mesh(mb.geometry(), m.metal); mesh.castShadow = mesh2.castShadow = forRig;
    group.add(mesh, mesh2);
  } else {
    const s = SPEC[id] ?? SPEC.falcon;
    const rz = -s.recL / 2 + 0.05;
    if (s.slide) { vb.box(0, 0.015, rz, s.recW, s.recH, s.recL, mid); vb.box(0, -0.03, rz + 0.01, s.recW * 0.8, 0.03, s.recL * 0.9, dark); }
    else if (s.launcher) {
      vb.box(0, 0.03, -0.1, 0.1, 0.1, 0.42, "#3b4230"); vb.box(0, 0.03, -0.37, 0.12, 0.12, 0.05, dark); vb.box(0, 0.03, -0.1 - 0.35, 0.115, 0.115, 0.04, dark);
      vb.box(0, -0.02, 0.1, 0.1, 0.1, 0.2, "#3b4230");
    } else vb.box(0, 0.02, rz, s.recW, s.recH, s.recL, body);
    if (!s.slide && !s.launcher) vb.box(0, 0.02 - s.recH * 0.2, rz, s.recW + 0.006, s.recH * 0.35, s.recL * 0.5, dark, undefined, 0.02);
    // grip + trigger
    vb.box(0, -0.065, 0.05, 0.035, 0.1, 0.05, s.slide ? mid : dark, [0.22, 0, 0]);
    vb.box(0, -0.03, -0.02, 0.01, 0.025, 0.07, dark, undefined, 0); vb.box(0, -0.043, -0.045, 0.01, 0.01, 0.045, dark, undefined, 0);
    let barStart = -(s.recL - 0.05);
    // handguard
    if (s.hand > 0 && !s.launcher) {
      vb.box(0, 0.015, barStart - s.hand / 2, s.recW + 0.012, s.recH * 0.85, s.hand, s.revolver ? dark : wood);
      vb.box(0, 0.015 + s.recH * 0.45, barStart - s.hand / 2, 0.012, 0.012, s.hand, dark, undefined, 0);
      barStart -= s.hand;
    }
    if (s.revolver) { vb.box(0, 0.025, rz - 0.02, 0.058, 0.058, 0.065, "#5a5f68"); vb.box(0, -0.05, rz + 0.07, 0.04, 0.03, 0.05, dark); }
    // barrel
    const bt = s.launcher ? 0.07 : 0.018;
    if (!s.launcher) vb.box(0, 0.025, barStart - s.bar / 2, bt, bt, s.bar, "#15171a", undefined, 0);
    muzzleZ = s.launcher ? -0.55 : barStart - s.bar;
    if (!s.launcher && !s.slide) vb.box(0, 0.025, muzzleZ + 0.012, 0.03, 0.03, 0.05, dark, undefined, 0);
    if (att.includes("suppressor")) { vb.box(0, 0.025, muzzleZ - 0.07, 0.04, 0.04, 0.16, "#15171a", undefined, 0); muzzleZ -= 0.14; }
    else if (att.includes("comp")) { vb.box(0, 0.025, muzzleZ - 0.02, 0.035, 0.035, 0.05, "#1a1c20", undefined, 0); vb.box(0, 0.025, muzzleZ - 0.02, 0.05, 0.012, 0.03, "#1a1c20", undefined, 0); muzzleZ -= 0.03; }
    if (att.includes("longbarrel")) { vb.box(0, 0.025, muzzleZ - 0.05, 0.02, 0.02, 0.1, "#15171a", undefined, 0); muzzleZ -= 0.1; }
    if (s.tube) vb.box(0, -0.012, barStart - (s.bar * 0.45), 0.026, 0.026, s.bar * 0.9, dark, undefined, 0);
    if (s.pump) vb.box(0, -0.012, barStart - 0.08, 0.05, 0.04, 0.13, wood);
    if (s.bipod) { vb.box(-0.03, -0.05, muzzleZ + 0.1, 0.01, 0.1, 0.01, dark, [0, 0, 0.3]); vb.box(0.03, -0.05, muzzleZ + 0.1, 0.01, 0.1, 0.01, dark, [0, 0, -0.3]); }
    // stock
    if (s.stock > 0) {
      const hv = att.includes("heavystock") ? 0.012 : 0;
      vb.box(0, 0.0, 0.05 + s.stock / 2, 0.034 + hv, 0.06 + hv, s.stock, wood);
      vb.box(0, -0.01, 0.05 + s.stock, 0.04 + hv, 0.09 + hv, 0.02, "#111", undefined, 0);
    }
    // grip attach
    if (att.includes("vgrip")) vb.box(0, -0.06, barStart + 0.02, 0.025, 0.07, 0.025, dark);
    if (att.includes("anglegrip")) vb.box(0, -0.04, barStart + 0.02, 0.025, 0.04, 0.07, dark, [0.5, 0, 0]);
    // sights / optics
    const optic = att.find((a) => ["reddot", "holo", "scope4"].includes(a));
    const sz = rz;
    if (optic === "reddot") { vb.box(0, 0.075, sz, 0.03, 0.035, 0.05, "#15171a"); vb.box(0, 0.082, sz - 0.026, 0.02, 0.022, 0.006, "#ff2a2a", undefined, 0); }
    else if (optic === "holo") { vb.box(0, 0.08, sz, 0.04, 0.045, 0.07, "#15171a"); vb.box(0, 0.09, sz - 0.036, 0.03, 0.03, 0.006, "#3affd8", undefined, 0); }
    else if (optic === "scope4" || s.sight === "scope") {
      const L = id === "longbow" ? 0.22 : 0.15;
      vb.box(0, 0.085, sz, 0.034, 0.034, L, "#15171a", undefined, 0); vb.box(0, 0.085, sz - L / 2 - 0.01, 0.044, 0.044, 0.025, "#15171a", undefined, 0); vb.box(0, 0.085, sz + L / 2 + 0.01, 0.04, 0.04, 0.02, "#15171a", undefined, 0);
      vb.box(0, 0.085, sz - L / 2 - 0.024, 0.032, 0.032, 0.004, "#3ab0ff", undefined, 0);
      vb.box(0, 0.055, sz - 0.04, 0.012, 0.03, 0.02, dark, undefined, 0); vb.box(0, 0.055, sz + 0.05, 0.012, 0.03, 0.02, dark, undefined, 0);
    } else if (s.sight === "iron") {
      vb.box(0, 0.068 + (s.slide ? 0.0 : 0.012), s.slide ? rz - s.recL / 2 + 0.012 : barStart + 0.03, 0.008, 0.02, 0.012, dark, undefined, 0);
      vb.box(0, 0.068 + (s.slide ? 0.0 : 0.012), s.slide ? rz + s.recL / 2 - 0.01 : sz + 0.08, 0.026, 0.02, 0.012, dark, undefined, 0);
      if (s.handleCarry && !optic) { vb.box(0, 0.082, sz + 0.02, 0.016, 0.014, 0.14, dark, undefined, 0); }
    }
    if (s.recL > 0.2 && !optic && s.sight !== "scope") vb.box(0, 0.06, rz, 0.02, 0.006, s.recL * 0.85, dark, undefined, 0);
    group.add(Object.assign(new THREE.Mesh(vb.geometry(), m.metal), { castShadow: forRig }));
    // magazine (own mesh for reload anim)
    if (s.mag !== "none") {
      const mg = new THREE.Group(); mg.name = "mag"; const w = s.magW ?? 0.034;
      const mz = s.mag === "pistol" ? 0.05 : rz + 0.02;
      const ext = att.includes("extmag") ? 1.35 : 1;
      if (s.mag === "box") { mb.box(0, -s.recH / 2 - (s.magH * ext) / 2, mz, w, s.magH * ext, 0.05, "#1c1e22", [0.05, 0, 0]); mb.box(0, -s.recH / 2 - (s.magH * ext), mz, w + 0.006, 0.012, 0.056, "#0f1012", undefined, 0); }
      if (s.mag === "curve") { mb.box(0, -s.recH / 2 - 0.05, mz, 0.034, 0.1, 0.05, "#1c1e22", [0.1, 0, 0]); mb.box(0, -s.recH / 2 - 0.13 * ext, mz - 0.02 * ext, 0.034, 0.08 * ext, 0.05, "#1c1e22", [0.35, 0, 0]); }
      if (s.mag === "drum") { mb.box(0, -s.recH / 2 - 0.07, mz, 0.1, 0.13, 0.1, "#23262a"); mb.box(0, -s.recH / 2 - 0.07, mz, 0.11, 0.06, 0.06, "#15171a"); }
      if (s.mag === "pistol") { mb.box(0, -0.07, mz, 0.026, 0.05, 0.045, "#1c1e22"); }
      const mm = new THREE.Mesh(mb.geometry(), m.metal); mm.castShadow = forRig; mg.add(mm); group.add(mg);
    }
  }
  group.userData.muzzle = new THREE.Vector3(0, 0.025, muzzleZ - 0.02);
  wcache.set(key, group);
  return group.clone(true);
}

// ---- first-person arm (extends along +Z from the hand)
const armCache = new Map<string, THREE.BufferGeometry>();
export function buildVMArm(sleeve: string, glove: string, trim: string): THREE.Mesh {
  const key = sleeve + glove + trim;
  let g = armCache.get(key);
  if (!g) {
    const v = new VB();
    v.box(0, 0, 0.015, 0.075, 0.07, 0.11, glove); v.box(0, 0.032, -0.02, 0.07, 0.014, 0.04, "#0f0f10", undefined, 0.1);
    v.box(0, 0, 0.1, 0.082, 0.078, 0.05, "#222");
    v.box(0, 0, 0.3, 0.092, 0.09, 0.36, sleeve);
    v.box(0, 0, 0.16, 0.098, 0.098, 0.03, trim, undefined, 0);
    v.box(0, 0.0, 0.52, 0.11, 0.11, 0.1, sleeve, undefined, 0.03);
    g = v.geometry(); armCache.set(key, g);
  }
  return new THREE.Mesh(g, mats().lit);
}

export function buildGrenadeModel(type: GrenadeType, scale = 1): THREE.Group {
  const v = new VB(); const m = mats();
  const col = type === "frag" ? "#4b5a34" : type === "smoke" ? "#8a9096" : "#c9b27a";
  v.box(0, 0, 0, 0.06, 0.09, 0.06, col); v.box(0, 0.052, 0, 0.032, 0.02, 0.032, "#2a2d31");
  v.box(0.02, 0.05, 0, 0.012, 0.04, 0.02, "#a9aeb4", undefined, 0); v.box(0.034, 0.075, 0, 0.02, 0.02, 0.01, "#d4a52a", undefined, 0);
  v.box(0, 0.005, 0, 0.064, 0.02, 0.064, type === "frag" ? "#2f3a21" : type === "smoke" ? "#ffffff" : "#3a7ad9", undefined, 0);
  const g = new THREE.Group(); g.add(new THREE.Mesh(v.geometry(), m.lit)); g.scale.setScalar(scale); return g;
}
