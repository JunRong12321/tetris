# Design System
## Online Multiplayer Tetris

**Status:** Draft for review  
**Version:** 0.1

---

## 1. Design Direction

### Design concept

**Competitive arcade / modern retro.**

The interface should feel like a modern browser game rather than a corporate dashboard.

Design priorities:

1. Game board clarity.
2. Fast visual recognition.
3. Strong hierarchy.
4. Minimal UI during active play.
5. Consistent arcade identity.
6. Responsive layout.

Avoid:

- Excessive gradients.
- Excessive glassmorphism.
- Tiny controls.
- Decorative UI that competes with the board.
- Random component styles.
- Excessive animation.

---

## 2. Visual Hierarchy

### Priority 1

Player's active board.

### Priority 2

Opponent board and match status.

### Priority 3

Score / lines / level.

### Priority 4

Next and hold pieces.

### Priority 5

Secondary actions/settings.

---

## 3. Layout System

Use a responsive 12-column mental grid.

### Landing

- Centered game identity.
- Primary actions.
- Short control guide.
- Connection status.

### Lobby

Desktop:

```text
┌───────────────────────────────────────────────┐
│ LOGO                         ROOM: ABC123      │
├───────────────────────────────────────────────┤
│                                               │
│        PLAYER 1        VS        PLAYER 2      │
│        READY                    WAITING        │
│                                               │
│                  [ READY ]                     │
│                                               │
└───────────────────────────────────────────────┘
```

### Game

Desktop:

```text
┌─────────────────────────────────────────────────────────┐
│ Match Status                         Connection: ●       │
├──────────────┬─────────────────────┬────────────────────┤
│ Hold / Stats │     YOUR BOARD      │  OPPONENT BOARD    │
│              │                     │                    │
│ Next Queue   │     10 × 20         │    10 × 20         │
│              │                     │                    │
│ Score        │                     │                    │
│ Lines        │                     │                    │
│ Level        │                     │                    │
└──────────────┴─────────────────────┴────────────────────┘
```

The exact layout may be adjusted during implementation if board proportions or responsive constraints require it.

---

## 4. Design Tokens

Use CSS custom properties or an equivalent theme-token system.

### Typography

Recommended font stack:

- Primary: `Inter`, system sans-serif.
- Arcade/display accent: a readable monospace/display font only where appropriate.

Avoid using novelty fonts for body text.

Recommended scale:

| Token | Size |
|---|---:|
| Display | 48px |
| H1 | 36px |
| H2 | 28px |
| H3 | 22px |
| Body Large | 18px |
| Body | 16px |
| Body Small | 14px |
| Caption | 12px |

Minimum interactive text should generally remain 14px or larger.

---

## 5. Spacing

Use a 4px base unit.

| Token | Value |
|---|---:|
| space-1 | 4px |
| space-2 | 8px |
| space-3 | 12px |
| space-4 | 16px |
| space-5 | 20px |
| space-6 | 24px |
| space-8 | 32px |
| space-10 | 40px |
| space-12 | 48px |
| space-16 | 64px |

Do not introduce arbitrary spacing values unless necessary.

---

## 6. Radius

| Token | Value |
|---|---:|
| radius-sm | 6px |
| radius-md | 10px |
| radius-lg | 16px |
| radius-xl | 22px |

Game cells should normally use a small radius or no radius depending on the final visual treatment.

---

## 7. Color System

The exact palette can be adjusted before implementation, but the semantic system must remain stable.

### Semantic colors

- `background`
- `surface`
- `surface-elevated`
- `border`
- `text-primary`
- `text-secondary`
- `text-muted`
- `accent`
- `success`
- `warning`
- `danger`
- `focus`

### Tetris piece colors

Each tetromino should have a distinct visual identity.

Recommended semantic mapping:

| Piece | Identity |
|---|---|
| I | Cyan |
| O | Yellow |
| T | Purple |
| S | Green |
| Z | Red |
| J | Blue |
| L | Orange |

The implementation must not depend on color alone. Piece shapes and block structure must remain recognizable.

---

## 8. Components

### Buttons

Variants:

- Primary
- Secondary
- Ghost
- Danger

States:

- Default
- Hover
- Focus
- Active
- Disabled
- Loading

### Room Code

Must be:

- Large.
- Easy to copy.
- Monospaced.
- Visually isolated.

Include:

- Copy button.
- Copied confirmation.

### Player Status

States:

- Connected.
- Ready.
- Waiting.
- Disconnected.
- Reconnecting.

Use icon + text, not color alone.

### Score Panel

Display:

- Score.
- Lines.
- Level.

Optional:

- Attack/garbage count.

### Game Board

Rules:

- Fixed aspect ratio.
- Clear cell boundaries.
- Locked blocks and active piece visually distinguishable.
- Ghost piece optional.
- Avoid visual effects that reduce block readability.

### Next Queue

Show enough pieces to help planning without overwhelming the interface.

MVP recommendation: 5 upcoming pieces.

### Hold

Show one held piece.

### Modal

Use for:

- Confirm leave.
- Match result.
- Connection failure.
- Critical errors.

Do not use modal dialogs for normal gameplay events.

---

## 9. Motion

Motion should communicate state, not decorate the interface.

Recommended:

- Button hover: 100–150ms.
- Panel transitions: 150–250ms.
- Countdown: strong but short scale/fade animation.
- Line clear: brief visual effect.
- Game-over: restrained transition.

Do not animate the entire page during gameplay.

Respect `prefers-reduced-motion`.

---

## 10. Sound

Sound is optional for MVP.

If added:

- Piece move.
- Piece lock.
- Line clear.
- Tetris.
- Garbage received.
- Countdown.
- Game over.
- Victory.

Provide:

- Master volume.
- SFX toggle.
- Music toggle.

No sound should be required to understand the game.

---

## 11. Responsive Rules

### >= 1200px

Full competitive layout.

### 900–1199px

Compress side panels while preserving both boards.

### 600–899px

Stack or partially collapse secondary information.

### <600px

Prioritize:

1. Active board.
2. Opponent board.
3. Essential score/status.
4. Controls.

Do not allow the UI to create horizontal scrolling during normal gameplay.

---

## 12. Accessibility Rules

- Keyboard focus visible.
- Interactive elements reachable by keyboard.
- Contrast should meet WCAG AA where practical.
- Use semantic buttons rather than clickable divs.
- Status changes should have accessible text.
- Do not encode success/failure through color only.
- Avoid flashing effects.
- Support reduced motion.

---

## 13. Copywriting Style

Use concise arcade language.

Preferred:

- `CREATE ROOM`
- `JOIN ROOM`
- `READY`
- `WAITING FOR PLAYER`
- `MATCH STARTING`
- `OPPONENT DISCONNECTED`
- `RECONNECTING`
- `YOU WIN`
- `YOU LOSE`
- `REMATCH`
- `EXIT TO LOBBY`

Avoid verbose technical messages in the game UI.

Technical details belong in logs/developer tooling.

---

## 14. Design QA Checklist

Before release:

- [ ] All screens use the same spacing scale.
- [ ] Buttons have consistent height and states.
- [ ] Focus states are visible.
- [ ] Game board remains readable at supported widths.
- [ ] Player/opponent distinction is obvious.
- [ ] Connection state is understandable.
- [ ] Color is not the only status signal.
- [ ] Reduced-motion behavior works.
- [ ] No layout shift occurs when game state changes.
- [ ] No important information is hidden behind unnecessary modals.
