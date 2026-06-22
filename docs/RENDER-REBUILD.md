# Render rebuild: "sliced plate" architecture

> Handoff notes (written when context was nearly full). The DECISION is made:
> rebuild the **render layer** so the lock is made of **real geometric pieces with
> real kerf gaps**, not paint on a continuous surface. Engine/levels/interaction
> stay. Read this fully before starting.

## Why we're switching

The lock is currently **paint, not pieces**: a continuous steel surface with cuts
and bevels painted on top via layered fills, SVG filters, `mix-blend-mode`, and
draw order. Every animation that wants pieces to move independently (recede,
holes, god-rays-through-gaps, the door swing) fights this. Recurring symptoms,
all the same root cause:

- brass sections layer on top of things they should drop behind;
- a whole-lock recede drags the outer bevel with it (the bevel is painted inside
  the group, so it scales with it);
- lines float over a sunk node's hole;
- the grey-cover regression (see gotcha #1).

User's words: *"we'll always be chasing this effect otherwise."* Correct. Polish
is about to get heavy, so we fix the foundation first.

## DO NOT TOUCH — engine, levels, interaction (all work, 13 tests green)

- `src/lib/engine/`: `fraction.ts` (exact BigInt rationals), `linear-system.ts`
  (RREF + determinacy = the definition of "solved"), `puzzle.ts` (figure model +
  geometric predicates), `theorems.ts` (skeleton keys = match() + equations();
  semicircle / triangle-sum / same-segment / angle-at-centre / isosceles-radii),
  `game.ts` (`Lock`: apply / probe / availablePlacements / isOpen), `validate.ts`
  (truthFilter + isSolvable), `levels.ts` (6 levels), `*.test.ts`.
- The **interaction** logic in `GameScreen.svelte` (drag keys via pointer events,
  triangle nearest-claim, 2-part physics chain using `render/rope.ts`, the
  rule-ordering gate via `Lock.probe`). It reads from `drawn.angles`:
  - `vx, vy` per angle → hit-target circles + chain anchor positions,
  - `vertex` per angle → triangle matching.
  **The new render MUST still expose `drawn.angles` with `id, vertex, vx, vy`.**

## Current render (what we're replacing)

- One component does everything: `src/lib/components/GameScreen.svelte`.
- `src/lib/render/figure.ts` → `drawPuzzle(puzzle)` returns: `viewBox` =
  `'-125 -175 250 550'` (1:2.2 tall), `circle {cx:0, cy:0, r:100}`, `segments`
  (`{x1,y1,x2,y2,kind,hi,sh}`), `points` (`{id,x,y,lx,ly}`), `angles`
  (`{id,vertex,vx,vy,sector,arc}`). Exports `PIN_R = 16`.
- Coords: maths y-up → screen y-down (`sx=x, sy=-y`). **Circle centre is the SVG
  user origin (0,0)** — this matters for transforms. The disc sits in the UPPER
  THIRD (origin is 175 down from the viewBox top = ~32% of 550).
- Layers today: doors steel rect (`#steel`, light-top→dark-bottom) + brushed
  overlay (feTurbulence) + the vertical SEAM (manual offset "lip" strokes +
  kerf; the disc covers its middle) → then `<g class="lock" transform={lockXf}>`
  = disc (`#disc` radial) + `discShade` vignette (masked off pins via
  `shadeMask`) + nodes + chords (relief+kerf) + outer circle (relief+kerf) +
  line-glow + god rays → then HTML HUD overlays (`.hud-top` title, `.hud-bottom`
  keys pinned at `top:51%`).
- **Engraving = paint:** each cut is a white stroke pushed through filter
  `#relief` (blur SourceAlpha → `feDiffuseLighting surfaceScale -7 azimuth 225`
  → componentTransfer compress, `color-interpolation-filters="sRGB"`) inside a
  `<g class="relief">` with `mix-blend-mode: overlay`, PLUS a thin near-black
  `.kerf` stroke. Overlay paints the bevel onto the steel; kerf is the black line.

## GOTCHAS (hard-won — do not relearn these)

1. **`mix-blend-mode` + any isolating ancestor = disaster.** A `<g>` with `mask`,
   `filter`, `opacity<1`, or a `transform` creates a stacking context that
   **isolates** descendant blend modes — they then blend against *transparent*,
   so the overlay-relief's opaque filter output becomes a flat grey layer that
   covers everything. This caused the grey-background regression. The sliced
   architecture should AVOID overlay-paint for cuts entirely (use real shapes +
   real gaps), which sidesteps this whole class.
2. **SVG `transform-origin` is unreliable.** To scale/rotate about the circle
   centre, use the SVG `transform` ATTRIBUTE — since the centre is the user
   origin, plain `scale(k)` / `rotate(d)` is about the centre. `scale(0.9)`
   recedes toward centre. CSS `transition: transform` DOES animate attribute
   changes (verified in Chrome).
3. `transform="scale(1)"` still makes a stacking context → use `''`/omit for none.
4. Real bounce ("ball settling") needs CSS `linear()` easing (the Penner
   easeOutBounce curve). `cubic-bezier` cannot multi-bounce.

## TARGET architecture

1. **Arrangement (the geometry):** `src/lib/render/arrangement.ts` (NEW, pure).
   Compute the planar subdivision of: the circle boundary + the chords (+ the
   seam splitting the door region). Produce **faces**.
   - vertices = puzzle points on the circle + interior chord∩chord intersections;
   - edges = chord sub-segments (split at intersections) + circular arcs between
     consecutive on-circle points;
   - faces = trace via half-edge/DCEL or angular "next edge" walk;
   - plus the two door regions (left/right of the seam, outside the circle).
   **DE-RISK THIS FIRST** with unit tests on all 6 levels (assert face counts,
   faces tile the disc with no overlap/gap, arcs handled). This is the "corner"
   risk flagged at project start. No rendering until this is solid.

2. **Render each face as a real steel piece**, inset slightly (toward its
   centroid, or edge-offset) so the **kerfs are genuine dark gaps** (the void
   shows between pieces). Each piece's edge is **bevelled** (chamfer lit
   top-left) — done per-piece (inset light/shadow lip strokes are cheap and
   dodge the blend-isolation trap; or a per-piece lighting filter for richer
   chamfer — decide during build).

