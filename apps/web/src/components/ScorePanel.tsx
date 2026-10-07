import type { GameState } from "@tetris/game-engine";

interface ScorePanelProps {
  state: GameState;
  label?: string;
}

export function ScorePanel({ state, label = "STATS" }: ScorePanelProps) {
  return (
    <div className="panel score-panel">
      <h3 className="panel-title">{label}</h3>
      <dl className="stat-grid">
        <div className="stat-row">
          <dt>SCORE</dt>
          <dd>{state.score.toLocaleString()}</dd>
        </div>
        <div className="stat-row">
          <dt>LINES</dt>
          <dd>{state.lines}</dd>
        </div>
        <div className="stat-row">
          <dt>LEVEL</dt>
          <dd>{state.level}</dd>
        </div>
        <div className="stat-row">
          <dt>ATTACK</dt>
          <dd>{state.garbageSent}</dd>
        </div>
      </dl>
    </div>
  );
}
