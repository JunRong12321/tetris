import { z } from "zod";
import { PLAYER_ACTIONS } from "@tetris/game-engine";

export const PROTOCOL_VERSION = 1;
const envelope = z.object({ protocolVersion: z.literal(PROTOCOL_VERSION) });

export const clientMessageSchema = z.discriminatedUnion("type", [
  envelope.extend({ type: z.literal("CREATE_ROOM"), sessionId: z.string().min(16).max(128) }),
  envelope.extend({ type: z.literal("JOIN_ROOM"), roomCode: z.string().regex(/^[A-Z0-9]{6}$/), sessionId: z.string().min(16).max(128) }),
  envelope.extend({ type: z.literal("READY"), ready: z.boolean() }),
  envelope.extend({ type: z.literal("INPUT"), action: z.enum(PLAYER_ACTIONS), sequence: z.number().int().nonnegative().max(10_000_000) }),
  envelope.extend({ type: z.literal("REMATCH") }),
  envelope.extend({ type: z.literal("LEAVE") }),
  envelope.extend({ type: z.literal("RECONNECT"), roomCode: z.string().regex(/^[A-Z0-9]{6}$/), sessionId: z.string().min(16).max(128) }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;
export type RoomStatus = "WAITING" | "READY_CHECK" | "COUNTDOWN" | "PLAYING" | "FINISHED";
export interface PlayerPresence { readonly playerId: 1 | 2; readonly connected: boolean; readonly ready: boolean; }
export interface SerializedPlayer {
  readonly board: readonly (readonly (string | null)[])[];
  readonly active: { type: string; x: number; y: number; rotation: number } | null;
  readonly hold: string | null;
  readonly queue: readonly string[];
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly pendingGarbage: number;
  readonly garbageSent: number;
  readonly gameOverReason: string | null;
}
export type ServerMessage =
  | { type: "ROOM_STATE"; protocolVersion: 1; roomCode: string; playerId: 1 | 2; players: readonly PlayerPresence[]; status: RoomStatus; countdownEndsAt: number | null }
  | { type: "MATCH_STATE"; protocolVersion: 1; status: "playing" | "finished"; serverTime: number; player: SerializedPlayer; opponent: SerializedPlayer; winner: 1 | 2 | null }
  | { type: "ERROR"; protocolVersion: 1; code: string; message: string };
export function parseClientMessage(value: unknown): ClientMessage | null {
  const result = clientMessageSchema.safeParse(value);
  return result.success ? result.data : null;
}
