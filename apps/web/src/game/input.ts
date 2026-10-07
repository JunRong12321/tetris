import type { PlayerAction } from "@tetris/game-engine";

export const KEY_BINDINGS: Record<string, PlayerAction> = {
  ArrowLeft: "MOVE_LEFT",
  KeyA: "MOVE_LEFT",
  ArrowRight: "MOVE_RIGHT",
  KeyD: "MOVE_RIGHT",
  ArrowDown: "SOFT_DROP",
  KeyS: "SOFT_DROP",
  ArrowUp: "ROTATE_CW",
  KeyX: "ROTATE_CW",
  KeyZ: "ROTATE_CCW",
  Space: "HARD_DROP",
  KeyC: "HOLD",
};

export class InputHandler {
  private keyDown = new Set<string>();
  private onAction?: (action: PlayerAction) => void;
  private onPause?: () => void;
  private dasDelay = 133;
  private arr = 33;
  private dasTimers = new Map<PlayerAction, ReturnType<typeof setTimeout>>();
  private arrTimers = new Map<PlayerAction, ReturnType<typeof setInterval>>();
  private repeatable = new Set<PlayerAction>(["MOVE_LEFT", "MOVE_RIGHT", "SOFT_DROP"]);

  attach(onAction: (action: PlayerAction) => void, onPause: () => void): void {
    this.onAction = onAction;
    this.onPause = onPause;
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  detach(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
    this.clearAllTimers();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.code === "KeyP") {
      if (!e.repeat) this.onPause?.();
      e.preventDefault();
      return;
    }

    const action = KEY_BINDINGS[e.code];
    if (!action || this.keyDown.has(e.code)) return;
    e.preventDefault();
    this.keyDown.add(e.code);
    this.onAction?.(action);

    if (this.repeatable.has(action)) {
      this.startDAS(action);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_BINDINGS[e.code];
    this.keyDown.delete(e.code);
    if (action) this.clearTimers(action);
  };

  private startDAS(action: PlayerAction): void {
    const dasTimer = setTimeout(() => {
      this.arrTimers.set(
        action,
        setInterval(() => this.onAction?.(action), this.arr),
      );
    }, this.dasDelay);
    this.dasTimers.set(action, dasTimer);
  }

  private clearTimers(action: PlayerAction): void {
    const das = this.dasTimers.get(action);
    if (das) clearTimeout(das);
    const arr = this.arrTimers.get(action);
    if (arr) clearInterval(arr);
    this.dasTimers.delete(action);
    this.arrTimers.delete(action);
  }

  private clearAllTimers(): void {
    for (const t of this.dasTimers.values()) clearTimeout(t);
    for (const t of this.arrTimers.values()) clearInterval(t);
    this.dasTimers.clear();
    this.arrTimers.clear();
    this.keyDown.clear();
  }

}
