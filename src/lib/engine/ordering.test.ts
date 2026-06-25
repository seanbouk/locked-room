import { describe, it, expect } from 'vitest';
import { Lock } from './game';
import type { Puzzle } from './puzzle';

// These exercise the engine's rule-ORDERING semantics, so the figures are built
// inline rather than pulled from LEVELS (which is generated and may change).
const R = 100;
const at = (deg: number) => ({
  x: Math.cos((deg * Math.PI) / 180) * R,
  y: Math.sin((deg * Math.PI) / 180) * R,
});

// Triangle in a semicircle: AB a diameter, C on the rim, ∠CAB given.
function triangleInSemicircle(): Puzzle {
  return {
    circle: { cx: 0, cy: 0, r: R },
    points: [{ id: 'A', ...at(180) }, { id: 'B', ...at(0) }, { id: 'C', ...at(60) }],
    segments: [
      { a: 'A', b: 'B', kind: 'chord' },
      { a: 'A', b: 'C', kind: 'chord' },
      { a: 'B', b: 'C', kind: 'chord' },
    ],
    angles: [
      { id: 'ACB', vertex: 'C', from: 'A', to: 'B' },
      { id: 'CAB', vertex: 'A', from: 'C', to: 'B' },
      { id: 'ABC', vertex: 'B', from: 'A', to: 'C' },
    ],
    givens: ['CAB'],
    targets: ['ABC'],
    keys: ['semicircle', 'triangle-sum'],
  };
}

// Two radii + the chord: a forced combination (isosceles AND triangle needed).
function isoscelesWedge(): Puzzle {
  return {
    circle: { cx: 0, cy: 0, r: R },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', ...at(235) }, { id: 'B', ...at(305) }],
    segments: [
      { a: 'O', b: 'A', kind: 'radius' },
      { a: 'O', b: 'B', kind: 'radius' },
      { a: 'A', b: 'B', kind: 'chord' },
    ],
    angles: [
      { id: 'AOB', vertex: 'O', from: 'A', to: 'B' },
      { id: 'OAB', vertex: 'A', from: 'O', to: 'B' },
      { id: 'OBA', vertex: 'B', from: 'O', to: 'A' },
    ],
    givens: ['AOB'],
    targets: ['OAB', 'OBA'],
    keys: ['isosceles-radii', 'triangle-sum'],
  };
}

describe('rule ordering (probe)', () => {
  it('triangle is premature until the right angle is found', () => {
    const lock = new Lock(triangleInSemicircle());
    const tri = lock.availablePlacements().find((p) => p.keyId === 'triangle-sum')!;
    const semi = lock.availablePlacements().find((p) => p.keyId === 'semicircle')!;

    // Triangle alone determines nothing; the right-angle does.
    expect(lock.probe(tri)).toEqual([]);
    expect(lock.probe(semi)).toContain('ACB');

    // After the right angle, the triangle solves exactly the third angle.
    lock.apply(semi);
    const next = lock.probe(tri);
    expect(next).toContain('ABC');
    // ...and it does NOT re-report the already-known right angle.
    expect(next).not.toContain('ACB');
  });

  it('a forced combination — neither rule resolves alone', () => {
    const lock = new Lock(isoscelesWedge());
    const iso = lock.availablePlacements().find((p) => p.keyId === 'isosceles-radii')!;
    const tri = lock.availablePlacements().find((p) => p.keyId === 'triangle-sum')!;

    // Deadlock: nothing is productive on its own.
    expect(lock.probe(iso)).toEqual([]);
    expect(lock.probe(tri)).toEqual([]);

    // Apply one (allowed because nothing else is productive); now the other resolves.
    lock.apply(iso);
    expect(lock.probe(tri).length).toBeGreaterThan(0);
  });
});
