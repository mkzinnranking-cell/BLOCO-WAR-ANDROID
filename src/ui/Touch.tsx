import { useEffect, useRef, useState } from "react";
import type { Game, HudState } from "../game/engine";
import type { BtnId, HudBtn, Settings } from "../game/types";

export const uPx = () => Math.max(2.4, Math.min(window.innerHeight / 100, window.innerWidth / 200));
export function useU() {
  const [u, setU] = useState(uPx());
  useEffect(() => { const f = () => setU(uPx()); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return u;
}

export const BTN_DEFS: { id: Exclude<BtnId, "joy">; icon: string; label: string; base: number }[] = [
  { id: "fire", icon: "🔫", label: "ATIRAR", base: 13 },
  { id: "ads", icon: "🎯", label: "MIRAR", base: 13 },
  { id: "reload", icon: "🔄", label: "RECARREGAR", base: 13 },
  { id: "sprint", icon: "🏃", label: "CORRER", base: 13 },
  { id: "jump", icon: "🦘", label: "PULAR", base: 13 },
  { id: "switch", icon: "🔁", label: "TROCAR ARMA", base: 13 },
  { id: "melee", icon: "🔪", label: "CORPO A CORPO", base: 13 },
  { id: "grenade", icon: "💥", label: "GRANADA", base: 13 },
  { id: "interact", icon: "✋", label: "INTERAGIR", base: 13 },
  { id: "ability", icon: "⚡", label: "HABILIDADE", base: 13 },
];
export const BTN_NAMES: Record<BtnId, string> = { joy: "JOYSTICK", fire: "ATIRAR", ads: "MIRAR", reload: "RECARREGAR", sprint: "CORRER", jump: "PULAR", switch: "TROCAR ARMA", melee: "CORPO A CORPO", grenade: "GRANADA", interact: "INTERAGIR", ability: "HABILIDADE" };

interface Props {
  game: Game | null; hud: HudState | null; settings: Settings;
  layout?: Record<BtnId, HudBtn>; editing?: boolean; selected?: BtnId | null; onSelect?: (id: BtnId) => void; onChange?: (id: BtnId, v: HudBtn) => void;
}

export function Touch({ game, hud, settings, layout, editing, selected, onSelect, onChange }: Props) {
  const cont = useRef<HTMLDivElement>(null);
  const u = useU();
  const lay = layout ?? settings.hud;
  const op = settings.hudOpacity;
  const joyDia = (s: number) => Math.max(88, 26 * u * s);
  const btnDia = (s: number, base = 13) => Math.max(46, base * u * s);

  // ---------------- joystick
  const [stick, setStick] = useState<{ ox: number; oy: number; kx: number; ky: number } | null>(null);
  const stickId = useRef<number | null>(null); const stickOrg = useRef({ x: 0, y: 0 }); const fullT = useRef(0);
  const rect = () => cont.current!.getBoundingClientRect();
  const lookId = useRef<number | null>(null); const lookLast = useRef({ x: 0, y: 0 });

  const joyDown = (e: React.PointerEvent) => {
    if (editing || !game) return;
    if (e.pointerType === "mouse") { cont.current?.requestPointerLock?.(); return; }
    if (stickId.current !== null) return;
    stickId.current = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = rect(); const cfg = lay.joy; let ox = e.clientX - r.left, oy = e.clientY - r.top;
    if (!settings.joystickFloating) { ox = (cfg.x / 100) * r.width; oy = (cfg.y / 100) * r.height; }
    stickOrg.current = { x: ox + r.left, y: oy + r.top }; setStick({ ox, oy, kx: 0, ky: 0 }); fullT.current = 0;
    joyMove(e);
  };
  const joyMove = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current || !game) return;
    const R = joyDia(lay.joy.s) / 2; const dx = e.clientX - stickOrg.current.x, dy = e.clientY - stickOrg.current.y;
    const m = Math.hypot(dx, dy); const k = m > R ? R / m : 1; const nx = (dx * k) / R, ny = (dy * k) / R;
    let mx = nx, my = -ny; const mag = Math.hypot(mx, my);
    if (mag < 0.12) { mx = 0; my = 0; } else { const s = (mag - 0.12) / 0.88 / mag; mx *= s; my *= s; }
    game.input.moveX = mx; game.input.moveY = my;
    if (mag > 0.97 && my > 0.6) { fullT.current += 1; if (fullT.current > 25) game.input.sprint = true; } else fullT.current = 0;
    setStick((s) => (s ? { ...s, kx: nx * R, ky: ny * R } : s));
  };
  const joyUp = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current || !game) return;
    stickId.current = null; game.input.moveX = 0; game.input.moveY = 0; setStick(null);
  };
  // ---------------- look
  const lookDown = (e: React.PointerEvent) => {
    if (editing || !game) return;
    if (e.pointerType === "mouse") { cont.current?.requestPointerLock?.(); return; }
    if (lookId.current !== null) return;
    lookId.current = e.pointerId; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: React.PointerEvent) => {
    if (e.pointerId !== lookId.current || !game) return;
    game.input.lookDX += e.clientX - lookLast.current.x; game.input.lookDY += e.clientY - lookLast.current.y; lookLast.current = { x: e.clientX, y: e.clientY };
  };
  const lookUp = (e: React.PointerEvent) => { if (e.pointerId === lookId.current) lookId.current = null; };

  // ---------------- desktop fallback (mouse + keyboard)
  useEffect(() => {
    if (!game || editing) return;
    const keys = new Set<string>(); const inp = game.input;
    const upd = () => {
      inp.moveX = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
      inp.moveY = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
      inp.sprint = keys.has("shift") ? true : inp.sprint && keys.size > 0 && inp.moveY > 0 ? inp.sprint : keys.has("shift");
    };
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); if (keys.has(k)) return; keys.add(k);
      if (k === " ") inp.jump = true; if (k === "r") inp.reload = true; if (k === "q" || k === "tab") { inp.sw = true; e.preventDefault(); } if (k === "f") inp.interact = true; if (k === "g") inp.grenade = true;
      if (k === "v") inp.melee = true; if (k === "e") inp.ability = true; if (k === "control") inp.ads = !inp.ads; upd();
    };
    const ku = (e: KeyboardEvent) => { keys.delete(e.key.toLowerCase()); upd(); };
    const mm = (e: MouseEvent) => { if (document.pointerLockElement) { inp.lookDX += e.movementX; inp.lookDY += e.movementY; } };
    const md = (e: MouseEvent) => { if (!document.pointerLockElement) return; if (e.button === 0) inp.fire = true; if (e.button === 2) inp.ads = !inp.ads; };
    const mu = (e: MouseEvent) => { if (e.button === 0) inp.fire = false; };
    const wh = (e: WheelEvent) => { if (document.pointerLockElement && Math.abs(e.deltaY) > 0) inp.sw = true; };
    const ctx = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("mousemove", mm); window.addEventListener("mousedown", md); window.addEventListener("mouseup", mu); window.addEventListener("wheel", wh); window.addEventListener("contextmenu", ctx);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("mousemove", mm); window.removeEventListener("mousedown", md); window.removeEventListener("mouseup", mu); window.removeEventListener("wheel", wh); window.removeEventListener("contextmenu", ctx); };
  }, [game, editing]);

  // ---------------- edit drag
  const drag = useRef<{ id: BtnId; dx: number; dy: number } | null>(null);
  const editDown = (e: React.PointerEvent, id: BtnId) => {
    if (!editing) return; e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = rect(); const b = lay[id]; drag.current = { id, dx: e.clientX - r.left - (b.x / 100) * r.width, dy: e.clientY - r.top - (b.y / 100) * r.height }; onSelect?.(id);
  };
  const editMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!editing || !d) return;
    const r = rect(); const b = lay[d.id]; const size = d.id === "joy" ? joyDia(b.s) : btnDia(b.s);
    const hx = (size / 2 / r.width) * 100, hy = (size / 2 / r.height) * 100;
    const x = Math.min(100 - hx, Math.max(hx, ((e.clientX - r.left - d.dx) / r.width) * 100)); const y = Math.min(100 - hy, Math.max(hy, ((e.clientY - r.top - d.dy) / r.height) * 100));
    onChange?.(d.id, { ...b, x, y });
  };
  const editUp = () => { drag.current = null; };

  // ---------------- buttons
  const press = (id: Exclude<BtnId, "joy">, down: boolean, e: React.PointerEvent) => {
    if (editing || !game) return; const inp = game.input;
    if (id === "fire") { inp.fire = down; if (down) { lookId.current = e.pointerId; lookLast.current = { x: e.clientX, y: e.clientY }; } else lookId.current = null; return; }
    if (!down) return;
    if (id === "ads") inp.ads = !inp.ads; else if (id === "sprint") inp.sprint = !inp.sprint;
    else if (id === "jump") inp.jump = true; else if (id === "reload") inp.reload = true; else if (id === "switch") inp.sw = true; else if (id === "melee") inp.melee = true;
    else if (id === "grenade") inp.grenade = true; else if (id === "interact") inp.interact = true; else if (id === "ability") inp.ability = true;
    if (navigator.vibrate && settings.vibration > 0) { try { navigator.vibrate(8 * settings.vibration); } catch { /* */ } }
  };

  const hint = hud?.hint;
  const joyCfg = lay.joy; const jd = joyDia(joyCfg.s);
  return (
    <div ref={cont} className="safe-box" style={{ touchAction: "none" }}>
      {/* zones */}
      <div className="absolute bottom-0 left-0 top-0 z-0" style={{ width: "45%", touchAction: "none" }} onPointerDown={joyDown} onPointerMove={joyMove} onPointerUp={joyUp} onPointerCancel={joyUp} />
      <div className="absolute bottom-0 right-0 top-0 z-0" style={{ width: "55%", touchAction: "none" }} onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      {hint === "look" && <div className="pointer-events-none absolute right-[6%] top-[25%] z-0 flex h-[45%] w-[38%] items-center justify-center rounded-3xl border-2 border-dashed border-amber-300/80 bg-amber-300/10 text-[1.1rem] font-bold text-amber-200 animate-pulse">DESLIZE AQUI ↔ ↕</div>}
      {/* joystick visual */}
      {(() => {
        const act = stick; const cx = act ? act.ox : (joyCfg.x / 100) * (cont.current?.clientWidth ?? 0); const cy = act ? act.oy : (joyCfg.y / 100) * (cont.current?.clientHeight ?? 0);
        const showBase = editing || !!act || true;
        return showBase && (
          <div
            className={`absolute z-[5] rounded-full border-2 border-white/40 ${editing && selected === "joy" ? "!border-amber-300" : ""} ${hint === "joy" ? "anim-pulse-ring" : ""}`}
            style={{ left: editing ? `${joyCfg.x}%` : cx, top: editing ? `${joyCfg.y}%` : cy, width: jd, height: jd, transform: "translate(-50%,-50%)", background: "radial-gradient(circle, rgba(255,255,255,0.08), rgba(255,255,255,0.02))", opacity: act ? Math.min(1, op + 0.2) : op * 0.8, touchAction: "none", pointerEvents: editing ? "auto" : "none" }}
            onPointerDown={(e) => editDown(e, "joy")} onPointerMove={editMove} onPointerUp={editUp}
          >
            <div className="absolute rounded-full border-2 border-white/60 bg-white/25" style={{ width: jd * 0.42, height: jd * 0.42, left: jd / 2 - jd * 0.21 + (act?.kx ?? 0), top: jd / 2 - jd * 0.21 + (act?.ky ?? 0) }} />
            {editing && <div className="absolute inset-0 flex items-center justify-center text-[0.8rem] font-bold text-white/80">MOVER</div>}
          </div>
        );
      })()}
      {/* buttons */}
      {BTN_DEFS.map((d) => {
        const b = lay[d.id]; const size = btnDia(b.s, d.base);
        const hidden = !editing && ((d.id === "interact" && !hud?.canInteract));
        if (hidden) return null;
        const active = (d.id === "ads" && (hud?.ads ?? 0) > 0.5) || (d.id === "sprint" && hud?.sprintOn) || (editing && selected === d.id);
        const cd = d.id === "ability" ? hud?.abilityCd ?? 0 : 0;
        const big = d.id === "fire";
        return (
          <div
            key={d.id} aria-label={d.label}
            onPointerDown={(e) => { if (editing) return editDown(e, d.id); e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); press(d.id, true, e); }}
            onPointerMove={(e) => { if (editing) return editMove(e); if (d.id === "fire" && game && e.pointerId === lookId.current) { game.input.lookDX += e.clientX - lookLast.current.x; game.input.lookDY += e.clientY - lookLast.current.y; lookLast.current = { x: e.clientX, y: e.clientY }; } }}
            onPointerUp={(e) => { if (editing) return editUp(); press(d.id, false, e); }}
            onPointerCancel={(e) => { if (!editing) press(d.id, false, e); }}
            className={`absolute z-10 flex flex-col items-center justify-center rounded-full border-2 ${active ? "border-amber-300 bg-amber-400/35" : "border-white/45 bg-black/35"} ${hint === d.id ? "anim-pulse-ring !border-amber-300" : ""}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: size, height: size, transform: "translate(-50%,-50%)", opacity: op, touchAction: "none", backdropFilter: "blur(2px)", boxShadow: big ? "0 0 1rem rgba(255,80,40,0.35) inset" : undefined, background: big && !active ? "radial-gradient(circle, rgba(255,90,50,0.35), rgba(0,0,0,0.35))" : undefined }}
          >
            <span style={{ fontSize: size * 0.42, lineHeight: 1, filter: "drop-shadow(0 1px 2px #000)" }}>{d.icon}</span>
            {size > 54 && <span className="mt-0.5 font-bold text-white/90" style={{ fontSize: Math.max(8, size * 0.15) }}>{d.label.split(" ")[0]}</span>}
            {cd > 0 && <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(rgba(0,0,0,0.7) ${cd * 360}deg, transparent 0)` }} />}
            {d.id === "grenade" && hud && <span className="absolute -right-1 -top-1 flex h-[1.4rem] min-w-[1.4rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[0.8rem] font-extrabold text-black">{hud.grenades}</span>}
            {editing && <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed border-amber-300/70" />}
          </div>
        );
      })}
    </div>
  );
}
