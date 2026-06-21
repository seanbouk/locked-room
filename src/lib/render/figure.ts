// Turns a Puzzle (maths coordinates, y-up, centred at origin) into drawable
// SVG primitives (screen coordinates, y-down). Kept pure and separate from the
// Svelte view so the geometry is easy to reason about and test.
//
// Each marked angle becomes its own wedge <path> — an independent element we
// can later explode / glow / shine light through, per the design's "fields".

import type { Puzzle, Point, Segment } from '../engine/puzzle';
import { point as lookup } from '../engine/puzzle';

export interface Drawn {
  viewBox: string;
  circle: { cx: number; cy: number; r: number };
  segments: Array<{
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    kind: string;
    // Perpendicular offsets (svg units) for the bevel lips of a fine cut: the
    // highlight lip sits on the side facing the top-left light, the shadow lip
    // opposite. Each line is drawn as two thin strokes at these offsets.
    hi: { x: number; y: number };
    sh: { x: number; y: number };
  }>;
  points: Array<{ id: string; x: number; y: number; lx: number; ly: number }>;
  angles: Array<{
    id: string;
    vertex: string;
    wedge: string;
    ix: number;
    iy: number;
    vx: number;
    vy: number;
  }>;
}

const WEDGE_R = 26;

// Maths -> screen: keep x, flip y so the figure looks the way it's described.
const sx = (p: Point) => p.x;
const sy = (p: Point) => -p.y;

function norm(dx: number, dy: number): [number, number] {
  const m = Math.hypot(dx, dy) || 1;
  return [dx / m, dy / m];
}

const BEVEL = 0.95; // half-gap between a cut's two bevel lips, in svg units

/** Offsets for the highlight/shadow lips of a fine cut, lit from the top-left. */
export function bevelOffsets(x1: number, y1: number, x2: number, y2: number) {
  // Normal to the line.
  let [nx, ny] = norm(-(y2 - y1), x2 - x1);
  // Point the highlight lip toward the top-left (negative x and y in screen space).
  if (nx + ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { hi: { x: nx * BEVEL, y: ny * BEVEL }, sh: { x: -nx * BEVEL, y: -ny * BEVEL } };
}

export function drawPuzzle(p: Puzzle): Drawn {
  const c = p.circle;
  const cx = c.cx;
  const cy = -c.cy;

  const segments = p.segments.map((s: Segment) => {
    const a = lookup(p, s.a);
    const b = lookup(p, s.b);
    const [x1, y1, x2, y2] = [sx(a), sy(a), sx(b), sy(b)];
    return { id: `${s.a}-${s.b}`, x1, y1, x2, y2, kind: s.kind, ...bevelOffsets(x1, y1, x2, y2) };
  });

  const points = p.points.map((pt) => {
    // Push the label radially outward from the circle centre.
    const [ux, uy] = norm(sx(pt) - cx, sy(pt) - cy);
    return { id: pt.id, x: sx(pt), y: sy(pt), lx: sx(pt) + ux * 16, ly: sy(pt) + uy * 16 };
  });

  const angles = p.angles.map((a) => {
    const v = lookup(p, a.vertex);
    const f = lookup(p, a.from);
    const t = lookup(p, a.to);
    const vx = sx(v);
    const vy = sy(v);
    const [fx, fy] = norm(sx(f) - vx, sy(f) - vy);
    const [tx, ty] = norm(sx(t) - vx, sy(t) - vy);

    const a0 = Math.atan2(fy, fx);
    let delta = Math.atan2(ty, tx) - a0;
    // Normalise to (-PI, PI] so we always draw the marked (non-reflex) angle.
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    const sweep = delta > 0 ? 1 : 0;

    const p0x = vx + fx * WEDGE_R;
    const p0y = vy + fy * WEDGE_R;
    const p1x = vx + tx * WEDGE_R;
    const p1y = vy + ty * WEDGE_R;
    const wedge = `M ${vx} ${vy} L ${p0x} ${p0y} A ${WEDGE_R} ${WEDGE_R} 0 0 ${sweep} ${p1x} ${p1y} Z`;

    // Indicator point: along the angle bisector, a bit inside the wedge.
    const bis = a0 + delta / 2;
    const ix = vx + Math.cos(bis) * WEDGE_R * 0.6;
    const iy = vy + Math.sin(bis) * WEDGE_R * 0.6;

    return { id: a.id, vertex: a.vertex, wedge, ix, iy, vx, vy };
  });

  return {
    // r=100 circle in a 250-wide box => the lock fills ~80% of the board width.
    // The box is 1:2.2 (tall) so the steel doors run the full height of a
    // portrait screen, with the lock centred between them.
    viewBox: '-125 -275 250 550',
    circle: { cx, cy, r: c.r },
    segments,
    points,
    angles,
  };
}
