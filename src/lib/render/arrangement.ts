// Planar subdivision of the lock's disc into real geometric FACES.
//
// This is the foundation of the "sliced plate" render: instead of painting cuts
// onto one continuous surface, we cut the disc into the actual pieces the chords
// and radii carve it into, so each piece can later be rendered as a real beveled
// shape and moved independently (recede, holes, god-rays, door swing).
//
// Pure geometry, maths coordinates (y-up, circle centred at the origin like the
// Puzzle). The Svelte/figure layer converts to screen coords (y-down) later.
//
// Algorithm: build a planar graph whose vertices are the puzzle points plus
// interior chord intersections, whose edges are the chord/radius sub-segments
// (split at intersections) plus the circular arcs between consecutive on-circle
// points, then trace faces with a half-edge ("next edge") walk. Arcs carry their
// tangent direction so they sort correctly against straight edges at a vertex.

import type { Puzzle, Segment } from '../engine/puzzle';
import { point as lookup } from '../engine/puzzle';

export interface V {
  x: number;
  y: number;
}

export interface ArrVertex extends V {
  onCircle: boolean;
  /** Puzzle point id, if this vertex is one (intersections have none). */
  pointId?: string;
}

/** A single edge of a face boundary: either a straight cut or a boundary arc. */
export interface ArrEdge {
  kind: 'seg' | 'arc';
  from: V;
  to: V;
  // Arc only — the circle it rides and which way from->to is travelled.
  cx?: number;
  cy?: number;
  r?: number;
  /** Arc: traversed counter-clockwise (increasing polar angle) from->to? */
  ccw?: boolean;
}

export interface Face {
  /** Boundary edges in order, forming a closed loop. */
  edges: ArrEdge[];
  /** Vertex indices in order (parallel to edges; edges[i] goes loop[i]->loop[i+1]). */
  loop: number[];
  /** Signed area (CCW positive). Bounded disc pieces are positive. */
  area: number;
  centroid: V;
  /** The single unbounded region outside the circle (area < 0). */
  outer: boolean;
}

export interface Arrangement {
  circle: { cx: number; cy: number; r: number };
  vertices: ArrVertex[];
  faces: Face[];
}

// Coordinates here are O(r) with r=100; intersections from float arithmetic.
const TOL = 1e-6 * 100; // merge / collinearity tolerance (~1e-4 in world units)
const ANG_SAMPLES = 48; // arc samples per full circle for area/centroid

const TAU = Math.PI * 2;

function near(a: V, b: V): boolean {
  return Math.abs(a.x - b.x) < TOL && Math.abs(a.y - b.y) < TOL;
}

/** Normalise an angle into [0, 2pi). */
function norm2pi(a: number): number {
  let x = a % TAU;
  if (x < 0) x += TAU;
  return x;
}

// ---------------------------------------------------------------------------
// Build the vertex/edge graph
// ---------------------------------------------------------------------------

interface Builder {
  circle: { cx: number; cy: number; r: number };
  vertices: ArrVertex[];
}

function addVertex(b: Builder, x: number, y: number, opts?: { pointId?: string }): number {
  for (let i = 0; i < b.vertices.length; i++) {
    if (near(b.vertices[i], { x, y })) {
      // Prefer to remember a real point id over an anonymous intersection.
      if (opts?.pointId && !b.vertices[i].pointId) b.vertices[i].pointId = opts.pointId;
      return i;
    }
  }
  const c = b.circle;
  const onCircle = Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r) < TOL;
  b.vertices.push({ x, y, onCircle, pointId: opts?.pointId });
  return b.vertices.length - 1;
}

/** Proper interior crossing of segments p1p2 and p3p4 (both params strictly inside). */
function properIntersection(p1: V, p2: V, p3: V, p4: V): V | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return null; // parallel / collinear
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  const eps = 1e-9;
  if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/** Parameter t of W projected onto segment P->Q, if W lies on it strictly between. */
function onSegmentParam(p: V, q: V, w: V): number | null {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return null;
  const cross = dx * (w.y - p.y) - dy * (w.x - p.x);
  if (Math.abs(cross) > TOL * Math.sqrt(len2)) return null; // not collinear
  const t = ((w.x - p.x) * dx + (w.y - p.y) * dy) / len2;
  if (t <= 1e-9 || t >= 1 - 1e-9) return null; // at or past an endpoint
  return t;
}

// ---------------------------------------------------------------------------
// Half-edges and face tracing
// ---------------------------------------------------------------------------

