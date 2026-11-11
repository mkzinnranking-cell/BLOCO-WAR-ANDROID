import { useEffect, useRef, useState } from "react";
import type { Game, GEvent, HudState } from "../game/engine";
import type { Settings } from "../game/types";
import { Btn } from "./common";
import { useU } from "./Touch";

interface Row { id: number; ev: GEvent }
let uid = 1;

export function Minimap({ game, size }: { game: Game; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0; let last = 0; const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw); if (t - last < 50) return; last = t;
      const d = game.minimapData(); const W = cv.width; const c = W / 2; const R = 30; const ppm = W / (2 * R);
      ctx.clearRect(0, 0, W, W); ctx.save(); ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = "#10171d"; ctx.fillRect(0, 0, W, W);
      ctx.translate(c, c); ctx.rotate(d.yaw); ctx.scale(ppm, ppm); ctx.translate(-d.x, -d.z);
      const off = d.S + 4; if (d.img) ctx.drawImage(d.img, -off, -off, 2 * d.S + 8, 2 * d.S + 8);
      const dot = (x: number, z: number, col: string, r = 1.6) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, z, r, 0, 6.3); ctx.fill(); };
      d.allies.forEach((a) => dot(a.x, a.z, "#4fb4ff"));
      d.foes.forEach((a) => dot(a.x, a.z, "#ff4a3a", 1.9));
      d.flags.forEach((f) => { dot(f.x, f.z, f.owner === 0 ? "#4fb4ff" : f.owner === 1 ? "#ff4a3a" : "#ccc", 3); });
      ctx.restore();
      // markers clamped to edge (screen space)
      d.markers.forEach((m) => {
        let dx = m.x - d.x, dz = m.z - d.z; const cs = Math.cos(d.yaw), sn = Math.sin(d.yaw);
        let sx = dx * cs - dz * sn, sy = dx * sn + dz * cs; const dist = Math.hypot(sx, sy); const lim = R - 3;
        if (dist > lim) { sx = (sx / dist) * lim; sy = (sy / dist) * lim; }
        const px = c + sx * ppm, py = c + sy * ppm; ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4); ctx.fillStyle = m.c; ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10); ctx.restore();
        void dx; void dz;
      });
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c, c - 8); ctx.lineTo(c + 6, c + 7); ctx.lineTo(c, c + 3); ctx.lineTo(c - 6, c + 7); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.stroke();
    };
    raf = requestAnimationFrame(draw); return () => cancelAnimationFrame(raf);
  }, [game]);
  return <canvas ref={ref} width={192} height={192} style={{ width: size, height: size }} className="rounded-full" />;
}

const FEED_ICON: Record<string, string> = { knife: "🔪", machete: "🔪", frag: "💥", boom40: "🚀", barrel: "🛢", target: "💥" };

