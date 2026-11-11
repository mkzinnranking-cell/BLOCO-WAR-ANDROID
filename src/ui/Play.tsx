import { useState } from "react";
import { CHALLENGES, MISSIONS } from "../game/data/campaign";
import { MAP_MAP, PLAY_MAPS } from "../game/data/maps";
import { getWeapon } from "../game/data/weapons";
import { BOT_NAMES } from "../game/entities/bots";
import { defaultSave, levelInfo, rankName } from "../game/save";
import type { Difficulty, MatchConfig, ModeKind } from "../game/types";
import { fmtTime } from "../game/util";
import { Btn, Card, Screen, Seg, Slider, Stat, credits } from "./common";
import { go, mutate, resetSave, startMatch, useStore } from "./store";

const DIFFS: { v: Difficulty; l: string }[] = [{ v: "easy", l: "Fácil" }, { v: "normal", l: "Normal" }, { v: "hard", l: "Difícil" }, { v: "extreme", l: "Extremo" }];
const DMAP: Record<string, Difficulty> = { Fácil: "easy", Normal: "normal", Difícil: "hard", Extremo: "extreme" };
const RANK_COL: Record<string, string> = { S: "#ffd23a", A: "#5dffb0", B: "#6ac4ff", C: "#c9c9c9", D: "#ff7a6a" };

export function Campaign() {
  const st = useStore(); const s = st.save; const [sel, setSel] = useState(() => { const n = MISSIONS.find((m) => !s.campaign[m.id]); return n ? n.id : 1; });
  const m = MISSIONS.find((x) => x.id === sel)!; const [diff, setDiff] = useState<Difficulty>(DMAP[m.diff]);
  const unlocked = (id: number) => id === 1 || !!s.campaign[id - 1];
  const done = Object.keys(s.campaign).length;
  return (
    <Screen title="CAMPANHA" sub={`Operação Aurora Negra • ${done}/10 missões`} onBack={() => go("menu")}>
      <div className="flex h-full gap-2">
        <div className="scroll-y flex w-[42%] flex-col gap-1.5">
          {!s.tutorialDone && <Card onClick={() => startMatch({ kind: "tutorial", mapId: "range", difficulty: "easy", bots: 0 })} className="!border-amber-300"><div className="font-bold text-amber-300">📘 Treinamento recomendado</div><div className="text-[0.85rem] text-white/70">Aprenda os controles primeiro.</div></Card>}
          {MISSIONS.map((x) => (
            <Card key={x.id} sel={x.id === sel} onClick={() => { if (unlocked(x.id)) { setSel(x.id); setDiff(DMAP[x.diff]); } }} className={unlocked(x.id) ? "" : "opacity-50"}>
              <div className="flex items-center gap-2">
                <div className="flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center rounded bg-amber-400 text-[1.3rem] font-black text-black">{unlocked(x.id) ? x.id : "🔒"}</div>
                <div className="min-w-0 flex-1"><div className="truncate font-bold leading-tight">{x.name}</div><div className="truncate text-[0.8rem] text-white/60">{x.sub}</div></div>
                {s.campaign[x.id] && <div className="title-font text-[1.6rem]" style={{ color: RANK_COL[s.campaign[x.id].rank] }}>{s.campaign[x.id].rank}</div>}
              </div>
            </Card>
          ))}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5"><div className="scroll-y flex min-h-0 flex-1 flex-col gap-2">
          <div className="panel p-2.5" style={{ background: `linear-gradient(135deg, ${MAP_MAP[m.map].art[0]}cc, rgba(10,15,22,0.92))` }}>
            <div className="text-[0.8rem] tracking-[0.2em] text-amber-300">MISSÃO {m.id} • {MAP_MAP[m.map].name.toUpperCase()}</div>
            <div className="title-font text-[1.6rem] leading-tight">{m.name}</div>
            <div className="text-[0.95rem] text-white/80">{m.brief}</div>
          </div>
          <div className="grid grid-cols-3 gap-1.5"><Stat label="Dificuldade" value={m.diff} /><Stat label="XP" value={`+${m.xp}`} /><Stat label="Créditos" value={`+${credits(m.credits)}`} /></div>
          <Card><div className="mb-1 text-[0.8rem] tracking-wider text-white/60">OBJETIVOS</div>{m.objectives.map((o, i) => <div key={i} className="text-[0.95rem]">▸ {o.text}</div>)}{m.stealth && <div className="mt-1 text-emerald-300">🥷 Missão furtiva — evite ser detectado</div>}</Card>
          <Seg label="Dificuldade dos inimigos" value={diff} options={DIFFS} onChange={setDiff} />
          </div>
          <Btn className="primary shrink-0 justify-center" disabled={!unlocked(m.id)} kind="ok" onClick={() => startMatch({ kind: "campaign", mapId: m.map, missionId: m.id, difficulty: diff, bots: 0 })}>▶ Iniciar missão</Btn>
        </div>
      </div>
    </Screen>
  );
}

