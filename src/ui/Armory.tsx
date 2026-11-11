import { useState } from "react";
import { COSMETICS, KIND_NAMES, type CosKind, type Cosm } from "../game/data/cosmetics";
import { ATTACHMENTS, CAT_NAMES, SLOT_NAMES, WEAPONS, computeStats, getWeapon, type AttSlot, type WeaponDef } from "../game/data/weapons";
import { levelInfo } from "../game/save";
import type { Equipment, GrenadeType } from "../game/types";
import { Btn, Card, Screen, credits, tap } from "./common";
import { getSave, go, mutate, useStore } from "./store";

export function tryBuy(id: string, price: number, level: number): boolean {
  const s = getSave(); if (s.owned.includes(id)) return true;
  if (levelInfo(s.xp).level < level) { tap("deny"); return false; }
  if (s.credits < price) { tap("deny"); return false; }
  mutate((sv) => { sv.credits -= price; sv.owned.push(id); }); tap("ok"); return true;
}

const GREN: { id: GrenadeType; name: string; price: number; desc: string; i: string }[] = [
  { id: "frag", name: "Granada Explosiva", price: 0, desc: "Dano alto em área. Fusível de 2,5s.", i: "💣" },
  { id: "smoke", name: "Granada de Fumaça", price: 300, desc: "Bloqueia a visão dos bots por 14s.", i: "🌫" },
  { id: "flash", name: "Granada de Luz", price: 300, desc: "Cega inimigos (e você) por alguns segundos.", i: "✨" },
];
const EQUIP: { id: Equipment; name: string; price: number; desc: string; i: string }[] = [
  { id: "medkit", name: "Kit Médico", price: 0, desc: "Cura 60 de vida em 3s. Recarga: 35s.", i: "🩹" },
  { id: "adrenaline", name: "Adrenalina", price: 500, desc: "+30% de velocidade por 8s. Recarga: 40s.", i: "💉" },
  { id: "radar", name: "Pulso de Radar", price: 800, desc: "Revela inimigos no minimapa por 9s. Recarga: 30s.", i: "📡" },
  { id: "armor", name: "Placa de Armadura", price: 600, desc: "+50 de armadura instantânea. Recarga: 60s.", i: "🛡" },
];
const gOwned = (id: string) => id === "frag" || id === "medkit" || getSave().owned.includes(id);

function StatBars({ def, att, base }: { def: WeaponDef; att: string[]; base?: boolean }) {
  const e = computeStats(def, att); const b = computeStats(def, []);
  const rows: [string, number, number][] = [
    ["Dano", (e.dmg * (e.pellets > 1 ? e.pellets * 0.55 : 1)) / 125, (b.dmg * (b.pellets > 1 ? b.pellets * 0.55 : 1)) / 125],
    ["Cadência", e.rpm / 1100, b.rpm / 1100], ["Alcance", e.maxRange / 250, b.maxRange / 250],
    ["Precisão", 1 - e.adsSpread / 4, 1 - b.adsSpread / 4], ["Controle", 1 - e.recoil / 6.5, 1 - b.recoil / 6.5], ["Mobilidade", (e.move - 0.75) / 0.45, (b.move - 0.75) / 0.45],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
      {rows.map(([l, v, bv]) => (
        <div key={l}><div className="flex justify-between text-[0.8rem]"><span className="text-white/70">{l}</span>{!base && Math.abs(v - bv) > 0.01 && <span className={v > bv ? "text-emerald-300" : "text-red-300"}>{v > bv ? "▲" : "▼"}</span>}</div>
          <div className="h-[0.45rem] overflow-hidden rounded bg-white/15"><div className="h-full rounded" style={{ width: `${Math.max(0.04, Math.min(1, v)) * 100}%`, background: v >= bv ? "#ffb400" : "#ff6a4a" }} /></div></div>
      ))}
      <div className="col-span-2 mt-0.5 flex gap-1.5 text-[0.8rem] text-white/70"><span className="chip">Pente {e.mag || "—"}</span><span className="chip">Reserva {e.reserve || "—"}</span><span className="chip">Recarga {e.reload ? e.reload.toFixed(1) + "s" : "—"}</span></div>
    </div>
  );
}