3. **Nodes** = real pin pieces seated in holes. **Doors** = left/right pieces
   (needed for the swing).

4. **Animation becomes trivial & correct:** recede a node → move that piece
   back; neighbours and their bevels stay put (the outer bevel belongs to the
   neighbour, so it can't move — fixes the current bug). God rays pour through
   the real gaps. Door swing = rotate the two door pieces. No blend/z-order
   trickery.

## Keep (don't rebuild these)

- The transition state machine: `phase` (`intro→play→allBack→circleBack→rotate→
  flash`), `HB=640ms`, `nodeBack(id) = transitioning || (solved && !given)`,
  the whiteout flash, the bounce `linear()` easing.
- The god rays (cones from centre through open holes, screen-blend, perlin
  luminance mask) and faint line glow — but they now shine through REAL gaps.
- viewBox / coord system / tall 1:2.2 layout / HUD overlays.
- The approved palette + look (below).

## Approved look (the target the user signed off on)

- Brushed steel doors, light-top→dark-bottom; vertical seam = the gap between two
  doors, with the lock straddling it.
- Cuts = fine machined incisions: bevel either side, lit from top-left, sharp
  near-black centre.
- **Given** node = solid brass disc. **Needed** = steel ring + a brass ARC on the
  angle (steel for the rest). **Solved** = the angle's slice fills brass, then the
  inner content recedes into a **black hole** (outer bevel/rim stays fixed).
- Recede = shrink toward the centre (vanishing point), ~90%, with bounce easing.
- Transition heartbeat (~0.64s each, evenly spaced): solved node sets back → all
  nodes back → whole lock back → rotate 90° clockwise → flash to white → next
  level. Faint light off every line; god rays through the open black holes.
- **Door swing — NOT YET BUILT:** the board splits at the seam into two halves
  that swing toward the viewer (hinged at the outer edges), after the rotate,
  before the flash. The sliced architecture is what makes this clean.

## Suggested build order

1. `arrangement.ts` + tests (faces for all 6 levels). No rendering.
2. New `figure.ts` output: faces (paths + bevel data) alongside the still-needed
   per-angle `{id,vertex,vx,vy}` for interaction.
3. Render static board from faces (steel pieces + real kerf gaps + bevels +
   brass on the right faces/nodes). Match the approved look.
4. Re-wire the transition (recede/rotate) to move pieces; re-add rays through
   gaps + whiteout.
5. Build the door swing (two real door pieces, CSS/SVG 3D rotateY toward viewer).
6. Re-verify interaction (drag/chain/triangle) against the new render.
