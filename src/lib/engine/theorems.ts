// Skeleton keys = circle theorems.
//
// Each key knows two things:
//   match(puzzle)    -> every place it legally fits (the "recognition" step)
//   equations(place) -> the linear equation(s) it injects when dropped there
//
// A key can ONLY be dropped where match() says it fits, so every injected
// equation is geometrically valid and the system stays consistent. Whether
// dropping it actually *solves* anything is decided later by the LinearSystem
// (a propagation key does nothing until one of its angles is already known).

import { eq, type Equation } from './linear-system';
import {
  type Angle,
  type Puzzle,
  hasSegment,
  isCentre,
  isDiameter,
  onCircle,
  otherRay,
  sideOfLine,
  subtendedChord,
} from './puzzle';

/** A concrete spot a key fits: the angle ids it acts on (+ a label for UI). */
export interface Placement {
  keyId: string;
  angleIds: string[];
  label: string;
}

export interface SkeletonKey {
  id: string;
  name: string;
  blurb: string;
  match(p: Puzzle): Placement[];
  equations(p: Puzzle, place: Placement): Equation[];
}

const angle = (p: Puzzle, id: string): Angle => {
  const a = p.angles.find((x) => x.id === id);
  if (!a) throw new Error(`unknown angle ${id}`);
  return a;
};

const RIGHT_ANGLE = 90;
const STRAIGHT = 180;

// ── Angle in a semicircle is a right angle (axiom — needs nothing prior) ──────
const semicircle: SkeletonKey = {
  id: 'semicircle',
  name: 'Right-Angle Key',
  blurb: 'The angle in a semicircle is a right angle.',
  match(p) {
    const out: Placement[] = [];
    for (const a of p.angles) {
      if (onCircle(p, a.vertex) && isDiameter(p, a.from, a.to)) {
        out.push({ keyId: this.id, angleIds: [a.id], label: `∠${a.id} = 90°` });
      }
    }
    return out;
  },
  equations(_p, place) {
    return [eq({ [place.angleIds[0]]: 1 }, RIGHT_ANGLE, `${place.keyId}:${place.angleIds[0]}`)];
  },
};

// ── Angles in the same segment are equal (propagator) ─────────────────────────
const sameSegment: SkeletonKey = {
  id: 'same-segment',
  name: 'Same-Segment Key',
  blurb: 'Angles subtended by the same chord, on the same side, are equal.',
  match(p) {
    const out: Placement[] = [];
    for (let i = 0; i < p.angles.length; i++) {
      for (let j = i + 1; j < p.angles.length; j++) {
        const a = p.angles[i];
        const b = p.angles[j];
        if (!onCircle(p, a.vertex) || !onCircle(p, b.vertex)) continue;
        const [ca, cb] = subtendedChord(a);
        const [da, db] = subtendedChord(b);
        if (ca !== da || cb !== db) continue; // different chords
        // Same side of the chord => same segment.
        if (sideOfLine(p, ca, cb, a.vertex) !== sideOfLine(p, ca, cb, b.vertex)) continue;
        out.push({ keyId: this.id, angleIds: [a.id, b.id], label: `∠${a.id} = ∠${b.id}` });
      }
    }
    return out;
  },
  equations(_p, place) {
    const [x, y] = place.angleIds;
    return [eq({ [x]: 1, [y]: -1 }, 0, `${place.keyId}:${x}=${y}`)];
  },
};

