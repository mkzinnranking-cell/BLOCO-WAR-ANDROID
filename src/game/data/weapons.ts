export type WeaponCat = "pistol" | "smg" | "ar" | "sniper" | "shotgun" | "lmg" | "special" | "melee";
export type Snd = "pistol" | "magnum" | "smg" | "rifle" | "sniper" | "shotgun" | "lmg" | "launcher" | "melee";

export interface WeaponDef {
  id: string; name: string; cat: WeaponCat; desc: string;
  dmg: number; head: number; rpm: number; auto: boolean; mag: number; reserve: number; reload: number;
  spread: number; adsSpread: number; recoil: number; recoilH: number; range: number; maxRange: number;
  pellets: number; zoom: number; move: number; adsTime: number; price: number; level: number;
  snd: Snd; scope?: boolean; projectile?: boolean; reach?: number;
}

export const CAT_NAMES: Record<WeaponCat, string> = {
  pistol: "Pistola", smg: "SMG", ar: "Rifle de Assalto", sniper: "Precisão", shotgun: "Escopeta", lmg: "Metralhadora", special: "Especial", melee: "Corpo a corpo",
};

const W = (o: Partial<WeaponDef> & Pick<WeaponDef, "id" | "name" | "cat" | "snd">): WeaponDef => ({
  desc: "", dmg: 20, head: 2, rpm: 600, auto: true, mag: 30, reserve: 120, reload: 2, spread: 2, adsSpread: 0.6, recoil: 1, recoilH: 0.4,
  range: 30, maxRange: 80, pellets: 1, zoom: 1.4, move: 1, adsTime: 0.15, price: 0, level: 1, ...o,
});

