// Hand-authored threshold + GENERATED level progression.
//
// Room 1 is a press-to-open threshold (no pins) that awards the Right-Angle key.
// The rooms after it are produced by scripts/gen-levels.ts: each was proven by
// the engine to be solvable with exactly the keys unlocked by that point, to
// agree with the figure's ground truth, and to be beatable a move at a time.
// Regenerate with:  npx vite-node scripts/gen-levels.ts > src/lib/engine/levels.ts
//
// Bands: 3 levels on the Right-Angle key, then 5 each as Triangle, Same-Segment
// and Angle-at-Centre are won, then 20 once the Balance (isosceles) key — the
// last one — is in hand. The final level of a teaching band awards the next key.

import type { Puzzle } from './puzzle';

export interface Level {
  id: number;
  title: string;
  /** One-line framing shown on entering the room. */
  intro: string;
  puzzle: Puzzle;
  /** Key id awarded on first completion. Display name comes from the theorem. */
  award?: string;
  /** Cosmetic only: segment endpoint pairs drawn as faint hairlines (a
   *  same-segment twin's sides, so it doesn't read as a solvable triangle). */
  faintSegments?: [string, string][];
}

export const STARTING_KEYS: string[] = [];

const level1: Level = {
  id: 1,
  title: 'The Threshold',
  intro: 'No theorem yet — this door only wants a push. Press the lock to open it.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: -100, y: 0 }, { id: 'B', x: 100, y: 0 }],
    segments: [],
    angles: [],
    givens: [],
    targets: [],
    keys: [],
  },
  award: 'semicircle',
};

const level2: Level = {
  id: 2,
  title: "The Right Corner",
  intro: "A line straight through the centre — find the corner it squares off.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 100, y: 0 }, { id: 'B', x: -100, y: 0 }, { id: 'C', x: 86.602540378, y: 50 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }],
    givens: [],
    targets: ['ACB'],
    keys: ['semicircle'],
  },
};

const level3: Level = {
  id: 3,
  title: "Two Clean Corners",
  intro: "One diameter, two corners on the rim. Both are squared off.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 100, y: 0 }, { id: 'B', x: -100, y: 0 }, { id: 'C', x: 76.604444312, y: 64.278760969 }, { id: 'D', x: -76.604444312, y: -64.278760969 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'D', b: 'A', kind: 'chord' }, { a: 'D', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'ADB', vertex: 'D', from: 'A', to: 'B' }],
    givens: [],
    targets: ['ACB', 'ADB'],
    keys: ['semicircle'],
  },
  award: 'triangle-sum',
};

const level4: Level = {
  id: 4,
  title: "Two Given, One Found",
  intro: "Two angles of the triangle are known. Its three must add to 180°.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 100, y: 0 }, { id: 'B', x: -50, y: 86.602540378 }, { id: 'C', x: -50, y: -86.602540378 }],
    segments: [{ a: 'A', b: 'B', kind: 'chord' }, { a: 'A', b: 'C', kind: 'chord' }, { a: 'B', b: 'C', kind: 'chord' }],
    angles: [{ id: 'BAC', vertex: 'A', from: 'B', to: 'C' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }, { id: 'ACB', vertex: 'C', from: 'A', to: 'B' }],
    givens: ['ABC', 'ACB'],
    targets: ['BAC'],
    keys: ['semicircle', 'triangle-sum'],
  },
};

const level5: Level = {
  id: 5,
  title: "The Third Angle",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 100, y: 0 }, { id: 'B', x: -100, y: 0 }, { id: 'C', x: 86.602540378, y: 50 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['CAB'],
    targets: ['ABC'],
    keys: ['semicircle', 'triangle-sum'],
  },
};

const level6: Level = {
  id: 6,
  title: "What the Triangle Owes",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 93.969262079, y: 34.202014333 }, { id: 'B', x: -93.969262079, y: -34.202014333 }, { id: 'C', x: 17.364817767, y: 98.480775301 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['CAB'],
    targets: ['ABC'],
    keys: ['semicircle', 'triangle-sum'],
  },
};

const level7: Level = {
  id: 7,
  title: "Closing the Triangle",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 76.604444312, y: 64.278760969 }, { id: 'B', x: -76.604444312, y: -64.278760969 }, { id: 'C', x: -64.278760969, y: 76.604444312 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['CAB'],
    targets: ['ABC'],
    keys: ['semicircle', 'triangle-sum'],
  },
  award: 'same-segment',
};

