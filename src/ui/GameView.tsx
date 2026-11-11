import { useEffect, useRef, useState } from "react";
import { audio } from "../game/audio";
import { MISSIONS } from "../game/data/campaign";
import { MAP_MAP } from "../game/data/maps";
import { Game, type GEvent, type HudState } from "../game/engine";
import { applyResult, levelInfo, rankName } from "../game/save";
import type { MatchConfig, MatchResult } from "../game/types";
import { fmtTime } from "../game/util";
import { Btn, Stat, credits } from "./common";
import { Hud } from "./Hud";
import { SettingsPanel } from "./Settings";
import { go, mutate, startMatch, useStore } from "./store";
import { Touch } from "./Touch";

const TIPS = [
  "Mire na cabeça: tiros na cabeça causam o dobro de dano.",
  "Use cobertura e recarregue atrás de caixas e paredes.",
  "Barris vermelhos explodem — atire neles perto dos inimigos.",
  "Granadas de fumaça bloqueiam a visão dos bots.",
  "Deslize o dedo no botão de atirar para mirar enquanto dispara.",
  "Empurre o joystick até o fim para correr automaticamente.",
  "Silenciadores reduzem o alcance do som dos seus disparos.",
  "A vida se regenera após alguns segundos sem levar dano.",
  "Ataques corpo a corpo pelas costas eliminam na hora.",
  "Granadas de luz cegam os inimigos próximos — e você também!",
  "Use o pulso de radar para revelar inimigos no minimapa.",
];

