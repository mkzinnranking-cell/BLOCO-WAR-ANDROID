import { useState } from "react";
import { MAPS } from "../game/data/maps";
import { levelInfo, rankName } from "../game/save";
import { Bar, Btn, credits } from "./common";
import { go, startMatch, useStore } from "./store";

export function MainMenu() {
  const st = useStore(); const s = st.save; const li = levelInfo(s.xp); const [quit, setQuit] = useState(false);
  const quick = () => {
    const maps = MAPS.filter((m) => m.id !== "range"); const m = maps[Math.floor(Math.random() * maps.length)];
    startMatch({ kind: "tdm", mapId: m.id, difficulty: "normal", bots: 7 });
  };
  const items: { l: string; i: string; s: Parameters<typeof go>[0]; cls?: string }[] = [
    { l: "Campanha", i: "🎖", s: "campaign" }, { l: "Multiplayer", i: "🌐", s: "multiplayer" },
    { l: "Treinamento", i: "🎯", s: "training" }, { l: "Contra Bots", i: "🤖", s: "bots" },
    { l: "Armamento", i: "🔫", s: "armory" }, { l: "Personalizar", i: "🧑‍🚀", s: "custom" },
    { l: "Loja", i: "🛒", s: "shop" }, { l: "Configurações", i: "⚙", s: "settings" },
    { l: "Perfil", i: "📊", s: "profile" },
  ];
  return (
    <div className="safe flex anim-fade">
      <div className="flex min-h-0 w-[56%] max-w-[34rem] flex-col gap-1.5">
        {/* player card */}
        <div className="panel flex shrink-0 items-center gap-2.5 px-2.5 py-1.5" onClick={() => go("profile")}>
          <div className="flex h-[3rem] w-[3rem] shrink-0 items-center justify-center rounded bg-amber-400 text-[1.6rem] font-black text-black">{li.level}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[1.15rem] font-extrabold leading-tight">{s.name}</div>
            <div className="text-[0.8rem] uppercase tracking-wider text-amber-300">{rankName(li.level)}</div>
            <Bar pct={li.pct} h="0.4rem" />
          </div>
          <div className="text-right"><div className="text-[1.1rem] font-extrabold text-teal-300">◈ {credits(s.credits)}</div><div className="text-[0.7rem] text-white/60">CRÉDITOS</div></div>
        </div>
        <div className="scroll-y min-h-0 flex-1">
          <div className="grid grid-cols-2 gap-1.5 pb-1">
            <Btn className="primary col-span-2 !min-h-[3.6rem] !text-[1.4rem]" onClick={quick} kind="ok">▶ Jogar <span className="text-[0.75rem] font-semibold opacity-70">partida rápida</span></Btn>
            {items.map((it) => <Btn key={it.l} onClick={() => go(it.s)}><span className="text-[1.2rem]">{it.i}</span><span className="truncate">{it.l}</span></Btn>)}
            <Btn className="danger" onClick={() => setQuit(true)}><span className="text-[1.2rem]">⏻</span>Sair</Btn>
          </div>
        </div>
      </div>
      {/* logo */}
      <div className="pointer-events-none absolute right-[max(var(--sar),1rem)] top-[max(var(--sat),0.6rem)] text-right">
        <div className="title-font text-[2.4rem] leading-none text-white" style={{ textShadow: "0 0 1.2rem rgba(255,180,0,0.55)" }}>ÉBANO <span className="text-amber-400">OPS</span></div>
        <div className="text-[0.85rem] tracking-[0.35em] text-teal-300">FPS • BLOCK TACTICS</div>
      </div>
      <div className="pointer-events-none absolute bottom-[max(var(--sab),0.5rem)] right-[max(var(--sar),1rem)] text-right text-[0.75rem] text-white/50">v1.0 • Arraste o personagem para girar</div>
      {!s.tutorialDone && (
        <button className="absolute right-[max(var(--sar),1rem)] top-[28%] max-w-[30%] rounded border-2 border-amber-300 bg-black/60 px-3 py-2 text-left text-[0.95rem] animate-pulse" onClick={() => startMatch({ kind: "tutorial", mapId: "range", difficulty: "easy", bots: 0 })}>
          <div className="font-bold text-amber-300">📘 TUTORIAL</div><div className="text-white/80">Aprenda os controles e ganhe créditos.</div>
        </button>
      )}
      {quit && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 anim-fade">
          <div className="panel flex w-[min(24rem,90%)] flex-col gap-2 p-4 text-center">
            <div className="title-font text-[1.4rem]">Sair do jogo?</div>
            <div className="text-[0.95rem] text-white/70">Seu progresso já está salvo automaticamente.</div>
            <div className="flex gap-2"><Btn className="danger flex-1 justify-center" onClick={() => { window.close(); document.body.innerHTML = '<div style="color:#fff;font:700 20px sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;text-align:center;background:#05070a;padding:2rem">Até a próxima, soldado!<br/>Você já pode fechar esta aba. Recarregue a página para jogar novamente.</div>'; }}>Sair</Btn><Btn className="flex-1 justify-center" onClick={() => setQuit(false)}>Voltar</Btn></div>
          </div>
        </div>
      )}
    </div>
  );
}
