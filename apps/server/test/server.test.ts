import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../src/server.ts";
import { TestClient, sleep } from "./helpers.ts";

const FAST = {
  countdownMs: 150,
  disconnectGraceMs: 400,
  lobbyGraceMs: 600,
  presenceMs: 100,
  heartbeatMs: 60_000,
} as const;

let server: RunningServer;
const clients: TestClient[] = [];

async function connect(sessionId?: string): Promise<TestClient> {
  const client = await TestClient.connect(server.port, sessionId);
  clients.push(client);
  return client;
}

/** Two players find each other through Quick Match. */
async function quickPair(): Promise<[TestClient, TestClient]> {
  const a = await connect();
  const b = await connect();
  a.send({ type: "QUICK_MATCH", sessionId: a.sessionId });
  await a.waitForType("QUEUE_STATE", (m) => m.searching === true);
  b.send({ type: "QUICK_MATCH", sessionId: b.sessionId });
  return [a, b];
}

/** Two players in a room created and joined by code, both ready, match underway. */
async function startedRoomMatch(): Promise<[TestClient, TestClient, string]> {
  const a = await connect();
  const b = await connect();
  a.send({ type: "CREATE_ROOM", sessionId: a.sessionId });
  const room = await a.waitForType("ROOM_STATE");
  const code = room.roomCode as string;
  b.send({ type: "JOIN_ROOM", roomCode: code, sessionId: b.sessionId });
  await b.waitForType("ROOM_STATE");
  a.send({ type: "READY", ready: true });
  b.send({ type: "READY", ready: true });
  await a.waitForType("MATCH_STATE");
  await b.waitForType("MATCH_STATE");
  return [a, b, code];
}

/** Hard-drops until the client's own board tops out and the match is finished. */
async function topOut(client: TestClient): Promise<void> {
  for (let i = 1; i <= 60 && !client.messages.some((m) => m.type === "MATCH_STATE" && m.status === "finished"); i++) {
    client.send({ type: "INPUT", action: "HARD_DROP", sequence: i });
    await sleep(20);
  }
  await client.waitFor((m) => m.type === "MATCH_STATE" && m.status === "finished", 5000, "finished match");
}

beforeAll(async () => {
  server = await startServer({ port: 0, ...FAST });
});

afterAll(async () => {
  for (const client of clients) client.terminate();
  await server.close();
});

describe("health", () => {
  it("reports server status and player counts", async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.playersOnline).toBe("number");
    expect(typeof body.playersSearching).toBe("number");
  });
});

