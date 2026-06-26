// Level generator (dev tool, run with vite-node).
//
// Hand-authoring dozens of circle-theorem figures and getting every one
// genuinely solvable-with-the-right-keys is error prone, so instead we PROPOSE
// figures from a handful of theorem templates, sweep their parameters, and let
// the real engine PROVE each candidate: solvable with the band's keys, agrees
// with the figure's ground truth, beatable a move at a time (the exact check
// levels.test.ts runs), and — for the teaching bands — genuinely needs the new
// key. Validated levels are emitted as the contents of src/lib/engine/levels.ts.
//
// Run:  npx vite-node scripts/gen-levels.ts > /tmp/levels.ts
//
// Determinism: no Math.random — parameters are swept in fixed order and the
// first N that pass + add variety are kept, so re-running yields the same file.

import { Lock } from '../src/lib/engine/game';
import { isSolvable, autoSolve } from '../src/lib/engine/validate';
import { trueMeasureDeg, type Puzzle, type Segment } from '../src/lib/engine/puzzle';

const R = 100;
const MIN_GAP = 25; // min angular spacing (deg) between on-circle points (no pin overlap)
const STEP = 10; // degree granularity for sweeps (keeps every angle an integer)

const rad = (d: number) => (d * Math.PI) / 180;
// Snap to 1e-9 so cardinal points read as clean integers (and float dust like
// sin(180°)≈1e-14 becomes 0) while staying far under the engine's 1e-6 truth
// tolerance. The SAME snapped value is validated and emitted, so the test sees
// exactly what the generator proved.
const snap = (n: number) => Math.round(n * 1e9) / 1e9;
const at = (deg: number) => ({ x: snap(Math.cos(rad(deg)) * R), y: snap(Math.sin(rad(deg)) * R) });

// ── Spec → Puzzle ────────────────────────────────────────────────────────────
type Deg = number | 'O';
interface PtSpec {
  id: string;
  deg: Deg;
}
interface AngSpec {
  v: string;
  f: string;
  t: string;
}
interface Spec {
  pts: PtSpec[];
  angles: AngSpec[];
  extraSegs?: [string, string][];
  givens: string[];
  targets: string[];
}

const angId = (a: AngSpec) => `${a.f}${a.v}${a.t}`;

function buildPuzzle(spec: Spec, keys: string[]): Puzzle {
  const degOf = new Map(spec.pts.map((p) => [p.id, p.deg]));
  const points = spec.pts.map((p) =>
    p.deg === 'O' ? { id: p.id, x: 0, y: 0 } : { id: p.id, ...at(p.deg) },
  );
  // segments = union of every angle's two rays + any extras; radius if it touches O.
  const segKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const segs = new Map<string, Segment>();
  const addSeg = (a: string, b: string) => {
    if (a === b) return;
    const k = segKey(a, b);
    if (segs.has(k)) return;
    const kind = degOf.get(a) === 'O' || degOf.get(b) === 'O' ? 'radius' : 'chord';
    segs.set(k, { a, b, kind });
  };
  for (const a of spec.angles) {
    addSeg(a.v, a.f);
    addSeg(a.v, a.t);
  }
  for (const [a, b] of spec.extraSegs ?? []) addSeg(a, b);

  return {
    circle: { cx: 0, cy: 0, r: R },
    points,
    segments: [...segs.values()],
    angles: spec.angles.map((a) => ({ id: angId(a), vertex: a.v, from: a.f, to: a.t })),
    givens: spec.givens,
    targets: spec.targets,
    keys,
  };
}

