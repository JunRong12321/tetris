# Agent Instructions
## Online Multiplayer Tetris

**Status:** Draft for review  
**Version:** 0.1

This document is the operating contract for AI coding agents working on this repository.

---

# 1. Mission

Build and maintain a production-quality browser-based online multiplayer Tetris game according to:

1. `docs/PRD.md`
2. `docs/DESIGN_SYSTEM.md`
3. `docs/ARCHITECTURE.md`

These documents are the source of truth.

The agent must not silently redefine product scope, gameplay rules, architecture, or UX.

---

# 2. Priority Order

When requirements conflict, follow this priority:

1. Explicit user instruction in the current task.
2. PRD.
3. Architecture.
4. Design System.
5. Existing tests.
6. Existing implementation.
7. Agent preference.

If a conflict cannot be resolved safely, stop and ask for clarification rather than guessing.

---

# 3. Before Coding

Before making changes:

1. Inspect the repository.
2. Read the relevant documentation.
3. Identify existing architecture.
4. Search for related implementation.
5. Check tests.
6. Determine the smallest change that satisfies the request.

Do not immediately rewrite existing code.

---

# 4. Planning Requirement

For any non-trivial task, create a short implementation plan before editing.

The plan should identify:

- files to change,
- reason for each change,
- dependencies,
- tests required,
- risks.

Do not create unnecessary files.

---

# 5. Scope Control

The agent must distinguish:

### MVP

Required for the first public release.

### Post-MVP

Useful but not necessary.

If a user asks for a post-MVP feature during MVP implementation, do not automatically build it as part of the current task unless explicitly requested.

---

# 6. Core Engineering Principle

**The game engine is the source of gameplay truth.**

Do not duplicate gameplay rules in multiple locations.

Bad:

```text
React calculates collision
+
server calculates collision
+
utility function calculates collision differently
```

Good:

```text
packages/game-engine
        |
        +--> server
        |
        +--> tests
        |
        +--> optional client prediction
```

---

# 7. Multiplayer Authority

The server is authoritative.

Never trust client-provided:

- score,
- board,
- piece position,
- winner,
- garbage,
- level,
- line count.

The client sends intentions/actions.

Example:

```text
Client:
MOVE_LEFT

Server:
Validate
Apply
Update state
Broadcast
```

---

# 8. Determinism

Game logic should be deterministic where practical.

Given:

```text
same initial state
+
same RNG seed
+
same ordered input sequence
```

the engine should produce the same result.

This is essential for:

- debugging,
- testing,
- reproducing bugs,
- future replays,
- anti-cheat improvements.

---

# 9. Network Rules

Every network message must:

1. Have a known type.
2. Have a schema.
3. Be validated.
4. Be authorized.
5. Be rate checked.
6. Be handled safely if malformed.

Never use unchecked casts such as:

```ts
message as SomeKnownType
```

as a substitute for runtime validation.

---

# 10. Error Handling

Do not silently swallow errors.

Bad:

```ts
try {
  ...
} catch {}
```

Prefer:

```ts
try {
  ...
} catch (error) {
  logger.error({ error }, "Failed to process match event");
}
```

User-facing errors should be understandable.

Developer-facing logs may contain technical details.

Never expose:

- secrets,
- stack traces,
- session tokens,
- internal server paths

to normal users.

---

# 11. TypeScript Rules

Use strict TypeScript.

Avoid:

- `any`.
- unnecessary type assertions.
- duplicate interfaces.
- implicit `any`.
- unsafe null handling.

Prefer:

- explicit domain types.
- discriminated unions.
- immutable data where practical.
- small pure functions.

---

# 12. React Rules

Avoid putting high-frequency game-loop data into React state when it causes unnecessary renders.

Prefer:

- refs,
- game-loop objects,
- canvas rendering,
- carefully scoped state.

React should primarily control application/UI state.

---

# 13. Game Engine Rules

