// Hand-authored level progression.
//
// Points are placed at exact angles on a radius-100 circle centred at the
// origin, so the figure's ground truth is clean. Every level is checked by
// levels.test.ts (via isSolvable) so we can never ship an unbeatable room.
//
// Key progression: the player starts with only the Right-Angle key and is
// awarded a new key on completing certain rooms, then uses it in later rooms.

import type { Puzzle } from './puzzle';

export interface Level {
  id: number;
  title: string;
  /** One-line framing shown on entering the room. */
  intro: string;
  puzzle: Puzzle;
  /** Key id awarded on first completion. Display name comes from the theorem. */
  award?: string;
}

export const STARTING_KEYS = ['semicircle'];

const R = 100;
const at = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return { x: Math.cos(r) * R, y: Math.sin(r) * R };
};
const O = { id: 'O', x: 0, y: 0 };

const level1: Level = {
  id: 1,
  title: 'The First Door',
  intro: 'A line straight through the centre. The angle that touches the rim is hiding something.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: R },
    points: [
      { id: 'A', ...at(180) },
      { id: 'B', ...at(0) },
      { id: 'C', ...at(65) },
    ],
    segments: [
      { a: 'A', b: 'B', kind: 'chord' },
      { a: 'A', b: 'C', kind: 'chord' },
      { a: 'B', b: 'C', kind: 'chord' },
    ],
    angles: [{ id: 'ACB', vertex: 'C', from: 'A', to: 'B' }],
    givens: [],
    targets: ['ACB'],
    keys: ['semicircle'],
  },
  award: 'triangle-sum',
};

const level2: Level = {
  id: 2,
  title: 'Two of Three',
  intro: 'One angle is given, one you just learned to find. The third must follow.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: R },
    points: [
      { id: 'A', ...at(180) },
      { id: 'B', ...at(0) },
      { id: 'C', ...at(60) },
    ],
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
  },
  award: 'same-segment',
};

const level3: Level = {
  id: 3,
  title: 'Mirror, Mirror',
  intro: 'Two angles look at the same chord from the same side. They are not so different.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: R },
    points: [
      { id: 'P', ...at(210) },
      { id: 'Q', ...at(330) },
      { id: 'R', ...at(90) },
      { id: 'S', ...at(50) },
    ],
    segments: [
      { a: 'P', b: 'Q', kind: 'chord' },
      { a: 'P', b: 'R', kind: 'chord' },
      { a: 'R', b: 'Q', kind: 'chord' },
      { a: 'P', b: 'S', kind: 'chord' },
      { a: 'S', b: 'Q', kind: 'chord' },
    ],
    angles: [
      { id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' },
      { id: 'PSQ', vertex: 'S', from: 'P', to: 'Q' },
    ],
    givens: ['PRQ'],
    targets: ['PSQ'],
    keys: ['same-segment'],
  },
  award: 'angle-at-centre',
};

const level4: Level = {
  id: 4,
  title: 'From the Centre',
  intro: 'The angle at the heart of the circle is grander than the one at the rim.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: R },
    points: [O, { id: 'P', ...at(205) }, { id: 'Q', ...at(335) }, { id: 'R', ...at(80) }],
    segments: [
      { a: 'O', b: 'P', kind: 'radius' },
      { a: 'O', b: 'Q', kind: 'radius' },
      { a: 'P', b: 'R', kind: 'chord' },
      { a: 'R', b: 'Q', kind: 'chord' },
    ],
    angles: [
      { id: 'PRQ', vertex: 'R', from: 'P', to: 'Q' },
      { id: 'POQ', vertex: 'O', from: 'P', to: 'Q' },
    ],
    givens: ['PRQ'],
    targets: ['POQ'],
    keys: ['angle-at-centre'],
  },
  award: 'isosceles-radii',
};

const level5: Level = {
  id: 5,
  title: 'Balanced on Two Spokes',
  intro: 'Two radii, one triangle. The base must share the load evenly.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: R },
    points: [O, { id: 'A', ...at(235) }, { id: 'B', ...at(305) }],
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
  },
};

const level6: Level = {
  id: 6,
  title: 'The Inner Sanctum',
  intro: 'Every key you carry has its part to play. Open it.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: R },
    points: [
      { id: 'A', ...at(180) },
      { id: 'B', ...at(0) },
      { id: 'C', ...at(70) },
      { id: 'D', ...at(120) },
    ],
    segments: [
      { a: 'A', b: 'B', kind: 'chord' },
      { a: 'A', b: 'C', kind: 'chord' },
      { a: 'B', b: 'C', kind: 'chord' },
      { a: 'C', b: 'D', kind: 'chord' },
      { a: 'B', b: 'D', kind: 'chord' },
    ],
    angles: [
      { id: 'ACB', vertex: 'C', from: 'A', to: 'B' },
      { id: 'CAB', vertex: 'A', from: 'C', to: 'B' },
      { id: 'ABC', vertex: 'B', from: 'A', to: 'C' },
      { id: 'CDB', vertex: 'D', from: 'C', to: 'B' },
    ],
    givens: ['CAB'],
    targets: ['ABC', 'CDB'],
    keys: ['semicircle', 'triangle-sum', 'same-segment'],
  },
};

export const LEVELS: Level[] = [level1, level2, level3, level4, level5, level6];
