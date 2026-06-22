// Turns a Puzzle (maths coordinates, y-up, centred at origin) into drawable
// SVG primitives (screen coordinates, y-down). Kept pure and separate from the
// Svelte view so the geometry is easy to reason about and test.
//
// Each marked angle becomes its own wedge <path> — an independent element we
// can later explode / glow / shine light through, per the design's "fields".

import type { Puzzle, Point, Segment } from '../engine/puzzle';
import { point as lookup } from '../engine/puzzle';
import { computeArrangement, type ArrEdge, type Face } from './arrangement';

/** A real plate piece: the disc carved into the faces the cuts make. The `inset`
 *  path is pulled back from every internal cut so the kerfs are genuine gaps;
 *  boundary arcs (the lock's rim) are left flush. */
export interface DrawnFace {
  id: string;
  /** Full face boundary in screen coords (arcs as SVG A commands). */
  path: string;
  /** Kerf-gapped piece in screen coords — what we render as the steel tile. */
  inset: string;
  /** Centroid in screen coords (for lighting / sorting / brass decisions). */
  cx: number;
  cy: number;
  /** Area magnitude in screen units (largest piece is usually the field). */
  area: number;
}

export interface Drawn {
  viewBox: string;
  circle: { cx: number; cy: number; r: number };
  /** The disc sliced into real pieces (sliced-plate render). */
  faces: DrawnFace[];
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
    vx: number;
    vy: number;
    /** filled pie slice at the pin radius (for a solved angle) */
    sector: string;
    /** just the outer arc (for a needed angle — no radii) */
    arc: string;
    /**
     * The pin sliced into real wedge pieces by every line meeting at the vertex
     * (a little pie chart) — each an inset, kerf-gapped sector path in screen
     * coords. `marked` flags the wedge(s) inside this angle's two rays (brass).
     */
    pieces: Array<{ d: string; mid: number; marked: boolean }>;
  }>;
}

export const PIN_R = 16;

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

// ---------------------------------------------------------------------------
// Sliced-plate faces: turn arrangement faces into drawable pieces.
//
// All geometry below is done in MATHS coords (y-up, same as the arrangement),
// then converted to screen (y-down) only when emitting the path string. Bounded
// faces are CCW in maths, so the interior is on the LEFT of each edge and the
// inward normal of a cut is dir rotated +90deg.
// ---------------------------------------------------------------------------

/** Half the kerf: each of two neighbouring pieces pulls back this far from the
 *  shared cut, so the visible gap between them is ~2x this (≈ current kerf). */
const GAP = 0.6;

interface MPt { x: number; y: number }

function sub(a: MPt, b: MPt): MPt { return { x: a.x - b.x, y: a.y - b.y }; }
function len(a: MPt): number { return Math.hypot(a.x, a.y) || 1; }

/** Intersection of line (p + t·d) and line (q + s·e); null if ~parallel. */
function lineLine(p: MPt, d: MPt, q: MPt, e: MPt): MPt | null {
  const denom = d.x * e.y - d.y * e.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / denom;
  return { x: p.x + t * d.x, y: p.y + t * d.y };
}

/** Intersection of line (p + t·d) with circle (centre C, radius R) nearest `near`. */
function lineCircle(p: MPt, d: MPt, C: MPt, R: number, near: MPt): MPt | null {
  const fx = p.x - C.x;
  const fy = p.y - C.y;
  const a = d.x * d.x + d.y * d.y;
  const b = 2 * (fx * d.x + fy * d.y);
  const cc = fx * fx + fy * fy - R * R;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b + sq) / (2 * a);
  const t2 = (-b - sq) / (2 * a);
  const c1 = { x: p.x + t1 * d.x, y: p.y + t1 * d.y };
  const c2 = { x: p.x + t2 * d.x, y: p.y + t2 * d.y };
  return len(sub(c1, near)) <= len(sub(c2, near)) ? c1 : c2;
}

/** Inward-offset reference point + direction for a straight cut edge of a CCW face. */
function offsetSeg(e: ArrEdge): { p: MPt; d: MPt } {
  const dir = sub(e.to, e.from);
  const m = len(dir);
  const d = { x: dir.x / m, y: dir.y / m };
  const nrm = { x: -d.y, y: d.x }; // left normal = interior side for CCW
  return { p: { x: e.from.x + nrm.x * GAP, y: e.from.y + nrm.y * GAP }, d };
}