// ── Angle at the centre is twice the angle at the circumference (propagator) ──
const angleAtCentre: SkeletonKey = {
  id: 'angle-at-centre',
  name: 'Double-Angle Key',
  blurb: 'The angle at the centre is twice the angle at the circumference.',
  match(p) {
    const out: Placement[] = [];
    const central = p.angles.filter((a) => isCentre(p, a.vertex));
    const inscribed = p.angles.filter((a) => onCircle(p, a.vertex));
    for (const c of central) {
      const [ca, cb] = subtendedChord(c);
      for (const ins of inscribed) {
        const [ia, ib] = subtendedChord(ins);
        if (ca !== ia || cb !== ib) continue;
        out.push({
          keyId: this.id,
          angleIds: [c.id, ins.id],
          label: `∠${c.id} = 2·∠${ins.id}`,
        });
      }
    }
    return out;
  },
  equations(_p, place) {
    const [centre, ins] = place.angleIds;
    return [eq({ [centre]: 1, [ins]: -2 }, 0, `${place.keyId}:${centre}=2·${ins}`)];
  },
};

// ── Angles in a triangle sum to 180° (combinator) ─────────────────────────────
const triangleSum: SkeletonKey = {
  id: 'triangle-sum',
  name: 'Triangle Key',
  blurb: 'The three angles of a triangle add up to 180°.',
  match(p) {
    const out: Placement[] = [];
    const n = p.angles.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) {
          const tri = [p.angles[i], p.angles[j], p.angles[k]];
          if (isTriangle(p, tri)) {
            out.push({
              keyId: this.id,
              angleIds: tri.map((a) => a.id),
              label: `∠${tri[0].id}+∠${tri[1].id}+∠${tri[2].id} = 180°`,
            });
          }
        }
    return out;
  },
  equations(_p, place) {
    const [a, b, c] = place.angleIds;
    return [eq({ [a]: 1, [b]: 1, [c]: 1 }, STRAIGHT, `${place.keyId}:${a},${b},${c}`)];
  },
};

/** Three marked angles are the interior angles of one triangle. */
function isTriangle(p: Puzzle, tri: Angle[]): boolean {
  const verts = tri.map((a) => a.vertex);
  if (new Set(verts).size !== 3) return false;
  // Every pair of vertices must be joined by a segment.
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++)
      if (!hasSegment(p, verts[i], verts[j])) return false;
  // Each angle's rays must point to the triangle's other two vertices.
  for (const a of tri) {
    const others = verts.filter((v) => v !== a.vertex).sort();
    const rays = [a.from, a.to].sort();
    if (rays[0] !== others[0] || rays[1] !== others[1]) return false;
  }
  return true;
}

// ── Base angles of an isosceles triangle (two radii) are equal (propagator) ──
const isoscelesRadii: SkeletonKey = {
  id: 'isosceles-radii',
  name: 'Balance Key',
  blurb: 'Two radii make an isosceles triangle: its base angles are equal.',
  match(p) {
    const out: Placement[] = [];
    for (let i = 0; i < p.angles.length; i++) {
      for (let j = i + 1; j < p.angles.length; j++) {
        const a = p.angles[i];
        const b = p.angles[j];
        // Both vertices on the circle (so vertex->centre is a radius)...
        if (!onCircle(p, a.vertex) || !onCircle(p, b.vertex)) continue;
        // ...each angle has one ray to the centre...
        const aOuter = otherRay(a, (id) => isCentre(p, id));
        const bOuter = otherRay(b, (id) => isCentre(p, id));
        if (aOuter === null || bOuter === null) continue;
        // ...and each angle's other ray points at the opposite base vertex.
        if (aOuter === b.vertex && bOuter === a.vertex) {
          out.push({ keyId: this.id, angleIds: [a.id, b.id], label: `∠${a.id} = ∠${b.id}` });
        }
      }
    }
    return out;
  },
  equations(_p, place) {
    const [x, y] = place.angleIds;
    return [eq({ [x]: 1, [y]: -1 }, 0, `${place.keyId}:${x}=${y}`)];
  },
};

export const ALL_KEYS: Record<string, SkeletonKey> = {
  [semicircle.id]: semicircle,
  [sameSegment.id]: sameSegment,
  [angleAtCentre.id]: angleAtCentre,
  [triangleSum.id]: triangleSum,
  [isoscelesRadii.id]: isoscelesRadii,
};
