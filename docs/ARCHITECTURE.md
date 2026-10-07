# Technical Architecture
## Online Multiplayer Tetris

**Status:** MVP implementation  
**Version:** 0.1

---

## 1. Recommended Stack

### Frontend

- React
- TypeScript
- Vite
- CSS Modules or a small structured CSS architecture
- WebSocket client

### Backend

- Node.js
- TypeScript
- Fastify or Express
- WebSocket server using a maintained WebSocket library

### Shared

- TypeScript shared game/domain package.
- Schema validation using Zod or equivalent.

### Testing

- Vitest for unit tests.
- Playwright for end-to-end browser tests.

### Tooling

- ESLint.
- Prettier.
- TypeScript strict mode.
- npm/pnpm.
- GitHub Actions.

### Initial hosting recommendation

Frontend and backend may be deployed separately if required.

Recommended initial path:

- Frontend: Vercel/Cloudflare Pages.
- Backend: Render/Fly.io/Railway or another WebSocket-capable service.
- Do not choose a serverless-only backend architecture that cannot maintain WebSocket connections.

The hosting provider can be changed later because deployment configuration should be isolated from game logic.

---

## 2. Architecture Style

Use a modular monorepo.

Recommended structure:

```text
online-tetris/
├── apps/
│   ├── web/
│   └── server/
├── packages/
│   ├── game-engine/
│   ├── protocol/
│   ├── schemas/
│   └── config/
├── tests/
│   ├── e2e/
│   └── fixtures/
├── docs/
│   ├── PRD.md
│   ├── DESIGN_SYSTEM.md
│   ├── ARCHITECTURE.md
│   └── AGENT_INSTRUCTIONS.md
├── .github/
│   └── workflows/
├── package.json
├── tsconfig.json
├── README.md
└── .gitignore
```

---

## 3. Responsibility Boundaries

### `apps/web`

Responsible for:

- UI.
- Input capture.
- Rendering.
- Client-side animation.
- WebSocket connection.
- Client state.
- Displaying server state.

Must not contain authoritative game rules.

### `apps/server`

Responsible for:

- HTTP server.
- WebSocket server.
- Rooms.
- Match lifecycle.
- Authentication/session identity if later introduced.
- Server-side game simulation.
- Rate limiting.
- Disconnect handling.

### `packages/game-engine`

Pure deterministic game logic.

Should contain:

- Board.
- Tetromino definitions.
- Rotation.
- Collision.
- Gravity.
- Locking.
- Line clearing.
- Scoring.
- Garbage.
- RNG/7-bag.
- Game state transitions.

It should not depend on React, WebSocket, browser APIs, or Node-specific networking.

### `packages/protocol`

Defines:

- Client -> server messages.
- Server -> client messages.
- Versioning.
- Message types.
- Payload structures.

### `packages/schemas`

Runtime validation for network payloads and configuration.

---

## 4. Authoritative Server Model

The server owns the canonical match state.

Conceptually:

```text
Client Input
    |
    v
WebSocket Server
    |
    v
Validate Message
    |
    v
Authoritative Game Engine
    |
    +--> Player A State
    |
    +--> Player B State
    |
    v
Emit State/Event Updates
    |
    +--> Client A
    |
    +--> Client B
```

The browser may render a predicted falling piece for responsiveness, but server state always wins when reconciliation occurs.

---

## 5. Game Tick

Do not synchronize by sending a full board every animation frame.

Recommended model:

- Server runs authoritative simulation.
- Server maintains a fixed simulation tick or scheduled gravity events.
- Client renders at browser refresh rate.
- Network messages communicate inputs and authoritative state changes.

Possible initial server tick:

- 60 Hz simulation loop if needed for simple deterministic timing.

However, gravity does not need to generate a network message every tick.

Prefer event/state updates such as:

- piece moved,
- piece rotated,
- piece locked,
- line cleared,
- garbage received,
- score updated,
- match status changed.

---

## 6. Network Protocol

All messages should contain a predictable envelope.

Example conceptual structure:

```json
{
  "type": "INPUT",
  "protocolVersion": 1,
  "sequence": 123,
  "payload": {
    "action": "MOVE_LEFT"
  }
}
```

Server messages:

```json
{
  "type": "STATE_UPDATE",
  "protocolVersion": 1,
  "serverTick": 12345,
  "payload": {}
}
```