const level8: Level = {
  id: 8,
  title: "Same Arc, Same Angle",
  intro: "Two angles watch the same chord from the same side. They cannot disagree.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: 100, y: 0 }, { id: 'Q', x: 50, y: 86.602540378 }, { id: 'R', x: 0, y: 100 }, { id: 'S', x: -50, y: 86.602540378 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }],
    givens: ['PRQ'],
    targets: ['PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment'],
  },
};

const level9: Level = {
  id: 9,
  title: "Twin Views",
  intro: "Two angles watch the same chord from the same side. They cannot disagree.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: 100, y: 0 }, { id: 'Q', x: 50, y: 86.602540378 }, { id: 'R', x: 0, y: 100 }, { id: 'S', x: -50, y: 86.602540378 }, { id: 'U', x: -86.602540378, y: 50 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'U', b: 'P', kind: 'chord' }, { a: 'U', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'PUQ', vertex: 'U', from: 'P', to: 'Q' }],
    givens: ['PRQ'],
    targets: ['PSQ', 'PUQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment'],
  },
};

const level10: Level = {
  id: 10,
  title: "The Folded Triangle",
  intro: "Close one triangle, then carry its angle across the chord to its twin.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: 100, y: 0 }, { id: 'Q', x: -17.364817767, y: 98.480775301 }, { id: 'R', x: -93.969262079, y: -34.202014333 }, { id: 'S', x: 8.715574275, y: -99.619469809 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'RPQ', vertex: 'P', from: 'R', to: 'Q' }, { id: 'RQP', vertex: 'Q', from: 'R', to: 'P' }],
    givens: ['RPQ', 'RQP'],
    targets: ['PRQ', 'PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment'],
  },
  faintSegments: [["S","P"],["S","Q"]],
};

const level11: Level = {
  id: 11,
  title: "Carried Across",
  intro: "Close one triangle, then carry its angle across the chord to its twin.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: 100, y: 0 }, { id: 'Q', x: 34.202014333, y: 93.969262079 }, { id: 'R', x: -76.604444312, y: 64.278760969 }, { id: 'S', x: 57.357643635, y: -81.915204429 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'RPQ', vertex: 'P', from: 'R', to: 'Q' }, { id: 'RQP', vertex: 'Q', from: 'R', to: 'P' }],
    givens: ['RPQ', 'RQP'],
    targets: ['PRQ', 'PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment'],
  },
  faintSegments: [["S","P"],["S","Q"]],
};

const level12: Level = {
  id: 12,
  title: "Square, Sum, Carry",
  intro: "Square the semicircle, sum the triangle, then carry the angle across the chord.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 100, y: 0 }, { id: 'B', x: -100, y: 0 }, { id: 'C', x: 17.364817767, y: 98.480775301 }, { id: 'D', x: -17.364817767, y: -98.480775301 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }, { a: 'D', b: 'A', kind: 'chord' }, { a: 'D', b: 'C', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }, { id: 'ADC', vertex: 'D', from: 'A', to: 'C' }],
    givens: ['CAB'],
    targets: ['ABC', 'ADC'],
    keys: ['semicircle', 'triangle-sum', 'same-segment'],
  },
  award: 'angle-at-centre',
  faintSegments: [["D","A"],["D","C"]],
};

const level13: Level = {
  id: 13,
  title: "Twice from the Heart",
  intro: "The angle at the heart of the circle is twice the one out on the rim.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'P', x: 100, y: 0 }, { id: 'Q', x: 76.604444312, y: 64.278760969 }, { id: 'R', x: 34.202014333, y: 93.969262079 }],
    segments: [{ a: 'O', b: 'P', kind: 'radius' }, { a: 'O', b: 'Q', kind: 'radius' }, { a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'POQ', vertex: 'O', from: 'P', to: 'Q' }, { id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }],
    givens: ['PRQ'],
    targets: ['POQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre'],
  },
};

const level14: Level = {
  id: 14,
  title: "The Centre Doubles",
  intro: "The angle at the heart of the circle is twice the one out on the rim.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'P', x: 76.604444312, y: 64.278760969 }, { id: 'Q', x: -17.364817767, y: 98.480775301 }, { id: 'R', x: -64.278760969, y: -76.604444312 }],
    segments: [{ a: 'O', b: 'P', kind: 'radius' }, { a: 'O', b: 'Q', kind: 'radius' }, { a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'POQ', vertex: 'O', from: 'P', to: 'Q' }, { id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }],
    givens: ['PRQ'],
    targets: ['POQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre'],
  },
};

