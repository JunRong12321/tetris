import { Button } from "./Button";

interface LandingScreenProps {
  onSoloPlay: () => void;
  onOnlineBattle: () => void;
}

const CONTROLS = [
  { keys: "\u2190 \u2192 / A D", action: "MOVE" },
  { keys: "\u2193 / S", action: "SOFT DROP" },
  { keys: "SPACE", action: "HARD DROP" },
  { keys: "\u2191 / X", action: "ROTATE CW" },
  { keys: "Z", action: "ROTATE CCW" },
  { keys: "C", action: "HOLD" },
  { keys: "P", action: "PAUSE" },
];

export function LandingScreen({ onSoloPlay, onOnlineBattle }: LandingScreenProps) {
  return (
    <div className="screen landing-screen">
      <div className="landing-content">
        <h1 className="game-title">
          <span className="title-line">TETRIS</span>
          <span className="title-subtitle">ONLINE BATTLE</span>
        </h1>

        <div className="landing-actions">
          <Button variant="primary" size="lg" onClick={onSoloPlay}>
            SOLO PLAY
          </Button>
          <Button variant="secondary" size="lg" onClick={onOnlineBattle}>
            ONLINE BATTLE
          </Button>
        </div>

        <p className="landing-hint">Solo Play is always available. Online Battle requires a separate server.</p>

        <div className="controls-guide">
          <h2 className="controls-title">CONTROLS</h2>
          <div className="controls-grid">
            {CONTROLS.map((c) => (
              <div key={c.action} className="control-row">
                <kbd className="key-cap">{c.keys}</kbd>
                <span className="control-action">{c.action}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="version-tag">v0.1.0</div>
      </div>
    </div>
  );
}
