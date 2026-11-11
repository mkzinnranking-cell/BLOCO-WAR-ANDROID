import { useState } from "react";
import { audio } from "../game/audio";
import { detectQuality } from "../game/save";
import { Btn, Seg, Slider, Toggle } from "./common";
import { go, mutate, startMatch, useStore } from "./store";
import { HudEditor } from "./Settings";

export function Welcome() {
  const st = useStore(); const s = st.save; const [step, setStep] = useState(0); const [name, setName] = useState(s.name === "Recruta" ? "" : s.name); const [edit, setEdit] = useState(false);
  const finish = (tutorial: boolean) => { mutate((sv) => { sv.firstRun = false; }); audio.music("menu"); if (tutorial) startMatch({ kind: "tutorial", mapId: "range", difficulty: "easy", bots: 0 }); else go("menu"); };
  const q = detectQuality();
  if (edit) return <HudEditor onClose={() => setEdit(false)} />;
  return (
    <div className="safe flex flex-col items-center justify-center anim-fade" style={{ background: "linear-gradient(135deg, rgba(5,8,12,0.9), rgba(10,16,24,0.82))" }}>
      <div className="flex max-h-full w-[min(36rem,100%)] flex-col gap-2 overflow-y-auto scroll-y">
        <div className="flex justify-center gap-1.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-1.5 w-8 rounded ${i <= step ? "bg-amber-400" : "bg-white/20"}`} />)}</div>
        {step === 0 && (
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="text-[0.9rem] tracking-[0.4em] text-teal-300">BEM-VINDO AO JOGO</div>
            <div className="title-font text-[3rem] leading-none" style={{ textShadow: "0 0 1.5rem rgba(255,180,0,0.5)" }}>ÉBANO <span className="text-amber-400">OPS</span></div>
            <div className="text-[1.05rem] text-white/80">FPS tático com soldados blocados, campanha com 10 missões, modos contra bots, armas customizáveis e progressão. Feito para tela de toque.</div>
            <Btn className="primary justify-center self-stretch" kind="ok" onClick={() => { audio.init(); setStep(1); }}>Começar ▶</Btn>
          </div>
        )}
        {step === 1 && (
          <div className="panel flex flex-col gap-2 p-3">
            <div className="title-font text-[1.4rem]">Como devemos te chamar?</div>
            <input autoFocus value={name} maxLength={14} onChange={(e) => setName(e.target.value)} placeholder="Seu nome de soldado" className="rounded border border-white/30 bg-black/50 px-3 py-2 text-[1.4rem] font-bold outline-none focus:border-amber-300" style={{ userSelect: "text" }} />
            <Btn className="primary justify-center" disabled={name.trim().length < 2} onClick={() => { mutate((sv) => { sv.name = name.trim(); }); setStep(2); }}>Continuar ▶</Btn>
          </div>
        )}
        {step === 2 && (
          <div className="panel flex flex-col gap-2 p-3">
            <div className="title-font text-[1.4rem]">Configuração gráfica</div>
            <div className="text-[0.9rem] text-white/70">Detectamos para o seu aparelho: <b className="text-amber-300">{q.toUpperCase()}</b>. Em AUTO a resolução se ajusta sozinha durante o jogo.</div>
            <Seg value={s.settings.quality} onChange={(v) => mutate((sv) => { sv.settings.quality = v; })} options={[{ v: "auto", l: "Auto" }, { v: "low", l: "Baixo" }, { v: "med", l: "Médio" }, { v: "high", l: "Alto" }]} />
            <Btn className="primary justify-center" onClick={() => setStep(3)}>Continuar ▶</Btn>
          </div>
        )}
        {step === 3 && (
          <div className="panel flex flex-col gap-1 p-3">
            <div className="title-font text-[1.4rem]">Controles</div>
            <Slider label="Sensibilidade da câmera" value={s.settings.sens} min={0.3} max={2.2} onChange={(v) => mutate((sv) => { sv.settings.sens = v; })} fmt={(v) => v.toFixed(2) + "x"} />
            <Toggle label="Joystick flutuante" value={s.settings.joystickFloating} onChange={(v) => mutate((sv) => { sv.settings.joystickFloating = v; })} />
            <Toggle label="Vibração" value={s.settings.vibration > 0} onChange={(v) => mutate((sv) => { sv.settings.vibration = v ? 0.6 : 0; })} />
            <Btn onClick={() => setEdit(true)}>✥ Ajustar posição dos botões</Btn>
            <Btn className="primary justify-center" onClick={() => setStep(4)}>Continuar ▶</Btn>
          </div>
        )}
        {step === 4 && (
          <div className="panel flex flex-col gap-2 p-3 text-center">
            <div className="title-font text-[1.4rem]">Tudo pronto, {s.name}!</div>
            <div className="text-[0.95rem] text-white/80">O tutorial interativo ensina cada controle durante o jogo e dá XP e créditos de bônus.</div>
            <Btn className="primary justify-center" kind="ok" onClick={() => finish(true)}>📘 Iniciar tutorial</Btn>
            <Btn className="justify-center" onClick={() => finish(false)}>Ir para o menu</Btn>
          </div>
        )}
      </div>
    </div>
  );
}