const level15: Level = {
  id: 15,
  title: "Rim and Core",
  intro: "The angle at the heart of the circle is twice the one out on the rim.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'P', x: 17.364817767, y: 98.480775301 }, { id: 'Q', x: -93.969262079, y: 34.202014333 }, { id: 'R', x: 64.278760969, y: 76.604444312 }],
    segments: [{ a: 'O', b: 'P', kind: 'radius' }, { a: 'O', b: 'Q', kind: 'radius' }, { a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'POQ', vertex: 'O', from: 'P', to: 'Q' }, { id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }],
    givens: ['PRQ'],
    targets: ['POQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre'],
  },
};

const level16: Level = {
  id: 16,
  title: "The Doubling",
  intro: "The angle at the heart of the circle is twice the one out on the rim.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'P', x: -50, y: 86.602540378 }, { id: 'Q', x: -50, y: -86.602540378 }, { id: 'R', x: 64.278760969, y: 76.604444312 }],
    segments: [{ a: 'O', b: 'P', kind: 'radius' }, { a: 'O', b: 'Q', kind: 'radius' }, { a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'POQ', vertex: 'O', from: 'P', to: 'Q' }, { id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }],
    givens: ['PRQ'],
    targets: ['POQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre'],
  },
};

const level17: Level = {
  id: 17,
  title: "Heart of It",
  intro: "The angle at the heart of the circle is twice the one out on the rim.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'P', x: -93.969262079, y: 34.202014333 }, { id: 'Q', x: 76.604444312, y: -64.278760969 }, { id: 'R', x: -64.278760969, y: 76.604444312 }],
    segments: [{ a: 'O', b: 'P', kind: 'radius' }, { a: 'O', b: 'Q', kind: 'radius' }, { a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'POQ', vertex: 'O', from: 'P', to: 'Q' }, { id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }],
    givens: ['PRQ'],
    targets: ['POQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre'],
  },
  award: 'isosceles-radii',
};

