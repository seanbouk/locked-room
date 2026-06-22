import { describe, it, expect } from 'vitest';
import { LEVELS } from '../engine/levels';
import { drawPuzzle } from './figure';
import { computeArrangement } from './arrangement';

describe('figure: sliced-plate faces', () => {
  it('emits one drawable piece per bounded arrangement face', () => {
    for (const lvl of LEVELS) {
      const drawn = drawPuzzle(lvl.puzzle);
      const bounded = computeArrangement(lvl.puzzle).faces.filter((f) => !f.outer);
      expect(drawn.faces.length, `level ${lvl.id}`).toBe(bounded.length);
    }
  });

  it('every face has valid, finite path strings starting with M and closing', () => {
    for (const lvl of LEVELS) {
      const drawn = drawPuzzle(lvl.puzzle);
      const ids = new Set<string>();
      for (const f of drawn.faces) {
        expect(ids.has(f.id), `dup id ${f.id}`).toBe(false);
        ids.add(f.id);
        for (const path of [f.path, f.inset]) {
          expect(path.startsWith('M '), `level ${lvl.id} ${f.id}`).toBe(true);
          expect(path.trimEnd().endsWith('Z'), `level ${lvl.id} ${f.id}`).toBe(true);
          expect(/NaN|Infinity|undefined/.test(path), `level ${lvl.id} ${f.id}: ${path}`).toBe(false);
        }
        expect(Number.isFinite(f.cx) && Number.isFinite(f.cy)).toBe(true);
        expect(f.area).toBeGreaterThan(0);
      }
    }
  });

  it('face area magnitudes match the arrangement (screen flip preserves area)', () => {
    for (const lvl of LEVELS) {
      const drawn = drawPuzzle(lvl.puzzle);
      const bounded = computeArrangement(lvl.puzzle)
        .faces.filter((f) => !f.outer)
        .map((f) => Math.abs(f.area))
        .sort((a, b) => a - b);
      const fromDrawn = drawn.faces.map((f) => f.area).sort((a, b) => a - b);
      for (let i = 0; i < bounded.length; i++) {
        expect(Math.abs(fromDrawn[i] - bounded[i]), `level ${lvl.id} face ${i}`).toBeLessThan(1e-6);
      }
    }
  });

  it('keeps the interaction contract: angles still expose id/vertex/vx/vy', () => {
    for (const lvl of LEVELS) {
      const drawn = drawPuzzle(lvl.puzzle);
      for (const a of drawn.angles) {
        expect(typeof a.id).toBe('string');
        expect(typeof a.vertex).toBe('string');
        expect(Number.isFinite(a.vx) && Number.isFinite(a.vy)).toBe(true);
      }
    }
  });
});
