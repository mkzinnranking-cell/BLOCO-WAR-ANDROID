import { useSyncExternalStore } from "react";
import { audio } from "../game/audio";
import { loadSave, persist } from "../game/save";
import type { MatchConfig, SaveData } from "../game/types";

export type Screen =
  | "welcome" | "menu" | "campaign" | "bots" | "multiplayer" | "training" | "challenges" | "armory" | "custom" | "shop" | "settings" | "profile" | "hudedit" | "game";

interface Store { save: SaveData; ver: number; screen: Screen; prev: Screen; match: MatchConfig | null; matchKey: number }
const store: Store = { save: loadSave(), ver: 0, screen: "menu", prev: "menu", match: null, matchKey: 0 };
if (store.save.firstRun) store.screen = "welcome";
const subs = new Set<() => void>();
const notify = () => { store.ver++; subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function useStore() {
  useSyncExternalStore(subscribe, () => store.ver);
  return store;
}
export function mutate(fn: (s: SaveData) => void) {
  fn(store.save); persist(store.save); audio.setVols(store.save.settings); notify();
}
export function go(screen: Screen) { store.prev = store.screen; store.screen = screen; notify(); }
export function startMatch(cfg: MatchConfig) { store.match = cfg; store.matchKey++; store.prev = store.screen === "game" ? store.prev : store.screen; store.screen = "game"; notify(); }
export function resetSave(def: SaveData) { store.save = def; persist(def); notify(); }
export const getSave = () => store.save;
