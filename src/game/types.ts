export type BtnId = "fire" | "ads" | "reload" | "sprint" | "jump" | "switch" | "melee" | "grenade" | "interact" | "ability" | "joy";
export interface HudBtn { x: number; y: number; s: number }
export type QualityId = "low" | "med" | "high";
export type Difficulty = "easy" | "normal" | "hard" | "extreme";
export type ModeKind = "campaign" | "tutorial" | "dm" | "tdm" | "dom" | "survival" | "training" | "challenge";
export type EnemyKind = "grunt" | "smg" | "shotgun" | "sniper" | "heavy" | "commander" | "dummy";
export type GrenadeType = "frag" | "smoke" | "flash";
export type Equipment = "medkit" | "adrenaline" | "radar" | "armor";

export interface Settings {
  quality: QualityId | "auto";
  shadows: boolean;
  particles: number; // 0..1
  viewDist: number; // 0.5..1.2
  effects: boolean;
  fpsCap: number;
  showFps: boolean;
  sens: number;
  adsSens: number;
  invertY: boolean;
  aimAssist: number; // 0..1
  vibration: number; // 0..1
  master: number;
  music: number;
  sfx: number;
  voice: number;
  hitmarker: boolean;
  damageIndicators: boolean;
  blood: boolean;
  subtitles: boolean;
  highContrast: boolean;
  uiScale: number;
  hudOpacity: number;
  crosshairSize: number;
  joystickFloating: boolean;
  hud: Record<BtnId, HudBtn>;
}

export interface Loadout { primary: string; secondary: string; melee: string; grenade: GrenadeType; equipment: Equipment }
export interface Cosmetics { skin: string; helmet: string; pack: string; gloves: string; camo: string; tracer: string }

export interface SaveData {
  v: number;
  name: string;
  firstRun: boolean;
  tutorialDone: boolean;
  xp: number;
  credits: number;
  campaign: Record<number, { rank: string; score: number; time: number }>;
  owned: string[];
  loadout: Loadout;
  attach: Record<string, Record<string, string>>;
  cosmetics: Cosmetics;
  stats: {
    matches: number; wins: number; losses: number; kills: number; deaths: number; shots: number; hits: number;
    headshots: number; playtime: number; weaponKills: Record<string, number>;
  };
  challenges: Record<string, { done: boolean; best: number }>;
  settings: Settings;
}

export interface MatchConfig {
  kind: ModeKind;
  mapId: string;
  difficulty: Difficulty;
  bots: number;
  missionId?: number;
  challengeId?: string;
  startObjective?: number;
  teamPick?: 0 | 1;
  allies?: number;
  playerNames?: string[];
}

export interface MatchResult {
  win: boolean;
  kind: ModeKind;
  title: string;
  sub: string;
  kills: number;
  deaths: number;
  assists: number;
  accuracy: number;
  headshots: number;
  time: number;
  xp: number;
  credits: number;
  rank?: string;
  score: number;
  missionId?: number;
  challengeId?: string;
  shots: number;
  hits: number;
  weaponKills: Record<string, number>;
  extra: string[];
}
