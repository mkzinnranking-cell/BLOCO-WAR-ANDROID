import { useEffect, useState } from "react";
import { DEFAULT_HUD, defaultSettings, detectQuality } from "../game/save";
import type { BtnId, HudBtn, Settings } from "../game/types";
import { Btn, Screen, Seg, Slider, Toggle } from "./common";
import { go, mutate, useStore } from "./store";
import { BTN_NAMES, Touch } from "./Touch";

type Tab = "gfx" | "ctl" | "aud" | "game" | "acc" | "perf";
const TABS: { id: Tab; l: string }[] = [{ id: "gfx", l: "Gráficos" }, { id: "ctl", l: "Controles" }, { id: "aud", l: "Áudio" }, { id: "game", l: "Gameplay" }, { id: "acc", l: "Acessib." }, { id: "perf", l: "Desempenho" }];

export function SettingsScreen() { return <SettingsPanel onBack={() => go("menu")} />; }

export function SettingsPanel({ onBack, inGame }: { onBack: () => void; inGame?: boolean }) {
  const st = useStore(); const s = st.save.settings; const [tab, setTab] = useState<Tab>("gfx"); const [edit, setEdit] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => mutate((sv) => { sv.settings[k] = v; });
  if (edit) return <HudEditor onClose={() => setEdit(false)} />;
  return (
    <Screen title="CONFIGURAÇÕES" onBack={onBack} sub={inGame ? "Alterações aplicadas na hora (gráficos na próxima partida)" : undefined}
      right={<Btn className="!min-h-[2.8rem] !py-1" onClick={() => mutate((sv) => { sv.settings = defaultSettings(); })}>Restaurar</Btn>}>
      <div className="flex flex-wrap gap-1.5 pb-2">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`min-h-[2.8rem] flex-1 rounded border px-2 text-[0.95rem] font-bold uppercase ${tab === t.id ? "border-amber-300 bg-amber-400 text-black" : "border-white/20 bg-white/10"}`}>{t.l}</button>)}
      </div>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {tab === "gfx" && (<>
          <div className="sm:col-span-2"><Seg label="Qualidade gráfica" value={s.quality} onChange={(v) => set("quality", v)} options={[{ v: "auto", l: "Auto" }, { v: "low", l: "Baixo" }, { v: "med", l: "Médio" }, { v: "high", l: "Alto" }]} /></div>
          <Toggle label="Sombras" value={s.shadows} onChange={(v) => set("shadows", v)} hint="Desligue para mais FPS" />
          <Toggle label="Efeitos (chuva, partículas extras)" value={s.effects} onChange={(v) => set("effects", v)} />
          <Slider label="Partículas" value={s.particles} min={0.2} max={1} onChange={(v) => set("particles", v)} />
          <Slider label="Distância de visão" value={s.viewDist} min={0.5} max={1.2} onChange={(v) => set("viewDist", v)} />
          <div className="sm:col-span-2"><Seg label="FPS máximo" value={s.fpsCap} onChange={(v) => set("fpsCap", v)} options={[{ v: 30, l: "30" }, { v: 60, l: "60" }, { v: 90, l: "90" }, { v: 120, l: "120" }]} /></div>
          <div className="text-[0.85rem] text-white/60 sm:col-span-2">No modo AUTO o jogo detecta o aparelho e ajusta a resolução dinamicamente para manter a fluidez.</div>
        </>)}
        {tab === "ctl" && (<>
          <Slider label="Sensibilidade da câmera" value={s.sens} min={0.2} max={2.5} onChange={(v) => set("sens", v)} fmt={(v) => v.toFixed(2) + "x"} />
          <Slider label="Sensibilidade da mira (ADS)" value={s.adsSens} min={0.2} max={1.5} onChange={(v) => set("adsSens", v)} fmt={(v) => v.toFixed(2) + "x"} />
          <Toggle label="Inverter eixo vertical" value={s.invertY} onChange={(v) => set("invertY", v)} />
          <Toggle label="Joystick flutuante" value={s.joystickFloating} onChange={(v) => set("joystickFloating", v)} hint="O joystick aparece onde você tocar" />
          <Slider label="Assistência de mira" value={s.aimAssist} onChange={(v) => set("aimAssist", v)} />
          <Slider label="Intensidade da vibração" value={s.vibration} onChange={(v) => set("vibration", v)} />
          <Slider label="Transparência dos botões" value={s.hudOpacity} min={0.25} max={1} onChange={(v) => set("hudOpacity", v)} />
          <div className="flex items-end"><Btn className="primary w-full" onClick={() => setEdit(true)}>✥ Personalizar HUD</Btn></div>
        </>)}
        {tab === "aud" && (<>
          <Slider label="Volume geral" value={s.master} onChange={(v) => set("master", v)} />
          <Slider label="Música" value={s.music} onChange={(v) => set("music", v)} />
          <Slider label="Efeitos sonoros" value={s.sfx} onChange={(v) => set("sfx", v)} />
          <Slider label="Voz" value={s.voice} onChange={(v) => set("voice", v)} />
        </>)}
        {tab === "game" && (<>
          <Toggle label="Hitmarker" value={s.hitmarker} onChange={(v) => set("hitmarker", v)} />
          <Toggle label="Indicador de dano direcional" value={s.damageIndicators} onChange={(v) => set("damageIndicators", v)} />
          <Toggle label="Sangue" value={s.blood} onChange={(v) => set("blood", v)} hint="Partículas de sangue opcionais" />
          <Toggle label="Exibir FPS" value={s.showFps} onChange={(v) => set("showFps", v)} />
          <Slider label="Vibração" value={s.vibration} onChange={(v) => set("vibration", v)} />
          <Slider label="Tamanho da mira" value={s.crosshairSize} min={0.5} max={2} onChange={(v) => set("crosshairSize", v)} fmt={(v) => v.toFixed(1) + "x"} />
        </>)}
        {tab === "acc" && (<>
          <Slider label="Tamanho da interface" value={s.uiScale} min={0.8} max={1.35} onChange={(v) => set("uiScale", v)} fmt={(v) => Math.round(v * 100) + "%"} />
          <Toggle label="Legendas" value={s.subtitles} onChange={(v) => set("subtitles", v)} />
          <Toggle label="Alto contraste" value={s.highContrast} onChange={(v) => set("highContrast", v)} hint="Mira verde e interface mais nítida" />
          <Toggle label="Inverter câmera" value={s.invertY} onChange={(v) => set("invertY", v)} />
          <Slider label="Assistência de mira" value={s.aimAssist} onChange={(v) => set("aimAssist", v)} />
          <Slider label="Vibração" value={s.vibration} onChange={(v) => set("vibration", v)} />
        </>)}
        {tab === "perf" && <Perf />}
      </div>
    </Screen>
  );
}