describe("quick match", () => {
  it("pairs two waiting players into a room that starts without a manual ready step", async () => {
    const [a, b] = await quickPair();

    const roomA = await a.waitForType("ROOM_STATE");
    const roomB = await b.waitForType("ROOM_STATE");
    expect(roomA.roomCode).toBe(roomB.roomCode);
    expect(roomA.quickMatch).toBe(true);
    expect(roomA.playerId).toBe(1);
    expect(roomB.playerId).toBe(2);

    await a.waitForType("ROOM_STATE", (m) => m.status === "COUNTDOWN");
    const matchA = await a.waitForType("MATCH_STATE");
    const matchB = await b.waitForType("MATCH_STATE");
    expect(matchA.status).toBe("playing");
    expect(matchB.status).toBe("playing");
  });

  it("keeps a lone player searching and lets them cancel", async () => {
    const a = await connect();
    a.send({ type: "QUICK_MATCH", sessionId: a.sessionId });
    const searching = await a.waitForType("QUEUE_STATE", (m) => m.searching === true);
    expect(searching.playersSearching as number).toBeGreaterThanOrEqual(1);

    a.send({ type: "CANCEL_QUICK_MATCH" });
    const cancelled = await a.waitForType("QUEUE_STATE", (m) => m.searching === false && a.messages.indexOf(m) > a.messages.indexOf(searching));
    expect(cancelled.searching).toBe(false);

    // Someone searching afterwards must not be paired with the player who cancelled.
    const b = await connect();
    b.send({ type: "QUICK_MATCH", sessionId: b.sessionId });
    await b.waitForType("QUEUE_STATE", (m) => m.searching === true);
    await sleep(250);
    expect(b.last("ROOM_STATE")).toBeUndefined();
    expect(a.last("ROOM_STATE")).toBeUndefined();
    b.send({ type: "CANCEL_QUICK_MATCH" });
  });

  it("never pairs a waiting player with a player who disconnected", async () => {
    const a = await connect();
    a.send({ type: "QUICK_MATCH", sessionId: a.sessionId });
    await a.waitForType("QUEUE_STATE", (m) => m.searching === true);
    a.terminate();
    await sleep(100);

    const b = await connect();
    b.send({ type: "QUICK_MATCH", sessionId: b.sessionId });
    await b.waitForType("QUEUE_STATE", (m) => m.searching === true);
    await sleep(250);
    expect(b.last("ROOM_STATE")).toBeUndefined();
    b.send({ type: "CANCEL_QUICK_MATCH" });
  });

  it("does not pair a session with itself (the same browser opened twice)", async () => {
    const first = await connect();
    const second = await connect(first.sessionId);
    first.send({ type: "QUICK_MATCH", sessionId: first.sessionId });
    await first.waitForType("QUEUE_STATE", (m) => m.searching === true);
    second.send({ type: "QUICK_MATCH", sessionId: second.sessionId });
    await sleep(300);
    expect(first.last("ROOM_STATE")).toBeUndefined();
    expect(second.last("ROOM_STATE")).toBeUndefined();
    second.send({ type: "CANCEL_QUICK_MATCH" });
  });

  it("pairs players two at a time and leaves the third waiting", async () => {
    const a = await connect();
    const b = await connect();
    const c = await connect();
    a.send({ type: "QUICK_MATCH", sessionId: a.sessionId });
    await a.waitForType("QUEUE_STATE", (m) => m.searching === true);
    b.send({ type: "QUICK_MATCH", sessionId: b.sessionId });
    await b.waitForType("ROOM_STATE");
    c.send({ type: "QUICK_MATCH", sessionId: c.sessionId });
    await c.waitForType("QUEUE_STATE", (m) => m.searching === true);
    await sleep(250);
    expect(c.last("ROOM_STATE")).toBeUndefined();
    c.send({ type: "CANCEL_QUICK_MATCH" });
  });

  it("returns both players to a fresh ready lobby for a rematch", async () => {
    const [a, b] = await quickPair();
    await a.waitForType("MATCH_STATE");
    await b.waitForType("MATCH_STATE");
    await topOut(a);
    await b.waitFor((m) => m.type === "MATCH_STATE" && m.status === "finished", 5000, "finished for b");
    a.clear();
    b.clear();
    a.send({ type: "REMATCH" });
    const lobbyA = await a.waitForType("ROOM_STATE", (m) => m.status === "WAITING");
    await b.waitForType("ROOM_STATE", (m) => m.status === "WAITING");
    const players = lobbyA.players as { ready: boolean }[];
    expect(players).toHaveLength(2);
    expect(players.every((p) => p.ready === false)).toBe(true);
  });
});

describe("room codes", () => {
  it("still lets friends play with a code", async () => {
    const [a, b] = await startedRoomMatch();
    const matchA = a.last("MATCH_STATE") as { player: { score: number }; opponent: { score: number } };
    expect(matchA.player.score).toBe(0);
    expect(b.last("MATCH_STATE")).toBeDefined();
  });

  it("rejects a third player and an unknown code", async () => {
    const [, , code] = await startedRoomMatch();
    const c = await connect();
    c.send({ type: "JOIN_ROOM", roomCode: code, sessionId: c.sessionId });
    const full = await c.waitForType("ERROR");
    expect(full.code).toBe("ROOM_FULL");

    c.send({ type: "JOIN_ROOM", roomCode: "ZZZZZZ", sessionId: c.sessionId });
    const missing = await c.waitForType("ERROR", (m) => m.code === "ROOM_NOT_FOUND");
    expect(missing.code).toBe("ROOM_NOT_FOUND");
  });
});