const MODES: { v: ModeKind; l: string; d: string; i: string }[] = [
  { v: "tdm", l: "Team DM", d: "Duas equipes. Primeiro a 30 abates.", i: "⚔" },
  { v: "dm", l: "Deathmatch", d: "Todos contra todos. Primeiro a 20.", i: "💀" },
  { v: "dom", l: "Dominação", d: "Capture e segure os pontos A, B e C.", i: "🚩" },
  { v: "survival", l: "Sobrevivência", d: "Resista a 10 ondas de inimigos.", i: "🛡" },
];
export function Bots() {
  const [mode, setMode] = useState<ModeKind>("tdm"); const [map, setMap] = useState("base"); const [diff, setDiff] = useState<Difficulty>("normal"); const [n, setN] = useState(7); const [team, setTeam] = useState<0 | 1>(0);
  const md = MODES.find((x) => x.v === mode)!;
  return (
    <Screen title="CONTRA BOTS" sub="Partidas offline contra IA" onBack={() => go("menu")}>
      <div className="flex h-full gap-2">
        <div className="scroll-y flex w-[48%] flex-col gap-1.5">
          <div className="text-[0.8rem] tracking-wider text-white/60">MODO</div>
          <div className="grid grid-cols-2 gap-1.5">{MODES.map((x) => <Card key={x.v} sel={x.v === mode} onClick={() => setMode(x.v)}><div className="text-[1.3rem]">{x.i}</div><div className="font-bold leading-tight">{x.l}</div></Card>)}</div>
          <div className="text-[0.9rem] text-white/70">{md.d}</div>
          <div className="text-[0.8rem] tracking-wider text-white/60">MAPA</div>
          <div className="grid grid-cols-2 gap-1.5">{PLAY_MAPS.map((m) => (
            <div key={m.id} onClick={() => setMap(m.id)} className={`cursor-pointer rounded border p-1.5 ${m.id === map ? "border-amber-300 shadow-[0_0_0.8rem_rgba(255,180,0,0.4)]" : "border-white/15"}`} style={{ background: `linear-gradient(135deg, ${m.art[0]}, ${m.art[1]})` }}>
              <div className="truncate text-[0.95rem] font-bold leading-tight" style={{ textShadow: "0 1px 3px #000" }}>{m.name}</div>
            </div>))}</div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1.5"><div className="scroll-y flex min-h-0 flex-1 flex-col gap-1.5">
          <Card><div className="title-font text-[1.2rem]">{MAP_MAP[map].name}</div><div className="text-[0.9rem] text-white/70">{MAP_MAP[map].desc}</div></Card>
          <Seg label="Dificuldade da IA" value={diff} options={DIFFS} onChange={setDiff} />
          {mode !== "survival" && <Slider label="Número de bots" value={n} min={2} max={15} step={1} onChange={setN} fmt={(v) => `${v}`} />}
          {(mode === "tdm" || mode === "dom") && <Seg label="Sua equipe" value={team} options={[{ v: 0, l: "Azul" }, { v: 1, l: "Vermelha" }]} onChange={(v) => setTeam(v as 0 | 1)} />}
          <div className="text-[0.8rem] text-white/50">Dificuldade maior = IA mais precisa, rápida, com flanqueios e granadas.</div>
          </div>
          <Btn className="primary shrink-0 justify-center" kind="ok" onClick={() => startMatch({ kind: mode, mapId: map, difficulty: diff, bots: mode === "survival" ? 0 : n, teamPick: team })}>▶ Iniciar partida</Btn>
        </div>
      </div>
    </Screen>
  );
}

