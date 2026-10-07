# Product Requirements Document (PRD)
## Online Multiplayer Tetris

**Status:** Draft for review  
**Version:** 0.1  
**Date:** 2026-10-07  
**Product Type:** Browser-based multiplayer game  
**Primary Release:** MVP / first public GitHub release

---

## 1. Product Summary

Online Multiplayer Tetris is a browser-based competitive falling-block game where players can enter a lobby, join a match, play Tetris in real time, and see the opponent's board and match status.

The first release should prioritize:

1. Fast time-to-game.
2. Responsive and reliable multiplayer synchronization.
3. Familiar Tetris mechanics.
4. A clean, arcade-style interface.
5. Easy local development and GitHub deployment.
6. A codebase that AI coding agents can safely extend.

The MVP should **not** attempt to become a full social gaming platform. Accounts, persistent rankings, cosmetics, tournaments, chat, and monetization are intentionally deferred.

---

## 2. Problem Statement

A single-player Tetris implementation is relatively easy to build, but a good multiplayer implementation requires deterministic game rules, low-latency state synchronization, disconnect handling, and a clear separation between client presentation and authoritative game state.

The project therefore needs an explicit product and engineering contract before implementation so that AI coding agents do not independently redefine game rules or architecture while coding.

---

## 3. Product Goals

### Primary goals

- Allow two players to play a competitive Tetris match online.
- Make joining a match understandable within seconds.
- Keep the actual game responsive even with normal internet latency.
- Prevent ordinary clients from deciding authoritative match outcomes.
- Provide a polished desktop-first experience that remains usable on tablets/mobile.
- Make the project easy to run locally from a fresh GitHub clone.
- Provide automated tests for core game logic.

### Secondary goals

- Support spectators/observers later without redesigning the protocol.
- Make future matchmaking, accounts, rankings, replays, and additional game modes possible.
- Keep the frontend and backend independently testable.

---

## 4. Non-Goals for MVP

The following are explicitly out of scope:

- User accounts/authentication.
- Persistent player profiles.
- Global leaderboard.
- Ranked matchmaking.
- Voice chat.
- Text chat.
- Friends system.
- In-game purchases.
- Skins/cosmetics marketplace.
- Tournaments.
- Replay browser.
- Spectator mode.
- Mobile-native applications.
- AI opponent.
- More than two players in one competitive match.
- Complex anti-cheat/behavioral detection.
- Cross-region matchmaking optimization.

These can be evaluated after the MVP is stable.

---

## 5. Target Users

### Primary user

A casual web gamer who wants to:

- open the website,
- create or join a room,
- immediately play Tetris against another person,
- understand who is winning,
- finish or restart a match without confusion.

### Secondary user

A developer evaluating the GitHub repository who wants to:

- clone the project,
- run it locally,
- understand the architecture,
- modify game rules,
- add another feature without reverse-engineering the codebase.

---

## 6. Core User Journey

### Journey A — Host a match

1. User opens the website.
2. User selects **Create Room**.
3. System creates a short room code.
4. User sees the waiting lobby.
5. User shares the room code.
6. Second player joins.
7. Both players see a ready state.
8. Match countdown begins.
9. Game starts.
10. Players play simultaneously.
11. One player wins / opponent loses / match ends.
12. Results screen appears.
13. Players can **Rematch** or **Exit to Lobby**.

### Journey B — Join a match

1. User opens the website.
2. User selects **Join Room**.
3. User enters room code.
4. System validates the room.
5. User enters the waiting lobby.
6. Match begins when the host and guest are ready.
7. Game proceeds.
8. Results appear.

### Journey C — Disconnect

If a player loses connection:

1. Opponent sees a clear connection status.
2. A short grace period is provided.
3. If the player reconnects, the match resumes if the server still holds the match.
4. If the player does not reconnect within the grace period, the disconnected player forfeits.
5. The remaining player receives a clear result.

---

## 7. MVP Feature Requirements

### FR-001 Landing screen

The landing screen shall provide:

- Game title/logo.
- Create Room button.
- Join Room button.
- Basic keyboard control reference.
- Connection/server status.
- Version/build indicator in a non-prominent location.

### FR-002 Room creation

The system shall:

- Create a unique short room code.
- Assign the creator as Player 1.
- Display the room code.
- Allow the creator to copy/share the code.
- Prevent invalid or expired rooms from being joined.

### FR-003 Room joining

The system shall:

