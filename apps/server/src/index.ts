import { startServer } from "./server.ts";

const port = Number(process.env.PORT ?? 8080);

const log = (event: string, data: Record<string, unknown>): void => {
  console.log(JSON.stringify({ time: new Date().toISOString(), component: "server", event, ...data }));
};

startServer({ port, log }).then(
  () => console.log(`Tetris server listening on port ${port}`),
  (reason: unknown) => {
    console.error("Failed to start server", reason);
    process.exit(1);
  },
);