describe("match lifecycle", () => {
  it("treats a second REMATCH click as harmless instead of an error", async () => {
    const [a, b] = await startedRoomMatch();
    await topOut(a);
    await b.waitFor((m) => m.type === "MATCH_STATE" && m.status === "finished", 5000, "finished for b");
    a.clear();
    b.clear();
    a.send({ type: "REMATCH" });
    await sleep(100);
    b.send({ type: "REMATCH" });
    await sleep(250);
    expect(a.last("ERROR")).toBeUndefined();
    expect(b.last("ERROR")).toBeUndefined();
    expect((b.last("ROOM_STATE") as { status: string }).status).toBe("WAITING");
  });

  it("announces the finished match to both players when it ends on a key press", async () => {
    const [a, b] = await startedRoomMatch();
    await topOut(a);
    const finishedRoom = await b.waitForType("ROOM_STATE", (m) => m.status === "FINISHED");
    expect(finishedRoom.status).toBe("FINISHED");
    const result = (await b.waitFor((m) => m.type === "MATCH_STATE" && m.status === "finished", 5000, "result")) as { winner: number };
    expect(result.winner).toBe(2);
  });

  it("cancels the countdown straight away when a player disappears", async () => {
    // A long countdown proves the cancel is immediate rather than a side effect of the countdown ending.
    const slow = await startServer({ port: 0, ...FAST, countdownMs: 2500 });
    try {
      const a = await TestClient.connect(slow.port);
      const b = await TestClient.connect(slow.port);
      a.send({ type: "CREATE_ROOM", sessionId: a.sessionId });
      const room = await a.waitForType("ROOM_STATE");
      b.send({ type: "JOIN_ROOM", roomCode: room.roomCode, sessionId: b.sessionId });
      await b.waitForType("ROOM_STATE");
      a.send({ type: "READY", ready: true });
      b.send({ type: "READY", ready: true });
      await a.waitForType("ROOM_STATE", (m) => m.status === "COUNTDOWN");
      a.clear(); // only updates from this point count, not the earlier WAITING ones
      b.terminate();
      const cancelled = await a.waitForType("ROOM_STATE", (m) => m.status === "WAITING", 300);
      expect(cancelled.countdownEndsAt).toBeNull();
      await sleep(300);
      expect(a.last("MATCH_STATE")).toBeUndefined();
      a.terminate();
    } finally {
      await slow.close();
    }
  });

  it("promotes the remaining player when someone leaves a lobby", async () => {
    const a = await connect();
    const b = await connect();
    a.send({ type: "CREATE_ROOM", sessionId: a.sessionId });
    const room = await a.waitForType("ROOM_STATE");
    b.send({ type: "JOIN_ROOM", roomCode: room.roomCode, sessionId: b.sessionId });
    await b.waitForType("ROOM_STATE");
    a.clear();
    b.clear();
    a.send({ type: "LEAVE" });
    const after = (await b.waitForType("ROOM_STATE", (m) => (m.players as unknown[]).length === 1)) as { playerId: number; players: { playerId: number }[] };
    expect(after.playerId).toBe(1);
    expect(after.players[0]?.playerId).toBe(1);
  });

  it("forfeits immediately when a player leaves mid-match", async () => {
    const [a, b] = await startedRoomMatch();
    a.send({ type: "LEAVE" });
    const result = (await b.waitFor((m) => m.type === "MATCH_STATE" && m.status === "finished", 2000, "forfeit result")) as { winner: number };
    expect(result.winner).toBe(2);
  });

  it("forfeits a disconnected player after the grace period", async () => {
    const [a, b] = await startedRoomMatch();
    a.terminate();
    const opponentGone = await b.waitForType("ROOM_STATE", (m) => (m.players as { playerId: number; connected: boolean }[]).some((p) => p.playerId === 1 && !p.connected));
    expect(opponentGone.status).toBe("PLAYING");
    const result = (await b.waitFor((m) => m.type === "MATCH_STATE" && m.status === "finished", 3000, "forfeit")) as { winner: number };
    expect(result.winner).toBe(2);
  });

  it("lets a player reconnect within the grace period and keep playing", async () => {
    const [a, b] = await startedRoomMatch();
    const roomCode = (b.last("ROOM_STATE") as { roomCode: string }).roomCode;
    const sessionId = b.sessionId;
    b.terminate();
    await sleep(100);
    const back = await connect(sessionId);
    back.send({ type: "RECONNECT", roomCode, sessionId });
    const restored = await back.waitForType("ROOM_STATE");
    expect(restored.status).toBe("PLAYING");
    expect(restored.playerId).toBe(2);
    await back.waitForType("MATCH_STATE");
    await sleep(700);
    expect(a.messages.some((m) => m.type === "MATCH_STATE" && m.status === "finished")).toBe(false);
  });

  it("refuses to hand a seat to an unknown session that claims to reconnect", async () => {
    const a = await connect();
    a.send({ type: "CREATE_ROOM", sessionId: a.sessionId });
    const room = await a.waitForType("ROOM_STATE");
    const intruder = await connect();
    intruder.send({ type: "RECONNECT", roomCode: room.roomCode, sessionId: intruder.sessionId });
    const rejected = await intruder.waitForType("ERROR");
    expect(rejected.code).toBe("ROOM_NOT_FOUND");
    expect(a.last("ROOM_STATE")).toBeDefined();
    expect(((a.last("ROOM_STATE") as { players: unknown[] }).players)).toHaveLength(1);
  });

  it("closes the older connection when the same session connects again", async () => {
    const first = await connect();
    first.send({ type: "CREATE_ROOM", sessionId: first.sessionId });
    const room = await first.waitForType("ROOM_STATE");
    const second = await connect(first.sessionId);
    second.send({ type: "RECONNECT", roomCode: room.roomCode, sessionId: first.sessionId });
    await second.waitForType("ROOM_STATE");
    await sleep(100);
    expect(first.closeCode).toBe(4000);
  });
});

