# Locked Room

A puzzle game where **circle theorems are skeleton keys** and **circle-theorem
figures are locks**. Drop keys (theorems) onto the figure; when every angle that
needs solving is *provably determined*, the lock opens and you move to the next
room. No numbers shown — it's all algebra, with the letters hidden too.

See [`docs/DESIGN.md`](docs/DESIGN.md) for the full architecture and the
researched reward/feel playbook.

## How it works

An angle is **solved** only when the linear system of applied theorem-equations
*uniquely determines* it (reduced row echelon form over exact BigInt rationals).
Never "two numbers look similar". Any solution path that reaches a determined
system opens the lock.

```
src/lib/engine/   the deduction engine (framework-free, fully tested)
  fraction.ts       exact rational arithmetic
  linear-system.ts  RREF + determinacy test  ← defines "solved"
  puzzle.ts         figure model + structural predicates (recognition)
  theorems.ts       skeleton keys: matcher + injected equation(s)
  game.ts           Lock: apply keys, check lock-open
  validate.ts       ground-truth guard + solvability validator
  levels.ts         hand-authored level progression
src/lib/render/   puzzle -> SVG primitives (each angle its own element)
src/lib/components/GameScreen.svelte   the interactive board
src/App.svelte    room map, play, reward (win a new key) flow
```

## Develop

```bash
npm install
npm run dev      # play locally
npm test         # run the engine + level tests
npm run check    # typecheck
npm run build    # production build (-> dist/, deploy to itch.io)
```

## Status

Engine complete and tested (11/11). Six playable rooms with key progression
(Right-Angle → Triangle → Mirror → Double → Balance). Next: juice pass
(particles, sound, room transitions), then Spotify + mobile/itch packaging.
