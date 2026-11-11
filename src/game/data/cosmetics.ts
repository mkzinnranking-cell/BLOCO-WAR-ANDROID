export type CosKind = "skin" | "helmet" | "pack" | "gloves" | "camo" | "tracer";
export interface Cosm { id: string; kind: CosKind; name: string; price: number; level: number; c: string; c2?: string; c3?: string }

export const COSMETICS: Cosm[] = [
  { id: "skin_recruit", kind: "skin", name: "Recruta Oliva", price: 0, level: 1, c: "#566b3a", c2: "#3f4a2c", c3: "#2f3a24" },
  { id: "skin_urban", kind: "skin", name: "Urbano Cinza", price: 600, level: 3, c: "#6b7078", c2: "#3c4047", c3: "#23262b" },
  { id: "skin_desert", kind: "skin", name: "Deserto Areia", price: 800, level: 5, c: "#b49a68", c2: "#8b7449", c3: "#5e4f34" },
  { id: "skin_arctic", kind: "skin", name: "Ártico", price: 1200, level: 8, c: "#d9dee4", c2: "#aab2bc", c3: "#6e7884" },
  { id: "skin_shadow", kind: "skin", name: "Sombra", price: 2000, level: 11, c: "#25272b", c2: "#17181b", c3: "#0f1012" },
  { id: "skin_crimson", kind: "skin", name: "Carmesim", price: 3000, level: 14, c: "#7a2323", c2: "#2b2b2f", c3: "#401313" },
  { id: "helm_standard", kind: "helmet", name: "Capacete Padrão", price: 0, level: 1, c: "#4a5a36" },
  { id: "helm_boonie", kind: "helmet", name: "Chapéu Boonie", price: 400, level: 2, c: "#6a7a48" },
  { id: "helm_beret", kind: "helmet", name: "Boina Vermelha", price: 700, level: 4, c: "#8a1f24" },
  { id: "helm_tactical", kind: "helmet", name: "Tático c/ Visor", price: 1500, level: 9, c: "#2a2d33" },
  { id: "helm_balaclava", kind: "helmet", name: "Balaclava Ops", price: 1100, level: 6, c: "#1b1c1f" },
  { id: "pack_none", kind: "pack", name: "Sem Mochila", price: 0, level: 1, c: "#000000" },
  { id: "pack_assault", kind: "pack", name: "Mochila de Assalto", price: 500, level: 2, c: "#3c4a2c" },
  { id: "pack_medic", kind: "pack", name: "Mochila Médica", price: 900, level: 5, c: "#c9c9c9", c2: "#c0272d" },
  { id: "pack_radio", kind: "pack", name: "Rádio Tático", price: 1000, level: 7, c: "#2d3138" },
  { id: "gl_black", kind: "gloves", name: "Luvas Pretas", price: 0, level: 1, c: "#1d1d20" },
  { id: "gl_tan", kind: "gloves", name: "Luvas Areia", price: 300, level: 2, c: "#a08a5c" },
  { id: "gl_green", kind: "gloves", name: "Luvas Verdes", price: 300, level: 2, c: "#3e5a30" },
  { id: "gl_orange", kind: "gloves", name: "Luvas Laranja", price: 700, level: 5, c: "#e0731a" },
  { id: "camo_none", kind: "camo", name: "Padrão", price: 0, level: 1, c: "#2b2f36" },
  { id: "camo_wood", kind: "camo", name: "Floresta", price: 800, level: 4, c: "#4c6a34", c2: "#2f4220" },
  { id: "camo_desert", kind: "camo", name: "Deserto", price: 800, level: 4, c: "#b39860", c2: "#7c6a40" },
  { id: "camo_neon", kind: "camo", name: "Neon", price: 2000, level: 10, c: "#19d6c9", c2: "#9b22e8" },
  { id: "camo_gold", kind: "camo", name: "Ouro", price: 4000, level: 16, c: "#e1b53a", c2: "#8c6a14" },
  { id: "tr_yellow", kind: "tracer", name: "Traçante Amarelo", price: 0, level: 1, c: "#ffd36b" },
  { id: "tr_cyan", kind: "tracer", name: "Traçante Ciano", price: 600, level: 3, c: "#4fe8ff" },
  { id: "tr_magenta", kind: "tracer", name: "Traçante Magenta", price: 600, level: 3, c: "#ff4fd8" },
  { id: "tr_green", kind: "tracer", name: "Traçante Verde", price: 600, level: 3, c: "#6dff6a" },
];
export const COS_MAP: Record<string, Cosm> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
export const KIND_NAMES: Record<CosKind, string> = { skin: "Roupa", helmet: "Capacete", pack: "Mochila", gloves: "Luvas", camo: "Camuflagem", tracer: "Efeito" };
