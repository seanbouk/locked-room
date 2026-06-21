// Safety net + level validator.
//
// truthFilter: matchers decide *where* a key fits using geometric predicates
// with a tolerance. As a belt-and-braces guard we additionally discard any
// placement whose injected equation does not actually hold for the figure's
// ground truth. So even if a predicate is slightly too permissive, a
// geometrically wrong equation can never enter the system.
//
// autoSolve / isSolvable: apply *every* legal placement of every available key
// and see whether all targets become determined. Because placements are
// structural (independent of what's solved), this yields the maximal solvable
// set — the definitive "is this level beatable with these keys?" check. The
// level editor and the test suite both lean on this.

import { type Equation } from './linear-system';
import { type Puzzle, trueMeasureDeg } from './puzzle';
import { ALL_KEYS, type Placement } from './theorems';
import { Lock } from './game';

const TOL = 1e-3;

/** Does an equation hold for the figure's true (never-shown) angle measures? */
export function equationHoldsForTruth(p: Puzzle, e: Equation): boolean {
  let lhs = 0;
  for (const [varId, coeff] of e.coeffs) {
    const a = p.angles.find((x) => x.id === varId);
    if (!a) return false; // equation references a non-angle var — reject
    lhs += coeff.toNumber() * trueMeasureDeg(p, a);
  }
  return Math.abs(lhs - e.constant.toNumber()) < TOL;
}

/** Placements whose injected equations are all consistent with the figure. */
export function truthFilter(p: Puzzle, places: Placement[]): Placement[] {
  return places.filter((place) => {
    const key = ALL_KEYS[place.keyId];
    return key.equations(p, place).every((e) => equationHoldsForTruth(p, e));
  });
}

/** Apply every available placement; returns the resulting (maximally solved) Lock. */
export function autoSolve(puzzle: Puzzle): Lock {
  const lock = new Lock(puzzle);
  for (const place of lock.availablePlacements()) lock.apply(place);
  return lock;
}

export function isSolvable(puzzle: Puzzle): boolean {
  return autoSolve(puzzle).isOpen;
}
