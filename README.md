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

## Playing online

1. Open the site and choose **ONLINE BATTLE**.
2. **QUICK MATCH** pairs you with another player who is searching. The match starts automatically after a short countdown. If nobody else is online yet, keep the tab open and you will be matched when someone joins.
3. To play a friend, one of you chooses **CREATE ROOM** and shares the six-character code; the other enters it under **JOIN**. Both press **READY**.
4. Controls: arrow keys or A/D to move, Down/S soft drop, Space hard drop, Up/X rotate clockwise, Z counter-clockwise, C hold. Holding a movement key repeats it.
5. Clearing two or more lines sends garbage to your opponent, and any clear first cancels garbage that is incoming for you. The last player standing wins. If a connection drops, the other player waits about 10 seconds before the match is forfeited.

Open the game in **two tabs** to test by yourself: each tab is a separate player.

## Docs

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Gameplay ruleset](docs/RULESET.md)
- [Agent instructions](docs/AGENT_INSTRUCTIONS.md)

## Deployment

The game has two parts, and both must be running for Online Battle to work:

| Part | Host | Config |
|---|---|---|
| Web client (static site) | GitHub Pages | `.github/workflows/deploy.yml` |
| Battle server (WebSocket) | Render (free) | `render.yaml` |

GitHub Pages only serves files and cannot run the WebSocket server, so the client needs the server's address at build time. Follow these steps in order.

### 1. Deploy the battle server (Render)

1. Sign in at [render.com](https://render.com) with GitHub.
2. Choose **New > Blueprint**, select this repository, and apply it. Render reads `render.yaml`.
3. Wait until the service shows **Live**. Copy its URL, for example `https://online-tetris-server.onrender.com`.
4. Check it: open `https://<your-server>/health`. You should see `{"status":"ok", ...}`.

The free plan sleeps after about 15 minutes without traffic. The first visit after that takes around a minute. The client retries automatically, so players will see "SERVER WAKING" for a while instead of an error.

### 2. Tell the web client where the server is

1. In GitHub, open **Settings > Secrets and variables > Actions > Variables**.
2. Click **New repository variable**.
3. Name: `VITE_SERVER_URL`. Value: the server address using `wss://`, for example `wss://online-tetris-server.onrender.com`.

Use `wss://`, not `ws://`. The site is served over HTTPS, and browsers block insecure WebSockets from HTTPS pages. `https://` and `ws://` values are converted automatically, but `wss://` is the correct form.

### 3. Turn on GitHub Pages

1. Open **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. The workflow also tries to enable this for you on the first run.

### 4. Build and publish the site

1. Open the **Actions** tab, select **Deploy to GitHub Pages**, and click **Run workflow**. Pushes to `main` also trigger it.
2. Wait for the `build` and `deploy` jobs to finish.
3. Open the site: `https://<your-github-username>.github.io/tetris/`.

Whenever `VITE_SERVER_URL` changes, run the workflow again. The value is baked into the build.

### Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| "Online Battle is not configured for this build" | `VITE_SERVER_URL` was not set when the site was built | Complete step 2, then rerun the workflow (step 4) |
| "SERVER OFFLINE" after several retries | Server is down, or the URL is wrong | Open `https://<server>/health`. If it fails, check the Render logs and the `VITE_SERVER_URL` value |
| Build workflow warns about `VITE_SERVER_URL` | Variable is empty or not `wss://` | Correct the variable and rerun |
| Pages URL returns 404 | Pages source is not set to GitHub Actions | Complete step 3 and rerun the workflow |
| Server `/health` works but the game does not connect | Site was built before the variable was set | Rerun the workflow |

For local development, run `npm install`, then `npm run dev --workspace @tetris/server` (port 8080) and, in a second terminal, `npm run dev --workspace @tetris/web`. Local builds use `ws://localhost:8080` automatically.