The engine must remain framework-independent.

Do not import:

- React,
- browser DOM APIs,
- WebSocket libraries,
- UI libraries

into `packages/game-engine`.

The engine should be executable in unit tests without a browser.

---

# 14. Input Rules

Player input must be represented as domain actions.

Recommended:

```ts
type PlayerAction =
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "SOFT_DROP"
  | "HARD_DROP"
  | "ROTATE_CW"
  | "ROTATE_CCW"
  | "HOLD";
```

Do not expose arbitrary state mutation through the network.

---

# 15. Tetris Rules

Do not invent gameplay behavior casually.

Before changing:

- scoring,
- rotation,
- wall kicks,
- garbage,
- T-spin detection,
- level progression,
- gravity,
- lock delay,

update the documented ruleset or explicitly confirm the change.

---

# 16. UI Rules

Follow `docs/DESIGN_SYSTEM.md`.

Do not introduce:

- random colors,
- arbitrary spacing,
- inconsistent button shapes,
- unrelated component styles,
- unnecessary animations.

If a new component is required:

1. Check whether an existing component can be reused.
2. Follow existing tokens.
3. Keep the API small.
4. Document unusual behavior.

---

# 17. Responsive Rules

Every UI feature must be checked against:

- desktop,
- tablet,
- narrow mobile.

Do not solve desktop layout problems by introducing horizontal overflow.

---

# 18. Accessibility Rules

Interactive elements should use semantic HTML.

Prefer:

```html
<button>
```

over:

```html
<div onClick={...}>
```

Provide:

- keyboard access,
- focus states,
- labels,
- status text,
- non-color indicators.

---

# 19. Testing Rules

Every gameplay feature must include unit tests.

Every multiplayer lifecycle feature should include integration tests.

Important bug fixes should include regression tests.

Test behavior rather than implementation details.

---

# 20. Test Priorities

### Highest priority

- collision,
- rotation,
- line clearing,
- scoring,
- garbage,
- game-over,
- deterministic RNG,
- server authorization,
- room state transitions,
- reconnect.

### Medium priority

- UI components,
- responsive layouts,
- animations.

---

# 21. Git Rules

Use focused commits.

Recommended:

```text
feat(game): implement seven-bag generator
feat(multiplayer): add room readiness state
fix(server): reject invalid gameplay actions
test(game): cover line clear edge cases
docs: update multiplayer protocol
```

Avoid commits such as:

```text
update stuff
fix things
changes
```

Do not mix unrelated refactoring into feature commits.

---

# 22. Branch Rules

Recommended:

```text
feature/<short-name>
fix/<short-name>
refactor/<short-name>
```

Never directly rewrite unrelated branches.

Do not force-push unless explicitly requested.

---

# 23. Pull Request Rules

A PR should contain:

### Summary

What changed?

### Reason

Why was it needed?

### Testing

What commands were run?

### Risk

What could break?

### Screenshots

Required for meaningful UI changes.

---

# 24. Definition of Done

Before declaring a task complete:

```text
[ ] Requirement implemented
[ ] Types pass
[ ] Lint passes
[ ] Unit tests pass
[ ] Integration tests pass where relevant
[ ] Build passes
[ ] Error states handled
[ ] Responsive behavior checked
[ ] Accessibility checked
[ ] Documentation updated if required
[ ] No unrelated changes
```

---

# 25. Required Commands

The repository should eventually expose predictable scripts such as:

```bash
npm run dev
npm run build
npm run test
npm run test:e2e
npm run lint
npm run typecheck
```

If the actual package manager differs, document the equivalent commands.

---

# 26. Agent Workflow

Use this lifecycle:

```text
USER REQUEST
    |
    v
UNDERSTAND
    |
    v
CHECK PRD / ARCHITECTURE / DESIGN
    |
    v
PLAN
    |
    v
IMPLEMENT
    |
    v
TEST
    |
    v
REVIEW DIFF
    |
    v
UPDATE DOCS
    |
    v
REPORT
```

