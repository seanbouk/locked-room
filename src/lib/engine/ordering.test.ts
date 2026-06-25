import { describe, it, expect } from 'vitest';
import { Lock } from './game';
import { LEVELS } from './levels';

const puzzleOf = (id: number) => LEVELS.find((l) => l.id === id)!.puzzle;

describe('rule ordering (probe)', () => {
  it('room 3: triangle is premature until the right angle is found', () => {
    const lock = new Lock(puzzleOf(3));
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

  it('room 6: a forced combination — neither rule resolves alone', () => {
    const lock = new Lock(puzzleOf(6));
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
