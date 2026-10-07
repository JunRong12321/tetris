import { useState, useCallback } from "react";
import { LandingScreen } from "./components/LandingScreen";
import { SoloGame } from "./components/SoloGame";
import { OnlineBattle } from "./components/OnlineBattle";

type Screen = "landing" | "solo" | "versus";

export function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [seed, setSeed] = useState<number>(0);
  const [startLevel] = useState<number>(1);

  const startSolo = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1e9));
    setScreen("solo");
  }, []);

  const startOnlineBattle = useCallback(() => {
    setSeed(Math.floor(Math.random() * 1e9));
    setScreen("versus");
  }, []);

  const exitToMenu = useCallback(() => setScreen("landing"), []);

  return (
    <div className="app">
      {screen === "landing" && (
        <LandingScreen onSoloPlay={startSolo} onOnlineBattle={startOnlineBattle} />
      )}
      {screen === "solo" && (
        <SoloGame key={seed} onExit={exitToMenu} seed={seed} startLevel={startLevel} />
      )}
      {screen === "versus" && <OnlineBattle onExit={exitToMenu} />}
    </div>
  );
}
