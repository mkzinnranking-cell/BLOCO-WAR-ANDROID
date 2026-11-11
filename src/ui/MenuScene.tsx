import { useEffect, useRef } from "react";
import * as THREE from "three";
import { makeRig, mats, STYLE_FROM_COS, VB } from "../game/gfx/models";
import type { Cosmetics } from "../game/types";

interface Props { cos: Cosmetics; weapon: string; att: string[]; active: boolean; shift?: number }

export function MenuScene({ cos, weapon, att, active, shift = 0.24 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const st = useRef<{ rig: ReturnType<typeof makeRig> | null; rebuild: () => void; active: boolean; yaw: number; drag: number | null }>({ rig: null, rebuild: () => { /* */ }, active, yaw: 0.5, drag: null });
  st.current.active = active;

  useEffect(() => {
    const cv = ref.current!; let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false }); } catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#070b10"); scene.fog = new THREE.Fog("#070b10", 6, 18);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 40); cam.position.set(0, 1.35, 5.2); cam.lookAt(0, 1.05, 0);
    scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x20150a, 0.9));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(-2.5, 3.5, 3); scene.add(key);
    const rimT = new THREE.PointLight(0x19d6c9, 14, 9); rimT.position.set(2.2, 1.8, -1.6); scene.add(rimT);
    const rimA = new THREE.PointLight(0xffb400, 10, 9); rimA.position.set(-2.4, 1.2, -1.4); scene.add(rimA);
    // stage
    const vb = new VB(); const gv = new VB();
    vb.box(0, -0.15, 0, 3.2, 0.3, 3.2, "#1b232c"); vb.box(0, 0.01, 0, 2.6, 0.04, 2.6, "#2a3642");
    gv.box(0, 0.035, 1.35, 3.0, 0.03, 0.06, "#ffb400"); gv.box(0, 0.035, -1.35, 3.0, 0.03, 0.06, "#19d6c9"); gv.box(1.35, 0.035, 0, 0.06, 0.03, 2.6, "#ffb400"); gv.box(-1.35, 0.035, 0, 0.06, 0.03, 2.6, "#19d6c9");
    vb.box(0, -0.2, 0, 24, 0.2, 24, "#0b1016");
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + 0.3, r = 7 + Math.random() * 3, h = 2 + Math.random() * 7;
      vb.box(Math.cos(a) * r, h / 2, -Math.abs(Math.sin(a)) * r - 2, 1 + Math.random() * 1.6, h, 1 + Math.random() * 1.6, "#121a22", [0, a, 0], 0.15);
      if (Math.random() < 0.7) gv.box(Math.cos(a) * (r - 0.9), 1 + Math.random() * h * 0.8, -Math.abs(Math.sin(a)) * (r - 0.9) - 2, 0.3, 0.12, 0.05, Math.random() < 0.5 ? "#ffb400" : "#19d6c9", [0, a, 0], 0);
    }
    const m = mats(); scene.add(new THREE.Mesh(vb.geometry(), m.lit), new THREE.Mesh(gv.geometry(), m.glow));
    // particles
    const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: 0xffd27a }), 60); const dm = new THREE.Object3D();
    const seeds = Array.from({ length: 60 }, () => ({ x: (Math.random() - 0.5) * 8, y: Math.random() * 4, z: (Math.random() - 0.5) * 6, s: 0.1 + Math.random() * 0.3 })); scene.add(parts);

    const S = st.current;
    S.rebuild = () => {
      if (S.rig) scene.remove(S.rig.root);
      const rig = makeRig(STYLE_FROM_COS(cos), weapon, cos.camo, ); S.rig = rig; scene.add(rig.root);
      rig.weapon?.traverse(() => { /* */ });
      void att;
    };
    S.rebuild();
    const resize = () => {
      const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.setViewOffset(w, h, -w * shift, 0, w, h); cam.updateProjectionMatrix();
      const k = h / w; cam.position.z = 5.2 * Math.max(1, 0.62 / (k * 1.1)) ** 0.35;
    };
    resize(); const ro = new ResizeObserver(resize); ro.observe(cv);
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop); if (!S.active || document.hidden) return;
      const t = now / 1000; const r = S.rig!; if (!r) return;
      if (S.drag === null) S.yaw += 0.003;
      r.root.rotation.y = 0.55 + Math.sin(S.yaw) * 0.6;
      const br = Math.sin(t * 1.8) * 0.012;
      r.torso.position.y = 0.86 + br; r.head.rotation.y = Math.sin(t * 0.7) * 0.2; r.head.rotation.x = Math.sin(t * 0.5) * 0.05;
      r.armR.rotation.set(1.05 + br * 4, 0.35, 0); r.armL.rotation.set(1.25 + br * 4, -0.45, 0); if (r.weapon) r.weapon.rotation.x = -0.05;
      r.legL.rotation.x = 0.05; r.legR.rotation.x = -0.05;
      rimT.intensity = 12 + Math.sin(t * 2) * 3; rimA.intensity = 9 + Math.cos(t * 1.7) * 3;
      seeds.forEach((s, i) => { dm.position.set(s.x, (s.y + t * s.s) % 4, s.z + Math.sin(t * 0.3 + i) * 0.2); dm.updateMatrix(); parts.setMatrixAt(i, dm.matrix); }); parts.instanceMatrix.needsUpdate = true;
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); renderer.forceContextLoss(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { st.current.rebuild(); }, [JSON.stringify(cos), weapon, att.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ touchAction: "none" }}
      onPointerDown={(e) => { st.current.drag = e.clientX; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (st.current.drag !== null) { st.current.yaw += (e.clientX - st.current.drag) * 0.01; st.current.drag = e.clientX; } }}
      onPointerUp={() => { st.current.drag = null; }} onPointerCancel={() => { st.current.drag = null; }} />
  );
}
