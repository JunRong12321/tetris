# Online Multiplayer Tetris

Browser-based, real-time 1v1 Tetris battle with an authoritative server.

> **Status:** Online MVP with ghost piece, row-clear effects, and graceful offline mode.

## Repository layout

```text
apps/web              React client (Solo Play + Online Battle)
apps/server           Node + WebSocket server for online matches
packages/game-engine  Pure deterministic Tetris rules
packages/protocol     Shared WebSocket message types and validation
docs/                 PRD, architecture, design system, agent rules, ruleset
```

## Develop

Requires Node 20+ (22 recommended). Solo Play works immediately. Online Battle requires the WebSocket server running as well.

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

### 1. Web client (GitHub Pages)

1. Push the repository to GitHub.
2. Go to **Settings > Pages** and set the source to **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs automatically on push to `main`.
4. Your game will be live at `https://<username>.github.io/<repository-name>/`.

Solo Play works immediately on GitHub Pages. Online Battle buttons will show "SERVER OFFLINE" until the battle server is deployed and configured.

### 2. Battle server (Render or similar)

1. Deploy `apps/server` to a WebSocket-capable Node host using `render.yaml`.
2. The server exposes a `/health` endpoint for monitoring.
3. In your GitHub repository, go to **Settings > Secrets and variables > Actions > Variables** and add `VITE_SERVER_URL` with the server's WebSocket address (e.g. `wss://your-server.onrender.com`).
4. Rerun the Pages workflow to rebuild the client with the server URL.

GitHub Pages cannot host WebSocket connections, so the server must run separately.