type Tab = "primary" | "secondary" | "melee" | "grenade" | "equip";
const TABS: { id: Tab; l: string }[] = [{ id: "primary", l: "Primária" }, { id: "secondary", l: "Secundária" }, { id: "melee", l: "Corpo a corpo" }, { id: "grenade", l: "Granada" }, { id: "equip", l: "Equipamento" }];
const TAB_CATS: Record<string, string[]> = { primary: ["smg", "ar", "sniper", "shotgun", "lmg", "special"], secondary: ["pistol"], melee: ["melee"] };

export function Armory() {
  const st = useStore(); const s = st.save; const lv = levelInfo(s.xp).level;
  const [tab, setTab] = useState<Tab>("primary"); const [sel, setSel] = useState<string>(s.loadout.primary);
  const list = TAB_CATS[tab] ? WEAPONS.filter((w) => TAB_CATS[tab].includes(w.cat)) : [];
  const equippedId = tab === "primary" ? s.loadout.primary : tab === "secondary" ? s.loadout.secondary : s.loadout.melee;
  const w = getWeapon(sel); const owned = s.owned.includes(w.id); const att = s.attach[w.id] ?? {};
  const changeTab = (t: Tab) => { setTab(t); if (TAB_CATS[t]) setSel(t === "primary" ? s.loadout.primary : t === "secondary" ? s.loadout.secondary : s.loadout.melee); };
  const equip = (id: string) => mutate((sv) => { if (tab === "primary") sv.loadout.primary = id; else if (tab === "secondary") sv.loadout.secondary = id; else sv.loadout.melee = id; });
  const setAtt = (slot: AttSlot, id: string | null) => mutate((sv) => { const a = (sv.attach[w.id] ??= {}); if (id) a[slot] = id; else delete a[slot]; });
  return (
    <Screen side title="ARMAMENTO" sub={`◈ ${credits(s.credits)} • Nível ${lv}`} onBack={() => go("menu")}>
      <div className="flex flex-wrap gap-1 pb-1.5">{TABS.map((t) => <button key={t.id} onClick={() => changeTab(t.id)} className={`min-h-[2.7rem] flex-1 rounded border px-1.5 text-[0.85rem] font-bold uppercase ${tab === t.id ? "border-amber-300 bg-amber-400 text-black" : "border-white/20 bg-white/10"}`}>{t.l}</button>)}</div>
      {tab === "grenade" && <div className="flex flex-col gap-1.5">{GREN.map((g) => <Card key={g.id} sel={s.loadout.grenade === g.id} onClick={() => { if (gOwned(g.id) || tryBuy(g.id, g.price, 1)) mutate((sv) => { sv.loadout.grenade = g.id; }); }}><div className="flex items-center gap-2"><span className="text-[1.8rem]">{g.i}</span><div className="flex-1"><b>{g.name}</b><div className="text-[0.85rem] text-white/70">{g.desc}</div></div><span className="chip">{s.loadout.grenade === g.id ? "EQUIPADO" : gOwned(g.id) ? "EQUIPAR" : `◈ ${g.price}`}</span></div></Card>)}</div>}
      {tab === "equip" && <div className="flex flex-col gap-1.5">{EQUIP.map((g) => <Card key={g.id} sel={s.loadout.equipment === g.id} onClick={() => { if (gOwned(g.id) || tryBuy(g.id, g.price, 1)) mutate((sv) => { sv.loadout.equipment = g.id; }); }}><div className="flex items-center gap-2"><span className="text-[1.8rem]">{g.i}</span><div className="flex-1"><b>{g.name}</b><div className="text-[0.85rem] text-white/70">{g.desc}</div></div><span className="chip">{s.loadout.equipment === g.id ? "EQUIPADO" : gOwned(g.id) ? "EQUIPAR" : `◈ ${g.price}`}</span></div></Card>)}</div>}
      {TAB_CATS[tab] && (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {list.map((x) => { const ow = s.owned.includes(x.id); return (
              <Card key={x.id} sel={sel === x.id} onClick={() => setSel(x.id)} className={ow ? "" : "opacity-80"}>
                <div className="flex items-center justify-between gap-1"><b className="truncate text-[0.95rem]">{x.name}</b>{equippedId === x.id && <span className="chip !bg-amber-400 !text-black">✔</span>}</div>
                <div className="text-[0.75rem] text-white/60">{CAT_NAMES[x.cat]}</div>
                <div className="text-[0.8rem]">{ow ? <span className="text-emerald-300">Desbloqueada</span> : lv < x.level ? <span className="text-red-300">🔒 Nível {x.level}</span> : <span className="text-teal-300">◈ {credits(x.price)}</span>}</div>
              </Card>); })}
          </div>
          <Card>
            <div className="flex items-center justify-between"><div><div className="title-font text-[1.2rem]">{w.name}</div><div className="text-[0.85rem] text-white/70">{w.desc}</div></div>
              {owned ? <Btn className="primary !min-h-[2.8rem]" disabled={equippedId === w.id} onClick={() => equip(w.id)}>{equippedId === w.id ? "Equipada" : "Equipar"}</Btn> : <Btn className="primary !min-h-[2.8rem]" disabled={lv < w.level || s.credits < w.price} onClick={() => { if (tryBuy(w.id, w.price, w.level)) equip(w.id); }}>{lv < w.level ? `Nível ${w.level}` : `Comprar ◈ ${credits(w.price)}`}</Btn>}</div>
            <div className="mt-1.5"><StatBars def={w} att={Object.values(att)} /></div>
          </Card>
          {w.cat !== "melee" && (
            <Card>
              <div className="title-font mb-1 text-[1rem]">UPGRADES <span className="text-[0.75rem] font-normal text-white/60">— cada peça tem vantagem e desvantagem</span></div>
              {!owned && <div className="text-[0.85rem] text-white/60">Compre a arma para instalar upgrades.</div>}
              {(Object.keys(SLOT_NAMES) as AttSlot[]).map((slot) => (
                <div key={slot} className="mb-1.5"><div className="text-[0.8rem] tracking-wider text-amber-300">{SLOT_NAMES[slot].toUpperCase()}</div>
                  <div className="grid grid-cols-3 gap-1">
                    <button disabled={!owned} onClick={() => setAtt(slot, null)} className={`min-h-[2.6rem] rounded border text-[0.8rem] font-bold ${!att[slot] ? "border-amber-300 bg-amber-400/20" : "border-white/20 bg-white/5"}`}>Padrão</button>
                    {ATTACHMENTS.filter((a) => a.slot === slot).map((a) => { const has = s.owned.includes(a.id); const on = att[slot] === a.id; return (
                      <button key={a.id} disabled={!owned} onClick={() => { if (has || tryBuy(a.id, a.price, a.level)) setAtt(slot, on ? null : a.id); }} className={`flex min-h-[2.6rem] flex-col items-start rounded border px-1.5 py-1 text-left ${on ? "border-amber-300 bg-amber-400/20" : "border-white/20 bg-white/5"}`}>
                        <span className="text-[0.8rem] font-bold leading-tight">{a.name}</span>
                        <span className="text-[0.68rem] leading-tight text-emerald-300">+ {a.pro}</span><span className="text-[0.68rem] leading-tight text-red-300">− {a.con}</span>
                        <span className="text-[0.7rem] text-white/70">{has ? (on ? "INSTALADO" : "Instalar") : levelInfo(s.xp).level < a.level ? `🔒 Nv ${a.level}` : `◈ ${a.price}`}</span>
                      </button>); })}
                  </div></div>
              ))}
            </Card>
          )}
        </div>
      )}
    </Screen>
  );
}