Never trust arbitrary client JSON.

Every message must be:

1. Parsed.
2. Schema validated.
3. Authorized.
4. Rate checked.
5. Applied only if legal.

---

## 7. Input Model

Use discrete player commands.

Examples:

- MOVE_LEFT
- MOVE_RIGHT
- SOFT_DROP
- HARD_DROP
- ROTATE_CW
- ROTATE_CCW
- HOLD
- READY
- REMATCH
- LEAVE

Avoid allowing clients to send:

- x coordinate.
- y coordinate.
- board state.
- score.
- garbage amount.
- piece identity.

The server determines the resulting state.

---

## 8. Randomness

Use a server-owned RNG seed.

Recommended:

1. Server creates match seed.
2. Seed initializes deterministic 7-bag generator.
3. Both clients receive only information appropriate to gameplay.
4. Server remains authoritative.

For debugging, the match seed may be logged.

Do not use `Math.random()` throughout gameplay logic if deterministic reproduction is required.

---

## 9. Game State Model

Conceptually:

```text
Match
├── id
├── roomId
├── status
├── startAt
├── createdAt
├── players
│   ├── playerA
│   └── playerB
└── rulesetVersion

PlayerState
├── board
├── activePiece
├── holdPiece
├── nextQueue
├── score
├── lines
├── level
├── garbageQueue
├── combo
├── backToBack
├── status
└── connection
```

The exact implementation may differ.

---

## 10. Room State Machine

Recommended:

```text
WAITING
   |
   v
READY_CHECK
   |
   v
COUNTDOWN
   |
   v
PLAYING
   |
   +----> PLAYER_DISCONNECTED
   |              |
   |              +--> PLAYING
   |              |
   |              +--> FINISHED
   |
   v
FINISHED
   |
   +--> REMATCH_READY
   |        |
   |        v
   |     COUNTDOWN
   |
   +--> CLOSED
```

Illegal transitions must be rejected.

---

## 11. Disconnect Handling

Recommended MVP:

- Grace period: 10 seconds.
- Match state remains on server during grace period.
- Opponent sees `RECONNECTING`.
- Reconnecting player resumes using a session token stored in memory.
- If grace period expires, disconnected player forfeits.
- Room remains available for result/rematch logic as appropriate.

If the server restarts, active matches may be lost in MVP.

Persistent match recovery is post-MVP.

---

## 12. Session Identity

MVP does not require accounts.

When entering a room:

- Generate a random client session identifier.
- Server assigns a player identifier.
- Use a secure opaque token for reconnect within the active server lifetime.

Do not use personally identifiable information as a player identifier.

---

## 13. Rate Limiting

Rate-limit:

- Room creation.
- Room join attempts.
- WebSocket input messages.
- Reconnection attempts.

The exact thresholds should be configurable.

Example initial gameplay limit:

- Reject clearly impossible input floods rather than applying an arbitrary low human-input ceiling.

---

## 14. State Synchronization Strategy

### Initial connection

Server sends:

- Match metadata.
- Player assignment.
- Current ruleset.
- Current authoritative state.

### During play

Server sends compact state/event updates.

### Reconciliation

Client:

1. Applies server state.
2. Clears invalid predicted inputs.
3. Replays still-pending local inputs if the client prediction system requires it.

For the first implementation, it is acceptable to use a simpler authoritative update model rather than implementing complex rollback.

---

## 15. Deployment boundary

GitHub Pages serves the static React client. It cannot run the authoritative WebSocket process. The server is deployed separately on a WebSocket-capable Node host and exposes a health endpoint for monitoring. The client receives the server WebSocket address at build time through `VITE_SERVER_URL`.

## 16. Persistence

MVP:

- No database required for core gameplay.
- Room and match state can be held in memory.

Optional database after MVP:

- PostgreSQL for users, profiles, rankings, match history.

Do not add a database merely because the project is multiplayer.

---

## 17. Scaling Path

### Stage 1

One server instance.

### Stage 2

Multiple server instances.

At Stage 2, introduce:

- Redis/pub-sub or equivalent.
- Room ownership/routing.
- Sticky WebSocket sessions where appropriate.

Do not build distributed infrastructure before it is needed.

---

## 18. Frontend State

