import { describe, expect, it } from "vitest";
import { resolveServerUrl, serverConfigMessage } from "../src/game/serverUrl";
import { MAX_RECONNECT_ATTEMPTS, nextReconnectDelay } from "../src/game/reconnect";

describe("resolveServerUrl", () => {
  it("never falls back to localhost in a production build", () => {
    expect(resolveServerUrl(undefined, "https:", false)).toEqual({ ok: false, reason: "missing" });
    expect(resolveServerUrl("", "https:", false)).toEqual({ ok: false, reason: "missing" });
    expect(resolveServerUrl("   ", "https:", false)).toEqual({ ok: false, reason: "missing" });
  });

  it("defaults to a local server in development", () => {
    expect(resolveServerUrl(undefined, "http:", true)).toEqual({
      ok: true,
      url: "ws://localhost:8080",
      upgradedToSecure: false,
    });
  });

  it("passes a wss address through unchanged", () => {
    expect(resolveServerUrl("wss://online-tetris-server.onrender.com", "https:", false)).toEqual({
      ok: true,
      url: "wss://online-tetris-server.onrender.com/",
      upgradedToSecure: false,
    });
  });

  it("upgrades ws to wss when the page is served over https (mixed-content fix)", () => {
    expect(resolveServerUrl("ws://example.onrender.com", "https:", false)).toEqual({
      ok: true,
      url: "wss://example.onrender.com/",
      upgradedToSecure: true,
    });
  });

  it("maps http(s) values to ws(s)", () => {
    const result = resolveServerUrl("https://example.onrender.com", "https:", false);
    expect(result).toMatchObject({ ok: true, url: "wss://example.onrender.com/" });
  });

  it("rejects malformed addresses and unsupported schemes", () => {
    expect(resolveServerUrl("not a url", "https:", false)).toEqual({ ok: false, reason: "invalid" });
    expect(resolveServerUrl("ftp://example.com", "https:", false)).toEqual({ ok: false, reason: "invalid" });
  });

  it("gives an actionable message for each failure", () => {
    expect(serverConfigMessage("missing")).toMatch(/VITE_SERVER_URL/);
    expect(serverConfigMessage("invalid")).toMatch(/wss:\/\//);
  });
});

describe("nextReconnectDelay", () => {
  it("backs off exponentially and caps the delay", () => {
    expect(nextReconnectDelay(1)).toBe(1000);
    expect(nextReconnectDelay(2)).toBe(2000);
    expect(nextReconnectDelay(3)).toBe(4000);
    expect(nextReconnectDelay(4)).toBe(8000);
    expect(nextReconnectDelay(50)).toBe(8000);
  });

  it("waits long enough to outlast a free-tier cold start (about a minute)", () => {
    let total = 0;
    for (let attempt = 1; attempt <= MAX_RECONNECT_ATTEMPTS; attempt++) {
      total += nextReconnectDelay(attempt);
    }
    expect(total).toBeGreaterThanOrEqual(60_000);
  });
});