// ------------------------------------------------------------------ cosmetics
const COS_TABS: CosKind[] = ["skin", "helmet", "pack", "gloves", "camo", "tracer"];

function CosCard({ c, equipped, onClick, label }: { c: Cosm; equipped: boolean; onClick: () => void; label: string }) {
  return (
    <Card sel={equipped} onClick={onClick}>
      <div className="mb-1 flex h-[1.6rem] overflow-hidden rounded"><div className="flex-1" style={{ background: c.c }} />{c.c2 && <div className="flex-1" style={{ background: c.c2 }} />}{c.c3 && <div className="flex-1" style={{ background: c.c3 }} />}</div>
      <div className="truncate text-[0.9rem] font-bold leading-tight">{c.name}</div><div className="text-[0.8rem] text-amber-300">{label}</div>
    </Card>
  );
}

export function Customize() {
  const st = useStore(); const s = st.save; const lv = levelInfo(s.xp).level; const [tab, setTab] = useState<CosKind>("skin");
  return (
    <Screen side title="PERSONALIZAÇÃO" sub={`◈ ${credits(s.credits)} • Cosméticos não afetam o equilíbrio`} onBack={() => go("menu")}>
      <div className="flex flex-wrap gap-1 pb-1.5">{COS_TABS.map((k) => <button key={k} onClick={() => setTab(k)} className={`min-h-[2.7rem] flex-1 rounded border px-1.5 text-[0.85rem] font-bold uppercase ${tab === k ? "border-amber-300 bg-amber-400 text-black" : "border-white/20 bg-white/10"}`}>{KIND_NAMES[k]}</button>)}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {COSMETICS.filter((c) => c.kind === tab).map((c) => { const ow = s.owned.includes(c.id); const eq = s.cosmetics[tab] === c.id;
          return <CosCard key={c.id} c={c} equipped={eq} label={eq ? "✔ Equipado" : ow ? "Equipar" : lv < c.level ? `🔒 Nível ${c.level}` : `◈ ${credits(c.price)}`}
            onClick={() => { if (ow || tryBuy(c.id, c.price, c.level)) mutate((sv) => { sv.cosmetics[tab] = c.id; }); }} />; })}
      </div>
      <div className="mt-2 text-[0.8rem] text-white/60">Arraste o personagem para girar. Camuflagens aparecem nas armas; luvas e roupas aparecem nos braços em primeira pessoa.</div>
    </Screen>
  );
}