Separate:

### Server state

- Room.
- Match status.
- Player states.
- Opponent state.
- Connection.

### Local UI state

- Modal visibility.
- Settings.
- Input configuration.
- Animations.
- Local sound preferences.

### Local transient prediction

- Active piece visual position.
- Pending inputs.

Avoid placing every animation frame into global React state.

---

## 19. Rendering

The game board should be rendered using either:

- Canvas; or
- Highly optimized DOM/CSS grid.

Recommendation: **Canvas for the active game board** if performance or animation becomes an issue.

DOM/CSS is acceptable for the first implementation if it remains performant and accessible.

UI panels should remain normal HTML for accessibility.

---

## 20. Testing Strategy

### Unit tests

Game engine:

- Spawn.
- Move.
- Collision.
- Rotation.
- Wall kicks if implemented.
- Soft drop.
- Hard drop.
- Lock.
- Line clear.
- Score.
- Level.
- 7-bag.
- Hold.
- Garbage.
- Game over.
- Deterministic seed.

### Integration tests

Server:

- Room creation.
- Join.
- Ready.
- Countdown.
- Input validation.
- Match start.
- Match end.
- Disconnect.
- Reconnect.
- Forfeit.
- Rematch.

### E2E

Use two browser contexts:

- Browser A creates room.
- Browser B joins.
- Both ready.
- Match starts.
- Basic gameplay.
- Match finishes.

---

## 21. CI/CD

Every pull request should run:

1. Install dependencies.
2. Typecheck.
3. Lint.
4. Unit tests.
5. Build.
6. E2E tests where environment permits.

Main branch should only receive changes that pass required checks.

---

## 22. Environment Variables

Never hardcode secrets.

Example:

```text
VITE_SERVER_URL=
SERVER_PORT=
CLIENT_ORIGIN=
SESSION_SECRET=
LOG_LEVEL=
```

Use `.env.example`.

Do not commit `.env`.

---

## 23. Logging

Structured logs should include:

- timestamp.
- level.
- component.
- event.
- room ID where safe.
- match ID where safe.
- player ID where safe.

Avoid logging:

- secrets.
- session tokens.
- unnecessary personal information.

---

## 24. Failure Strategy

If WebSocket disconnects:

1. Mark local connection state.
2. Attempt reconnect.
3. Re-authenticate session.
4. Request authoritative state.
5. Resume if server accepts session.
6. Otherwise return user to lobby with a clear explanation.

If server returns invalid protocol:

- Stop processing the message.
- Log the protocol error.
- Do not crash the entire server.

---

## 25. GitHub Repository Strategy

Recommended branches:

- `main` — stable.
- `develop` — optional if using a staging flow.
- `feature/<name>` — feature work.
- `fix/<name>` — bug fixes.

For a solo AI-assisted project, a simpler flow is preferable:

```text
main
  |
feature branch
  |
PR
  |
CI
  |
review
  |
merge
```

Every meaningful agent-generated change should be reviewable as a commit or pull request.

---

## 26. Definition of Done

A feature is done only when:

- Implementation is complete.
- Types are correct.
- Tests cover important behavior.
- UI states are handled.
- Errors are handled.
- Documentation is updated if behavior changes.
- No unrelated files are modified.
- Build succeeds.
- Lint succeeds.
- Tests succeed.

---

## 27. Key Architectural Decisions

### ADR-001

Use TypeScript across frontend, backend, and shared packages.

### ADR-002

Use authoritative server gameplay.

### ADR-003

Use WebSockets for real-time communication.

### ADR-004

Keep game engine pure and deterministic.

### ADR-005

Avoid persistent database in MVP.

### ADR-006

Use monorepo structure to share protocol and game logic.

### ADR-007

Use schema validation for every network message.

### ADR-008

Prefer simple authoritative synchronization before implementing advanced client prediction.

---

## 28. Architecture Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Desync | High | Server authority + deterministic engine |
| Cheating | High | Validate all commands |
| WebSocket disconnects | High | Reconnect/grace period |
| Agent changes architecture | High | Agent instructions + ADRs |
| Overengineering | Medium | MVP boundaries |
| Poor mobile UX | Medium | Responsive design requirements |
| Rendering performance | Medium | Canvas option + profiling |
| Protocol changes | Medium | Versioned messages |
