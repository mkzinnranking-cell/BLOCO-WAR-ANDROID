import type { CSSProperties, ReactNode } from "react";
import { audio } from "../game/audio";

export function tap(kind: "tap" | "ok" | "back" | "deny" = "tap") { audio.init(); audio.ui(kind); }

export function Btn({ children, onClick, className = "", disabled, style, kind = "tap" }: { children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean; style?: CSSProperties; kind?: "tap" | "ok" | "back" }) {
  return (
    <button disabled={disabled} className={`btn ${className}`} style={style} onClick={() => { tap(kind); onClick?.(); }}>
      {children}
    </button>
  );
}

export function Screen({ title, onBack, right, children, sub, side }: { title: string; onBack?: () => void; right?: ReactNode; children: ReactNode; sub?: string; side?: boolean }) {
  return (
    <div className="safe flex flex-col gap-2 anim-fade" style={side ? { width: "64%", background: "linear-gradient(90deg, rgba(5,8,12,0.95) 80%, rgba(5,8,12,0))" } : { background: "linear-gradient(135deg, rgba(5,8,12,0.94), rgba(10,16,24,0.9))" }}>
      <div className="flex items-center gap-3 shrink-0" style={{ minHeight: "3.4rem" }}>
        {onBack && <Btn onClick={onBack} kind="back" className="!min-h-[3.2rem] !px-4 !py-1">◀ Voltar</Btn>}
        <div className="min-w-0 flex-1">
          <div className="title-font truncate text-[1.5rem] leading-none text-white">{title}</div>
          {sub && <div className="truncate text-[0.85rem] text-white/60">{sub}</div>}
        </div>
        {right}
      </div>
      <div className="h-px shrink-0 bg-gradient-to-r from-amber-400/80 via-white/10 to-transparent" />
      <div className="scroll-y min-h-0 flex-1 pr-1">{children}</div>
    </div>
  );
}

export function Slider({ label, value, min = 0, max = 1, step = 0.01, onChange, fmt }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <div className="px-1 py-0.5">
      <div className="flex justify-between text-[1rem] font-semibold"><span>{label}</span><span className="text-amber-300">{fmt ? fmt(value) : Math.round(value * 100) + "%"}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </div>
  );
}
export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button className="flex min-h-[3rem] w-full items-center justify-between gap-3 rounded px-1 py-1 text-left" onClick={() => { tap(); onChange(!value); }}>
      <span className="min-w-0"><span className="block text-[1rem] font-semibold">{label}</span>{hint && <span className="block text-[0.8rem] text-white/55">{hint}</span>}</span>
      <span className={`relative h-[1.7rem] w-[3.2rem] shrink-0 rounded-full transition-colors ${value ? "bg-amber-400" : "bg-white/20"}`}>
        <span className={`absolute top-[0.2rem] h-[1.3rem] w-[1.3rem] rounded-full bg-white transition-all ${value ? "left-[1.7rem]" : "left-[0.2rem]"}`} />
      </span>
    </button>
  );
}
export function Seg<T extends string | number>({ label, value, options, onChange }: { label?: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="px-1 py-0.5">
      {label && <div className="text-[1rem] font-semibold">{label}</div>}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {options.map((o) => (
          <button key={String(o.v)} onClick={() => { tap(); onChange(o.v); }} className={`min-h-[2.8rem] min-w-[4.6rem] flex-1 overflow-hidden truncate rounded border px-1.5 text-[0.9rem] font-bold uppercase ${o.v === value ? "border-amber-300 bg-amber-400 text-black" : "border-white/20 bg-white/10 text-white"}`}>{o.l}</button>
        ))}
      </div>
    </div>
  );
}
export function Bar({ pct, color = "#ffb400", h = "0.6rem" }: { pct: number; color?: string; h?: string }) {
  return <div className="w-full overflow-hidden rounded-full bg-white/15" style={{ height: h }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, background: color }} /></div>;
}
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return <div className="panel flex flex-col items-center justify-center px-2 py-2"><div className="text-[1.35rem] font-extrabold leading-none text-amber-300">{value}</div><div className="pt-1 text-[0.75rem] uppercase tracking-wider text-white/60">{label}</div></div>;
}
export function Card({ children, className = "", onClick, sel }: { children: ReactNode; className?: string; onClick?: () => void; sel?: boolean }) {
  return <div onClick={onClick ? () => { tap(); onClick(); } : undefined} className={`panel p-2.5 ${onClick ? "cursor-pointer active:brightness-125" : ""} ${sel ? "!border-amber-300 shadow-[0_0_0.8rem_rgba(255,180,0,0.35)]" : ""} ${className}`}>{children}</div>;
}
export const credits = (n: number) => n.toLocaleString("pt-BR");
