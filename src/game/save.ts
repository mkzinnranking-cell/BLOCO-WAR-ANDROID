import type { BtnId, HudBtn, MatchResult, SaveData, Settings } from "./types";

const KEY = "ebano_fps_save_v1";

export const DEFAULT_HUD: Record<BtnId, HudBtn> = {
  joy: { x: 14, y: 70, s: 1.3 },
  sprint: { x: 31, y: 85, s: 0.9 },
  grenade: { x: 7, y: 40, s: 0.9 },
  ability: { x: 21, y: 36, s: 0.9 },
  interact: { x: 50, y: 74, s: 1 },
  fire: { x: 87, y: 68, s: 1.5 },
  ads: { x: 70, y: 80, s: 1 },
  reload: { x: 76, y: 50, s: 1 },
  jump: { x: 94, y: 44, s: 1 },
  melee: { x: 86, y: 37, s: 0.9 },
  switch: { x: 94, y: 24, s: 0.9 },
};

export function detectQuality(): "low" | "med" | "high" {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
  const px = Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1);
  if (cores <= 4 || mem <= 3) return "low";
  if (cores >= 8 && mem >= 6 && px < 3000) return "high";
  return "med";
}

export function defaultSettings(): Settings {
  return {
    quality: "auto", shadows: true, particles: 1, viewDist: 1, effects: true, fpsCap: 60, showFps: false,
    sens: 1, adsSens: 0.7, invertY: false, aimAssist: 0.5, vibration: 0.6,
    master: 0.8, music: 0.5, sfx: 0.9, voice: 0.9,
    hitmarker: true, blood: false, damageIndicators: true, subtitles: true, highContrast: false,
    uiScale: 1, hudOpacity: 0.75, crosshairSize: 1, joystickFloating: true,
    hud: JSON.parse(JSON.stringify(DEFAULT_HUD)),
  };
}

export function defaultSave(): SaveData {
  return {
    v: 1, name: "Recruta", firstRun: true, tutorialDone: false, xp: 0, credits: 500, campaign: {},
    owned: ["p9", "hornet", "falcon", "knife", "skin_recruit", "helm_standard", "pack_none", "gl_black", "camo_none", "tr_yellow"],
    loadout: { primary: "falcon", secondary: "p9", melee: "knife", grenade: "frag", equipment: "medkit" },
    attach: {},
    cosmetics: { skin: "skin_recruit", helmet: "helm_standard", pack: "pack_none", gloves: "gl_black", camo: "camo_none", tracer: "tr_yellow" },
    stats: { matches: 0, wins: 0, losses: 0, kills: 0, deaths: 0, shots: 0, hits: 0, headshots: 0, playtime: 0, weaponKills: {} },
    challenges: {},
    settings: defaultSettings(),
  };
}

export function loadSave(): SaveData {
  const d = defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<SaveData>;
    const s: SaveData = {
      ...d, ...p,
      loadout: { ...d.loadout, ...p.loadout },
      cosmetics: { ...d.cosmetics, ...p.cosmetics },
      stats: { ...d.stats, ...p.stats, weaponKills: { ...(p.stats?.weaponKills ?? {}) } },
      settings: { ...d.settings, ...p.settings, hud: { ...d.settings.hud, ...(p.settings?.hud ?? {}) } },
    };
    return s;
  } catch {
    return d;
  }
}
export function persist(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

// ---------- progression ----------
export const xpToNext = (level: number) => 120 + (level - 1) * 80;
export function levelInfo(xp: number) {
  let level = 1, rem = xp;
  while (rem >= xpToNext(level) && level < 99) { rem -= xpToNext(level); level++; }
  return { level, cur: rem, need: xpToNext(level), pct: rem / xpToNext(level) };
}
export const RANKS = ["Recruta", "Soldado", "Cabo", "Sargento", "Subtenente", "Tenente", "Capitão", "Major", "Coronel", "General", "Lenda"];
export const rankName = (level: number) => RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 4))];

export function applyResult(save: SaveData, r: MatchResult): { levelBefore: number; levelAfter: number } {
  const levelBefore = levelInfo(save.xp).level;
  save.xp += r.xp;
  save.credits += r.credits;
  const st = save.stats;
  st.matches++;
  if (r.win) st.wins++; else st.losses++;
  st.kills += r.kills; st.deaths += r.deaths; st.shots += r.shots; st.hits += r.hits; st.headshots += r.headshots; st.playtime += r.time;
  for (const [k, v] of Object.entries(r.weaponKills)) st.weaponKills[k] = (st.weaponKills[k] ?? 0) + v;
  if (r.kind === "tutorial" && r.win) save.tutorialDone = true;
  if (r.kind === "campaign" && r.win && r.missionId) {
    const prev = save.campaign[r.missionId];
    const order = "DCBAS";
    if (!prev || order.indexOf(r.rank ?? "D") > order.indexOf(prev.rank) || r.score > prev.score) {
      save.campaign[r.missionId] = { rank: r.rank ?? "D", score: Math.max(r.score, prev?.score ?? 0), time: prev ? Math.min(prev.time, r.time) : r.time };
    }
  }
  if (r.kind === "challenge" && r.challengeId) {
    const c = save.challenges[r.challengeId] ?? { done: false, best: 0 };
    if (r.win) c.done = true;
    c.best = Math.max(c.best, r.score);
    save.challenges[r.challengeId] = c;
  }
  persist(save);
  return { levelBefore, levelAfter: levelInfo(save.xp).level };
}
