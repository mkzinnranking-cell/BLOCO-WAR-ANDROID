import type { Snd } from "./data/weapons";

interface ShotP { nd: number; lp: number; th: number; td: number; g: number; hp?: number }
const SHOT: Record<Snd, ShotP> = {
  pistol: { nd: 0.12, lp: 5000, th: 180, td: 0.1, g: 0.7, hp: 400 },
  magnum: { nd: 0.28, lp: 3500, th: 110, td: 0.22, g: 1.1, hp: 200 },
  smg: { nd: 0.09, lp: 6500, th: 200, td: 0.06, g: 0.6, hp: 500 },
  rifle: { nd: 0.16, lp: 4200, th: 140, td: 0.14, g: 0.9, hp: 300 },
  sniper: { nd: 0.5, lp: 3000, th: 90, td: 0.4, g: 1.3, hp: 150 },
  shotgun: { nd: 0.3, lp: 2800, th: 100, td: 0.25, g: 1.2, hp: 150 },
  lmg: { nd: 0.14, lp: 3600, th: 120, td: 0.12, g: 1, hp: 200 },
  launcher: { nd: 0.35, lp: 1800, th: 70, td: 0.35, g: 1, hp: 80 },
  melee: { nd: 0.1, lp: 3000, th: 0, td: 0, g: 0.5, hp: 1500 },
};