export function Multiplayer() {
  const st = useStore(); const name = st.save.name;
  const [mode, setMode] = useState<ModeKind>("tdm"); const [map, setMap] = useState("city"); const [diff, setDiff] = useState<Difficulty>("normal");
  const [slots, setSlots] = useState<{ name: string; team: 0 | 1 }[]>(() => Array.from({ length: 7 }, (_, i) => ({ name: BOT_NAMES[i * 2 % BOT_NAMES.length], team: (i % 2 === 0 ? 1 : 0) as 0 | 1 })));
  const [count, setCount] = useState(6); const [myTeam, setMyTeam] = useState<0 | 1>(0);
  const active = slots.slice(0, count - 1);
  const allies = active.filter((s) => s.team === myTeam).length;
  return (
    <Screen title="MULTIPLAYER" sub="Salas de 2 a 8 jogadores" onBack={() => go("menu")}>
      <div className="mb-2 rounded border border-amber-400/60 bg-amber-400/10 p-2 text-[0.9rem]"><b className="text-amber-300">⚠ Online indisponível nesta versão.</b> Não há servidor conectado, então salas públicas não existem. O jogo inclui a arquitetura de rede pronta (<code>src/net/NetAdapter.ts</code>). Abaixo você monta uma <b>sala local</b> com jogadores controlados por IA — totalmente funcional.</div>
      <div className="flex gap-2">
        <div className="flex w-[50%] flex-col gap-1.5">
          <Card>
            <div className="mb-1 flex items-center justify-between"><span className="title-font">Sala local</span><span className="chip">{count}/8 jogadores</span></div>
            <div className="flex items-center gap-2 rounded bg-white/10 px-2 py-1.5"><span className="chip !bg-amber-400 !text-black">HOST</span><b className="flex-1 truncate">{name}</b>
              <button className={`min-h-[2.4rem] rounded px-3 font-bold ${myTeam === 0 ? "bg-sky-500" : "bg-red-500"}`} onClick={() => setMyTeam(myTeam === 0 ? 1 : 0)}>{mode === "dm" ? "—" : myTeam === 0 ? "AZUL" : "VERM."}</button></div>
            {active.map((s, i) => (
              <div key={i} className="mt-1 flex items-center gap-2 rounded bg-white/5 px-2 py-1"><span className="chip">IA</span><span className="flex-1 truncate">{s.name}</span>
                <button className={`min-h-[2.4rem] rounded px-3 font-bold ${mode === "dm" ? "bg-white/20" : s.team === 0 ? "bg-sky-500" : "bg-red-500"}`} onClick={() => mode !== "dm" && setSlots((l) => l.map((x, k) => (k === i ? { ...x, team: x.team === 0 ? 1 : 0 } : x)))}>{mode === "dm" ? "—" : s.team === 0 ? "AZUL" : "VERM."}</button></div>
            ))}
          </Card>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Slider label="Jogadores na sala" value={count} min={2} max={8} step={1} onChange={setCount} fmt={(v) => `${v}`} />
          <Seg label="Modo" value={mode} options={[{ v: "tdm", l: "Team DM" }, { v: "dm", l: "DM" }, { v: "dom", l: "Domin." }]} onChange={(v) => setMode(v as ModeKind)} />
          <Seg label="Mapa" value={map} options={PLAY_MAPS.slice(0, 6).map((m) => ({ v: m.id, l: m.name.split(" ")[0] }))} onChange={setMap} />
          <Seg label="IA" value={diff} options={DIFFS} onChange={setDiff} />
          {mode !== "dm" && allies > count - 1 - allies + 4 && <div className="text-[0.85rem] text-red-300">Equipes muito desbalanceadas.</div>}
          <Btn className="primary justify-center" kind="ok" disabled={mode !== "dm" && count - 1 - allies < 1} onClick={() => { const cfg: MatchConfig = { kind: mode, mapId: map, difficulty: diff, bots: count - 1, teamPick: myTeam, allies }; startMatch(cfg); }}>▶ Iniciar partida</Btn>
          <Btn className="!opacity-60" disabled>🌐 Entrar em sala online (indisponível)</Btn>
        </div>
      </div>
    </Screen>
  );
}

