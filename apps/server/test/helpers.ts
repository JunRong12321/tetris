import WebSocket from "ws";

export const VERSION = 1;

/** Minimal WebSocket test client that records every server message. */
export class TestClient {
  readonly messages: Record<string, unknown>[] = [];
  readonly sessionId = `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}-test-session`;
  private socket!: WebSocket;
  closeCode: number | null = null;

  static async connect(port: number, sessionId?: string): Promise<TestClient> {
    const client = new TestClient();
    if (sessionId) (client as { sessionId: string }).sessionId = sessionId;
    client.socket = new WebSocket(`ws://127.0.0.1:${port}`);
    client.socket.on("message", (raw) => client.messages.push(JSON.parse(raw.toString()) as Record<string, unknown>));
    client.socket.on("close", (code) => { client.closeCode = code; });
    await new Promise<void>((resolve, reject) => {
      client.socket.once("open", () => resolve());
      client.socket.once("error", reject);
    });
    return client;
  }

  send(message: Record<string, unknown>): void {
    this.socket.send(JSON.stringify({ protocolVersion: VERSION, ...message }));
  }

  sendRaw(text: string): void {
    this.socket.send(text);
  }

  close(): void {
    this.socket.close();
  }

  terminate(): void {
    this.socket.terminate();
  }

  last(type: string): Record<string, unknown> | undefined {
    return [...this.messages].reverse().find((m) => m.type === type);
  }

  /** Resolves with the first message (existing or future) matching `predicate`. */
  async waitFor(predicate: (m: Record<string, unknown>) => boolean, timeoutMs = 5000, label = "message"): Promise<Record<string, unknown>> {
    const start = Date.now();
    let cursor = 0;
    while (Date.now() - start < timeoutMs) {
      for (; cursor < this.messages.length; cursor++) {
        const m = this.messages[cursor]!;
        if (predicate(m)) return m;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timed out waiting for ${label}. Last messages: ${JSON.stringify(this.messages.slice(-3))}`);
  }

  waitForType(type: string, extra?: (m: Record<string, unknown>) => boolean, timeoutMs = 5000): Promise<Record<string, unknown>> {
    return this.waitFor((m) => m.type === type && (extra ? extra(m) : true), timeoutMs, type);
  }

  /** Index marker so a later waitFor only considers messages from now on. */
  clear(): void {
    this.messages.length = 0;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