- Accept a room code.
- Validate room existence.
- Reject full rooms.
- Reject invalid/expired codes.
- Assign the joining user as Player 2.

### FR-004 Lobby

The lobby shall show:

- Player 1 connection/readiness state.
- Player 2 connection/readiness state.
- Room code.
- Ready button.
- Leave room button.

The match shall not start until both players are ready.

### FR-005 Countdown

Before gameplay:

- Display a visible countdown.
- Synchronize countdown timing using server time.
- Prevent gameplay input before the match start timestamp.

### FR-006 Tetris board

Each player shall have:

- 10-column playfield.
- 20 visible rows.
- Hidden spawn/buffer rows as required by the game engine.
- Falling active piece.
- Locked blocks.
- Current piece preview.
- Hold piece.
- Next-piece queue.

### FR-007 Controls

Default keyboard controls:

| Action | Key |
|---|---|
| Move left | Arrow Left / A |
| Move right | Arrow Right / D |
| Soft drop | Arrow Down / S |
| Hard drop | Space |
| Rotate clockwise | Arrow Up / X |
| Rotate counter-clockwise | Z |
| Hold | C |
| Pause | P |

Controls must be implemented through an input abstraction so alternative controls can be added later.

### FR-008 Gameplay rules

MVP shall implement:

- Standard 7-piece bag generation.
- Piece movement.
- Rotation.
- Collision detection.
- Gravity.
- Locking.
- Line clearing.
- Scoring.
- Level progression.
- Hold.
- Next queue.
- Game over.

The implementation should follow a documented ruleset consistently rather than mixing behaviors from different Tetris variants.

### FR-009 Competitive multiplayer

For MVP, each match contains exactly two players.

Each player sees:

- Own board.
- Opponent board preview.
- Own score.
- Opponent score.
- Own lines.
- Opponent lines.
- Own level.
- Opponent level.
- Connection status.
- Match timer/status.

### FR-010 Garbage / attack system

MVP competitive mode shall support garbage attacks.

Recommended initial rules:

- Clearing multiple lines generates garbage.
- T-spins may generate additional attack power only if the ruleset implementation explicitly supports reliable T-spin detection.
- Single-line clears should generate 0 garbage.
- Double: 1 garbage.
- Triple: 2 garbage.
- Tetris: 4 garbage.

Attack resolution must be authoritative on the server.

If T-spin detection creates excessive implementation risk, it may be disabled in the first MVP build and added as a separate feature flag.

### FR-011 Match end

A match ends when:

- A player's board reaches game-over conditions; or
- A player forfeits due to disconnect; or
- A server-side match termination condition occurs.

The result screen shall show:

- Winner.
- Loser.
- Final scores.
- Lines cleared.
- Match duration.
- Rematch.
- Exit.

### FR-012 Rematch

Rematch shall:

- Keep both players in the same room.
- Reset game state.
- Generate a new deterministic/randomized game sequence.
- Return players to ready state.
- Start only when both are ready again.

### FR-013 Leave room

A player may leave:

- waiting lobby,
- between matches,
- result screen.

Leaving during an active match counts as a forfeit unless the player is temporarily disconnected and reconnects within the configured grace period.

---

## 8. UX Requirements

### UX-001

A new user should understand how to start a game without documentation.

### UX-002

Important states must be visually distinct:

- Waiting
- Ready
- Countdown
- Playing
- Paused
- Opponent disconnected
- Game over
- Rematch
- Error

### UX-003

No critical game action should depend solely on color.

### UX-004

The active player board must remain the visual focus.

### UX-005

Opponent information should be visible without competing with the main board.

### UX-006

During gameplay, animation must never block keyboard input.

---

## 9. Responsive Requirements

### Desktop

Primary target:

- 1280×720 and above.
- Keyboard controls.
- Two-board competitive layout.

### Tablet

Support:

- 768px width and above.
- Touch controls may be added if practical.
- Preserve readable board proportions.

### Mobile

MVP target is **viewable and functional**, but desktop remains the priority.

If touch controls are implemented:

- Controls must not obscure the board.
- Buttons need adequate touch targets.
- Hard drop and rotate should be easy to access.

---

## 10. Accessibility

MVP shall include:

- Keyboard navigation outside active gameplay.
- Visible focus states.
- Sufficient contrast.
- Text labels for major actions.
- No color-only status indicators.
- Reduced-motion consideration.
- Accessible button labels.

Screen-reader optimization of the real-time game board is not a release blocker, but important status messages should be accessible.