// ── The exact "beatable a move at a time" walk levels.test.ts uses ─────────────
function rebuild(puzzle: Puzzle, played: string[]): Lock {
  const lock = new Lock(puzzle);
  for (const label of played) {
    const place = lock.availablePlacements().find((p) => p.label === label);
    if (place) lock.apply(place);
  }
  return lock;
}
function greedy(puzzle: Puzzle): { open: boolean; steps: number } {
  const played: string[] = [];
  for (let step = 0; step < 100; step++) {
    const lock = rebuild(puzzle, played);
    if (lock.isOpen) return { open: true, steps: played.length };
    const moves = lock.availablePlacements().filter((p) => !played.includes(p.label));
    if (moves.length === 0) return { open: false, steps: played.length };
    let chosen = moves[0].label;
    for (const p of moves) {
      if (rebuild(puzzle, played).apply(p).length > 0) {
        chosen = p.label;
        break;
      }
    }
    played.push(chosen);
  }
  return { open: false, steps: played.length };
}

// ── Validation ─────────────────────────────────────────────────────────────--
interface Valid {
  puzzle: Puzzle;
  steps: number;
  required: string[]; // keys without which it is no longer solvable
  sig: string;
}
function minAngularGap(degs: number[]): number {
  let m = 360;
  for (let i = 0; i < degs.length; i++)
    for (let j = i + 1; j < degs.length; j++) {
      let d = Math.abs(((degs[i] - degs[j]) % 360) + 360) % 360;
      d = Math.min(d, 360 - d);
      m = Math.min(m, d);
    }
  return m;
}
function validate(spec: Spec, keys: string[]): Valid | null {
  // distinct, well-spaced on-circle points
  const circleDegs = spec.pts.filter((p) => p.deg !== 'O').map((p) => p.deg as number);
  if (new Set(circleDegs).size !== circleDegs.length) return null;
  if (minAngularGap(circleDegs) < MIN_GAP) return null;
  if (spec.targets.length === 0) return null;
  if (spec.targets.some((t) => spec.givens.includes(t))) return null;

  const puzzle = buildPuzzle(spec, keys);

  // every marked angle: integer measure (so a `given` rounds exactly) and not
  // near-degenerate (visible wedge, valid theorem geometry)
  for (const a of puzzle.angles) {
    const m = trueMeasureDeg(puzzle, a);
    if (Math.abs(m - Math.round(m)) > 1e-6) return null;
    if (m < 10 || m > 170) return null;
  }
  // givens/targets reference real angles
  const ids = new Set(puzzle.angles.map((a) => a.id));
  if (![...spec.givens, ...spec.targets].every((id) => ids.has(id))) return null;

  if (!isSolvable(puzzle)) return null;
  if (!autoSolve(puzzle).verifyAgainstTruth()) return null;
  const g = greedy(puzzle);
  if (!g.open || g.steps < 1) return null;

  // which keys are strictly necessary
  const required = keys.filter((k) => !isSolvable({ ...puzzle, keys: keys.filter((x) => x !== k) }));

  const sig = JSON.stringify({
    p: [...circleDegs].sort((a, b) => a - b),
    o: spec.pts.some((p) => p.deg === 'O'),
    a: puzzle.angles.map((a) => a.id).sort(),
    g: [...spec.givens].sort(),
    t: [...spec.targets].sort(),
  });
  return { puzzle, steps: g.steps, required, sig };
}

// ── Templates ──────────────────────────────────────────────────────────────--
// Each yields candidate specs over a parameter sweep; validate() filters.

function* sweepDiameter() {
  for (let d = 0; d < 180; d += STEP) yield d; // diameter base point A; B = A+180
}
const norm360 = (x: number) => ((x % 360) + 360) % 360;