export function GameView({ cfg }: { cfg: MatchConfig }) {
  const st = useStore(); const save = st.save;
  const canvas = useRef<HTMLCanvasElement>(null); const wrap = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [prog, setProg] = useState({ p: 0, label: "Preparando" });
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false); const [showSet, setShowSet] = useState(false);
  const [result, setResult] = useState<(MatchResult & { lvBefore: number; lvAfter: number }) | null>(null);
  const [death, setDeath] = useState<{ checkpoint: boolean; respawn: boolean } | null>(null);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const done = useRef(false);
  const map = MAP_MAP[cfg.mapId]; const mission = cfg.kind === "campaign" || cfg.kind === "tutorial" ? (cfg.kind === "tutorial" ? null : MISSIONS.find((m) => m.id === cfg.missionId)) : null;

  useEffect(() => {
    const cv = canvas.current!; let g: Game | null = null; let alive = true; let iv = 0;
    try { void document.documentElement.requestFullscreen?.({ navigationUI: "hide" } as FullscreenOptions).then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape")).catch(() => { /* */ }); } catch { /* */ }
    try { g = new Game(cv, save); } catch (e) { setProg({ p: 0, label: "Erro ao iniciar WebGL: " + String(e) }); return; }
    const onEv = (e: GEvent) => {
      if (e.t === "end" && !done.current) {
        done.current = true; let info = { levelBefore: 1, levelAfter: 1 };
        mutate((s) => { info = applyResult(s, e.result); });
        setTimeout(() => { if (document.pointerLockElement) document.exitPointerLock(); setResult({ ...e.result, lvBefore: info.levelBefore, lvAfter: info.levelAfter }); audio.music("menu"); if (e.result.win) audio.ui("complete"); }, 700);
      }
      if (e.t === "death") setDeath({ checkpoint: e.checkpoint, respawn: e.respawn });
    };
    g.on(onEv);
    const ro = new ResizeObserver(() => { const w = wrap.current; if (w && g) g.resize(w.clientWidth, w.clientHeight); }); ro.observe(wrap.current!);
    g.start(cfg, (p, label) => alive && setProg({ p, label })).then(() => {
      if (!alive) return; (window as unknown as { __game?: Game }).__game = g; setGame(g); g!.resize(wrap.current!.clientWidth, wrap.current!.clientHeight);
      iv = window.setInterval(() => { if (g) { setHud({ ...g.hud, flags: g.hud.flags }); } }, 90);
    }).catch((err) => { console.error(err); setProg({ p: 0, label: "Erro: " + String(err?.message ?? err) }); });
    const vis = () => { if (document.hidden && g && g.running && !g.ended) { g.pause(true); setPaused(true); } };
    const plc = () => { if (!document.pointerLockElement && g && g.running && !g.paused && !g.ended && !g.cut && matchMedia("(pointer:fine)").matches) { g.pause(true); setPaused(true); } };
    document.addEventListener("visibilitychange", vis); document.addEventListener("pointerlockchange", plc);
    return () => { alive = false; clearInterval(iv); ro.disconnect(); document.removeEventListener("visibilitychange", vis); document.removeEventListener("pointerlockchange", plc); if (document.pointerLockElement) document.exitPointerLock(); g?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doPause = (v: boolean) => { if (!game || game.ended) return; game.pause(v); setPaused(v); if (!v) setShowSet(false); };
  const exitMenu = () => { game?.dispose(); audio.music("menu"); go("menu"); };
  const campaignish = cfg.kind === "campaign" || cfg.kind === "tutorial";
  const loading = !game;

  return (
    <div ref={wrap} className="absolute inset-0 bg-black">
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
      {game && hud && <Hud game={game} hud={hud} settings={save.settings} onPause={() => doPause(true)} />}
      {game && hud && !hud.cut && !result && <Touch game={game} hud={hud} settings={save.settings} />}

      {/* death */}
      {game && hud?.dead && !result && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 anim-fade" style={{ background: "rgba(80,0,0,0.55)" }}>
          <div className="title-font text-[2.6rem] text-red-300">{death?.checkpoint ? "VOCÊ MORREU" : "ELIMINADO"}</div>
          {death?.respawn && <div className="text-[1.2rem]">Reaparecendo em {Math.ceil(hud.respawnIn)}...</div>}
          {death?.checkpoint && (
            <div className="flex gap-2">
              <Btn className="primary" onClick={() => { setDeath(null); game.restartCheckpoint(); }}>Reiniciar checkpoint</Btn>
              <Btn className="danger" onClick={exitMenu}>Sair</Btn>
            </div>
          )}
        </div>
      )}

      {/* pause */}
      {paused && !result && (
        <div className="absolute inset-0 z-40 flex items-center justify-center anim-fade" style={{ background: "rgba(0,0,0,0.72)" }}>
          {showSet ? (
            <div className="safe"><SettingsPanel inGame onBack={() => setShowSet(false)} /></div>
          ) : (
            <div className="safe flex items-center justify-center">
              <div className="panel flex max-h-full w-[min(28rem,92%)] flex-col gap-2 overflow-y-auto p-3 scroll-y">
                <div className="title-font text-center text-[1.6rem]">⏸ PAUSADO</div>
                <Btn className="primary" onClick={() => doPause(false)}>▶ Continuar</Btn>
                {campaignish ? <Btn onClick={() => { doPause(false); setDeath(null); game?.restartCheckpoint(); }}>↺ Reiniciar checkpoint</Btn> : <Btn onClick={() => { startMatch({ ...cfg }); }}>↺ Reiniciar partida</Btn>}
                <Btn onClick={() => setShowSet(true)}>⚙ Configurações</Btn>
                <Btn className="danger" onClick={() => { doPause(false); game?.finish(cfg.kind === "training", cfg.kind === "training" ? "TREINO ENCERRADO" : "MISSÃO ABANDONADA", cfg.kind === "training" ? "Bom treino!" : "Você deixou a partida"); }}>🚪 Sair da missão</Btn>
                <Btn onClick={exitMenu}>🏠 Voltar ao menu</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {/* result */}
      {result && <ResultScreen r={result} cfg={cfg} />}

      {/* loading */}
      {loading && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end" style={{ background: `linear-gradient(135deg, ${map?.art[0]}, ${map?.art[1]} 60%, ${map?.art[2]})` }}>
          <div className="absolute inset-0 stripes opacity-40" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.85))" }} />
          <div className="safe flex flex-col justify-end gap-2">
            <div className="absolute right-[6%] top-[12%] text-right"><div className="title-font text-[1rem] text-amber-300">{cfg.kind === "campaign" ? `MISSÃO ${cfg.missionId}` : cfg.kind === "tutorial" ? "TREINAMENTO" : cfg.kind.toUpperCase()}</div><div className="text-[0.95rem] text-white/80">{map?.name}</div></div>
            <div className="title-font text-[2.2rem] leading-none text-white">{mission?.name ?? (cfg.kind === "tutorial" ? "Treinamento Básico" : map?.name)}</div>
            <div className="max-w-[60%] text-[1rem] text-white/80">{mission?.brief ?? map?.desc}</div>
            <div className="mt-1 rounded border-l-4 border-amber-400 bg-black/50 px-3 py-1.5 text-[1rem]"><span className="text-amber-300">DICA: </span>{tip}</div>
            <div className="flex items-center justify-between text-[0.85rem] text-white/80"><span>{prog.label}...</span><span>{Math.round(prog.p * 100)}%</span></div>
            <div className="h-[0.8rem] w-full overflow-hidden rounded bg-black/60 ring-1 ring-white/30"><div className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-200" style={{ width: `${prog.p * 100}%` }} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultScreen({ r, cfg }: { r: MatchResult & { lvBefore: number; lvAfter: number }; cfg: MatchConfig }) {
  const st = useStore(); const li = levelInfo(st.save.xp);
  const next = cfg.kind === "campaign" && r.win ? MISSIONS.find((m) => m.id === (cfg.missionId ?? 0) + 1) : null;
  const rankCol: Record<string, string> = { S: "#ffd23a", A: "#5dffb0", B: "#6ac4ff", C: "#c9c9c9", D: "#ff7a6a" };
  const leveled = r.lvAfter > r.lvBefore;
  const victory = r.win;
  return (
    <div className="absolute inset-0 z-50 anim-fade" style={{ background: victory ? "linear-gradient(135deg, rgba(5,30,25,0.97), rgba(5,12,20,0.97))" : "linear-gradient(135deg, rgba(40,8,8,0.97), rgba(8,10,16,0.97))" }}>
      <div className="safe flex flex-col gap-2">
        <div className="flex shrink-0 items-center gap-4">
          <div className="min-w-0 flex-1"><div className="title-font truncate text-[2rem] leading-none" style={{ color: victory ? "#5dffb0" : "#ff6a5a" }}>{r.title}</div><div className="truncate text-[1rem] text-white/70">{r.sub}</div></div>
          {r.rank && cfg.kind === "campaign" && <div className="flex flex-col items-center"><div className="text-[0.7rem] tracking-widest text-white/60">CLASSIFICAÇÃO</div><div className="title-font text-[3.2rem] leading-none" style={{ color: rankCol[r.rank], textShadow: `0 0 1rem ${rankCol[r.rank]}` }}>{r.rank}</div></div>}
        </div>
        <div className="scroll-y min-h-0 flex-1">
          <div className="grid grid-cols-4 gap-1.5">
            <Stat label="Abates" value={r.kills} /><Stat label="Mortes" value={r.deaths} /><Stat label="Assistências" value={r.assists} /><Stat label="Tiros na cabeça" value={r.headshots} />
            <Stat label="Precisão" value={`${Math.round(r.accuracy * 100)}%`} /><Stat label="Tempo" value={fmtTime(r.time)} /><Stat label="XP ganho" value={`+${r.xp}`} /><Stat label="Créditos" value={`+${credits(r.credits)}`} />
          </div>
          <div className="panel mt-2 p-2.5">
            <div className="flex items-center justify-between text-[1rem]"><span className="font-bold">NÍVEL {li.level} • {rankName(li.level)}</span><span className="text-white/70">{li.cur}/{li.need} XP</span></div>
            <div className="mt-1 h-[0.8rem] w-full overflow-hidden rounded bg-white/15"><div className="h-full bg-gradient-to-r from-amber-500 to-amber-300" style={{ width: `${li.pct * 100}%` }} /></div>
            {leveled && <div className="mt-1.5 text-center text-[1.2rem] text-amber-300 animate-pulse">⬆ SUBIU DE NÍVEL! Novos itens disponíveis na loja e no armamento.</div>}
            <div className="mt-1 text-[0.9rem] text-white/70">Pontuação: <b className="text-white">{r.score.toLocaleString("pt-BR")}</b>{r.extra.map((e, i) => <div key={i}>• {e}</div>)}</div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {next && <Btn className="primary" onClick={() => startMatch({ ...cfg, missionId: next.id, mapId: next.map, startObjective: 0 })}>Próxima missão ▶</Btn>}
          <Btn className={next ? "" : "primary"} onClick={() => go("menu")}>Continuar</Btn>
          {cfg.kind !== "tutorial" && <Btn onClick={() => startMatch({ ...cfg })}>↺ Jogar novamente</Btn>}
        </div>
      </div>
    </div>
  );
}
