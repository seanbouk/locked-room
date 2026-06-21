import { describe, it, expect } from 'vitest';
import { LEVELS, STARTING_KEYS } from './levels';
import { autoSolve, isSolvable } from './validate';
import { ALL_KEYS } from './theorems';
import { Lock } from './game';
import type { Puzzle } from './puzzle';

// Rebuild a lock state from a list of already-played placement labels.
function rebuild(puzzle: Puzzle, playedLabels: string[]): Lock {
  const lock = new Lock(puzzle);
  for (const label of playedLabels) {
    const place = lock.availablePlacements().find((p) => p.label === label);
    if (place) lock.apply(place);
  }
  return lock;
}

// Simulate a player, matching GameScreen semantics: applying a key injects its
// equation whether or not it immediately reveals an angle (some rooms need two
// rules combined before either angle resolves). Prefer a revealing move; else
// play any not-yet-played move. Proves every room is winnable through play and
// terminates (no dead-ends — guaranteed anyway since equations only accumulate).
function greedyPlaythrough(puzzle: Puzzle): { open: boolean; steps: number; stuck: boolean } {
  const played: string[] = [];
  for (let step = 0; step < 100; step++) {
    const lock = rebuild(puzzle, played);
    if (lock.isOpen) return { open: true, steps: played.length, stuck: false };
    const moves = lock.availablePlacements().filter((p) => !played.includes(p.label));
    if (moves.length === 0) return { open: false, steps: played.length, stuck: true };
    // Prefer a move that reveals a new angle; otherwise take a setup move.
    let chosen = moves[0].label;
    for (const p of moves) {
      const probe = rebuild(puzzle, played);
      if (probe.apply(p).length > 0) {
        chosen = p.label;
        break;
      }
    }
    played.push(chosen);
  }
  return { open: false, steps: played.length, stuck: false };
}

describe('level progression', () => {
  it('every level is beatable with the keys it offers', () => {
    for (const lvl of LEVELS) {
      expect(isSolvable(lvl.puzzle), `level ${lvl.id} (${lvl.title})`).toBe(true);
    }
  });

  it('the auto-solution agrees with each figure’s ground truth', () => {
    for (const lvl of LEVELS) {
      const lock = autoSolve(lvl.puzzle);
      expect(lock.verifyAgainstTruth(), `level ${lvl.id}`).toBe(true);
    }
  });

  it('only ever offers keys the player could already have unlocked', () => {
    // Walk the progression; a level may only list keys already in the kit.
    const kit = new Set(STARTING_KEYS);
    for (const lvl of LEVELS) {
      for (const k of lvl.puzzle.keys) {
        expect(kit.has(k), `level ${lvl.id} uses un-unlocked key "${k}"`).toBe(true);
      }
      if (lvl.award) kit.add(lvl.award);
    }
  });

  it('every awarded key and every used key is a real theorem', () => {
    for (const lvl of LEVELS) {
      for (const k of lvl.puzzle.keys) expect(ALL_KEYS[k], k).toBeTruthy();
      if (lvl.award) expect(ALL_KEYS[lvl.award], lvl.award).toBeTruthy();
    }
  });

  it('is beatable one productive move at a time, with no dead-ends', () => {
    for (const lvl of LEVELS) {
      const r = greedyPlaythrough(lvl.puzzle);
      expect(r.open, `level ${lvl.id} (${lvl.title}) stuck=${r.stuck}`).toBe(true);
      expect(r.steps, `level ${lvl.id} should need at least one move`).toBeGreaterThan(0);
    }
  });

  it('each level actually requires a deduction (targets unknown at the start)', () => {
    for (const lvl of LEVELS) {
      // A target listed as a given would be a non-puzzle.
      for (const t of lvl.puzzle.targets) {
        expect(lvl.puzzle.givens.includes(t), `level ${lvl.id} target ${t}`).toBe(false);
      }
    }
  });
});