// Right angle in a semicircle (band 1): just identify the 90°.
function rightAngle(): Spec[] {
  const out: Spec[] = [];
  for (const d of sweepDiameter()) {
    for (let off = 30; off <= 150; off += STEP) {
      const A = d, B = norm360(d + 180), C = norm360(d + off);
      out.push({
        pts: [pt('A', A), pt('B', B), pt('C', C)],
        angles: [ang('C', 'A', 'B')],
        extraSegs: [['A', 'B']],
        givens: [],
        targets: ['ACB'],
      });
    }
  }
  return out;
}
// Two right angles on one diameter (band 1 variety): two taps.
function twoRight(): Spec[] {
  const out: Spec[] = [];
  for (const d of sweepDiameter()) {
    const A = d, B = norm360(d + 180);
    for (let o1 = 40; o1 <= 90; o1 += STEP)
      for (let o2 = 40; o2 <= 90; o2 += STEP) {
        const C = norm360(d + o1), D = norm360(d + 180 + o2); // opposite sides
        out.push({
          pts: [pt('A', A), pt('B', B), pt('C', C), pt('D', D)],
          angles: [ang('C', 'A', 'B'), ang('D', 'A', 'B')],
          extraSegs: [['A', 'B']],
          givens: [],
          targets: ['ACB', 'ADB'],
        });
      }
  }
  return out;
}
// Triangle in a semicircle (band 2): right angle + triangle sum.
function triSemi(): Spec[] {
  const out: Spec[] = [];
  for (const d of sweepDiameter()) {
    const A = d, B = norm360(d + 180);
    for (let off = 30; off <= 150; off += STEP) {
      const C = norm360(d + off);
      const base = {
        pts: [pt('A', A), pt('B', B), pt('C', C)],
        angles: [ang('C', 'A', 'B'), ang('A', 'C', 'B'), ang('B', 'A', 'C')],
      };
      out.push({ ...base, givens: ['CAB'], targets: ['ABC'] });
      out.push({ ...base, givens: ['CAB'], targets: ['ABC', 'ACB'] });
      out.push({ ...base, givens: ['ABC'], targets: ['CAB', 'ACB'] });
    }
  }
  return out;
}
// A plain triangle (intro to the Triangle key): three inscribed vertices, two
// angles given (brass), the third the target — solvable by triangle-sum ALONE.
// No diameter, so the right-angle key has nothing to grab: it just needs the
// triangle key.
function triangleOnly(): Spec[] {
  // Gather candidate triples and sort the WELL-SHAPED ones first (gaps near 120°
  // ⇒ near-equilateral), so the intro level is a clean triangle, not a sliver.
  const triples: Array<{ A: number; B: number; C: number; score: number }> = [];
  for (let a = 0; a < 360; a += 30)
    for (let b = a + 30; b < a + 330; b += 30)
      for (let c = b + 30; c < a + 360; c += 30) {
        const A = norm360(a), B = norm360(b), C = norm360(c);
        const s = [A, B, C].sort((x, y) => x - y);
        const gaps = [s[1] - s[0], s[2] - s[1], 360 - (s[2] - s[0])];
        if (Math.min(...gaps) < 50) continue; // no sliver / clustered points
        if (gaps.some((g) => Math.abs(g - 180) < 1)) continue; // no diameter → no right angle
        const score = gaps.reduce((acc, g) => acc + (g - 120) ** 2, 0); // 0 = equilateral
        triples.push({ A, B, C, score });
      }
  triples.sort((p, q) => p.score - q.score);
  const out: Spec[] = [];
  for (const { A, B, C } of triples) {
    // interior angles: BAC at A, ABC at B, ACB at C
    const angles = [ang('A', 'B', 'C'), ang('B', 'A', 'C'), ang('C', 'A', 'B')];
    const base = { pts: [pt('A', A), pt('B', B), pt('C', C)], angles };
    out.push({ ...base, givens: ['ABC', 'ACB'], targets: ['BAC'] });
    out.push({ ...base, givens: ['BAC', 'ACB'], targets: ['ABC'] });
    out.push({ ...base, givens: ['BAC', 'ABC'], targets: ['ACB'] });
  }
  return out;
}
// Same segment (band 3): two (or three) inscribed angles on one chord.
function sameSeg(three: boolean): Spec[] {
  const out: Spec[] = [];
  for (let p = 0; p < 360; p += 20)
    for (let q = p + 60; q < p + 300; q += 20) {
      const P = norm360(p), Q = norm360(q);
      // apexes on the major-arc side; sweep a few
      for (let r = q + 30; r <= p + 330; r += 20)
        for (let s = r + 30; s <= p + 345; s += 20) {
          const Rv = norm360(r), Sv = norm360(s);
          const pts = [pt('P', P), pt('Q', Q), pt('R', Rv), pt('S', Sv)];
          if (three) {
            for (let u = s + 30; u <= p + 350; u += 20) {
              const Uv = norm360(u);
              out.push({
                pts: [...pts, pt('U', Uv)],
                angles: [ang('R', 'P', 'Q'), ang('S', 'P', 'Q'), ang('U', 'P', 'Q')],
                extraSegs: [['P', 'Q']],
                givens: ['PRQ'],
                targets: ['PSQ', 'PUQ'],
              });
            }
          } else {
            out.push({
              pts,
              angles: [ang('R', 'P', 'Q'), ang('S', 'P', 'Q')],
              extraSegs: [['P', 'Q']],
              givens: ['PRQ'],
              targets: ['PSQ'],
            });
          }
        }
    }
  return out;
}
// Angle at the centre (band 4): central = 2 × inscribed.
function centre(): Spec[] {
  const out: Spec[] = [];
  for (let p = 0; p < 360; p += 20)
    for (let q = p + 40; q < p + 200; q += 20) {
      const P = norm360(p), Q = norm360(q);
      for (let r = q + 30; r <= p + 330; r += 20) {
        const Rv = norm360(r);
        const base = {
          pts: [pt('O', 'O'), pt('P', P), pt('Q', Q), pt('R', Rv)],
          angles: [ang('O', 'P', 'Q'), ang('R', 'P', 'Q')],
        };
        out.push({ ...base, givens: ['PRQ'], targets: ['POQ'] });
        out.push({ ...base, givens: ['POQ'], targets: ['PRQ'] });
      }
    }
  return out;
}
// Isosceles by two radii (band 5).
function iso(): Spec[] {
  const out: Spec[] = [];
  for (let a = 0; a < 360; a += 20)
    for (let b = a + 40; b < a + 200; b += 20) {
      const A = norm360(a), B = norm360(b);
      const base = {
        pts: [pt('O', 'O'), pt('A', A), pt('B', B)],
        angles: [ang('O', 'A', 'B'), ang('A', 'O', 'B'), ang('B', 'O', 'A')],
      };
      out.push({ ...base, givens: ['AOB'], targets: ['OAB', 'OBA'] });
      out.push({ ...base, givens: ['OAB'], targets: ['OBA', 'AOB'] });
    }
  return out;
}
// Centre + isosceles + triangle chain (band 5): inscribed angle -> central -> base.
function centreIso(): Spec[] {
  const out: Spec[] = [];
  for (let a = 0; a < 360; a += 20)
    for (let b = a + 40; b < a + 160; b += 20) {
      const A = norm360(a), B = norm360(b);
      for (let r = b + 40; r <= a + 320; r += 30) {
        const Rv = norm360(r);
        out.push({
          pts: [pt('O', 'O'), pt('A', A), pt('B', B), pt('R', Rv)],
          angles: [ang('R', 'A', 'B'), ang('O', 'A', 'B'), ang('A', 'O', 'B'), ang('B', 'O', 'A')],
          givens: ['ARB'],
          targets: ['AOB', 'OAB', 'OBA'],
        });
      }
    }
  return out;
}
// Triangle + same-segment chain (band 5): two triangle angles -> third -> twin.
function triSameSeg(): Spec[] {
  const out: Spec[] = [];
  for (let p = 0; p < 360; p += 30)
    for (let q = p + 60; q < p + 200; q += 30) {
      const P = norm360(p), Q = norm360(q);
      for (let r = q + 40; r <= p + 300; r += 30)
        for (let s = r + 30; s <= p + 330; s += 30) {
          const Rv = norm360(r), Sv = norm360(s);
          out.push({
            pts: [pt('P', P), pt('Q', Q), pt('R', Rv), pt('S', Sv)],
            angles: [ang('R', 'P', 'Q'), ang('S', 'P', 'Q'), ang('P', 'R', 'Q'), ang('Q', 'R', 'P')],
            extraSegs: [['P', 'Q']],
            givens: ['RPQ', 'RQP'],
            targets: ['PRQ', 'PSQ'],
          });
        }
    }
  return out;
}