const level18: Level = {
  id: 18,
  title: "Two Even Spokes",
  intro: "Two radii make one triangle — its base angles share the load evenly.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 100, y: 0 }, { id: 'B', x: 76.604444312, y: 64.278760969 }],
    segments: [{ a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['AOB'],
    targets: ['OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level19: Level = {
  id: 19,
  title: "Centre, Rim, Base",
  intro: "From the rim to the centre to the base: chain the doubling and the balance.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 100, y: 0 }, { id: 'B', x: 76.604444312, y: 64.278760969 }, { id: 'R', x: 17.364817767, y: 98.480775301 }],
    segments: [{ a: 'R', b: 'A', kind: 'chord' }, { a: 'R', b: 'B', kind: 'chord' }, { a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ARB', vertex: 'R', from: 'A', to: 'B' }, { id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['ARB'],
    targets: ['AOB', 'OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level20: Level = {
  id: 20,
  title: "Mirror and Measure",
  intro: "Close one triangle, then carry its angle across the chord to its twin.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: -50, y: 86.602540378 }, { id: 'Q', x: -98.480775301, y: -17.364817767 }, { id: 'R', x: -17.364817767, y: -98.480775301 }, { id: 'S', x: 90.630778704, y: -42.261826174 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'RPQ', vertex: 'P', from: 'R', to: 'Q' }, { id: 'RQP', vertex: 'Q', from: 'R', to: 'P' }],
    givens: ['RPQ', 'RQP'],
    targets: ['PRQ', 'PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
  faintSegments: [["S","P"],["S","Q"]],
};

const level21: Level = {
  id: 21,
  title: "Half a Turn, Shared",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 100, y: 0 }, { id: 'B', x: -100, y: 0 }, { id: 'C', x: -76.604444312, y: 64.278760969 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['ABC'],
    targets: ['CAB', 'ACB'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level22: Level = {
  id: 22,
  title: "The Balanced Base",
  intro: "Two radii make one triangle — its base angles share the load evenly.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 100, y: 0 }, { id: 'B', x: -76.604444312, y: 64.278760969 }],
    segments: [{ a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['OAB'],
    targets: ['OBA', 'AOB'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level23: Level = {
  id: 23,
  title: "Twice Around the Heart",
  intro: "From the rim to the centre to the base: chain the doubling and the balance.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 100, y: 0 }, { id: 'B', x: -50, y: 86.602540378 }, { id: 'R', x: -34.202014333, y: -93.969262079 }],
    segments: [{ a: 'R', b: 'A', kind: 'chord' }, { a: 'R', b: 'B', kind: 'chord' }, { a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ARB', vertex: 'R', from: 'A', to: 'B' }, { id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['ARB'],
    targets: ['AOB', 'OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level24: Level = {
  id: 24,
  title: "Close, Then Cross",
  intro: "Close one triangle, then carry its angle across the chord to its twin.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: 0, y: -100 }, { id: 'Q', x: 93.969262079, y: -34.202014333 }, { id: 'R', x: 17.364817767, y: 98.480775301 }, { id: 'S', x: -90.630778704, y: 42.261826174 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'RPQ', vertex: 'P', from: 'R', to: 'Q' }, { id: 'RQP', vertex: 'Q', from: 'R', to: 'P' }],
    givens: ['RPQ', 'RQP'],
    targets: ['PRQ', 'PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
  faintSegments: [["S","P"],["S","Q"]],
};

const level25: Level = {
  id: 25,
  title: "The Corner That Remains",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 98.480775301, y: 17.364817767 }, { id: 'B', x: -98.480775301, y: -17.364817767 }, { id: 'C', x: -76.604444312, y: 64.278760969 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['CAB'],
    targets: ['ABC', 'ACB'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level26: Level = {
  id: 26,
  title: "Spokes and Span",
  intro: "Two radii make one triangle — its base angles share the load evenly.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 93.969262079, y: 34.202014333 }, { id: 'B', x: -76.604444312, y: 64.278760969 }],
    segments: [{ a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['AOB'],
    targets: ['OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level27: Level = {
  id: 27,
  title: "The Patient Chain",
  intro: "From the rim to the centre to the base: chain the doubling and the balance.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 93.969262079, y: 34.202014333 }, { id: 'B', x: -50, y: 86.602540378 }, { id: 'R', x: -76.604444312, y: -64.278760969 }],
    segments: [{ a: 'R', b: 'A', kind: 'chord' }, { a: 'R', b: 'B', kind: 'chord' }, { a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ARB', vertex: 'R', from: 'A', to: 'B' }, { id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['ARB'],
    targets: ['AOB', 'OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level28: Level = {
  id: 28,
  title: "Crossed Witnesses",
  intro: "Close one triangle, then carry its angle across the chord to its twin.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: 50, y: 86.602540378 }, { id: 'Q', x: -93.969262079, y: 34.202014333 }, { id: 'R', x: -64.278760969, y: -76.604444312 }, { id: 'S', x: 99.619469809, y: 8.715574275 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'RPQ', vertex: 'P', from: 'R', to: 'Q' }, { id: 'RQP', vertex: 'Q', from: 'R', to: 'P' }],
    givens: ['RPQ', 'RQP'],
    targets: ['PRQ', 'PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
  faintSegments: [["S","P"],["S","Q"]],
};

const level29: Level = {
  id: 29,
  title: "One Given, Two Found",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 93.969262079, y: 34.202014333 }, { id: 'B', x: -93.969262079, y: -34.202014333 }, { id: 'C', x: -76.604444312, y: 64.278760969 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['CAB'],
    targets: ['ABC'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level30: Level = {
  id: 30,
  title: "From Centre, Outward",
  intro: "Two radii make one triangle — its base angles share the load evenly.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 76.604444312, y: 64.278760969 }, { id: 'B', x: -50, y: 86.602540378 }],
    segments: [{ a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['OAB'],
    targets: ['OBA', 'AOB'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level31: Level = {
  id: 31,
  title: "From Rim to Spoke",
  intro: "From the rim to the centre to the base: chain the doubling and the balance.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 76.604444312, y: 64.278760969 }, { id: 'B', x: -50, y: 86.602540378 }, { id: 'R', x: -76.604444312, y: -64.278760969 }],
    segments: [{ a: 'R', b: 'A', kind: 'chord' }, { a: 'R', b: 'B', kind: 'chord' }, { a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ARB', vertex: 'R', from: 'A', to: 'B' }, { id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['ARB'],
    targets: ['AOB', 'OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level32: Level = {
  id: 32,
  title: "The Twin Corner",
  intro: "Close one triangle, then carry its angle across the chord to its twin.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: -86.602540378, y: -50 }, { id: 'Q', x: 17.364817767, y: -98.480775301 }, { id: 'R', x: 64.278760969, y: 76.604444312 }, { id: 'S', x: -90.630778704, y: 42.261826174 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'RPQ', vertex: 'P', from: 'R', to: 'Q' }, { id: 'RQP', vertex: 'Q', from: 'R', to: 'P' }],
    givens: ['RPQ', 'RQP'],
    targets: ['PRQ', 'PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
  faintSegments: [["S","P"],["S","Q"]],
};

const level33: Level = {
  id: 33,
  title: "One Given, Two Found · 7",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 86.602540378, y: 50 }, { id: 'B', x: -86.602540378, y: -50 }, { id: 'C', x: -64.278760969, y: 76.604444312 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['ABC'],
    targets: ['CAB', 'ACB'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level34: Level = {
  id: 34,
  title: "Even on Two Radii",
  intro: "Two radii make one triangle — its base angles share the load evenly.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 50, y: 86.602540378 }, { id: 'B', x: -76.604444312, y: 64.278760969 }],
    segments: [{ a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['AOB'],
    targets: ['OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level35: Level = {
  id: 35,
  title: "Doubled then Balanced",
  intro: "From the rim to the centre to the base: chain the doubling and the balance.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'O', x: 0, y: 0 }, { id: 'A', x: 50, y: 86.602540378 }, { id: 'B', x: -50, y: 86.602540378 }, { id: 'R', x: 17.364817767, y: -98.480775301 }],
    segments: [{ a: 'R', b: 'A', kind: 'chord' }, { a: 'R', b: 'B', kind: 'chord' }, { a: 'O', b: 'A', kind: 'radius' }, { a: 'O', b: 'B', kind: 'radius' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ARB', vertex: 'R', from: 'A', to: 'B' }, { id: 'AOB', vertex: 'O', from: 'A', to: 'B' }, { id: 'OAB', vertex: 'A', from: 'O', to: 'B' }, { id: 'OBA', vertex: 'B', from: 'O', to: 'A' }],
    givens: ['ARB'],
    targets: ['AOB', 'OAB', 'OBA'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

const level36: Level = {
  id: 36,
  title: "Across and Equal",
  intro: "Close one triangle, then carry its angle across the chord to its twin.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'P', x: 100, y: 0 }, { id: 'Q', x: 34.202014333, y: 93.969262079 }, { id: 'R', x: -76.604444312, y: 64.278760969 }, { id: 'S', x: -99.619469809, y: -8.715574275 }],
    segments: [{ a: 'R', b: 'P', kind: 'chord' }, { a: 'R', b: 'Q', kind: 'chord' }, { a: 'S', b: 'P', kind: 'chord' }, { a: 'S', b: 'Q', kind: 'chord' }, { a: 'P', b: 'Q', kind: 'chord' }],
    angles: [{ id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' }, { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' }, { id: 'RPQ', vertex: 'P', from: 'R', to: 'Q' }, { id: 'RQP', vertex: 'Q', from: 'R', to: 'P' }],
    givens: ['RPQ', 'RQP'],
    targets: ['PRQ', 'PSQ'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
  faintSegments: [["S","P"],["S","Q"]],
};

const level37: Level = {
  id: 37,
  title: "One Given, Two Found · 8",
  intro: "A right angle hides in the semicircle, and one angle is given. The rest must follow.",
  puzzle: {
    circle: { cx: 0, cy: 0, r: 100 },
    points: [{ id: 'A', x: 76.604444312, y: 64.278760969 }, { id: 'B', x: -76.604444312, y: -64.278760969 }, { id: 'C', x: -64.278760969, y: 76.604444312 }],
    segments: [{ a: 'C', b: 'A', kind: 'chord' }, { a: 'C', b: 'B', kind: 'chord' }, { a: 'A', b: 'B', kind: 'chord' }],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }, { id: 'CAB', vertex: 'A', from: 'C', to: 'B' }, { id: 'ABC', vertex: 'B', from: 'A', to: 'C' }],
    givens: ['CAB'],
    targets: ['ABC', 'ACB'],
    keys: ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'],
  },
};

export const LEVELS: Level[] = [level1, level2, level3, level4, level5, level6, level7, level8, level9, level10, level11, level12, level13, level14, level15, level16, level17, level18, level19, level20, level21, level22, level23, level24, level25, level26, level27, level28, level29, level30, level31, level32, level33, level34, level35, level36, level37];
