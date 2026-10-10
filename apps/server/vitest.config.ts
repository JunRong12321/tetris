import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // These tests start a real server and connect real WebSocket clients.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