interface HE {
  from: number;
  to: number;
  twin: number;
  kind: 'seg' | 'arc';
  ccw?: boolean; // arc traversal direction from->to
  outAngle: number; // tangent direction leaving `from`
  inAngle: number; // travel direction arriving at `to`
  visited: boolean;
}

export function computeArrangement(puzzle: Puzzle): Arrangement {
  const circle = { cx: puzzle.circle.cx, cy: puzzle.circle.cy, r: puzzle.circle.r };
  const b: Builder = { circle, vertices: [] };

  // 1. Puzzle points become vertices.
  for (const pt of puzzle.points) addVertex(b, pt.x, pt.y, { pointId: pt.id });

  // Straight cuts we'll subdivide: chords, radii, lines (anything that cuts the disc).
  const cuts = puzzle.segments.filter(
    (s: Segment) => s.kind === 'chord' || s.kind === 'radius' || s.kind === 'line',
  );
  const cutPts = cuts.map((s) => [lookup(puzzle, s.a), lookup(puzzle, s.b)] as const);

  // 2. Interior intersections between cuts become vertices.
  for (let i = 0; i < cutPts.length; i++) {
    for (let j = i + 1; j < cutPts.length; j++) {
      const x = properIntersection(cutPts[i][0], cutPts[i][1], cutPts[j][0], cutPts[j][1]);
      if (x) addVertex(b, x.x, x.y);
    }
  }

  // 3. Split each cut at every vertex lying on it -> straight edges.
  const segKeys = new Set<string>();
  const segEdges: Array<{ a: number; b: number }> = [];
  const addSeg = (a: number, b: number) => {
    if (a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (segKeys.has(key)) return;
    segKeys.add(key);
    segEdges.push({ a, b });
  };
  for (const [P, Q] of cutPts) {
    const ai = addVertex(b, P.x, P.y);
    const bi = addVertex(b, Q.x, Q.y);
    const along: Array<{ t: number; idx: number }> = [
      { t: 0, idx: ai },
      { t: 1, idx: bi },
    ];
    for (let k = 0; k < b.vertices.length; k++) {
      if (k === ai || k === bi) continue;
      const t = onSegmentParam(P, Q, b.vertices[k]);
      if (t !== null) along.push({ t, idx: k });
    }
    along.sort((m, n) => m.t - n.t);
    for (let k = 0; k + 1 < along.length; k++) addSeg(along[k].idx, along[k + 1].idx);
  }

  // 4. Boundary arcs between consecutive on-circle vertices.
  const onCircleIdx = b.vertices
    .map((v, i) => ({ v, i }))
    .filter((o) => o.v.onCircle)
    .map((o) => ({
      i: o.i,
      ang: norm2pi(Math.atan2(o.v.y - circle.cy, o.v.x - circle.cx)),
    }))
    .sort((m, n) => m.ang - n.ang);

  interface ArcEdge {
    a: number; // earlier (CCW) vertex
    b: number; // later (CCW) vertex
  }
  const arcEdges: ArcEdge[] = [];
  for (let k = 0; k < onCircleIdx.length; k++) {
    const a = onCircleIdx[k];
    const c = onCircleIdx[(k + 1) % onCircleIdx.length];
    if (a.i === c.i) continue;
    arcEdges.push({ a: a.i, b: c.i });
  }

  // 5. Build half-edges.
  const hes: HE[] = [];
  const V = b.vertices;

  const radialAngle = (vi: number) =>
    Math.atan2(V[vi].y - circle.cy, V[vi].x - circle.cx);

  // Straight edge -> two half-edges.
  for (const e of segEdges) {
    const dir = Math.atan2(V[e.b].y - V[e.a].y, V[e.b].x - V[e.a].x);
    const i0 = hes.length;
    hes.push({
      from: e.a, to: e.b, twin: i0 + 1, kind: 'seg',
      outAngle: norm2pi(dir), inAngle: norm2pi(dir), visited: false,
    });
    hes.push({
      from: e.b, to: e.a, twin: i0, kind: 'seg',
      outAngle: norm2pi(dir + Math.PI), inAngle: norm2pi(dir + Math.PI), visited: false,
    });
  }

  // Arc edge -> two half-edges (CCW a->b, CW b->a). Tangent = radial +/- 90deg.
  for (const e of arcEdges) {
    const ra = radialAngle(e.a);
    const rb = radialAngle(e.b);
    const i0 = hes.length;
    // CCW from a to b: leaving a along radial+90, arriving b along radial+90.
    hes.push({
      from: e.a, to: e.b, twin: i0 + 1, kind: 'arc', ccw: true,
      outAngle: norm2pi(ra + Math.PI / 2), inAngle: norm2pi(rb + Math.PI / 2), visited: false,
    });
    // CW from b to a: leaving b along radial-90, arriving a along radial-90.
    hes.push({
      from: e.b, to: e.a, twin: i0, kind: 'arc', ccw: false,
      outAngle: norm2pi(rb - Math.PI / 2), inAngle: norm2pi(ra - Math.PI / 2), visited: false,
    });
  }

  // Group half-edges by their `from` vertex for the next-edge lookup.
  const byFrom: number[][] = V.map(() => []);
  hes.forEach((h, i) => byFrom[h.from].push(i));

  // next(e): at v=e.to, take the half-edge leaving v with the smallest clockwise
  // turn from the reverse of our arrival direction. This keeps the face interior
  // on the LEFT (bounded faces come out CCW / positive area; the outer face CW).
  function nextHE(ei: number): number {
    const e = hes[ei];
    const v = e.to;
    const back = norm2pi(e.inAngle + Math.PI);
    let best = -1;
    let bestGap = Infinity;
    for (const ci of byFrom[v]) {
      // Clockwise gap from `back` to this edge's departure; twin sits at gap 0,
      // remapped to 2pi so it's only chosen when nothing else leaves v.
      let gap = norm2pi(back - hes[ci].outAngle);
      if (gap < 1e-9) gap = TAU;
      if (gap < bestGap) {
        bestGap = gap;
        best = ci;
      }
    }
    return best;
  }

  // 6. Trace faces.
  const faces: Face[] = [];
  for (let s = 0; s < hes.length; s++) {
    if (hes[s].visited) continue;
    const loopHE: number[] = [];
    let cur = s;
    let guard = 0;
    do {
      hes[cur].visited = true;
      loopHE.push(cur);
      cur = nextHE(cur);
      if (guard++ > hes.length + 5) throw new Error('arrangement: face trace did not close');
    } while (cur !== s);

    const loop = loopHE.map((i) => hes[i].from);
    const edges: ArrEdge[] = loopHE.map((i) => {
      const h = hes[i];
      const from = { x: V[h.from].x, y: V[h.from].y };
      const to = { x: V[h.to].x, y: V[h.to].y };
      if (h.kind === 'arc') {
        return { kind: 'arc', from, to, cx: circle.cx, cy: circle.cy, r: circle.r, ccw: h.ccw };
      }
      return { kind: 'seg', from, to };
    });

    const { area, centroid } = faceAreaCentroid(edges, circle);
    faces.push({ edges, loop, area, centroid, outer: area < 0 });
  }

  return { circle, vertices: V, faces };
}

// ---------------------------------------------------------------------------
// Geometry of a traced face (arcs sampled into a fine polyline)
// ---------------------------------------------------------------------------

/** Sample a face boundary into a closed polyline (arcs flattened). */
export function facePolygon(edges: ArrEdge[], circle: { cx: number; cy: number; r: number }): V[] {
  const pts: V[] = [];
  for (const e of edges) {
    pts.push({ x: e.from.x, y: e.from.y });
    if (e.kind === 'arc') {
      const a0 = Math.atan2(e.from.y - circle.cy, e.from.x - circle.cx);
      let a1 = Math.atan2(e.to.y - circle.cy, e.to.x - circle.cx);
      // Sweep in the traversal direction.
      if (e.ccw) {
        while (a1 <= a0) a1 += TAU;
      } else {
        while (a1 >= a0) a1 -= TAU;
      }
      const steps = Math.max(2, Math.ceil((Math.abs(a1 - a0) / TAU) * ANG_SAMPLES));
      for (let k = 1; k < steps; k++) {
        const a = a0 + ((a1 - a0) * k) / steps;
        pts.push({ x: circle.cx + circle.r * Math.cos(a), y: circle.cy + circle.r * Math.sin(a) });
      }
    }
  }
  return pts;
}

function faceAreaCentroid(
  edges: ArrEdge[],
  circle: { cx: number; cy: number; r: number },
): { area: number; centroid: V } {
  const poly = facePolygon(edges, circle);
  let a2 = 0; // 2*area
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  const area = a2 / 2;
  if (Math.abs(a2) < 1e-12) return { area: 0, centroid: { x: poly[0].x, y: poly[0].y } };
  return { area, centroid: { x: cx / (3 * a2), y: cy / (3 * a2) } };
}