// ------------------------------------------------------------------ shop
type ShopTab = "weapons" | "att" | "gad" | CosKind;
export function Shop() {
  const st = useStore(); const s = st.save; const lv = levelInfo(s.xp).level; const [tab, setTab] = useState<ShopTab>("weapons");
  const tabs: { id: ShopTab; l: string }[] = [{ id: "weapons", l: "Armas" }, { id: "att", l: "Upgrades" }, { id: "gad", l: "Gadgets" }, ...COS_TABS.map((k) => ({ id: k as ShopTab, l: KIND_NAMES[k] }))];
  const Row = ({ name, sub, owned, price, level, id, i }: { name: string; sub: string; owned: boolean; price: number; level: number; id: string; i?: string }) => (
    <Card><div className="flex items-center gap-2">{i && <span className="text-[1.5rem]">{i}</span>}<div className="min-w-0 flex-1"><b className="block truncate">{name}</b><div className="truncate text-[0.8rem] text-white/60">{sub}</div></div>
      {owned ? <span className="chip !bg-emerald-600">COMPRADO</span> : <Btn className="primary !min-h-[2.6rem] !px-3 !py-1" disabled={lv < level || s.credits < price} onClick={() => tryBuy(id, price, level)}>{lv < level ? `Nv ${level}` : `◈ ${credits(price)}`}</Btn>}</div></Card>
  );
  return (
    <Screen title="LOJA" sub="Opcional — tudo também é desbloqueável jogando" onBack={() => go("menu")} right={<span className="chip !bg-teal-600/40 !text-[1rem]">◈ {credits(s.credits)}</span>}>
      <div className="mb-1.5 rounded bg-white/5 p-1.5 text-[0.85rem] text-white/70">💡 Créditos são ganhos jogando. Nenhum item exige pagamento real e a campanha pode ser concluída com o arsenal inicial.</div>
      <div className="flex flex-wrap gap-1 pb-1.5">{tabs.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`min-h-[2.7rem] flex-1 rounded border px-1.5 text-[0.8rem] font-bold uppercase ${tab === t.id ? "border-amber-300 bg-amber-400 text-black" : "border-white/20 bg-white/10"}`}>{t.l}</button>)}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {tab === "weapons" && WEAPONS.map((w) => <Row key={w.id} id={w.id} name={w.name} sub={`${CAT_NAMES[w.cat]} • dano ${w.dmg}${w.pellets > 1 ? `×${w.pellets}` : ""}`} owned={s.owned.includes(w.id)} price={w.price} level={w.level} />)}
        {tab === "att" && ATTACHMENTS.map((a) => <Row key={a.id} id={a.id} name={a.name} sub={`${SLOT_NAMES[a.slot]} • +${a.pro}`} owned={s.owned.includes(a.id)} price={a.price} level={a.level} />)}
        {tab === "gad" && [...GREN, ...EQUIP].map((g) => <Row key={g.id} id={g.id} i={g.i} name={g.name} sub={g.desc} owned={gOwned(g.id)} price={g.price} level={1} />)}
        {COS_TABS.includes(tab as CosKind) && COSMETICS.filter((c) => c.kind === tab).map((c) => <Row key={c.id} id={c.id} name={c.name} sub={KIND_NAMES[c.kind]} owned={s.owned.includes(c.id)} price={c.price} level={c.level} />)}
      </div>
    </Screen>
  );
}