export function Training() {
  const st = useStore(); const s = st.save;
  return (
    <Screen title="TREINAMENTO" sub="Aprenda, pratique e supere desafios" onBack={() => go("menu")}>
      <div className="grid grid-cols-2 gap-2">
        <Card onClick={() => startMatch({ kind: "tutorial", mapId: "range", difficulty: "easy", bots: 0 })} className="!p-3"><div className="text-[1.6rem]">📘</div><div className="title-font text-[1.1rem]">Tutorial interativo</div><div className="text-[0.85rem] text-white/70">Movimento, câmera, tiro, mira, recarga, granada, interação e objetivos.</div><div className="mt-1 text-[0.85rem] text-amber-300">{s.tutorialDone ? "✔ Concluído (pode repetir)" : "+150 XP e +300 créditos na primeira vez"}</div></Card>
        <Card onClick={() => startMatch({ kind: "training", mapId: "range", difficulty: "easy", bots: 0 })} className="!p-3"><div className="text-[1.6rem]">🎯</div><div className="title-font text-[1.1rem]">Campo de tiro livre</div><div className="text-[0.85rem] text-white/70">Alvos, munição infinita. Teste armas e acessórios sem pressão.</div></Card>
      </div>
      <div className="title-font my-2 text-[1.1rem]">DESAFIOS</div>
      <div className="grid grid-cols-2 gap-2 pb-2">
        {CHALLENGES.map((c) => { const p = s.challenges[c.id]; return (
          <Card key={c.id} onClick={() => startMatch({ kind: "challenge", mapId: c.map, challengeId: c.id, difficulty: "normal", bots: c.bots })}>
            <div className="flex items-center justify-between"><b className="text-[1.05rem]">{c.name}</b>{p?.done && <span className="chip !bg-emerald-600">✔</span>}</div>
            <div className="text-[0.85rem] text-white/70">{c.desc}</div>
            <div className="mt-1 flex gap-1.5 text-[0.8rem]"><span className="chip">{MAP_MAP[c.map].name}</span><span className="chip">+{c.xp} XP</span><span className="chip">◈ {c.reward}</span>{p && <span className="chip">Melhor: {p.best}</span>}</div>
          </Card>); })}
      </div>
    </Screen>
  );
}

export function Profile() {
  const st = useStore(); const s = st.save; const li = levelInfo(s.xp); const t = s.stats; const [rs, setRs] = useState(false);
  const fav = Object.entries(t.weaponKills).sort((a, b) => b[1] - a[1])[0];
  return (
    <Screen title="PERFIL" onBack={() => go("menu")}>
      <div className="flex flex-col gap-2">
        <div className="panel flex items-center gap-3 p-3">
          <div className="flex h-[4rem] w-[4rem] items-center justify-center rounded bg-amber-400 text-[2rem] font-black text-black">{li.level}</div>
          <div className="min-w-0 flex-1">
            <input value={s.name} maxLength={14} onChange={(e) => mutate((sv) => { sv.name = e.target.value || "Recruta"; })} className="w-full rounded border border-white/20 bg-black/40 px-2 py-1 text-[1.3rem] font-extrabold outline-none focus:border-amber-300" style={{ userSelect: "text" }} />
            <div className="text-[0.95rem] text-amber-300">{rankName(li.level)} • {li.cur}/{li.need} XP • XP total {s.xp}</div>
            <div className="mt-1 h-[0.6rem] overflow-hidden rounded bg-white/15"><div className="h-full bg-amber-400" style={{ width: `${li.pct * 100}%` }} /></div>
          </div>
          <div className="text-right"><div className="text-[1.5rem] font-extrabold text-teal-300">◈ {credits(s.credits)}</div><div className="text-[0.75rem] text-white/60">CRÉDITOS</div></div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Partidas" value={t.matches} /><Stat label="Vitórias" value={t.wins} /><Stat label="Derrotas" value={t.losses} /><Stat label="Abates" value={t.kills} />
          <Stat label="Mortes" value={t.deaths} /><Stat label="K/D" value={t.deaths ? (t.kills / t.deaths).toFixed(2) : t.kills} /><Stat label="Precisão" value={`${t.shots ? Math.round((t.hits / t.shots) * 100) : 0}%`} /><Stat label="Tiros na cabeça" value={t.headshots} />
          <Stat label="Arma favorita" value={<span className="text-[1rem]">{fav ? getWeapon(fav[0]).name : "—"}</span>} /><Stat label="Tempo de jogo" value={fmtTime(t.playtime)} /><Stat label="Campanha" value={`${Object.keys(s.campaign).length}/10`} /><Stat label="Desafios" value={`${Object.values(s.challenges).filter((c) => c.done).length}/${CHALLENGES.length}`} />
        </div>
        <div className="flex gap-2"><Btn onClick={() => go("settings")}>⚙ Configurações</Btn>{!rs ? <Btn className="danger" onClick={() => setRs(true)}>Apagar progresso</Btn> : <Btn className="danger" onClick={() => { resetSave(defaultSave()); go("welcome"); }}>Confirmar: apagar tudo</Btn>}</div>
      </div>
    </Screen>
  );
}
