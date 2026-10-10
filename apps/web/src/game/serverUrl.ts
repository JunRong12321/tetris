/**
 * Resolves the battle-server WebSocket address for the current build.
 *
 * Kept free of React and `import.meta` so it can be unit-tested in Node.
 *
 * Rules:
 * - An empty/unset value is an error in production builds. Falling back to
 *   localhost would point every visitor's browser at their own machine.
 * - Development builds default to a local server.
 * - http(s) values are accepted and mapped to ws(s).
 * - On an https page, plain ws is upgraded to wss, because browsers block
 *   insecure WebSockets from secure pages (mixed content).
 */
export type ServerTarget =
  | { readonly ok: true; readonly url: string; readonly upgradedToSecure: boolean }
  | { readonly ok: false; readonly reason: "missing" | "invalid" };

export function resolveServerUrl(
  raw: string | undefined,
  pageProtocol: string,
  isDev: boolean,
): ServerTarget {
  const value = (raw ?? "").trim();
  if (value === "") {
    return isDev
      ? { ok: true, url: "ws://localhost:8080", upgradedToSecure: false }
      : { ok: false, reason: "missing" };
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (parsed.protocol === "http:") parsed.protocol = "ws:";
  else if (parsed.protocol === "https:") parsed.protocol = "wss:";

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    return { ok: false, reason: "invalid" };
  }

  const upgradedToSecure = pageProtocol === "https:" && parsed.protocol === "ws:";
  if (upgradedToSecure) parsed.protocol = "wss:";

  return { ok: true, url: parsed.toString(), upgradedToSecure };
}

export function serverConfigMessage(reason: "missing" | "invalid"): string {
  return reason === "missing"
    ? "Online Battle is not configured for this build. Set the VITE_SERVER_URL repository variable to your server's wss:// address and rerun the Pages workflow."
    : "VITE_SERVER_URL is not a valid WebSocket address. Use the form wss://your-server-host.";
}