export const WEAPONS: WeaponDef[] = [
  W({ id: "p9", name: "P-9 Viper", cat: "pistol", snd: "pistol", desc: "Pistola confiável e precisa.", dmg: 24, rpm: 400, auto: false, mag: 15, reserve: 90, reload: 1.4, spread: 1.4, adsSpread: 0.4, recoil: 1.3, range: 25, maxRange: 60, zoom: 1.3, adsTime: 0.1, move: 1.05 }),
  W({ id: "mag50", name: "Magnum .50", cat: "pistol", snd: "magnum", desc: "Revólver de altíssimo impacto.", dmg: 62, head: 2.2, rpm: 160, auto: false, mag: 6, reserve: 36, reload: 2.4, spread: 1.6, adsSpread: 0.3, recoil: 4.2, range: 35, maxRange: 80, zoom: 1.3, price: 1500, level: 4, adsTime: 0.12 }),
  W({ id: "hornet", name: "VX-5 Hornet", cat: "smg", snd: "smg", desc: "SMG rápida, ótima de perto.", dmg: 17, rpm: 840, mag: 30, reserve: 180, reload: 1.7, spread: 2.6, adsSpread: 0.9, recoil: 0.8, recoilH: 0.5, range: 16, maxRange: 50, zoom: 1.35, move: 1.08, adsTime: 0.11 }),
  W({ id: "mamba", name: "Mamba PDW", cat: "smg", snd: "smg", desc: "Cadência altíssima, pente grande.", dmg: 14, rpm: 1050, mag: 40, reserve: 200, reload: 1.9, spread: 3, adsSpread: 1, recoil: 0.9, recoilH: 0.7, range: 14, maxRange: 45, zoom: 1.35, move: 1.06, price: 2200, level: 7, adsTime: 0.12 }),
  W({ id: "falcon", name: "ARX Falcon", cat: "ar", snd: "rifle", desc: "Rifle de assalto equilibrado.", dmg: 26, rpm: 640, mag: 30, reserve: 150, reload: 2.1, spread: 2.2, adsSpread: 0.45, recoil: 1.1, recoilH: 0.45, range: 38, maxRange: 110, zoom: 1.5, adsTime: 0.15 }),
  W({ id: "vanguard", name: "Vanguard BR", cat: "ar", snd: "rifle", desc: "Dano alto, recuo forte.", dmg: 36, rpm: 500, mag: 25, reserve: 125, reload: 2.4, spread: 2, adsSpread: 0.35, recoil: 1.7, recoilH: 0.6, range: 45, maxRange: 120, zoom: 1.6, move: 0.97, price: 3000, level: 9, adsTime: 0.17 }),
  W({ id: "longbow", name: "Longbow SR", cat: "sniper", snd: "sniper", desc: "Um tiro, um abate.", dmg: 105, head: 2.5, rpm: 52, auto: false, mag: 5, reserve: 30, reload: 2.8, spread: 6, adsSpread: 0.05, recoil: 5, range: 120, maxRange: 250, zoom: 4, move: 0.9, adsTime: 0.28, price: 3500, level: 6, scope: true }),
  W({ id: "hammer", name: "Hammer-12", cat: "shotgun", snd: "shotgun", desc: "Devastadora a curta distância.", dmg: 11, head: 1.6, rpm: 72, auto: false, mag: 6, reserve: 36, reload: 2.6, spread: 5.5, adsSpread: 3.8, recoil: 5, pellets: 9, range: 10, maxRange: 32, zoom: 1.2, move: 0.97, price: 1800, level: 5, adsTime: 0.16 }),
  W({ id: "titan", name: "Titan LMG", cat: "lmg", snd: "lmg", desc: "Fogo de supressão sustentado.", dmg: 24, rpm: 720, mag: 100, reserve: 200, reload: 4.2, spread: 3, adsSpread: 0.9, recoil: 0.9, recoilH: 0.8, range: 40, maxRange: 110, zoom: 1.4, move: 0.84, adsTime: 0.25, price: 4200, level: 12 }),
  W({ id: "boom40", name: "Boom-40", cat: "special", snd: "launcher", desc: "Lança-granadas explosivo.", dmg: 160, head: 1, rpm: 38, auto: false, mag: 1, reserve: 6, reload: 2.6, spread: 0.5, adsSpread: 0.1, recoil: 6, range: 200, maxRange: 200, zoom: 1.3, move: 0.92, adsTime: 0.2, price: 5000, level: 15, projectile: true }),
  W({ id: "knife", name: "Faca Tática", cat: "melee", snd: "melee", desc: "Silenciosa e rápida.", dmg: 55, head: 1.5, rpm: 130, auto: false, mag: 0, reserve: 0, reload: 0, reach: 2.1, move: 1.12 }),
  W({ id: "machete", name: "Facão", cat: "melee", snd: "melee", desc: "Golpe lento, dano brutal.", dmg: 90, head: 1.5, rpm: 80, auto: false, mag: 0, reserve: 0, reload: 0, reach: 2.4, move: 1.08, price: 900, level: 3 }),
];
export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const getWeapon = (id: string) => WEAPON_MAP[id] ?? WEAPON_MAP.p9;

