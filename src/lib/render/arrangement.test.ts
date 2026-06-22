import { describe, it, expect } from 'vitest';
import { LEVELS } from '../engine/levels';
import { computeArrangement, facePolygon, type Face } from './arrangement';

const TAU = Math.PI * 2;

function boundedFaces(faces: Face[]): Face[] {
  return faces.filter((f) => !f.outer);
}

/** Ray-cast point-in-polygon (polygon already flattened from a face). */
function pointInPoly(p: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const straddles = a.y > p.y !== b.y > p.y;
    if (straddles) {
      const xCross = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

/** Distance from p to segment ab — used to skip samples sitting on an edge. */
function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

describe('arrangement (sliced-plate faces)', () => {
  it('produces exactly one unbounded outer face per level', () => {
    for (const lvl of LEVELS) {
      const arr = computeArrangement(lvl.puzzle);
      const outer = arr.faces.filter((f) => f.outer);
      expect(outer.length, `level ${lvl.id} (${lvl.title})`).toBe(1);
    }
  });

  it('bounded faces tile the disc (areas sum to pi*r^2)', () => {
    for (const lvl of LEVELS) {
      const arr = computeArrangement(lvl.puzzle);
      const sum = boundedFaces(arr.faces).reduce((s, f) => s + f.area, 0);
      const discArea = Math.PI * arr.circle.r * arr.circle.r;
      // Arcs are sampled, so allow a small relative tolerance.
      expect(Math.abs(sum - discArea) / discArea, `level ${lvl.id} sum=${sum.toFixed(1)}`).toBeLessThan(0.01);
    }
  });

  it('satisfies Euler V - E + F = 2', () => {
    for (const lvl of LEVELS) {
      const arr = computeArrangement(lvl.puzzle);
      const V = arr.vertices.length;
      // Each undirected edge appears once per face's edge list; total directed
      // edges across all faces = 2E.
      const directed = arr.faces.reduce((s, f) => s + f.edges.length, 0);
      const E = directed / 2;
      const F = arr.faces.length;
      expect(V - E + F, `level ${lvl.id}: V=${V} E=${E} F=${F}`).toBe(2);
    }
  });

  it('every bounded face has positive area and a centroid inside the disc', () => {
    for (const lvl of LEVELS) {
      const arr = computeArrangement(lvl.puzzle);
      for (const f of boundedFaces(arr.faces)) {
        expect(f.area, `level ${lvl.id}`).toBeGreaterThan(0);
        const d = Math.hypot(f.centroid.x - arr.circle.cx, f.centroid.y - arr.circle.cy);
        expect(d, `level ${lvl.id} centroid radius`).toBeLessThan(arr.circle.r + 1e-3);
      }
    }
  });

  it('partitions the disc: every interior sample lies in exactly one face', () => {
    for (const lvl of LEVELS) {
      const arr = computeArrangement(lvl.puzzle);
      const { cx, cy, r } = arr.circle;
      const polys = boundedFaces(arr.faces).map((f) => facePolygon(f.edges, arr.circle));
      const N = 41;
      let tested = 0;
      for (let i = 1; i < N; i++) {
        for (let j = 1; j < N; j++) {
          const p = { x: cx - r + (2 * r * i) / N, y: cy - r + (2 * r * j) / N };
          // Strictly inside the disc, with margin.
          if (Math.hypot(p.x - cx, p.y - cy) > r - 0.5) continue;
          // Skip samples that sit on any face edge (classification is ambiguous there).
          let onEdge = false;
          for (const poly of polys) {
            for (let k = 0; k < poly.length && !onEdge; k++) {
              if (distToSeg(p, poly[k], poly[(k + 1) % poly.length]) < 0.4) onEdge = true;
            }
            if (onEdge) break;
          }
          if (onEdge) continue;
          const hits = polys.filter((poly) => pointInPoly(p, poly)).length;
          expect(hits, `level ${lvl.id} point (${p.x.toFixed(1)},${p.y.toFixed(1)})`).toBe(1);
          tested++;
        }
      }
      expect(tested, `level ${lvl.id} should test many interior points`).toBeGreaterThan(50);
    }
  });

  it('every face boundary arc rides the circle', () => {
    for (const lvl of LEVELS) {
      const arr = computeArrangement(lvl.puzzle);
      for (const f of arr.faces) {
        for (const e of f.edges) {
          if (e.kind !== 'arc') continue;
          for (const end of [e.from, e.to]) {
            const d = Math.hypot(end.x - arr.circle.cx, end.y - arr.circle.cy);
            expect(Math.abs(d - arr.circle.r), `level ${lvl.id} arc endpoint`).toBeLessThan(1e-3);
          }
        }
      }
    }
  });
});