The agent must not skip the test/review stage.

---

# 27. Self-Review Checklist

Before final response, ask:

### Product

- Does this satisfy the requested behavior?
- Did I accidentally add scope?

### Architecture

- Is the server/client responsibility still correct?
- Did I introduce a dependency unnecessarily?

### Security

- Can the client fake important state?
- Are messages validated?

### Reliability

- What happens if the socket closes?
- What happens if malformed data arrives?

### Testing

- Is the core behavior tested?
- Did I add a regression test for a bug?

### UX

- Is the state understandable?
- Is the action obvious?
- Does it work at narrow widths?

### Code quality

- Is there duplicated logic?
- Are names clear?
- Is the implementation simpler than before?

---

# 28. Forbidden Agent Behaviors

Do not:

1. Rewrite the project without justification.
2. Change frameworks because of personal preference.
3. Add a database without a product/architecture reason.
4. Add authentication during MVP unless explicitly requested.
5. Trust client gameplay state.
6. Hide errors.
7. Remove tests to make CI pass.
8. Disable TypeScript strictness.
9. Introduce `any` to bypass typing problems.
10. Modify unrelated files.
11. Replace working architecture with a new architecture without approval.
12. Claim a feature works without testing it.
13. Claim multiplayer works after testing only one browser.
14. Commit secrets.
15. Invent undocumented game rules.

---

# 29. When to Ask the User

Ask for clarification when:

- two requirements conflict;
- a change affects architecture materially;
- a gameplay rule is undefined and cannot be safely inferred;
- a security decision has significant consequences;
- a destructive migration is required;
- a third-party service/account is required;
- implementation would significantly increase MVP scope.

Do not ask for clarification for trivial implementation details that can be safely inferred from the existing architecture.

---

# 30. Autonomous Decisions

The agent may decide:

- variable names,
- internal function structure,
- test naming,
- minor CSS implementation details,
- small refactors needed to complete the requested feature,
- exact library versions within the approved stack.

The agent should not independently decide:

- framework changes,
- multiplayer protocol redesign,
- database adoption,
- authentication,
- monetization,
- new gameplay modes,
- major UI direction,
- breaking API changes.

---

# 31. Documentation Maintenance

If implementation changes:

- architecture,
- network protocol,
- gameplay rules,
- deployment,
- environment variables,

the relevant documentation must be updated in the same change.

Documentation drift is considered a defect.

---

# 32. Initial Implementation Order

When coding is approved, follow this order:

### Phase 1 — Repository foundation

- Monorepo.
- TypeScript.
- Tooling.
- CI.
- Documentation.

### Phase 2 — Pure game engine

- Board.
- Pieces.
- Collision.
- Rotation.
- Gravity.
- Locking.
- Line clear.
- Score.
- 7-bag.
- Hold.
- Garbage.
- Tests.

### Phase 3 — Server

- HTTP.
- WebSocket.
- Rooms.
- Player sessions.
- Match state machine.
- Authoritative engine.
- Protocol validation.

### Phase 4 — Frontend

- Landing.
- Create/join room.
- Lobby.
- Board.
- HUD.
- Opponent board.
- Result screen.

### Phase 5 — Multiplayer integration

- Two-client flow.
- Countdown.
- Input.
- Synchronization.
- Disconnect.
- Reconnect.
- Rematch.

### Phase 6 — Quality

- E2E tests.
- Responsive QA.
- Accessibility.
- Performance.
- Error handling.
- Documentation.

### Phase 7 — Deployment

- Production environment.
- WebSocket-capable backend.
- Frontend deployment.
- CI/CD.
- Smoke test.

---

# 33. Final Agent Principle

**Do not optimize for writing the most code. Optimize for producing a small, understandable, testable system that behaves exactly as the product specification requires.**
