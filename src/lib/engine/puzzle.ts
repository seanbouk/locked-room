// The geometric description of a lock (a circle-theorem puzzle).
//
// Coordinates are exact enough to draw the figure and to decide *structural*
// predicates (is this point on the circle? are these two points a diameter?).
// They are NEVER shown to the player and never used to decide whether an angle
// is "solved" — that is the LinearSystem's job. Coordinates only answer "does
// this theorem geometrically apply here?", which is a property of the fixed
// figure, so a small tolerance is appropriate.

export interface Point {
  id: string;
  x: number;
  y: number;
}

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

export type SegmentKind = 'chord' | 'radius' | 'tangent' | 'line';

export interface Segment {
  a: string; // point id
  b: string; // point id
  kind: SegmentKind;
}

/** A marked angle: the angle at `vertex` between rays vertex->from and vertex->to. */
export interface Angle {
  id: string;
  vertex: string;
  from: string;
  to: string;
}

export interface Puzzle {
  circle: Circle;
  points: Point[];
  segments: Segment[];
  angles: Angle[];
  /** Angle ids known from the start (their value is fixed but never displayed). */
  givens: string[];
  /** Angle ids the player must determine to open the lock. */
  targets: string[];
  /** Skeleton keys available on this level. */
  keys: string[];
}

const EPS = 1e-6;

export function point(p: Puzzle, id: string): Point {
  const pt = p.points.find((q) => q.id === id);
  if (!pt) throw new Error(`unknown point ${id}`);
  return pt;
}

/** Exact-degree measure of a marked angle, from the figure's ground truth. */
export function trueMeasureDeg(p: Puzzle, a: Angle): number {
  const v = point(p, a.vertex);
  const f = point(p, a.from);
  const t = point(p, a.to);
  const a1 = Math.atan2(f.y - v.y, f.x - v.x);
  const a2 = Math.atan2(t.y - v.y, t.x - v.x);
  let d = Math.abs(a1 - a2) * (180 / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

export function onCircle(p: Puzzle, id: string): boolean {
  const pt = point(p, id);
  const dx = pt.x - p.circle.cx;
  const dy = pt.y - p.circle.cy;
  return Math.abs(Math.hypot(dx, dy) - p.circle.r) < EPS * Math.max(1, p.circle.r);
}

export function isCentre(p: Puzzle, id: string): boolean {
  const pt = point(p, id);
  return Math.abs(pt.x - p.circle.cx) < EPS && Math.abs(pt.y - p.circle.cy) < EPS;
}

/** Are A and B endpoints of a diameter (i.e. the centre is their midpoint)? */
export function isDiameter(p: Puzzle, aId: string, bId: string): boolean {
  if (!onCircle(p, aId) || !onCircle(p, bId)) return false;
  const a = point(p, aId);
  const b = point(p, bId);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return Math.abs(mx - p.circle.cx) < EPS * Math.max(1, p.circle.r) &&
    Math.abs(my - p.circle.cy) < EPS * Math.max(1, p.circle.r);
}

export function hasSegment(p: Puzzle, x: string, y: string): boolean {
  return p.segments.some(
    (s) => (s.a === x && s.b === y) || (s.a === y && s.b === x),
  );
}

/** The (unordered) chord a marked angle "looks at": its two non-vertex points. */
export function subtendedChord(a: Angle): [string, string] {
  return a.from < a.to ? [a.from, a.to] : [a.to, a.from];
}

/**
 * Given that exactly one of an angle's rays satisfies `pred`, return the other
 * ray's point id. Returns null if zero or both rays satisfy `pred`.
 */
export function otherRay(a: Angle, pred: (id: string) => boolean): string | null {
  const pf = pred(a.from);
  const pt = pred(a.to);
  if (pf && !pt) return a.to;
  if (pt && !pf) return a.from;
  return null;
}

/** Which side of line PQ does point R fall on? Sign of the cross product. */
export function sideOfLine(p: Puzzle, pId: string, qId: string, rId: string): number {
  const P = point(p, pId);
  const Q = point(p, qId);
  const R = point(p, rId);
  const cross = (Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x);
  if (Math.abs(cross) < EPS) return 0;
  return cross > 0 ? 1 : -1;
}
