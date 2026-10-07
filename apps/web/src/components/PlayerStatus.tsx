type Status = "connected" | "ready" | "waiting" | "disconnected" | "reconnecting";

interface PlayerStatusProps {
  name: string;
  status: Status;
}

const ICONS: Record<Status, string> = {
  connected: "\u25CF",
  ready: "\u2713",
  waiting: "\u23F3",
  disconnected: "\u2715",
  reconnecting: "\u21BB",
};

const LABELS: Record<Status, string> = {
  connected: "CONNECTED",
  ready: "READY",
  waiting: "WAITING",
  disconnected: "DISCONNECTED",
  reconnecting: "RECONNECTING",
};

export function PlayerStatus({ name, status }: PlayerStatusProps) {
  return (
    <div className={`player-status status-${status}`}>
      <span className="status-icon" aria-hidden="true">
        {ICONS[status]}
      </span>
      <span className="status-name">{name}</span>
      <span className="status-label">{LABELS[status]}</span>
    </div>
  );
}