function pt(id: string, deg: Deg): PtSpec {
  return { id, deg };
}
function ang(v: string, f: string, t: string): AngSpec {
  return { v, f, t };
}

// ── Selection ────────────────────────────────────────────────────────────────
interface Template {
  kind: string;
  gen: () => Spec[];
}
// figure signatures already used, so no two rooms across the whole game repeat
const globalSeen = new Set<string>();
function collect(
  templates: Template[],
  keys: string[],
  count: number,
  opts: { needKeys?: string[]; minSteps?: number; minRequired?: number },
): Array<Valid & { kind: string }> {
  // One spread-out validated pool PER template, so we can round-robin across
  // figure types for variety instead of clustering on whichever swept first.
  const pools: Array<Array<Valid & { kind: string }>> = templates.map((tpl) => {
    const valid: Array<Valid & { kind: string }> = [];
    const seenLocal = new Set<string>();
    for (const spec of tpl.gen()) {
      const v = validate(spec, keys);
      if (!v) continue;
      if (opts.needKeys && !opts.needKeys.every((k) => v.required.includes(k))) continue;
      if (opts.minSteps && v.steps < opts.minSteps) continue;
      if (opts.minRequired && v.required.length < opts.minRequired) continue;
      if (seenLocal.has(v.sig)) continue;
      seenLocal.add(v.sig);
      valid.push({ ...v, kind: tpl.kind });
    }
    // spread: swept neighbours are near-identical, so stride through the list
    if (valid.length === 0) return valid;
    const want = Math.max(count, 8);
    const stride = Math.max(1, Math.floor(valid.length / want));
    const spread: Array<Valid & { kind: string }> = [];
    for (let i = 0; i < valid.length; i += stride) spread.push(valid[i]);
    return spread;
  });

  const picked: Array<Valid & { kind: string }> = [];
  const seen = globalSeen; // dedupe ACROSS bands too (e.g. trisemi in b2 and b5)
  const idx = pools.map(() => 0);
  let progress = true;
  while (picked.length < count && progress) {
    progress = false;
    for (let t = 0; t < pools.length && picked.length < count; t++) {
      const pool = pools[t];
      while (idx[t] < pool.length) {
        const v = pool[idx[t]++];
        if (seen.has(v.sig)) continue;
        seen.add(v.sig);
        picked.push(v);
        progress = true;
        break;
      }
    }
  }
  return picked;
}