/** The inset corner at the START of edge `i` (between edge i-1 and edge i). */
function insetCorner(edges: ArrEdge[], i: number, C: MPt): MPt {
  const n = edges.length;
  const prev = edges[(i - 1 + n) % n];
  const cur = edges[i];
  const P = { x: cur.from.x, y: cur.from.y }; // original shared vertex
  // Arcs are the rim and aren't pulled in, so any corner touching an arc lands
  // on the full-radius circle; corners between two cuts are line∩line.
  if (cur.kind === 'seg' && prev.kind === 'seg') {
    const a = offsetSeg(prev);
    const b = offsetSeg(cur);
    return lineLine(a.p, a.d, b.p, b.d) ?? P;
  }
  if (cur.kind === 'seg' && prev.kind === 'arc') {
    const b = offsetSeg(cur);
    return lineCircle(b.p, b.d, C, cur.r ?? len(sub(P, C)), P) ?? P;
  }
  if (cur.kind === 'arc' && prev.kind === 'seg') {
    const a = offsetSeg(prev);
    return lineCircle(a.p, a.d, C, cur.r ?? len(sub(P, C)), P) ?? P;
  }
  return P; // arc->arc: the rim point itself
}

/** Maths angle of P about centre C. */
function angOf(P: MPt, C: MPt): number {
  return Math.atan2(P.y - C.y, P.x - C.x);
}

/** SVG arc flags for travelling start->end along the circle in the edge's sense. */
function arcFlags(start: MPt, end: MPt, C: MPt, ccw: boolean): { large: number; sweep: number } {
  const a0 = angOf(start, C);
  const a1 = angOf(end, C);
  // Swept maths angle in the traversal direction, in (0, 2pi].
  let delta = ccw ? a1 - a0 : a0 - a1;
  while (delta <= 0) delta += Math.PI * 2;
  while (delta > Math.PI * 2) delta -= Math.PI * 2;
  // Screen flips y, so maths-CCW reads as SVG sweep 0 (and CW as sweep 1).
  return { large: delta > Math.PI ? 1 : 0, sweep: ccw ? 0 : 1 };
}

/** Build a screen-space SVG path from a loop of corner points + their edges. */
function pathFrom(corners: MPt[], edges: ArrEdge[], C: MPt): string {
  const S = (p: MPt) => `${p.x.toFixed(2)} ${(-p.y).toFixed(2)}`;
  let out = `M ${S(corners[0])}`;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const start = corners[i];
    const end = corners[(i + 1) % corners.length];
    if (e.kind === 'arc') {
      const r = e.r ?? len(sub(end, C));
      const { large, sweep } = arcFlags(start, end, C, !!e.ccw);
      out += ` A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} ${sweep} ${S(end)}`;
    } else {
      out += ` L ${S(end)}`;
    }
  }
  return out + ' Z';
}

function drawnFaces(p: Puzzle): DrawnFace[] {
  const arr = computeArrangement(p);
  const C: MPt = { x: arr.circle.cx, y: arr.circle.cy };
  const bounded = arr.faces.filter((f) => !f.outer);
  return bounded.map((f: Face, idx: number) => {
    const full = f.edges.map((e) => ({ x: e.from.x, y: e.from.y }));
    const inset = f.edges.map((_, i) => insetCorner(f.edges, i, C));
    return {
      id: `face${idx}`,
      path: pathFrom(full, f.edges, C),
      inset: pathFrom(inset, f.edges, C),
      cx: f.centroid.x,
      cy: -f.centroid.y,
      area: Math.abs(f.area),
    };
  });
}

// ---------------------------------------------------------------------------
// Pin pieces: the pin is sliced into wedges by every line meeting at its vertex
// (a little pie chart), each wedge inset so the kerfs are real gaps — exactly
// like the disc. Geometry is done directly in SCREEN coords (vx,vy already
// flipped); angles are screen-space atan2.
// ---------------------------------------------------------------------------

/** Screen-space angle of the ray from vertex V to point O. */
function screenAngle(vx: number, vy: number, o: Point): number {
  return Math.atan2(-o.y - vy, o.x - vx);
}

function norm2piF(a: number): number {
  let x = a % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x;
}

