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
  segments: Array<{ id: string; x1: number; y1: number; x2: number; y2: number; kind: string }>;
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

export function drawPuzzle(p: Puzzle): Drawn {
  const c = p.circle;
  const cx = c.cx;
  const cy = -c.cy;

  const segments = p.segments.map((s: Segment) => {
    const a = lookup(p, s.a);
    const b = lookup(p, s.b);
    return { id: `${s.a}-${s.b}`, x1: sx(a), y1: sy(a), x2: sx(b), y2: sy(b), kind: s.kind };
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
    viewBox: '-165 -165 330 330',
    circle: { cx, cy, r: c.r },
    segments,
    points,
    angles,
  };
}