function Perf() {
  const st = useStore(); const s = st.save.settings; const [fps, setFps] = useState(0); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  useEffect(() => { let raf = 0, n = 0, t0 = performance.now(); const f = (t: number) => { n++; if (t - t0 > 500) { setFps(Math.round((n * 1000) / (t - t0))); n = 0; t0 = t; } raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf); }, []);
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const detect = () => {
    setBusy(true); let n = 0; const t0 = performance.now(); const cv = document.createElement("canvas"); cv.width = cv.height = 512; const c = cv.getContext("2d")!;
    const f = (t: number) => {
      for (let i = 0; i < 400; i++) { c.fillStyle = `hsl(${i},80%,50%)`; c.fillRect((i * 7) % 500, (i * 13) % 500, 40, 40); }
      n++; if (t - t0 < 1200) requestAnimationFrame(f); else {
        const avg = (n * 1000) / (t - t0); let q = detectQuality(); if (avg < 40) q = "low"; else if (avg < 52 && q === "high") q = "med";
        mutate((sv) => { sv.settings.quality = q; }); setNote(`Teste: ${Math.round(avg)} FPS → ${q.toUpperCase()}`); setBusy(false);
      }
    };
    requestAnimationFrame(f);
  };
  const row = (a: string, b: string) => <div className="flex justify-between border-b border-white/10 py-1.5 text-[1rem]"><span className="text-white/70">{a}</span><b className="text-amber-300">{b}</b></div>;
  return (<>
    <div className="panel p-2.5">
      {row("FPS", `${fps}`)}{row("PING", "— (jogo offline / local)")}{row("Qualidade gráfica", s.quality === "auto" ? `AUTO (${detectQuality().toUpperCase()})` : s.quality.toUpperCase())}
      {row("Núcleos de CPU", `${navigator.hardwareConcurrency ?? "?"}`)}{row("Memória", mem ? `${mem} GB` : "n/d")}{row("Tela", `${screen.width}×${screen.height} @${(window.devicePixelRatio || 1).toFixed(1)}x`)}{row("Janela", `${window.innerWidth}×${window.innerHeight}`)}
    </div>
    <div className="flex flex-col gap-2">
      <Toggle label="Exibir FPS durante o jogo" value={s.showFps} onChange={(v) => mutate((sv) => { sv.settings.showFps = v; })} />
      <Btn className="primary" disabled={busy} onClick={detect}>{busy ? "Testando..." : "⚡ Gráficos automáticos: detectar agora"}</Btn>
      {note && <div className="text-[0.95rem] text-teal-300">{note}</div>}
      <Btn onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => { /* */ }); }}>⛶ Tela cheia</Btn>
    </div>
  </>);
}