export type AttSlot = "optic" | "mag" | "barrel" | "grip" | "stock" | "muzzle";
export const SLOT_NAMES: Record<AttSlot, string> = { optic: "Mira", mag: "Carregador", barrel: "Cano", grip: "Empunhadura", stock: "Coronha", muzzle: "Compensador" };
export interface Mods { dmg?: number; range?: number; recoil?: number; spread?: number; adsTime?: number; move?: number; mag?: number; reload?: number; zoom?: number; noise?: number }
export interface Attachment { id: string; slot: AttSlot; name: string; price: number; level: number; pro: string; con: string; mods: Mods }
export const ATTACHMENTS: Attachment[] = [
  { id: "reddot", slot: "optic", name: "Red Dot", price: 400, level: 2, pro: "Mira limpa, zoom 1.3x", con: "Mirar 5% mais lento", mods: { zoom: 1.3, adsTime: 1.05 } },
  { id: "holo", slot: "optic", name: "Holográfica", price: 700, level: 4, pro: "Zoom 1.7x", con: "Mirar 12% mais lento", mods: { zoom: 1.7, adsTime: 1.12 } },
  { id: "scope4", slot: "optic", name: "Luneta 4x", price: 1100, level: 7, pro: "Zoom 3.2x", con: "Mirar 30% mais lento", mods: { zoom: 3.2, adsTime: 1.3 } },
  { id: "extmag", slot: "mag", name: "Pente Estendido", price: 500, level: 3, pro: "+50% munição no pente", con: "Recarga 20% mais lenta", mods: { mag: 1.5, reload: 1.2 } },
  { id: "fastmag", slot: "mag", name: "Pente Rápido", price: 450, level: 3, pro: "Recarga 30% mais rápida", con: "-20% pente", mods: { reload: 0.7, mag: 0.8 } },
  { id: "longbarrel", slot: "barrel", name: "Cano Longo", price: 600, level: 5, pro: "+30% alcance, +precisão", con: "Mirar 15% mais lento", mods: { range: 1.3, spread: 0.85, adsTime: 1.15 } },
  { id: "shortbarrel", slot: "barrel", name: "Cano Curto", price: 550, level: 5, pro: "Mirar 20% mais rápido", con: "-20% alcance", mods: { adsTime: 0.8, range: 0.8, spread: 1.1, move: 1.03 } },
  { id: "vgrip", slot: "grip", name: "Grip Vertical", price: 500, level: 4, pro: "-20% recuo", con: "Mirar 10% mais lento", mods: { recoil: 0.8, adsTime: 1.1 } },
  { id: "anglegrip", slot: "grip", name: "Grip Angular", price: 500, level: 4, pro: "Mirar 15% mais rápido", con: "+5% recuo", mods: { adsTime: 0.85, recoil: 1.05 } },
  { id: "heavystock", slot: "stock", name: "Coronha Pesada", price: 650, level: 6, pro: "-15% recuo", con: "-5% mobilidade", mods: { recoil: 0.85, move: 0.95 } },
  { id: "lightstock", slot: "stock", name: "Coronha Leve", price: 600, level: 6, pro: "+5% mobilidade", con: "+10% recuo", mods: { move: 1.05, recoil: 1.1 } },
  { id: "comp", slot: "muzzle", name: "Compensador", price: 700, level: 8, pro: "-18% recuo", con: "-3% dano", mods: { recoil: 0.82, dmg: 0.97 } },
  { id: "suppressor", slot: "muzzle", name: "Silenciador", price: 900, level: 8, pro: "Tiros quase silenciosos", con: "-10% alcance, -5% dano", mods: { noise: 0.15, range: 0.9, dmg: 0.95 } },
];
export const ATT_MAP: Record<string, Attachment> = Object.fromEntries(ATTACHMENTS.map((a) => [a.id, a]));

export interface EffStats {
  dmg: number; head: number; rpm: number; auto: boolean; mag: number; reserve: number; reload: number; spread: number; adsSpread: number;
  recoil: number; recoilH: number; range: number; maxRange: number; pellets: number; zoom: number; adsTime: number; move: number; noise: number;
}
export function computeStats(def: WeaponDef, att: string[]): EffStats {
  const s: EffStats = {
    dmg: def.dmg, head: def.head, rpm: def.rpm, auto: def.auto, mag: def.mag, reserve: def.reserve, reload: def.reload, spread: def.spread,
    adsSpread: def.adsSpread, recoil: def.recoil, recoilH: def.recoilH, range: def.range, maxRange: def.maxRange, pellets: def.pellets,
    zoom: def.zoom, adsTime: def.adsTime, move: def.move, noise: 1,
  };
  for (const id of att) {
    const m = ATT_MAP[id]?.mods;
    if (!m) continue;
    if (m.dmg) s.dmg *= m.dmg;
    if (m.range) { s.range *= m.range; s.maxRange *= m.range; }
    if (m.recoil) { s.recoil *= m.recoil; s.recoilH *= m.recoil; }
    if (m.spread) { s.spread *= m.spread; s.adsSpread *= m.spread; }
    if (m.adsTime) s.adsTime *= m.adsTime;
    if (m.move) s.move *= m.move;
    if (m.mag) s.mag = Math.max(1, Math.round(s.mag * m.mag));
    if (m.reload) s.reload *= m.reload;
    if (m.zoom && def.cat !== "melee") s.zoom = Math.max(s.zoom, m.zoom);
    if (m.noise) s.noise *= m.noise;
  }
  return s;
}