export function Hud({ game, hud, settings, onPause }: { game: Game; hud: HudState; settings: Settings; onPause: () => void }) {
  const u = useU();
  const [hits, setHits] = useState<Row[]>([]); const [dmg, setDmg] = useState<Row[]>([]); const [feed, setFeed] = useState<Row[]>([]); const [banners, setBanners] = useState<Row[]>([]); const [xps, setXps] = useState<Row[]>([]);
  useEffect(() => game.on((ev) => {
    const row = { id: uid++, ev };
    const add = (set: React.Dispatch<React.SetStateAction<Row[]>>, ms: number, max = 6) => { set((l) => [...l.slice(-(max - 1)), row]); setTimeout(() => set((l) => l.filter((r) => r.id !== row.id)), ms); };
    if (ev.t === "hit") add(setHits, 260, 3); else if (ev.t === "dmg") add(setDmg, 900, 6); else if (ev.t === "feed") add(setFeed, 5000, 4);
    else if (ev.t === "banner") { setBanners([row]); setTimeout(() => setBanners((l) => l.filter((r) => r.id !== row.id)), 3200); } else if (ev.t === "xp") add(setXps, 1400, 3);
  }), [game]);

  const cs = settings.crosshairSize; const gap = (3 + hud.spread * 2.2) * cs * (u / 3.6);
  const len = 9 * cs * (u / 3.6);
  const hpPct = hud.hp / 100; const hpCol = hpPct > 0.5 ? "#3ad46a" : hpPct > 0.25 ? "#ffb400" : "#ff3a2a";
  const mm = Math.max(84, 27 * u);
  const hc = settings.highContrast;
  // marker position along top
  let mx = 50; let showM = false;
  if (hud.hasMarker && !hud.dead) { showM = true; const a = hud.markerAng; const half = 0.75; mx = 50 + Math.max(-1, Math.min(1, Math.tan(Math.max(-1.4, Math.min(1.4, a))) / Math.tan(half))) * 38; if (Math.abs(a) > 1.45) mx = a > 0 ? 12 : 88; }
  const teamMode = hud.mode === "tdm" || hud.mode === "dom" || hud.mode === "dm";

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ color: "#fff", fontWeight: 700, textShadow: "0 1px 3px #000, 0 0 6px rgba(0,0,0,0.8)" }}>
      {/* overlays */}
      {hud.lowHp && <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(190,0,0,0.55) 100%)", animation: "fadeIn 0.5s" }} />}
      {hud.flashAmt > 0.02 && <div className="absolute inset-0 bg-white" style={{ opacity: Math.min(1, hud.flashAmt * 1.3) }} />}
      {hud.scoped && (
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at center, transparent 0, transparent 30vh, #000 31vh)" }}>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-black/80" /><div className="absolute bottom-0 top-0 left-1/2 w-px bg-black/80" />
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
        </div>
      )}
      {/* damage indicators */}
      {settings.damageIndicators && (
        <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0 }}>
          {dmg.map((d) => d.ev.t === "dmg" && (
            <div key={d.id} className="absolute" style={{ transform: `rotate(${-d.ev.ang}rad)`, left: 0, top: 0, animation: "dmgArc 0.9s forwards" }}>
              <div style={{ position: "absolute", left: -6 * u, top: -17 * u, width: 12 * u, height: 3 * u, borderRadius: "50% 50% 0 0", background: "linear-gradient(180deg, rgba(255,40,30,0.95), rgba(255,40,30,0))" }} />
            </div>
          ))}
        </div>
      )}
      {/* crosshair */}
      {!hud.scoped && !hud.dead && (
        <div className="absolute left-1/2 top-1/2" style={{ width: 0, height: 0, opacity: 1 - hud.ads * 0.4 }}>
          {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([x, y], i) => (
            <div key={i} className="absolute" style={{ background: hc ? "#00ff66" : "#fff", boxShadow: "0 0 2px #000, 0 0 0 1px rgba(0,0,0,0.6)", width: x ? len : 2.5, height: x ? 2.5 : len, left: x === -1 ? -gap - len : x === 1 ? gap : -1.25, top: y === -1 ? -gap - len : y === 1 ? gap : -1.25 }} />
          ))}
          <div className="absolute rounded-full bg-red-500" style={{ width: 3.5, height: 3.5, left: -1.75, top: -1.75, boxShadow: "0 0 2px #000" }} />
          {settings.hitmarker && hits.map((h) => h.ev.t === "hit" && (
            <div key={h.id} className="absolute left-0 top-0" style={{ width: 18 * cs * (u / 3.6), height: 18 * cs * (u / 3.6), animation: "hitm 0.26s forwards" }}>
              <div className="absolute inset-0 border-2" style={{ borderColor: h.ev.kill ? "#ff3a2a" : h.ev.head ? "#ffb400" : "#fff", boxShadow: "0 0 3px #000" }} />
              <div className="absolute" style={{ left: "35%", right: "35%", top: -2, bottom: -2, background: "#0a0e13" }} /><div className="absolute" style={{ top: "35%", bottom: "35%", left: -2, right: -2, background: "#0a0e13" }} />
            </div>
          ))}
        </div>
      )}
      {/* xp */}
      <div className="absolute left-1/2 flex flex-col items-center gap-0.5" style={{ top: "60%", transform: "translateX(-50%)" }}>
        {xps.map((x) => x.ev.t === "xp" && <div key={x.id} className="text-[0.95rem] text-amber-300" style={{ animation: "feedIn 1.4s forwards" }}>+{x.ev.amount} XP <span className="text-white/70">{x.ev.why}</span></div>)}
      </div>

      <div className="safe-box">
        {/* top-left: minimap */}
        <div className="absolute left-0 top-0 flex items-start gap-1.5">
          <div className="rounded-full bg-black/40 p-0.5" style={{ boxShadow: "0 0 0 2px rgba(255,255,255,0.15)" }}><Minimap game={game} size={mm} /></div>
          <div className="flex flex-col gap-1">
            {hud.stealth && <span className="chip !bg-emerald-600/80">🥷 FURTIVO</span>}
            {hud.prot && <span className="chip !bg-sky-600/80">🛡 PROTEÇÃO</span>}
            {hud.radar && <span className="chip !bg-red-600/80">📡 RADAR</span>}
          </div>
        </div>

        {/* top-center objective */}
        <div className="absolute left-1/2 top-0 flex -translate-x-1/2 flex-col items-center" style={{ width: "40%", maxWidth: 520 }}>
          {teamMode && hud.scoreLimit > 0 && (
            <div className="mb-1 flex items-center gap-2 rounded bg-black/50 px-3 py-0.5 text-[1.1rem]">
              <span className="text-sky-300">{hud.mode === "dm" ? "VOCÊ" : "EQUIPE"} {hud.scoreA}</span><span className="text-white/60">/ {hud.scoreLimit}</span><span className="text-red-300">{hud.mode === "dm" ? "LÍDER" : "INIMIGO"} {hud.scoreB}</span><span className="ml-2 text-amber-300">{hud.timer}</span>
            </div>
          )}
          {hud.flags.length > 0 && (
            <div className="mb-1 flex gap-2">{hud.flags.map((f) => <span key={f.n} className="flex h-[1.9rem] w-[1.9rem] items-center justify-center rounded-full border-2 border-white/70 text-[1rem]" style={{ background: f.owner === 0 ? "#2a7fd0" : f.owner === 1 ? "#d03a2a" : "rgba(0,0,0,0.5)" }}>{f.n}</span>)}</div>
          )}
          <div className="w-full rounded bg-black/45 px-3 py-1 text-center" style={{ borderTop: "2px solid #ffb400" }}>
            <div className="text-[0.65rem] tracking-[0.25em] text-amber-300">OBJETIVO ATUAL{!teamMode && hud.timer ? ` • ${hud.timer}` : ""}</div>
            <div className="text-[1rem] leading-tight">{hud.objective}{hud.objProg && <span className="ml-2 text-amber-300">[{hud.objProg}]</span>}</div>
          </div>
          {hud.boss && (
            <div className="mt-1 w-full"><div className="text-center text-[0.75rem] text-red-300">{hud.boss.name}</div><div className="h-[0.6rem] w-full overflow-hidden rounded bg-black/60 ring-1 ring-red-400"><div className="h-full bg-red-500" style={{ width: `${hud.boss.p * 100}%` }} /></div></div>
          )}
          {hud.dialog && settings.subtitles && (
            <div className="mt-1.5 w-full rounded bg-black/65 px-3 py-1 text-left anim-slide" style={{ borderLeft: "3px solid #19d6c9" }}>
              <span className="text-[0.8rem] text-teal-300">{hud.dialog.who}: </span><span className="text-[0.95rem] font-semibold">{hud.dialog.text}</span>
            </div>
          )}
          {showM && !hud.cut && <div className="mt-1 text-[0.8rem] text-amber-300">◆ {Math.round(hud.markerDist)}m</div>}
        </div>
        {showM && !hud.cut && <div className="absolute text-amber-300" style={{ left: `${mx}%`, top: "17%", transform: "translateX(-50%)", fontSize: "1.6rem", textShadow: "0 0 4px #000" }}>{Math.abs(hud.markerAng) > 1.45 ? (hud.markerAng > 0 ? "◀" : "▶") : "▼"}</div>}

        {/* top-right */}
        <div className="absolute right-0 top-0 flex flex-col items-end gap-1">
          <button className="pointer-events-auto flex items-center justify-center rounded-full border-2 border-white/40 bg-black/50 text-[1.2rem]" style={{ width: Math.max(46, 11 * u), height: Math.max(46, 11 * u) }} onPointerDown={(e) => { e.stopPropagation(); onPause(); }} aria-label="Pausar">⏸</button>
          {settings.showFps && <span className="chip !bg-black/60">{hud.fps} FPS • {hud.quality}</span>}
          <div className="flex flex-col items-end gap-0.5" style={{ maxWidth: "30vw" }}>
            {feed.map((f) => f.ev.t === "feed" && (
              <div key={f.id} className="flex items-center gap-1.5 rounded bg-black/55 px-2 py-0.5 text-[0.85rem]" style={{ animation: "feedIn 5s forwards", outline: f.ev.me ? "1px solid #ffb400" : "none" }}>
                <span style={{ color: f.ev.kt === 0 ? "#6ac4ff" : "#ff7a6a" }} className="truncate">{f.ev.killer}</span><span>{FEED_ICON[f.ev.weapon] ?? "🔫"}{f.ev.head ? "💀" : ""}</span><span style={{ color: f.ev.vt === 0 ? "#6ac4ff" : "#ff7a6a" }} className="truncate">{f.ev.victim}</span>
              </div>
            ))}
          </div>
        </div>

        {/* bottom-center: health */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: "24%", minWidth: 150 }}>
          <div className="flex items-center gap-2"><span className="text-[1.3rem]">❤</span>
            <div className="flex-1"><div className="h-[0.8rem] w-full overflow-hidden rounded-sm bg-black/60 ring-1 ring-white/30"><div className="h-full transition-all" style={{ width: `${hpPct * 100}%`, background: hpCol }} /></div>
              <div className="mt-0.5 h-[0.4rem] w-full overflow-hidden rounded-sm bg-black/60"><div className="h-full bg-sky-400" style={{ width: `${hud.armor * 2}%` }} /></div></div>
            <span className="min-w-[2.4rem] text-right text-[1.5rem] leading-none" style={{ color: hpCol }}>{hud.hp}</span>
          </div>
        </div>

        {/* bottom-right: ammo */}
        <div className="absolute bottom-0 right-0 flex flex-col items-end" style={{ minWidth: "18%" }}>
          <div className="flex items-center gap-1 text-[0.8rem]">{[...Array(Math.min(5, hud.grenades))].map((_, i) => <span key={i}>💣</span>)}<span className="text-white/60">{hud.gtype === "frag" ? "FRAG" : hud.gtype === "smoke" ? "FUMAÇA" : "LUZ"}</span></div>
          <div className="text-[0.85rem] uppercase tracking-wider text-amber-300">{hud.wname}</div>
          {hud.wcat !== "melee" ? (
            <div className="flex items-baseline gap-1.5"><span className={`text-[2.4rem] leading-none ${hud.ammo === 0 ? "text-red-400 animate-pulse" : ""}`}>{hud.ammo}</span><span className="text-[1.2rem] text-white/70">/ {hud.infAmmo ? "∞" : hud.reserve}</span></div>
          ) : <div className="text-[1.4rem]">🔪</div>}
          {hud.reloadP >= 0 && <div className="mt-0.5 h-[0.35rem] w-[8rem] overflow-hidden rounded bg-black/60"><div className="h-full bg-amber-400" style={{ width: `${hud.reloadP * 100}%` }} /></div>}
          {hud.ammo === 0 && hud.wcat !== "melee" && hud.reloadP < 0 && <div className="text-[0.8rem] text-red-300">RECARREGAR</div>}
        </div>

        {hud.prompt && <div className="absolute left-1/2 text-[0.95rem] text-amber-200" style={{ top: "63%", transform: "translateX(-50%)" }}>✋ {hud.prompt}{hud.promptP > 0 && <div className="mx-auto mt-1 h-1.5 w-24 overflow-hidden rounded bg-black/60"><div className="h-full bg-amber-300" style={{ width: `${hud.promptP * 100}%` }} /></div>}</div>}
      </div>

      {/* banners */}
      {banners.map((b) => b.ev.t === "banner" && (
        <div key={b.id} className="absolute left-1/2 text-center" style={{ top: "30%", transform: "translateX(-50%)", animation: "bannerIn 3.2s forwards" }}>
          <div className="title-font px-6 py-1 text-[1.9rem]" style={{ color: b.ev.kind === "obj" ? "#5dffb0" : b.ev.kind === "alert" ? "#ff5a4a" : "#ffc533", background: "linear-gradient(90deg, transparent, rgba(0,0,0,0.65), transparent)" }}>{b.ev.text}</div>
          {b.ev.sub && <div className="text-[1rem] text-white/90" style={{ background: "linear-gradient(90deg, transparent, rgba(0,0,0,0.5), transparent)" }}>{b.ev.sub}</div>}
        </div>
      ))}

      {/* cutscene */}
      {hud.cut && (
        <>
          <div className="absolute left-0 right-0 top-0 bg-black" style={{ height: "13%" }} />
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-black px-[10%]" style={{ height: "24%" }}>
            <div className="text-center"><div className="text-[0.9rem] tracking-widest text-teal-300">{hud.cut.who}</div><div className="text-[1.15rem] font-semibold">{hud.cut.text}</div></div>
          </div>
          <div className="pointer-events-auto absolute" style={{ right: "max(var(--sar),0.8rem)", bottom: "calc(24% + 0.5rem)" }}><Btn onClick={() => game.skipCutscene()} className="!min-h-[2.8rem] !py-1">Pular ▶▶</Btn></div>
        </>
      )}
    </div>
  );
}
