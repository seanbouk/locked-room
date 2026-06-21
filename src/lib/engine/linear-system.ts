// A system of linear equations over angle (and length) variables.
//
// This is the core of the game. Each circle theorem the player applies injects
// one or more linear equations of the form  sum(coeff_i * var_i) = constant.
//
// An angle is "SOLVED" iff the current system *uniquely determines* its value:
// the value is identical across every solution of the system. That is a pure
// linear-algebra fact (computed via reduced row echelon form), not a numeric
// coincidence. This is what lets us say "this rule proved we could identify
// this angle, therefore it is known" — and why any solution path that reaches a
// determined system counts as solving the lock.
//
// Note: determinacy of a variable depends only on the coefficient matrix, not
// on the right-hand-side constants (given the system is consistent). We carry
// the constants anyway so we can recover the actual value for verification and
// for the (never-shown-to-player) ground-truth consistency check.

import { Fraction } from './fraction';

export interface Equation {
  // varId -> coefficient. Missing var means coefficient 0.
  coeffs: Map<string, Fraction>;
  constant: Fraction;
  // Optional provenance: which key/placement produced this equation.
  source?: string;
}

export interface SolveResult {
  consistent: boolean;
  // varId -> exact value, for every variable the system uniquely determines.
  determined: Map<string, Fraction>;
}

/** Build an equation from a plain object of integer coefficients. */
export function eq(
  coeffs: Record<string, number>,
  constant: number,
  source?: string,
): Equation {
  const m = new Map<string, Fraction>();
  for (const [k, v] of Object.entries(coeffs)) m.set(k, Fraction.of(v));
  return { coeffs: m, constant: Fraction.of(constant), source };
}

export class LinearSystem {
  private equations: Equation[] = [];

  add(equation: Equation): void {
    this.equations.push(equation);
  }

  /** Drop the last n equations (used to undo a temporary probe). */
  removeLast(n: number): void {
    this.equations.splice(this.equations.length - n, n);
  }

  get size(): number {
    return this.equations.length;
  }

  /**
   * Reduce the system and report which variables are uniquely determined.
   * Recomputed from scratch each call — cheap at puzzle scale, and keeps the
   * logic obviously correct rather than incrementally clever.
   */
  solve(): SolveResult {
    // Stable column ordering across every variable that appears anywhere.
    const vars: string[] = [];
    const varIndex = new Map<string, number>();
    for (const e of this.equations) {
      for (const v of e.coeffs.keys()) {
        if (!varIndex.has(v)) {
          varIndex.set(v, vars.length);
          vars.push(v);
        }
      }
    }

    const nCols = vars.length;
    // Augmented matrix: each row is [c_0 ... c_{n-1} | constant].
    const rows: Fraction[][] = this.equations.map((e) => {
      const row = new Array<Fraction>(nCols + 1).fill(Fraction.ZERO);
      for (const [v, c] of e.coeffs) row[varIndex.get(v)!] = c;
      row[nCols] = e.constant;
      return row;
    });

    // Gauss-Jordan elimination to reduced row echelon form.
    const pivotColOfRow: number[] = [];
    let pivotRow = 0;
    for (let col = 0; col < nCols && pivotRow < rows.length; col++) {
      // Find a row at/after pivotRow with a non-zero entry in this column.
      let sel = -1;
      for (let r = pivotRow; r < rows.length; r++) {
        if (!rows[r][col].isZero()) {
          sel = r;
          break;
        }
      }
      if (sel === -1) continue; // free column, no pivot here

      [rows[pivotRow], rows[sel]] = [rows[sel], rows[pivotRow]];

      // Normalise pivot row so the pivot entry is 1.
      const pivVal = rows[pivotRow][col];
      for (let c = 0; c <= nCols; c++) rows[pivotRow][c] = rows[pivotRow][c].div(pivVal);

      // Eliminate this column from every other row.
      for (let r = 0; r < rows.length; r++) {
        if (r === pivotRow) continue;
        const factor = rows[r][col];
        if (factor.isZero()) continue;
        for (let c = 0; c <= nCols; c++) {
          rows[r][c] = rows[r][c].sub(factor.mul(rows[pivotRow][c]));
        }
      }
      pivotColOfRow[pivotRow] = col;
      pivotRow++;
    }
    const usedRows = pivotRow;

    // Consistency: a row of all-zero coefficients with non-zero constant is 0 = k.
    for (const row of rows) {
      const allZero = row.slice(0, nCols).every((f) => f.isZero());
      if (allZero && !row[nCols].isZero()) {
        return { consistent: false, determined: new Map() };
      }
    }

    const pivotCols = new Set(pivotColOfRow.slice(0, usedRows));

    // A pivot variable is determined iff its row has no dependence on any free
    // (non-pivot) variable — then it equals the row's constant outright.
    const determined = new Map<string, Fraction>();
    for (let r = 0; r < usedRows; r++) {
      const pc = pivotColOfRow[r];
      let dependsOnFree = false;
      for (let c = 0; c < nCols; c++) {
        if (c === pc) continue;
        if (!pivotCols.has(c) && !rows[r][c].isZero()) {
          dependsOnFree = true;
          break;
        }
      }
      if (!dependsOnFree) determined.set(vars[pc], rows[r][nCols]);
    }

    return { consistent: true, determined };
  }
}