---

## 11. Performance Requirements

### Client

Target:

- 60 FPS on typical modern desktop hardware.
- Game input response should feel immediate.
- Rendering should avoid unnecessary full-page React/UI rerenders.

### Network

Target:

- Typical gameplay should remain playable at normal consumer latency.
- Server should use compact state/event messages.
- Client should not transmit the entire board every frame.

### Server

The server should support multiple simultaneous rooms without architecture changes.

Initial capacity target:

- 100 concurrent rooms.
- 200 concurrent players.

This is a planning target, not a guaranteed production SLA.

---

## 12. Multiplayer Authority Model

The server is authoritative for:

- Match lifecycle.
- Player membership.
- Countdown.
- Random piece sequence / RNG seed.
- Legal gameplay validation.
- Board state.
- Collision/locking outcomes.
- Line clears.
- Garbage attacks.
- Score.
- Winner/loser.
- Disconnect timeout.

The client is responsible for:

- Input capture.
- Rendering.
- UI animation.
- Local presentation.
- Optional prediction where safe.

The client must never be trusted to submit:

- final score,
- final board,
- winner,
- garbage amount,
- arbitrary piece sequence.

---

## 13. Security / Abuse Requirements

MVP security should prevent ordinary client tampering rather than attempt to solve advanced cheating.

Requirements:

- Validate all gameplay commands server-side.
- Reject impossible inputs.
- Rate-limit input messages.
- Validate room codes.
- Expire abandoned rooms.
- Do not expose server secrets to frontend.
- Never trust client-provided score/board data.
- Prevent a client from modifying another player's state.
- Validate message schema and protocol version.

---

## 14. Error States

The product must provide clear messages for:

- Server unavailable.
- Failed room creation.
- Invalid room code.
- Room full.
- Room expired.
- Connection lost.
- Reconnection failed.
- Match already started.
- Invalid game command.
- Unexpected server error.

Technical stack traces must not be shown to normal players.

---

## 15. Analytics / Observability

MVP should log:

- Room created.
- Room joined.
- Match started.
- Match completed.
- Match forfeited.
- Player disconnected.
- Player reconnected.
- Server errors.

Do not collect unnecessary personal information.

---

## 16. Acceptance Criteria

The MVP is considered complete when:

1. Two users can connect from separate browser windows/devices.
2. One user can create a room.
3. The second user can join using a room code.
4. Both users can ready up.
5. Countdown starts consistently.
6. Both players receive the same match start timing.
7. Both players can play Tetris simultaneously.
8. Server validates gameplay.
9. Garbage attacks work correctly.
10. Match result is consistent between clients.
11. Disconnect/forfeit behavior works.
12. Rematch works.
13. Refreshing the browser does not corrupt another player's match.
14. Invalid room/game messages are rejected.
15. Core Tetris logic has automated unit tests.
16. The application can be started locally using documented commands.
17. Production deployment instructions are documented.
18. GitHub Actions runs lint/test/build checks.

---

## 17. MVP Success Metrics

Technical:

- Match completion rate.
- Disconnect rate.
- Server error rate.
- Average match duration.
- Invalid-message rejection rate.

Product:

- Time from landing page to active game.
- Percentage of created rooms that successfully reach a match.
- Rematch rate.
- Repeat sessions per user/device.

These metrics can initially be logged without persistent user accounts.

---

## 18. Post-MVP Roadmap

### Phase 2

- Spectator mode.
- Custom room names.
- Public room browser.
- Better touch controls.
- Additional game modes.
- Sound/music settings.
- Settings persistence.

### Phase 3

- Accounts.
- Profiles.
- Leaderboards.
- Match history.
- ELO/ranking.
- Friends.
- Private invitations.

### Phase 4

- Tournaments.
- Replays.
- Cosmetics.
- Seasonal events.
- Advanced anti-cheat.
- Regional matchmaking.

---

## 19. Product Decisions Requiring Approval

Before coding, confirm:

- [ ] Exact Tetris ruleset.
- [ ] Whether T-spins are included in MVP.
- [ ] Whether touch controls are MVP or Phase 2.
- [ ] Whether pause is permitted in multiplayer.
- [ ] Match timeout duration.
- [ ] Disconnect grace period.
- [ ] Maximum room lifetime.
- [ ] Preferred visual theme.
- [ ] Preferred hosting provider.

**Recommended defaults are defined in ARCHITECTURE.md.**
