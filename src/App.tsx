import { useEffect, useState } from "react";
import { audio } from "./game/audio";
import { Armory, Customize, Shop } from "./ui/Armory";
import { GameView } from "./ui/GameView";
import { MainMenu } from "./ui/MainMenu";
import { MenuScene } from "./ui/MenuScene";
import { Bots, Campaign, Multiplayer, Profile, Training } from "./ui/Play";
import { SettingsScreen } from "./ui/Settings";
import { useStore } from "./ui/store";
import { Welcome } from "./ui/Welcome";

export default function App() {
  const st = useStore(); const s = st.save; const screen = st.screen;
  const [portrait, setPortrait] = useState(window.innerHeight > window.innerWidth * 1.05);

  useEffect(() => {
    const fit = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const base = Math.max(12, Math.min(22, Math.min(h * 0.036, w * 0.019)));
      document.documentElement.style.fontSize = `${base * s.settings.uiScale}px`;
      document.documentElement.style.setProperty("--u", `${Math.max(2.4, Math.min(h / 100, w / 200))}px`);
      setPortrait(h > w * 1.05);
    };
    fit(); window.addEventListener("resize", fit); window.addEventListener("orientationchange", fit);
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("orientationchange", fit); };
  }, [s.settings.uiScale]);

  useEffect(() => {
    const first = () => { audio.init(); audio.setVols(s.settings); if (screen !== "game") audio.music("menu"); };
    window.addEventListener("pointerdown", first, { once: true }); window.addEventListener("keydown", first, { once: true });
    return () => { window.removeEventListener("pointerdown", first); window.removeEventListener("keydown", first); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (screen !== "game") { audio.music("menu"); audio.stopAmbience(); } }, [screen]);

  const inGame = screen === "game" && st.match;
  const sceneActive = ["menu", "custom", "armory", "welcome"].includes(screen);
  const att = Object.values(s.attach[s.loadout.primary] ?? {});

  return (
    <div className={`fixed inset-0 overflow-hidden bg-black ${s.settings.highContrast ? "hi-contrast" : ""}`}>
      {!inGame && <MenuScene cos={s.cosmetics} weapon={s.loadout.primary} att={att} active={sceneActive} shift={screen === "custom" || screen === "armory" ? 0.3 : 0.24} />}
      {inGame && <GameView key={st.matchKey} cfg={st.match!} />}
      {!inGame && screen === "welcome" && <Welcome />}
      {!inGame && screen === "menu" && <MainMenu />}
      {!inGame && screen === "campaign" && <Campaign />}
      {!inGame && screen === "bots" && <Bots />}
      {!inGame && screen === "multiplayer" && <Multiplayer />}
      {!inGame && screen === "training" && <Training />}
      {!inGame && screen === "armory" && <Armory />}
      {!inGame && screen === "custom" && <Customize />}
      {!inGame && screen === "shop" && <Shop />}
      {!inGame && screen === "settings" && <SettingsScreen />}
      {!inGame && screen === "profile" && <Profile />}
      {portrait && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-black/95 text-center">
          <div className="text-[4rem]" style={{ animation: "pulseRing 2s infinite", borderRadius: 16 }}>📱</div>
          <div className="title-font text-[1.4rem]">Gire o aparelho</div>
          <div className="max-w-[80%] text-[1rem] text-white/70">O jogo foi feito para o modo paisagem. Vire o celular na horizontal para continuar.</div>
        </div>
      )}
    </div>
  );
}