/** Inset wedge path for a pin sector spanning screen angles a0..a1 (a1 > a0). */
function insetSectorPath(vx: number, vy: number, R: number, a0: number, a1: number, gap: number): string {
  const V: MPt = { x: vx, y: vy };
  const u0: MPt = { x: Math.cos(a0), y: Math.sin(a0) };
  const u1: MPt = { x: Math.cos(a1), y: Math.sin(a1) };
  // Normals pointing INTO the sector (toward the interior angular span).
  const n0: MPt = { x: -Math.sin(a0), y: Math.cos(a0) };
  const n1: MPt = { x: Math.sin(a1), y: -Math.cos(a1) };
  const P0: MPt = { x: vx + gap * n0.x, y: vy + gap * n0.y };
  const P1: MPt = { x: vx + gap * n1.x, y: vy + gap * n1.y };
  const apex = lineLine(P0, u0, P1, u1) ?? V;
  const Rin = R - gap;
  const ref0: MPt = { x: vx + u0.x * R, y: vy + u0.y * R };
  const ref1: MPt = { x: vx + u1.x * R, y: vy + u1.y * R };
  const C0 = lineCircle(P0, u0, V, Rin, ref0) ?? ref0;
  const C1 = lineCircle(P1, u1, V, Rin, ref1) ?? ref1;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const f = (n: number) => n.toFixed(2);
  // sweep 1: increasing screen angle (clockwise in y-down space)
  return `M ${f(apex.x)} ${f(apex.y)} L ${f(C0.x)} ${f(C0.y)} A ${f(Rin)} ${f(Rin)} 0 ${large} 1 ${f(C1.x)} ${f(C1.y)} Z`;
}

/** Is screen angle `mid` inside the (non-reflex) span from `fromA` to `toA`? */
function angleInSpan(mid: number, fromA: number, toA: number): boolean {
  let d = toA - fromA;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  const lo = d >= 0 ? fromA : fromA + d;
  const hi = d >= 0 ? fromA + d : fromA;
  let m = mid;
  while (m < lo) m += 2 * Math.PI;
  while (m >= lo + 2 * Math.PI) m -= 2 * Math.PI;
  return m >= lo - 1e-9 && m <= hi + 1e-9;
}

// --- small geometry helpers for the curved pin slicing ---
function uvec(a: number): MPt {
  return { x: Math.cos(a), y: Math.sin(a) };
}
function normPiF(a: number): number {
  let x = a;
  while (x <= -Math.PI) x += 2 * Math.PI;
  while (x > Math.PI) x -= 2 * Math.PI;
  return x;
}
function dist(a: MPt, b: MPt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function angAround(C: MPt, P: MPt): number {
  return Math.atan2(P.y - C.y, P.x - C.x);
}
/** Circle∩circle nearest `near` (fallback to `near` if they don't meet). */
function circleCircle(c1: MPt, r1: number, c2: MPt, r2: number, near: MPt): MPt {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return near;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const bx = c1.x + (a * dx) / d;
  const by = c1.y + (a * dy) / d;
  const p1 = { x: bx - (dy / d) * h, y: by + (dx / d) * h };
  const p2 = { x: bx + (dy / d) * h, y: by - (dx / d) * h };
  return dist(p1, near) <= dist(p2, near) ? p1 : p2;
}
/** Append samples of arc (centre C, radius r) from angle a0 to a1 (i = 1..steps). */
function pushArc(pts: MPt[], C: MPt, r: number, a0: number, a1: number, steps: number): void {
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push({ x: C.x + r * Math.cos(a), y: C.y + r * Math.sin(a) });
  }
}
function polyPath(pts: MPt[]): string {
  let s = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) s += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  return s + ' Z';
}
const ARC_STEP = Math.PI / 14; // ~13° between arc samples

/**
 * Slice the pin at vertex `vid` into kerf-gapped wedge pieces by every line that
 * meets it. Chords slice the disc-facing half into pie sectors; the main circle
 * (for an on-circle pin) cuts across along its real ARC, leaving the bulge that
 * sticks out past the rim as one outer piece. Each edge is inset by GAP so the
 * kerfs are genuine black gaps, exactly like the disc.
 */