// ── Titles / intros (keyed by figure KIND, so flavour always matches geometry)
const titles: Record<string, string[]> = {
  right: ['The Right Corner', 'Square to the Diameter', 'A Corner on the Line', 'Straight Through'],
  tworight: ['Two Clean Corners', 'A Pair of Squares', 'Both Corners True'],
  triangleonly: ['Two Given, One Found', 'The Missing Angle', 'A Hundred and Eighty', 'The Third of Three'],
  trisemi: ['The Third Angle', 'What the Triangle Owes', 'Closing the Triangle', 'Half a Turn, Shared', 'The Corner That Remains', 'One Given, Two Found'],
  sameseg: ['Same Arc, Same Angle', 'Twin Views', 'Across the Chord', 'Echo on the Rim', 'Two Witnesses', 'Three of a Kind'],
  centre: ['Twice from the Heart', 'The Centre Doubles', 'Rim and Core', 'The Doubling', 'Heart of It', 'Half the Centre'],
  iso: ['Two Even Spokes', 'The Balanced Base', 'Spokes and Span', 'From Centre, Outward', 'Even on Two Radii', 'The Level Base', 'Balanced Load', 'Twin Spokes'],
  centreiso: ['Centre, Rim, Base', 'Twice Around the Heart', 'The Patient Chain', 'From Rim to Spoke', 'Doubled then Balanced', 'The Long Way In', 'Heart, Then Balance', 'Three Keys Turning'],
  trisameseg: ['The Folded Triangle', 'Carried Across', 'Mirror and Measure', 'Close, Then Cross', 'Crossed Witnesses', 'The Twin Corner', 'Across and Equal', 'Triangle to Twin'],
};
const intros: Record<string, string> = {
  right: 'A line straight through the centre — find the corner it squares off.',
  tworight: 'One diameter, two corners on the rim. Both are squared off.',
  triangleonly: 'Two angles of the triangle are known. Its three must add to 180°.',
  trisemi: 'A right angle hides in the semicircle, and one angle is given. The rest must follow.',
  sameseg: 'Two angles watch the same chord from the same side. They cannot disagree.',
  centre: 'The angle at the heart of the circle is twice the one out on the rim.',
  iso: 'Two radii make one triangle — its base angles share the load evenly.',
  centreiso: 'From the rim to the centre to the base: chain the doubling and the balance.',
  trisameseg: 'Close one triangle, then carry its angle across the chord to its twin.',
};