export class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode; musicG!: GainNode; sfxG!: GainNode; voiceG!: GainNode;
  noise!: AudioBuffer;
  vols = { master: 0.8, music: 0.5, sfx: 0.9, voice: 0.9 };
  active = 0;
  ambNodes: AudioNode[] = [];
  ambTimer = 0;
  musicTimer = 0;
  musicMode: "off" | "menu" | "combat" = "off";
  nextNote = 0;
  step16 = 0;

  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    this.musicG = c.createGain(); this.sfxG = c.createGain(); this.voiceG = c.createGain();
    this.musicG.connect(this.master); this.sfxG.connect(this.master); this.voiceG.connect(this.master);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVols();
  }
  setVols(v: { master: number; music: number; sfx: number; voice: number }) { this.vols = v; this.applyVols(); }
  applyVols() {
    if (!this.ctx) return;
    this.master.gain.value = this.vols.master;
    this.musicG.gain.value = this.vols.music * 0.5;
    this.sfxG.gain.value = this.vols.sfx;
    this.voiceG.gain.value = this.vols.voice;
  }
  listener(x: number, y: number, z: number, yaw: number) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    if (l.positionX) {
      l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
      l.forwardX.value = -Math.sin(yaw); l.forwardY.value = 0; l.forwardZ.value = -Math.cos(yaw);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    }
  }
  private out(pos?: { x: number; y: number; z: number }, lpDist = true): AudioNode | null {
    if (!this.ctx || this.active > 28) return null;
    if (!pos) return this.sfxG;
    const c = this.ctx;
    const p = c.createPanner();
    p.panningModel = "equalpower"; p.distanceModel = "inverse"; p.refDistance = 5; p.rolloffFactor = 1.3; p.maxDistance = 200;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    const l = c.listener;
    const d = l.positionX ? Math.hypot(pos.x - l.positionX.value, pos.z - l.positionZ.value) : 10;
    if (lpDist && d > 25) {
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = Math.max(700, 9000 / (1 + d / 25));
      f.connect(p); p.connect(this.sfxG);
      return f;
    }
    p.connect(this.sfxG);
    return p;
  }
  private burst(out: AudioNode, dur: number, type: BiquadFilterType, freq: number, gain: number, delay = 0, q = 0.7) {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); const t = c.currentTime + delay;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    this.active++; s.onended = () => { this.active--; };
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  private tone(out: AudioNode, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = "sine", delay = 0) {
    const c = this.ctx!; const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); this.active++; o.onended = () => { this.active--; };
    o.start(t); o.stop(t + dur + 0.02);
  }
  shot(snd: Snd, noise = 1, pos?: { x: number; y: number; z: number }) {
    const o = this.out(pos); if (!o) return;
    const p = SHOT[snd];
    const g = p.g * (0.25 + 0.75 * noise);
    if (snd === "melee") { this.burst(o, 0.12, "highpass", 1800, 0.5); this.burst(o, 0.08, "bandpass", 3000, 0.3, 0.05); return; }
    this.burst(o, p.nd, "lowpass", p.lp * (0.5 + 0.5 * noise), g, 0, 0.5);
    this.burst(o, p.nd * 0.4, "highpass", p.hp ?? 400, g * 0.6, 0);
    this.tone(o, p.th * 1.6, p.th * 0.4, p.td, g * 0.9);
    if (snd === "sniper" || snd === "shotgun" || snd === "launcher") this.burst(o, 0.9, "lowpass", 600, g * 0.35, 0.08);
  }
  reload(stage: 0 | 1 | 2, pos?: { x: number; y: number; z: number }) {
    const o = this.out(pos, false); if (!o) return;
    if (stage === 0) { this.burst(o, 0.04, "bandpass", 2200, 0.5, 0, 4); this.tone(o, 300, 160, 0.06, 0.2, "square"); }
    if (stage === 1) { this.burst(o, 0.05, "bandpass", 1500, 0.55, 0, 3); this.tone(o, 520, 300, 0.05, 0.15, "square"); }
    if (stage === 2) { this.burst(o, 0.06, "bandpass", 1100, 0.6, 0, 3); this.tone(o, 240, 120, 0.1, 0.3, "square"); }
  }
  empty() { const o = this.out(); if (o) this.burst(o, 0.03, "bandpass", 3000, 0.4, 0, 6); }
  step(pos?: { x: number; y: number; z: number }, run = false) {
    const o = this.out(pos, false); if (!o) return;
    this.burst(o, 0.08, "lowpass", 400 + Math.random() * 300, run ? 0.35 : 0.2);
  }
  explosion(pos?: { x: number; y: number; z: number }, big = 1) {
    const o = this.out(pos); if (!o) return;
    this.burst(o, 1.2 * big, "lowpass", 900, 1.2);
    this.burst(o, 0.4, "highpass", 1200, 0.5);
    this.tone(o, 110, 25, 0.9, 1.2);
    this.burst(o, 1.8, "lowpass", 300, 0.6, 0.1);
  }
  hit(head: boolean, kill = false) {
    const o = this.out(); if (!o) return;
    this.tone(o, head ? 1900 : 1300, head ? 1500 : 900, 0.07, 0.35, "square");
    if (kill) this.tone(o, 700, 400, 0.18, 0.3, "triangle", 0.04);
  }
  impact(pos: { x: number; y: number; z: number }) {
    const o = this.out(pos, false); if (!o) return;
    this.burst(o, 0.06, "bandpass", 2500 + Math.random() * 1500, 0.25, 0, 2);
  }
  hurt() { const o = this.out(); if (o) { this.tone(o, 220, 120, 0.2, 0.4, "sawtooth"); this.burst(o, 0.15, "lowpass", 600, 0.4); } }
  ui(kind: "tap" | "ok" | "back" | "deny" | "complete" = "tap") {
    const o = this.out(); if (!o) return;
    if (kind === "tap") this.tone(o, 900, 1200, 0.05, 0.18, "square");
    if (kind === "back") this.tone(o, 700, 450, 0.07, 0.18, "square");
    if (kind === "deny") this.tone(o, 200, 150, 0.15, 0.25, "sawtooth");
    if (kind === "ok") { this.tone(o, 600, 900, 0.08, 0.2, "triangle"); this.tone(o, 900, 1400, 0.1, 0.2, "triangle", 0.08); }
    if (kind === "complete") [523, 659, 784, 1046].forEach((f, i) => this.tone(o, f, f, 0.25, 0.22, "triangle", i * 0.1));
  }
  pickup() { const o = this.out(); if (o) { this.tone(o, 500, 800, 0.1, 0.25, "triangle"); this.tone(o, 800, 1200, 0.1, 0.25, "triangle", 0.09); } }
  bounce(pos: { x: number; y: number; z: number }) { const o = this.out(pos, false); if (o) { this.tone(o, 800, 500, 0.04, 0.2, "square"); this.burst(o, 0.04, "bandpass", 2000, 0.2); } }
  beep() { const o = this.voiceG; if (!o || !this.ctx) return; this.tone(o, 1200, 1200, 0.05, 0.12, "square"); }
  voice(text: string) {
    if (!this.ctx) return;
    const n = Math.min(14, Math.max(4, Math.floor(text.length / 6)));
    for (let i = 0; i < n; i++) this.tone(this.voiceG, 180 + Math.random() * 120, 150 + Math.random() * 100, 0.09, 0.12, "sawtooth", i * 0.13);
  }
  whoosh() { const o = this.out(); if (o) this.burst(o, 0.25, "bandpass", 900, 0.3, 0, 1); }
  alarm() { const o = this.out(); if (o) for (let i = 0; i < 3; i++) this.tone(o, 700, 700, 0.12, 0.2, "square", i * 0.2); }

  // ---------- ambience ----------
  stopAmbience() {
    this.ambNodes.forEach((n) => { try { (n as AudioBufferSourceNode).stop?.(); n.disconnect(); } catch { /* */ } });
    this.ambNodes = []; clearInterval(this.ambTimer);
  }
  ambience(kind: "wind" | "rain" | "machine" | "night" | "quiet", rain: boolean) {
    this.stopAmbience();
    if (!this.ctx) return;
    const c = this.ctx;
    const loop = (type: BiquadFilterType, f: number, gain: number, q = 0.5, lfo = 0) => {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      s.connect(fl); fl.connect(g); g.connect(this.sfxG); s.start();
      this.ambNodes.push(s, fl, g);
      if (lfo) {
        const o = c.createOscillator(); o.frequency.value = lfo; const og = c.createGain(); og.gain.value = gain * 0.6;
        o.connect(og); og.connect(g.gain); o.start(); this.ambNodes.push(o, og);
      }
    };
    if (kind === "wind" || kind === "night") loop("bandpass", 500, 0.1, 0.8, 0.12);
    if (rain || kind === "rain") loop("highpass", 3500, 0.07);
    if (kind === "machine") { loop("lowpass", 160, 0.18, 0.5, 0.3); const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = 55; const g = c.createGain(); g.gain.value = 0.03; o.connect(g); g.connect(this.sfxG); o.start(); this.ambNodes.push(o, g); }
    if (kind === "night") this.ambTimer = window.setInterval(() => { if (this.ctx && this.active < 20) for (let i = 0; i < 3; i++) this.tone(this.sfxG, 4200, 4300, 0.05, 0.03, "sine", i * 0.08); }, 900);
  }

  // ---------- music ----------
  music(mode: "off" | "menu" | "combat") {
    if (mode === this.musicMode) return;
    this.musicMode = mode; clearInterval(this.musicTimer);
    if (!this.ctx || mode === "off") return;
    this.nextNote = this.ctx.currentTime + 0.1; this.step16 = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 120);
  }
  private schedule() {
    const c = this.ctx; if (!c || this.musicMode === "off") return;
    const bpm = this.musicMode === "combat" ? 118 : 74;
    const dur = 60 / bpm / 4;
    const root = [55, 55, 65.4, 49][Math.floor(this.step16 / 16) % 4];
    while (this.nextNote < c.currentTime + 0.35) {
      const t = this.nextNote - c.currentTime; const s = this.step16 % 16;
      if (this.musicMode === "combat") {
        if (s % 4 === 0) this.tone(this.musicG, 120, 40, 0.18, 0.7, "sine", t);
        if (s % 2 === 0) this.tone(this.musicG, root * (s % 8 === 6 ? 1.5 : 1), root * (s % 8 === 6 ? 1.5 : 1), dur * 1.8, 0.28, "sawtooth", t);
        if (s % 4 === 2) this.burst(this.musicG, 0.05, "highpass", 7000, 0.18, t);
        if (s === 0 || s === 8) this.tone(this.musicG, root * 4, root * 4, dur * 6, 0.07, "triangle", t);
      } else {
        if (s === 0) { this.tone(this.musicG, root * 2, root * 2, dur * 14, 0.2, "triangle", t); this.tone(this.musicG, root * 3, root * 3, dur * 14, 0.1, "triangle", t); }
        if (s % 4 === 0) this.tone(this.musicG, root * 4 * [1, 1.2, 1.5, 1.8][(s / 4) % 4], root * 4 * [1, 1.2, 1.5, 1.8][(s / 4) % 4], dur * 3, 0.08, "sine", t);
        if (s === 0) this.tone(this.musicG, 90, 35, 0.25, 0.5, "sine", t);
      }
      this.nextNote += dur; this.step16++;
    }
  }
}
export const audio = new AudioSys();
