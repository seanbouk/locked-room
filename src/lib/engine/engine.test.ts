import { describe, it, expect } from 'vitest';
import { Lock } from './game';
import type { Puzzle } from './puzzle';

// A canonical GCSE figure:
//   AB is a diameter; C sits on the circle making triangle ABC.
//   ∠ACB = 90  (angle in a semicircle)
//   ∠CAB = 30  (given)
//   ∠ABC = 60  (must be deduced: 180 - 90 - 30)
//
// Points placed at exact degrees so the figure's truth is clean:
//   A=180°, B=0° (=> AB through the centre = diameter), C=60°.
const R = 100;
const at = (deg: number) => ({
  x: Math.cos((deg * Math.PI) / 180) * R,
  y: Math.sin((deg * Math.PI) / 180) * R,
});

function makePuzzle(): Puzzle {
  return {
    circle: { cx: 0, cy: 0, r: R },
    points: [
      { id: 'O', x: 0, y: 0 },
      { id: 'A', ...at(180) },
      { id: 'B', ...at(0) },
      { id: 'C', ...at(60) },
    ],
    segments: [
      { a: 'A', b: 'B', kind: 'chord' },
      { a: 'B', b: 'C', kind: 'chord' },
      { a: 'C', b: 'A', kind: 'chord' },
    ],
    angles: [
      { id: 'ACB', vertex: 'C', from: 'A', to: 'B' },
      { id: 'CAB', vertex: 'A', from: 'C', to: 'B' },
      { id: 'ABC', vertex: 'B', from: 'A', to: 'C' },
    ],
    givens: ['CAB'],
    targets: ['ACB', 'ABC'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre'],
  };
}

describe('deduction engine', () => {
  it('recognises where each key legally fits', () => {
    const lock = new Lock(makePuzzle());
    const places = lock.availablePlacements();

    const semi = places.filter((p) => p.keyId === 'semicircle');
    expect(semi).toHaveLength(1);
    expect(semi[0].angleIds).toEqual(['ACB']); // only the semicircle angle

    const tri = places.filter((p) => p.keyId === 'triangle-sum');
    expect(tri).toHaveLength(1);
    expect([...tri[0].angleIds].sort()).toEqual(['ABC', 'ACB', 'CAB']);
  });

  it('does not mark targets solved before the rules are applied', () => {
    const lock = new Lock(makePuzzle());
    expect(lock.isSolved('ACB')).toBe(false);
    expect(lock.isSolved('ABC')).toBe(false);
    expect(lock.isOpen).toBe(false);
  });

  it('requires the dependency chain: triangle-sum alone cannot solve ABC', () => {
    const lock = new Lock(makePuzzle());
    const tri = lock.availablePlacements().find((p) => p.keyId === 'triangle-sum')!;
    lock.apply(tri); // CAB given + (CAB+ACB+ABC=180): two unknowns, one equation
    expect(lock.isSolved('ACB')).toBe(false);
    expect(lock.isSolved('ABC')).toBe(false);
    expect(lock.isOpen).toBe(false);
  });

  it('opens the lock when the chain completes (semicircle -> triangle)', () => {
    const lock = new Lock(makePuzzle());
    const places = lock.availablePlacements();

    const newlySolved = lock.apply(places.find((p) => p.keyId === 'semicircle')!);
    expect(newlySolved).toContain('ACB');
    expect(lock.isSolved('ABC')).toBe(false); // not yet — needs the triangle rule
    expect(lock.isOpen).toBe(false);

    const more = lock.apply(places.find((p) => p.keyId === 'triangle-sum')!);
    expect(more).toContain('ABC');
    expect(lock.isOpen).toBe(true);
    expect(lock.verifyAgainstTruth()).toBe(true); // 90 + 60 match the figure
  });

  it('is path-independent: triangle-first then semicircle also opens it', () => {
    const lock = new Lock(makePuzzle());
    const places = lock.availablePlacements();
    lock.apply(places.find((p) => p.keyId === 'triangle-sum')!);
    expect(lock.isOpen).toBe(false);
    lock.apply(places.find((p) => p.keyId === 'semicircle')!);
    expect(lock.isOpen).toBe(true);
    expect(lock.verifyAgainstTruth()).toBe(true);
  });
});