// ------------------------------------------------------------------ HUD editor
export function HudEditor({ onClose }: { onClose: () => void }) {
  const st = useStore(); const base = st.save.settings;
  const [lay, setLay] = useState<Record<BtnId, HudBtn>>(() => JSON.parse(JSON.stringify(base.hud)));
  const [op, setOp] = useState(base.hudOpacity); const [cs, setCs] = useState(base.crosshairSize);
  const [sel, setSel] = useState<BtnId>("fire"); const [low, setLow] = useState(false);
  const preview: Settings = { ...base, hudOpacity: op, crosshairSize: cs, hud: lay };
  const save = () => { mutate((sv) => { sv.settings.hud = lay; sv.settings.hudOpacity = op; sv.settings.crosshairSize = cs; }); onClose(); };
  const reset = () => { setLay(JSON.parse(JSON.stringify(DEFAULT_HUD))); setOp(0.75); setCs(1); };
  const g = 9 * cs;
  return (
    <div className="absolute inset-0 z-[60]" style={{ background: "linear-gradient(135deg,#1b2a1f,#10161d)" }}>
      <div className="absolute inset-0 stripes opacity-30" />
      <Touch game={null} hud={null} settings={preview} layout={lay} editing selected={sel} onSelect={setSel} onChange={(id, v) => setLay((l) => ({ ...l, [id]: v }))} />
      {/* ghosts of HUD elements for reference */}
      <div className="safe-box pointer-events-none">
        <div className="absolute left-0 top-0 rounded-full border-2 border-dashed border-white/30" style={{ width: "13vh", height: "13vh" }}><div className="flex h-full items-center justify-center text-[0.7rem] text-white/50">MAPA</div></div>
        <div className="absolute bottom-0 right-0 rounded border-2 border-dashed border-white/30 px-3 py-2 text-[0.8rem] text-white/50" style={{ width: "18%", height: "14%" }}>MUNIÇÃO</div>
        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center justify-center rounded border-2 border-dashed border-white/30 text-[0.8rem] text-white/50" style={{ width: "24%", height: "9%" }}>VIDA</div>
        <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0 }}>{[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([x, y], i) => <div key={i} className="absolute bg-white" style={{ width: x ? 9 * cs : 2.5, height: x ? 2.5 : 9 * cs, left: x === -1 ? -g - 9 * cs + 6 : x === 1 ? g - 6 : -1, top: y === -1 ? -g - 9 * cs + 6 : y === 1 ? g - 6 : -1 }} />)}</div>
      </div>
      <div className={`absolute left-1/2 z-[70] flex w-[min(34rem,58%)] ${low ? "bottom-[max(var(--sab),0.4rem)]" : "top-[max(var(--sat),0.4rem)]"} -translate-x-1/2 flex-col gap-1 rounded-lg border border-white/20 bg-black/80 p-2`}>
        <div className="flex items-center justify-between"><span className="title-font text-[1.1rem]">PERSONALIZAR HUD</span><span className="flex items-center gap-1.5"><button className="chip !min-h-[2rem]" onClick={() => setLow(!low)}>⇅ Mover painel</button><span className="chip !bg-amber-400 !text-black">{BTN_NAMES[sel]}</span></span></div>
        <div className="text-[0.8rem] text-white/60">Arraste os botões para mover. Toque para selecionar.</div>
        <div className="grid grid-cols-3 gap-x-3">
          <Slider label="Tamanho" value={lay[sel].s} min={0.6} max={2.2} onChange={(v) => setLay((l) => ({ ...l, [sel]: { ...l[sel], s: v } }))} fmt={(v) => v.toFixed(1) + "x"} />
          <Slider label="Transparência" value={op} min={0.25} max={1} onChange={setOp} />
          <Slider label="Mira" value={cs} min={0.5} max={2} onChange={setCs} fmt={(v) => v.toFixed(1) + "x"} />
        </div>
        <div className="flex gap-1.5"><Btn className="primary flex-1 !min-h-[2.8rem] !py-1 justify-center" onClick={save}>Salvar</Btn><Btn className="flex-1 !min-h-[2.8rem] !py-1 justify-center" onClick={reset}>Restaurar</Btn><Btn className="danger flex-1 !min-h-[2.8rem] !py-1 justify-center" onClick={onClose}>Cancelar</Btn></div>
      </div>
    </div>
  );
}
