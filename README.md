# Online Multiplayer Tetris

Browser-based, real-time 1v1 Tetris battle with an authoritative server.

> **Status:** online MVP foundation. The web client, authoritative WebSocket server, room lobby, reconnect grace period, garbage attacks, and deployment workflows are implemented.

## Repository layout

```text
apps/web              React client           (Phase 4)
apps/server           Node + WebSocket server (Phase 3)
packages/game-engine  Pure deterministic Tetris rules  ✅
docs/                 PRD, architecture, design system, agent rules, ruleset
```

## Develop

Requires Node 20+ (22 recommended). The browser client can be played in solo mode immediately. Online Battle requires the WebSocket server running as well.

```bash
npm install
npm run typecheck
npm run lint
npm run test
npm run build
```

## Docs

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Gameplay ruleset](docs/RULESET.md)
- [Agent instructions](docs/AGENT_INSTRUCTIONS.md)

## Deployment

The project deploys as two services:

The server can be checked locally with the `/health` endpoint while it is running.

1. **Web client:** GitHub Pages through `.github/workflows/deploy.yml`.
2. **Battle server:** a WebSocket-capable Node host such as Render, using `render.yaml`.

GitHub Pages cannot maintain WebSocket connections, so it only hosts the interface. After deploying the server, add its WebSocket address as the repository variable `VITE_SERVER_URL`, then rerun the Pages workflow. The health endpoint is `/health`.

For GitHub Pages, set the repository Pages source to **GitHub Actions**. The workflow builds from the repository root and publishes `apps/web/dist`.
