// A tiny Verlet chain — the physics for a multi-part key's "loose end".
//
// Bead 0 is pinned to the angle the key first latched onto; the last bead is
// the handle the player drags toward the next angle. While the handle is held
// it's pinned to the pointer; when released it sags under gravity. Operates in
// SVG user units (same space the figure is drawn in).

export interface Bead {
  x: number;
  y: number;
  px: number;
  py: number;
}

export const SEG = 15; // rest length between beads
export const BEADS = 6;

const GRAVITY = 0.35;
const FRICTION = 0.96;
const ITER = 16;
const BOUND = 158; // keep the chain inside the circle's viewBox so it stays grabbable

/** Spawn a chain hanging from the anchor, drifting toward `toward` (the centre). */
export function makeRope(ax: number, ay: number, toward: { x: number; y: number }): Bead[] {
  let dx = toward.x - ax;
  let dy = toward.y - ay;
  const m = Math.hypot(dx, dy) || 1;
  dx /= m;
  dy /= m;
  const beads: Bead[] = [];
  for (let i = 0; i < BEADS; i++) {
    const x = ax + dx * SEG * i;
    const y = ay + dy * SEG * i;
    beads.push({ x, y, px: x, py: y });
  }
  return beads;
}

function clamp(v: number) {
  return Math.max(-BOUND, Math.min(BOUND, v));
}

/** Step the chain. `anchor`/`handle` pin bead 0 / the last bead when given; pass
 *  null to free that end (so a released key sags or falls). `opts.bound` keeps
 *  the beads inside the viewBox (true while in play); pass false to let the chain
 *  fall off-screen. `opts.gravity` overrides the per-step pull (a heavier value
 *  flings a failed key off faster). */
export function stepRope(
  beads: Bead[],
  anchor: { x: number; y: number } | null,
  handle: { x: number; y: number } | null,
  opts: { bound?: boolean; gravity?: number } = {},
) {
  const last = beads.length - 1;
  const bound = opts.bound ?? true;
  const gravity = opts.gravity ?? GRAVITY;
  const lim = (v: number) => (bound ? clamp(v) : v);

  // Verlet integration for free beads (a pinned end is skipped).
  for (let i = 0; i < beads.length; i++) {
    if (anchor && i === 0) continue;
    if (handle && i === last) continue;
    const b = beads[i];
    const vx = (b.x - b.px) * FRICTION;
    const vy = (b.y - b.py) * FRICTION;
    b.px = b.x;
    b.py = b.y;
    b.x = lim(b.x + vx);
    b.y = lim(b.y + vy + gravity);
  }

  // Distance constraints, re-pinning the fixed ends each pass.
  for (let k = 0; k < ITER; k++) {
    if (anchor) {
      beads[0].x = anchor.x;
      beads[0].y = anchor.y;
    }
    if (handle) {
      beads[last].x = handle.x;
      beads[last].y = handle.y;
    }
    for (let i = 0; i < last; i++) {
      const a = beads[i];
      const b = beads[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      const diff = ((d - SEG) / d) * 0.5;
      const ox = dx * diff;
      const oy = dy * diff;
      a.x += ox;
      a.y += oy;
      b.x -= ox;
      b.y -= oy;
    }
  }
  if (anchor) {
    beads[0].x = anchor.x;
    beads[0].y = anchor.y;
  }
  if (handle) {
    beads[last].x = handle.x;
    beads[last].y = handle.y;
  }
}
