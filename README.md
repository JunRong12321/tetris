# Online Multiplayer Tetris

Browser-based, real-time 1v1 Tetris battle with an authoritative server.

> **Status:** early development. Phases 1–2 (repo foundation + pure game engine) are done.
> Server, web client and deployment are next. See `docs/AGENT_INSTRUCTIONS.md` §32.

## Repository layout

```text
apps/web              React client           (Phase 4)
apps/server           Node + WebSocket server (Phase 3)
packages/game-engine  Pure deterministic Tetris rules  ✅
docs/                 PRD, architecture, design system, agent rules, ruleset
```

## Develop

Requires Node 20+ (22 recommended).

```bash
npm install
npm run typecheck
npm run lint
npm run test
```

## Docs

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Gameplay ruleset](docs/RULESET.md)
- [Agent instructions](docs/AGENT_INSTRUCTIONS.md)

## Deployment (planned)

GitHub Pages / Vercel / Cloudflare Pages can host the static web client, but real-time matches need
a WebSocket-capable Node server (Render, Fly.io or Railway). Deployment guide arrives with Phase 7.