function pinPieces(
  p: Puzzle,
  vid: string,
  vx: number,
  vy: number,
  fromA: number,
  toA: number,
  cx: number,
  cy: number,
  rDisc: number,
): Array<{ d: string; mid: number; marked: boolean }> {
  const V: MPt = { x: vx, y: vy };
  const C: MPt = { x: cx, y: cy };
  const R = PIN_R;
  const g = GAP;
  const Rin = R - g;

  // Directions of every chord/radius meeting the vertex.
  const chord: number[] = [];
  for (const s of p.segments) {
    const other = s.a === vid ? s.b : s.b === vid ? s.a : null;
    if (other) chord.push(norm2piF(screenAngle(vx, vy, lookup(p, other))));
  }
  chord.sort((m, n) => m - n);
  const onCircle = Math.abs(dist(V, C) - rDisc) < 0.5;

  const pieces: Array<{ d: string; mid: number; marked: boolean }> = [];
  const marked = (mid: number) => angleInSpan(norm2piF(mid), fromA, toA);

  if (!onCircle) {
    // Interior pin (e.g. the centre): the chords slice it into straight sectors.
    const uniq: number[] = [];
    for (const a of chord) if (!uniq.length || Math.abs(a - uniq[uniq.length - 1]) > 1e-4) uniq.push(a);
    if (uniq.length < 2) {
      const r = Rin;
      const d = `M ${(vx + r).toFixed(2)} ${vy.toFixed(2)} A ${r} ${r} 0 1 1 ${(vx - r).toFixed(2)} ${vy.toFixed(2)} A ${r} ${r} 0 1 1 ${(vx + r).toFixed(2)} ${vy.toFixed(2)} Z`;
      return [{ d, mid: (fromA + toA) / 2, marked: true }];
    }
    for (let i = 0; i < uniq.length; i++) {
      const a0 = uniq[i];
      const a1 = i + 1 < uniq.length ? uniq[i + 1] : uniq[0] + 2 * Math.PI;
      const mid = (a0 + a1) / 2;
      pieces.push({ d: insetSectorPath(vx, vy, R, a0, a1, g), mid, marked: marked(mid) });
    }
    return pieces;
  }

  // On-circle pin: the rim runs through the vertex. The disc-facing half spans
  // the tangent directions; chords subdivide it; the rim arc is the curved base.
  const dirToO = Math.atan2(cy - vy, cx - vx);
  const innerStart = dirToO - Math.PI / 2;
  const innerEnd = dirToO + Math.PI / 2;
  const inner = chord
    .map((a) => {
      let x = a;
      while (x < innerStart) x += 2 * Math.PI;
      while (x > innerStart + 2 * Math.PI) x -= 2 * Math.PI;
      return x;
    })
    .filter((a) => a > innerStart + 1e-3 && a < innerEnd - 1e-3)
    .sort((m, n) => m - n);

  // Inset edge for a chord-ray boundary at `ang`, pulled toward the sector (mid).
  const lineEdge = (ang: number, mid: number) => {
    const d = uvec(ang);
    let n = { x: -Math.sin(ang), y: Math.cos(ang) };
    if (normPiF(mid - ang) < 0) n = { x: -n.x, y: -n.y };
    return { p: { x: vx + g * n.x, y: vy + g * n.y }, d };
  };
  // Inset radius for the rim cut, pulled toward the sector interior (mid side).
  const rimR = (mid: number) => (dist({ x: vx + 0.5 * Math.cos(mid), y: vy + 0.5 * Math.sin(mid) }, C) < rDisc ? rDisc - g : rDisc + g);

  type Bnd = { ang: number; rim: boolean };
  const bnds: Bnd[] = [
    { ang: innerStart, rim: true },
    ...inner.map((a) => ({ ang: a, rim: false })),
    { ang: innerEnd, rim: true },
  ];

  for (let i = 0; i + 1 < bnds.length; i++) {
    const low = bnds[i];
    const high = bnds[i + 1];
    const mid = (low.ang + high.ang) / 2;
    const rr = rimR(mid);
    // apex (near the vertex) = intersection of the two inset edges
    let apex: MPt;
    if (!low.rim && !high.rim) {
      const el = lineEdge(low.ang, mid);
      const eh = lineEdge(high.ang, mid);
      apex = lineLine(el.p, el.d, eh.p, eh.d) ?? V;
    } else {
      const line = lineEdge((low.rim ? high : low).ang, mid);
      apex = lineCircle(line.p, line.d, C, rr, V) ?? V;
    }
    // outer corners where each edge meets the pin rim (radius Rin)
    const refLow = { x: vx + Rin * Math.cos(low.ang), y: vy + Rin * Math.sin(low.ang) };
    const refHigh = { x: vx + Rin * Math.cos(high.ang), y: vy + Rin * Math.sin(high.ang) };
    const cLow = low.rim ? circleCircle(C, rr, V, Rin, refLow) : (lineCircle(lineEdge(low.ang, mid).p, lineEdge(low.ang, mid).d, V, Rin, refLow) ?? refLow);
    const cHigh = high.rim ? circleCircle(C, rr, V, Rin, refHigh) : (lineCircle(lineEdge(high.ang, mid).p, lineEdge(high.ang, mid).d, V, Rin, refHigh) ?? refHigh);

    const pts: MPt[] = [apex];
    if (low.rim) {
      const a0 = angAround(C, apex);
      pushArc(pts, C, rr, a0, a0 + normPiF(angAround(C, cLow) - a0), 6);
    } else pts.push(cLow);
    // pin rim, cLow -> cHigh (increasing angle, low -> high)
    {
      const a0 = angAround(V, cLow);
      let span = angAround(V, cHigh) - a0;
      while (span <= 0) span += 2 * Math.PI;
      pushArc(pts, V, Rin, a0, a0 + span, Math.max(2, Math.ceil(span / ARC_STEP)));
    }
    if (high.rim) {
      const a0 = angAround(C, cHigh);
      pushArc(pts, C, rr, a0, a0 + normPiF(angAround(C, apex) - a0), 6);
    }
    pieces.push({ d: polyPath(pts), mid, marked: marked(mid) });
  }

  // The outer bulge that sticks out past the rim: one crescent piece, bounded by
  // the pin rim (outer) and the disc rim arc (inner), no chords cross it.
  const rOut = rDisc + g;
  const refA = { x: vx + Rin * Math.cos(innerStart), y: vy + Rin * Math.sin(innerStart) };
  const refB = { x: vx + Rin * Math.cos(innerEnd), y: vy + Rin * Math.sin(innerEnd) };
  const cA = circleCircle(C, rOut, V, Rin, refA);
  const cB = circleCircle(C, rOut, V, Rin, refB);
  const outer: MPt[] = [cB];
  {
    const a0 = angAround(V, cB);
    let span = angAround(V, cA) - a0;
    while (span <= 0) span += 2 * Math.PI; // outer semicircle, away from O
    pushArc(outer, V, Rin, a0, a0 + span, Math.max(4, Math.ceil(span / ARC_STEP)));
  }
  {
    const a0 = angAround(C, cA);
    pushArc(outer, C, rOut, a0, a0 + normPiF(angAround(C, cB) - a0), 8);
  }
  pieces.push({ d: polyPath(outer), mid: dirToO + Math.PI, marked: false });

  return pieces;
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

    const p0x = vx + fx * PIN_R;
    const p0y = vy + fy * PIN_R;
    const p1x = vx + tx * PIN_R;
    const p1y = vy + ty * PIN_R;
    const sector = `M ${vx} ${vy} L ${p0x} ${p0y} A ${PIN_R} ${PIN_R} 0 0 ${sweep} ${p1x} ${p1y} Z`;
    const arc = `M ${p0x} ${p0y} A ${PIN_R} ${PIN_R} 0 0 ${sweep} ${p1x} ${p1y}`;

    const fromA = screenAngle(vx, vy, f);
    const toA = screenAngle(vx, vy, t);
    const pieces = pinPieces(p, a.vertex, vx, vy, fromA, toA, cx, cy, c.r);

    return { id: a.id, vertex: a.vertex, vx, vy, sector, arc, pieces };
  });

  return {
    // r=100 circle in a 250-wide box => the lock fills ~80% of the board width.
    // The box is 1:2.2 (tall) and the lock sits in the UPPER third (0,0 is 175
    // down from the top); the brushed steel + seam carry on down to fill the
    // screen, so the whole game clusters near the top.
    viewBox: '-125 -175 250 550',
    circle: { cx, cy, r: c.r },
    faces: drawnFaces(p),
    segments,
    points,
    angles,
  };
}
