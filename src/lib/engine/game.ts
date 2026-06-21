// Game state for a single lock: tracks which keys have been applied, what is
// currently solved, and whether the lock is open.
//
// The flow is exactly the design premise:
//   1. available placements come from each key's matcher (where it fits)
//   2. applying a placement injects its equation(s) into the LinearSystem
//   3. we re-solve; any newly-determined angle is now "known"
//   4. when every target angle is determined, the lock opens

import { LinearSystem } from './linear-system';
import { Fraction } from './fraction';
import { type Puzzle, trueMeasureDeg } from './puzzle';
import { ALL_KEYS, type Placement } from './theorems';

export interface AppliedKey {
  placement: Placement;
}

export class Lock {
  private system = new LinearSystem();
  readonly applied: AppliedKey[] = [];

  constructor(readonly puzzle: Puzzle) {
    // Givens fix an angle's (never-displayed) value using the figure's truth.
    for (const id of puzzle.givens) {
      const a = puzzle.angles.find((x) => x.id === id)!;
      const deg = Math.round(trueMeasureDeg(puzzle, a));
      this.system.add({
        coeffs: new Map([[id, Fraction.ONE]]),
        constant: Fraction.of(deg),
        source: `given:${id}`,
      });
    }
  }

  /** Every legal placement of every key available on this level. */
  availablePlacements(): Placement[] {
    const out: Placement[] = [];
    for (const keyId of this.puzzle.keys) {
      const key = ALL_KEYS[keyId];
      if (key) out.push(...key.match(this.puzzle));
    }
    return out;
  }

  /** Drop a key. Returns the angle ids that became solved as a result. */
  apply(place: Placement): string[] {
    const before = this.solvedIds();
    const key = ALL_KEYS[place.keyId];
    for (const e of key.equations(this.puzzle, place)) this.system.add(e);
    this.applied.push({ placement: place });
    const after = this.solvedIds();
    return [...after].filter((id) => !before.has(id));
  }

  /** Set of angle ids the system currently determines uniquely. */
  solvedIds(): Set<string> {
    return new Set(this.system.solve().determined.keys());
  }

  isSolved(id: string): boolean {
    return this.system.solve().determined.has(id);
  }

  /** The lock opens once every target angle is uniquely determined. */
  get isOpen(): boolean {
    const solved = this.solvedIds();
    return this.puzzle.targets.every((t) => solved.has(t));
  }

  /** Cross-check the solver against the figure's ground truth (dev only). */
  verifyAgainstTruth(): boolean {
    const { determined } = this.system.solve();
    for (const [id, val] of determined) {
      const a = this.puzzle.angles.find((x) => x.id === id);
      if (!a) continue;
      if (Math.abs(val.toNumber() - trueMeasureDeg(this.puzzle, a)) > 1e-6) return false;
    }
    return true;
  }
}