// ── Emit ───────────────────────────────────────────────────────────────────--
const num = (n: number) => String(n === 0 ? 0 : n); // full precision; normalise -0 → 0
function emitPuzzle(p: Puzzle): string {
  const ptStr = p.points
    .map((q) => `{ id: '${q.id}', x: ${num(q.x)}, y: ${num(q.y)} }`)
    .join(', ');
  const segStr = p.segments.map((s) => `{ a: '${s.a}', b: '${s.b}', kind: '${s.kind}' }`).join(', ');
  const angStr = p.angles
    .map((a) => `{ id: '${a.id}', vertex: '${a.vertex}', from: '${a.from}', to: '${a.to}' }`)
    .join(', ');
  const arr = (xs: string[]) => `[${xs.map((x) => `'${x}'`).join(', ')}]`;
  return `  {
    circle: { cx: 0, cy: 0, r: ${R} },
    points: [${ptStr}],
    segments: [${segStr}],
    angles: [${angStr}],
    givens: ${arr(p.givens)},
    targets: ${arr(p.targets)},
    keys: ${arr(p.keys)},
  }`;
}

// A band is an ordered list of GROUPS (each a template set + count), so we can
// compose a band precisely — e.g. "one triangle-only intro, then three
// triangle-in-semicircle". Levels come out in group order; the award lands on
// the band's final level.
interface Group {
  templates: Template[];
  count: number;
  needKeys?: string[];
  minRequired?: number;
}
interface Plan {
  band: string;
  keys: string[];
  groups: Group[];
  award?: string;
}

const SEMI = 'semicircle', TRI = 'triangle-sum', SAME = 'same-segment', CEN = 'angle-at-centre', ISO = 'isosceles-radii';

const T = {
  right: { kind: 'right', gen: rightAngle },
  tworight: { kind: 'tworight', gen: twoRight },
  triangleOnly: { kind: 'triangleonly', gen: triangleOnly },
  trisemi: { kind: 'trisemi', gen: triSemi },
  sameseg2: { kind: 'sameseg', gen: () => sameSeg(false) },
  sameseg3: { kind: 'sameseg', gen: () => sameSeg(true) },
  trisameseg: { kind: 'trisameseg', gen: triSameSeg },
  centre: { kind: 'centre', gen: centre },
  iso: { kind: 'iso', gen: iso },
  centreiso: { kind: 'centreiso', gen: centreIso },
} satisfies Record<string, Template>;

