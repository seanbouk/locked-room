# Locked Room — Design & Architecture

A puzzle game where **circle theorems are skeleton keys** and **circle-theorem
figures are locks**. You pick the lock by dropping keys (theorems) onto the
figure; when every angle that needs solving is *provably determined*, the lock
opens and you pass into the next room.

No numbers are ever shown. It's all algebra — and algebra is just hidden
numbers, so we hide the letters too.

---

## 1. Core principle: "solved" = provably determined

The single most important rule: an angle is **solved** when the rules applied so
far *uniquely determine* it — not when "two numbers look similar".

We model the whole figure as a **system of linear equations** over angle (and
length) variables:

- Every angle is a variable.
- A few **givens** fix some angles; some angles are flagged as **targets**.
- Each theorem the player applies injects linear equation(s):

  | Key | Equation injected |
  |---|---|
  | Angle in a semicircle | `x = 90` (axiom, no prior knowledge needed) |
  | Tangent ⊥ radius | `x = 90` (axiom) |
  | Angle at centre = 2× circumference | `centre − 2·inscribed = 0` |
  | Angles in same segment | `a − b = 0` |
  | Cyclic quad, opposite angles | `a + c = 180` |
  | Alternate segment | `tangent_chord − alt = 0` |
  | Triangle angle sum | `a + b + c = 180` |
  | Angles on a line / isosceles radii | `…= 180` / `a − b = 0` |

- After each placement we reduce the system to **reduced row echelon form** and
  ask, per variable: *is its value identical across every solution?* If yes, it
  is determined → solved. **The lock opens when all targets are determined.**

Why this model:

- **No numbers shown.** Determinacy is the signal, not a value.
- **Any solution path works** ("if you solve it, it's solved").
- **Dependency chains emerge for free** — a propagation key does nothing until
  one of its angles is already known, so "solve one to unlock the next" falls
  out of the maths.
- **Real algebra works** — `a+b=180` plus `a=b` pins both at 90, because the
  solver combines equations rather than copying values around.
- **Exact.** Integer-coefficient equations, exact rational (BigInt) arithmetic,
  zero floating-point fuzz.

### Implementation (`src/lib/engine/`)
- `fraction.ts` — exact rationals (BigInt).
- `linear-system.ts` — equations + Gauss-Jordan RREF + the determinacy test.
- `puzzle.ts` — geometric figure + structural predicates (on-circle, diameter,
  same-side-of-chord …). Coordinates draw the figure and decide *where a key
  fits*; they never decide what's solved.
- `theorems.ts` — each key = `match()` (where it legally drops) + `equations()`.
- `game.ts` — `Lock`: apply keys, recompute solved set, check `isOpen`.
- `engine.test.ts` — proves recognition, no-premature-solve, dependency chains,
  lock-open, path-independence, and a ground-truth cross-check.

Status: **engine core complete and tested (5/5 green).**

---

## 2. Geometry as independent "fields"

Each region carved out by the lines must be independently manipulable (pieces
jump out, light through the cracks, doors open). So the figure is rendered as a
**planar subdivision**: compute the arrangement of chords/radii/tangents + the
circle boundary into **faces**, and render **each face as its own SVG element**
from the very first prototype — so the fancy transitions are later just
animating elements that already exist, not a rewrite.

Hard separation, so polish never entangles logic:

```
model (geometry + constraint state)  →  view (SVG)  →  juice (particles/light/sound)
```

Gameplay emits events (`angle-solved`, `lock-opened`); the juice layer
*subscribes*.

---

## 3. Tech stack

- **Vite + TypeScript** — chosen.
- **Svelte** for the app shell (menus, level select, Spotify panel, HUD).
- **Custom SVG renderer** for the puzzle (not a framework's job).
- **GSAP** (later) for choreographing satisfying transitions; a thin
  Canvas/WebGL layer for particles when we get to the juice pass.

---

## 4. Build order

1. ✅ Solver core + tests (no graphics).
2. SVG per-face renderer for one hand-coded puzzle.
3. One key: pick-up → highlight valid drops → drop → solve → placeholder "open".
4. Key progression + 5–10 hand levels + a **level editor/validator** (auto-checks
   solvability — turns tiring authoring into fast iteration; doubles as test rig).
5. More keys, more levels, deeper dependency chains.
6. Juice pass: transitions, particles, light-through-cracks, sound, room flow.
7. Spotify, mobile/fullscreen polish, itch.io packaging.

---

## 5. Reward & feel — researched playbook (keep the satisfaction, drop the predation)

Theme — unlocking locks/doors to move through rooms — is ideal for satisfying
feedback. Map the craft onto it:

**Keep (well-evidenced):**
- **Variable reward magnitude** — sometimes a small click, sometimes a chain.
  Dopamine tracks *better-than-predicted* outcomes, so vary the payoff.
- **Rising-pitch audio combo** — each successive lock in a room a semitone
  higher; the final lock *resolves* the musical phrase. (Candy Crush's signature
  trick, perfect for our theme.)
- **Endowed progress + goal-gradient** — progress maps that start partly filled;
  tease the next door just ahead.
- **Juice:** tween/ease everything, squash-stretch "pop", **hit-stop** (1–3
  frame freeze the instant a lock clicks), gentle screen shake on the *final*
  door only, **permanence** (solved locks keep a glow). Source canon: "Juice it
  or lose it" (Jonasson/Purho), "Art of Screenshake" (Vlambeer/Nijman), *Game
  Feel* (Swink — juice only works on **instant, low-latency input**).
- **Audio:** layer each unlock = percussive transient (weighty clunk) + tonal
  chime; calm, warm, low-fatigue music; gentle (never harsh) "not quite" sounds.
- **Earned-only stars** spent on **cosmetic** room decor; collection/completion
  meta; per-room celebration (door opens, light floods in, fanfare resolves).
- **Gentle curve** — alternate easy/hard rooms; introduce each new key with an
  easy instructional room first.

**Deliberately omit (predatory / our ethical edge):**
- No energy/lives, no wait-or-pay.
- No paid boosters at difficulty spikes; no near-miss→purchase funnel (the
  near-miss effect is gambling-specific and *failed* its only direct video-game
  test, so we lose nothing).
- No gacha/loot boxes, no fake countdowns/scarcity, no confirmshaming, no
  friend-spam. If ever monetised: cosmetic, optional, transparent only.

**Honesty flags from the research:** the dopamine / goal-gradient / music-reward
science is solid; the "near-miss is addictive" claim is gambling-specific and
shaky in games; the "women 35–65" framing is directionally right but overstates
the high end (largest bucket is 25–34) — design for the *motivations* (calm,
expression, mastery, escapism), which are well-evidenced, not for stereotypes.