describe("input safety", () => {
  it("rejects malformed messages and actions outside a room", async () => {
    const a = await connect();
    a.sendRaw("not json");
    expect((await a.waitForType("ERROR")).code).toBe("INVALID_MESSAGE");
    a.send({ type: "DROP_TABLES" });
    await sleep(50);
    a.send({ type: "INPUT", action: "HARD_DROP", sequence: 1 });
    const notInRoom = await a.waitForType("ERROR", (m) => m.code === "NOT_IN_ROOM");
    expect(notInRoom.code).toBe("NOT_IN_ROOM");
  });

  it("rejects an input sequence that is out of range", async () => {
    const [a] = await startedRoomMatch();
    a.clear();
    a.send({ type: "INPUT", action: "HARD_DROP", sequence: Date.now() });
    const invalid = await a.waitForType("ERROR");
    expect(invalid.code).toBe("INVALID_MESSAGE");
  });

  it("disconnects a client that sends an oversized message", async () => {
    const a = await connect();
    a.sendRaw("x".repeat(10_000));
    await sleep(200);
    expect(a.closeCode).toBe(1009);
  });
});

describe("rate limiting", () => {
  it("drops message floods instead of processing every one", async () => {
    const limited = await startServer({ port: 0, ...FAST, rateBurst: 5, ratePerSecond: 1 });
    try {
      const client = await TestClient.connect(limited.port);
      for (let i = 0; i < 50; i++) client.sendRaw("garbage");
      await sleep(400);
      const errors = client.messages.filter((m) => m.type === "ERROR").length;
      expect(errors).toBeGreaterThanOrEqual(1);
      expect(errors).toBeLessThan(15);
      client.terminate();
    } finally {
      await limited.close();
    }
  });
});

describe("presence", () => {
  it("tells idle players how many people are online", async () => {
    const a = await connect();
    await connect();
    const presence = await a.waitForType("QUEUE_STATE", (m) => (m.playersOnline as number) >= 2);
    expect(presence.searching).toBe(false);
  });
});

describe("presence updates", () => {
  it("refreshes the online count as soon as someone connects, without waiting for the periodic update", async () => {
    // A very long periodic interval proves the update is event-driven.
    const quiet = await startServer({ port: 0, ...FAST, presenceMs: 60_000 });
    try {
      const first = await TestClient.connect(quiet.port);
      await first.waitForType("QUEUE_STATE", (m) => m.playersOnline === 1);
      const second = await TestClient.connect(quiet.port);
      const update = await first.waitForType("QUEUE_STATE", (m) => m.playersOnline === 2, 1500);
      expect(update.playersOnline).toBe(2);
      second.terminate();
      const after = await first.waitForType("QUEUE_STATE", (m) => m.playersOnline === 1 && first.messages.indexOf(m) > first.messages.indexOf(update), 1500);
      expect(after.playersOnline).toBe(1);
      first.terminate();
    } finally {
      await quiet.close();
    }
  });
});