const plans: Plan[] = [
  // 2 right-angle levels (a single corner + a two-corner), then the Triangle key.
  { band: 'b1', keys: [SEMI], award: TRI, groups: [{ templates: [T.right, T.tworight], count: 2 }] },
  // Triangle key: one pure-triangle intro (two givens, find the third), then
  // three triangle-in-semicircle rooms. Then the Same-Segment key.
  {
    band: 'b2', keys: [SEMI, TRI], award: SAME,
    groups: [
      { templates: [T.triangleOnly], count: 1, needKeys: [TRI] },
      { templates: [T.trisemi], count: 3, needKeys: [TRI] },
    ],
  },
  // Same-Segment: two pure same-segment rooms, then three that COMBINE it with
  // the triangle (find an angle, carry it across the chord). Then Angle-at-Centre.
  {
    band: 'b3', keys: [SEMI, TRI, SAME], award: CEN,
    groups: [
      { templates: [T.sameseg2, T.sameseg3], count: 2, needKeys: [SAME] },
      { templates: [T.trisameseg], count: 3, needKeys: [SAME, TRI] },
    ],
  },
  // (Bands below are untouched for now — to be revisited.)
  { band: 'b4', keys: [SEMI, TRI, SAME, CEN], award: ISO, groups: [{ templates: [T.centre], count: 5, needKeys: [CEN] }] },
  {
    band: 'b5', keys: [SEMI, TRI, SAME, CEN, ISO],
    groups: [{ templates: [T.iso, T.centreiso, T.trisameseg, T.trisemi], count: 20, minRequired: 2 }],
  },
];

const generated: Array<{ kind: string; puzzle: Puzzle; award?: string }> = [];
for (const plan of plans) {
  const picked: Array<Valid & { kind: string }> = [];
  for (const g of plan.groups) {
    const got = collect(g.templates, plan.keys, g.count, { needKeys: g.needKeys, minRequired: g.minRequired });
    if (got.length < g.count) console.error(`  !! SHORTFALL in ${plan.band} group [${g.templates.map((t) => t.kind).join(',')}]: ${got.length}/${g.count}`);
    picked.push(...got);
  }
  console.error(`${plan.band}: ${picked.length} [${picked.map((p) => p.kind).join(',')}]`);
  picked.forEach((v, i) => {
    generated.push({
      kind: v.kind,
      puzzle: v.puzzle,
      award: i === picked.length - 1 ? plan.award : undefined,
    });
  });
}

// title counter per kind, so each figure type cycles its own flavour pool
const used: Record<string, number> = {};
function levelMeta(kind: string): { title: string; intro: string } {
  const i = used[kind] ?? 0;
  used[kind] = i + 1;
  const pool = titles[kind] ?? [kind];
  const title = i < pool.length ? pool[i] : `${pool[pool.length - 1]} · ${i + 1}`;
  return { title, intro: intros[kind] ?? '' };
}

// ── File body ──────────────────────────────────────────────────────────────--
const lines: string[] = [];
lines.push(`// Hand-authored threshold + GENERATED level progression.
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
}

export const STARTING_KEYS: string[] = [];
`);

// Room 1: the threshold (verbatim, not generated).
lines.push(`const level1: Level = {
  id: 1,
  title: 'The Threshold',
  intro: 'No theorem yet — this door only wants a push. Press the lock to open it.',
  puzzle: {
    circle: { cx: 0, cy: 0, r: ${R} },
    points: [{ id: 'A', x: ${num(at(180).x)}, y: ${num(at(180).y)} }, { id: 'B', x: ${num(at(0).x)}, y: ${num(at(0).y)} }],
    segments: [],
    angles: [],
    givens: [],
    targets: [],
    keys: [],
  },
  award: '${SEMI}',
};
`);

generated.forEach((g, i) => {
  const id = i + 2; // room 1 is the threshold
  const { title, intro } = levelMeta(g.kind);
  const awardLine = g.award ? `\n  award: '${g.award}',` : '';
  lines.push(`const level${id}: Level = {
  id: ${id},
  title: ${JSON.stringify(title)},
  intro: ${JSON.stringify(intro)},
  puzzle: ${emitPuzzle(g.puzzle).trimStart()},${awardLine}
};
`);
});

const ids = generated.map((_, i) => `level${i + 2}`);
lines.push(`export const LEVELS: Level[] = [level1, ${ids.join(', ')}];`);

console.log(lines.join('\n'));
console.error(`TOTAL rooms: ${generated.length + 1}`);
