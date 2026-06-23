<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock } from '../engine/game';
  import { drawPuzzle, PIN_R } from '../render/figure';
  import { makeRope, stepRope, type Bead } from '../render/rope';
  import { ALL_KEYS, type Placement } from '../engine/theorems';
  import { GodLight } from '../render/godlight';
  import type { Level } from '../engine/levels';

  let {
    level,
    unlockedKeys,
    onComplete,
    onOpenRooms,
  }: {
    level: Level;
    unlockedKeys: string[];
    onComplete: () => void;
    onOpenRooms: () => void;
  } = $props();

  const KEY_ORDER = ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'];
  const allKeys = KEY_ORDER.map((id) => ALL_KEYS[id]).filter(Boolean);

  const lock = new Lock(level.puzzle);
  const drawn = drawPuzzle(level.puzzle);
  const givenSet = new Set(level.puzzle.givens);
  const targetSet = new Set(level.puzzle.targets);
  const angleMap = new Map(drawn.angles.map((a) => [a.id, a]));

  // DEBUG: a distinct colour wash per plate piece, to tell faces apart while
  // tidying the sliced render. Toggle with the "d" key. Golden-angle hue spread
  // so adjacent pieces never share a colour.
  let debugTint = $state(false);
  const tintColor = (i: number) => `hsl(${Math.round((i * 137.508) % 360)} 80% 55%)`;
  // Continue the debug palette after the disc faces, so every pin wedge also
  // gets its own distinct colour. pinBase[ai] = first colour index for angle ai.
  const pinBase: number[] = (() => {
    let acc = drawn.faces.length;
    return drawn.angles.map((a) => {
      const base = acc;
      acc += a.pieces.length;
      return base;
    });
  })();

  let solved = $state(new Set<string>(lock.solvedIds()));
  let flash = $state(new Set<string>());
  let appliedLabels = $state(new Set<string>());
  let toast = $state('');
  let shake = $state(false);

  // Level-transition state machine. Recede works PER SEGMENT now: solving an
  // angle drops just its (brass) wedge. On the lock opening: drop the remaining
  // wedges in a heavily-overlapped cascade -> spin every pin a quarter turn ->
  // shrink the whole lock back -> rotate it 90deg -> flash white -> next level.
  const HB = 640;
  type Phase = 'intro' | 'play' | 'drop' | 'spin' | 'circleBack' | 'rotate' | 'doors' | 'flash';
  let phase = $state<Phase>('intro');
  setTimeout(() => phase === 'intro' && (phase = 'play'), 40); // fade in from white
  const transitioning = $derived(phase !== 'play' && phase !== 'intro');
  // From 'drop' on, every wedge is down; from 'spin' on, every pin is turned.
  const dropping = $derived(phase !== 'play' && phase !== 'intro');
  const spun = $derived(
    phase === 'spin' || phase === 'circleBack' || phase === 'rotate' || phase === 'doors' || phase === 'flash',
  );
  // A wedge is "down" when it's the solved angle's marked wedge (during play),
  // or once the end cascade has begun (everything drops).
  const pieceDown = (ai: number, j: number) => {
    if (dropping) return true;
    const a = drawn.angles[ai];
    return !givenSet.has(a.id) && solved.has(a.id) && a.pieces[j].marked;
  };

  // Cascade order for the end drop: finish the "half-done" pins first (the
  // already-solved pins' still-up wedges), then everything else. Each wedge gets
  // an incremental index -> a small staggered transition-delay (heavy overlap).
  const DROP_STAGGER = 45; // ms between wedge starts
  const dropOrder = $derived.by(() => {
    const m = new Map<string, number>();
    let idx = 0;
    const downInPlay = (a: (typeof drawn.angles)[number], pc: { marked: boolean }) =>
      !givenSet.has(a.id) && solved.has(a.id) && pc.marked;
    // 1. remaining wedges of solved (non-given) pins
    drawn.angles.forEach((a, ai) => {
      if (givenSet.has(a.id) || !solved.has(a.id)) return;
      a.pieces.forEach((pc, j) => {
        if (!pc.marked) m.set(`${ai}-${j}`, idx++);
      });
    });
    // 2. every other still-up wedge
    drawn.angles.forEach((a, ai) => {
      a.pieces.forEach((pc, j) => {
        const key = `${ai}-${j}`;
        if (m.has(key) || downInPlay(a, pc)) return;
        m.set(key, idx++);
      });
    });
    return m;
  });
  const dropDelayMs = (ai: number, j: number) => `${(dropOrder.get(`${ai}-${j}`) ?? 0) * DROP_STAGGER}ms`;

  function startTransition() {
    phase = 'drop'; // cascade the remaining wedges down
    const tDrop = Math.max(HB, dropOrder.size * DROP_STAGGER + 480);
    const tSpin = tDrop + 560;
    const tBack = tSpin + 520;
    const tRot = tBack + HB;
    const tDoors = tRot + HB; // the lock has turned; now the doors swing open
    setTimeout(() => (phase = 'spin'), tDrop); // quarter-turn every pin together
    setTimeout(() => (phase = 'circleBack'), tSpin);
    setTimeout(() => (phase = 'rotate'), tBack);
    setTimeout(() => (phase = 'doors'), tRot);
    setTimeout(() => (phase = 'flash'), tDoors + 520); // flash once the doors are open
    setTimeout(() => onComplete(), tDoors + 520 + 600);
  }

  // A set-back wedge recedes toward the VANISHING POINT (the puzzle centre = the
  // user origin): scale() about the origin shrinks it AND drifts it toward centre.
  // Back-amount 0.126 (≈ the old 0.09 + 40%), i.e. everything settles to 0.874.
  const PIN_BACK = 0.874;
  // Once all wedges are down, every pin turns a quarter turn IN PLACE. We nest
  // each pin as translate(centre) > rotate > translate(-centre) so the animated
  // transform is a PLAIN rotate() about the group origin — CSS tweens that as a
  // clean spin. (Rotating via the centred `rotate(90 cx cy)` attribute form
  // interpolates the whole matrix, which adds a translation mid-tween and makes
  // the pin swing out — the "jump" we saw.) Bounce easing for the clunk.
  const pinTurn = $derived(spun ? 'rotate(90)' : 'rotate(0)');
  // How far a "down" wedge sits back. During play / the end drop it sinks
  // (PIN_BACK) into its hole. But once the WHOLE lock recedes, the sunk wedges
  // return to flush (1) so the lock face catches up to them and they recede as
  // one — instead of the pins sitting in a deeper hole than the plate (which
  // also exposed the bevelled hole edge as an unwanted metal ring).
  const endShow = $derived(
    phase === 'circleBack' || phase === 'rotate' || phase === 'doors' || phase === 'flash',
  );
  const wedgeBack = $derived(endShow ? 1 : PIN_BACK);
  // The whole lock scales about the user origin (0,0) = circle centre, and
  // rotates. It recedes by EXACTLY the same step a pin does (PIN_BACK), no more:
  // there are only two depths in the whole game — "forward" and "one step back".
  // At the end the plate recedes to that one step, meeting the already-back pins
  // (which, now flush again, don't move), so the figure just sits one step back
  // and a quarter-turned — never a third, deeper level.
  const LOCK_BACK = PIN_BACK;
  // Sequence: the lock RECEDES one step (circleBack), with the pins held still,
  // THEN the whole body turns 90° (rotate), carrying the pins rigidly. Finally
  // the whole lock SLIDES UP off the top (doors/flash) — the translate is the
  // outermost (screen-space) term so it lifts straight up regardless of the
  // scale/rotate — leaving just the light as the doors slide away.
  const lockXf = $derived(
    phase === 'doors' || phase === 'flash'
      ? `translate(0 -360) scale(${LOCK_BACK}) rotate(90)`
      : phase === 'rotate'
        ? `scale(${LOCK_BACK}) rotate(90)`
        : phase === 'circleBack'
          ? `scale(${LOCK_BACK})`
          : '', // no transform during play/drop/spin, so it doesn't isolate blends
  );

  // Each door is its half of the board with only the DISC cut out (one circle,
  // so the #bevel filter chamfers a clean rim). We do NOT cut the rim pins: the
  // pins render in the lock group, which is drawn ON TOP of the doors, so a pin
  // that straddles the rim already shows over the solid door. Cutting pin holes
  // as well meant the door's evenodd disc-hole and pin-hole overlapped and XOR'd
  // back to filled — the stray "half pin" of steel stuck to the door. A small
  // inset from the seam (x=0) leaves a real kerf gap down the middle.
  const SEAM = 0.6;
  const doorPath = (side: 'L' | 'R') => {
    const r = drawn.circle.r;
    const rect =
      side === 'L'
        ? `M -125 -175 L ${-SEAM} -175 L ${-SEAM} 375 L -125 375 Z`
        : `M ${SEAM} -175 L 125 -175 L 125 375 L ${SEAM} 375 Z`;
    const disc = ` M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
    return rect + disc;
  };

  let svgEl: SVGSVGElement;

  // ── God-light ───────────────────────────────────────────────────────────────
  // Volumetric shafts derived from the lock's REAL negative space (see
  // render/godlight.ts). We rasterise the live occluder geometry — every solid
  // piece, read straight off the DOM at its current animated transform — into an
  // "aperture" canvas (white = open void/light, black = steel), and a WebGL pass
  // erodes the thin kerfs to black, streaks the wider openings radially outward
  // from the centre, and tints them warm. The result is screen-blended over the
  // SVG, so the resting state (only hairline kerfs) reads exactly as before, and
  // every recede / open / door-swing widens the apertures and blooms the light.
  const VB = { x: -125, y: -175, w: 250, h: 550 }; // = drawn.viewBox
  let glCanvas = $state<HTMLCanvasElement>();
  let apDbg = $state<HTMLCanvasElement>(); // debug: shows the raw aperture mask
  let debugAp = $state(false);
  let light: GodLight | null = null;
  const aperture = document.createElement('canvas');
  const apCtx = aperture.getContext('2d')!;
  let apW = 0;
  let apH = 0;
  let rafId = 0;
  let animateUntil = 0;
  // eased state, advanced in the frame loop
  let intensity = 0;
  let lit = $state(false); // started raining light at least once (fades canvas in)

  // ── Dev HUD counter ─────────────────────────────────────────────────────────
  // An on-screen marker so a recorded video can be referenced precisely. The
  // clock RESETS at the start of each stage (phase), so the reading is always
  // "stage + ms into that stage" — independent of how long earlier stages (e.g.
  // the variable-length drop cascade) took. So "doors +650ms" maps straight to
  // 650ms into the door swing. Reads "<phase> +<ms>ms · f<frame>". Toggle 'f'.
  let showCounter = $state(true);
  let frameNo = $state(0);
  let clockMs = $state(0);
  let phaseStartT = 0;

  // Brightness PER POINT OF LIGHT is never cranked up — the picture brightens
  // only because more open AREA is revealed. The reverse: as the lock recedes
  // and the doors open, so much area opens that we tween the per-pixel exposure
  // DOWN, so the finale still reads brighter (more area) without blowing to a
  // flat white sheet — you can still pick out the donut. (intro fades from black.)
  // BRIGHTNESS is the single light knob. Per-point brightness is CONSTANT — the
  // picture only gets brighter when the aperture reveals more open area (a wider
  // gap, the doors sliding off, the lock leaving), never a per-phase multiplier.
  const BRIGHTNESS = 1.5;
  const intensityTarget = () => (phase === 'intro' ? 0 : BRIGHTNESS);

  function syncSize() {
    if (!glCanvas) return;
    const rect = glCanvas.getBoundingClientRect();
    if (rect.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const MAXH = 1100;
    const h = Math.min(MAXH, Math.round(rect.height * dpr));
    const w = Math.round((h * VB.w) / VB.h);
    if (w === apW && h === apH) return;
    apW = w;
    apH = h;
    aperture.width = w;
    aperture.height = h;
    light?.resize(w, h);
  }

  // Light-source centre (disc centre = svg origin) in aperture px, set each
  // rasterise so the radial streak originates correctly even with letterboxing.
  let centreX = 0;
  let centreY = 0;

  // Screen-px → aperture-px matrix. We read geometry via getScreenCTM() (robust:
  // it includes CSS transforms and works through clip/mask groups, unlike
  // getCTM) and map it into the aperture through the canvas's own box.
  function screenToAp(): DOMMatrix | null {
    if (!glCanvas) return null;
    const r = glCanvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    return new DOMMatrix([
      apW / r.width, 0, 0, apH / r.height, (-r.left * apW) / r.width, (-r.top * apH) / r.height,
    ]);
  }

  // getScreenCTM() returns a legacy SVGMatrix in some engines (no transformPoint
  // / multiply), so always wrap it in a real DOMMatrix.
  const toDM = (m: DOMMatrix | null): DOMMatrix | null =>
    m ? new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]) : null;

  // Rasterise the negative space: white = light gets through, black = occluder.
  function rasterizeAperture() {
    if (!svgEl || !apW) return;
    const s2a = screenToAp();
    const rootCtm = toDM(svgEl.getScreenCTM());
    if (!s2a || !rootCtm) return;
    apCtx.setTransform(1, 0, 0, 1, 0, 0);
    apCtx.fillStyle = '#fff'; // the bright room behind everything
    apCtx.fillRect(0, 0, apW, apH);

    const c0 = s2a.transformPoint(rootCtm.transformPoint(new DOMPoint(0, 0)));
    centreX = c0.x;
    centreY = c0.y;

    // 1. the doors + the lock-face plate pieces block the void (black). Doors
    //    fade out as they swing open, flooding the outer board with light.
    const draw = (sel: string, alpha: number, rule: CanvasFillRule) => {
      if (alpha <= 0.004) return;
      apCtx.fillStyle = alpha >= 1 ? '#000' : `rgba(0,0,0,${alpha})`;
      svgEl.querySelectorAll<SVGGraphicsElement>(sel).forEach((el) => {
        const scm = toDM(el.getScreenCTM());
        const d = el.getAttribute('d');
        if (!scm || !d) return;
        const m = s2a.multiply(scm);
        apCtx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        apCtx.fill(new Path2D(d), rule);
      });
    };
    // Doors: each is clipped to its own half (as in the SVG), otherwise its
    // evenodd disc-hole spills a filled half-disc across the seam and buries the
    // revealed "donut" until the doors physically swing away.
    const drawDoor = (sel: string, side: 'L' | 'R') => {
      const el = svgEl.querySelector<SVGGraphicsElement>(sel);
      const scm = toDM(el?.getScreenCTM() ?? null);
      const d = el?.getAttribute('d');
      if (!scm || !d) return;
      // getScreenCTM tracks the door's 2D slide, so as it slides off the centre
      // opens and the light floods exactly in step with the visible door.
      const m = s2a.multiply(scm);
      apCtx.save();
      apCtx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      const clip = new Path2D();
      clip.rect(side === 'L' ? -125 : SEAM, -175, 125 - SEAM, 550);
      apCtx.clip(clip);
      apCtx.fillStyle = '#000';
      apCtx.fill(new Path2D(d), 'evenodd');
      apCtx.restore();
    };
    drawDoor('.door-L .door-steel', 'L');
    drawDoor('.door-R .door-steel', 'R');
    draw('.plate-piece', 1, 'nonzero');

    // 2. bore the pin holes back open (the face has a hole at every pin) in the
    //    lock group's current transform — light spills through wherever the pin
    //    behind doesn't fill it.
    const lockScm = toDM(svgEl.querySelector<SVGGraphicsElement>('.lock')?.getScreenCTM() ?? null);
    if (lockScm) {
      const lm = s2a.multiply(lockScm);
      apCtx.setTransform(1, 0, 0, 1, 0, 0);
      apCtx.fillStyle = '#fff';
      for (const a of drawn.angles) {
        const c = lm.transformPoint(new DOMPoint(a.vx, a.vy));
        const e = lm.transformPoint(new DOMPoint(a.vx + PIN_R, a.vy));
        const rad = Math.hypot(e.x - c.x, e.y - c.y);
        apCtx.beginPath();
        apCtx.arc(c.x, c.y, rad, 0, Math.PI * 2);
        apCtx.fill();
      }
    }

    // 3. the pin pieces themselves re-occlude their holes (black). A receded /
    //    dropped-back wedge fills less, leaving a ring/shaft of light.
    draw('.pin-piece', 1, 'nonzero');
    apCtx.setTransform(1, 0, 0, 1, 0, 0);

    if (debugAp && apDbg) {
      apDbg.width = apW;
      apDbg.height = apH;
      apDbg.getContext('2d')!.drawImage(aperture, 0, 0);
    }
  }

  function frame() {
    rafId = 0;
    if (!light?.enabled || !apW) return;
    syncSize();
    // ease intensity toward its (now constant) target — fade up from black on
    // entry, otherwise hold steady. Brightness comes ONLY from how much open
    // area the aperture reveals, never from a per-phase multiplier.
    const it = intensityTarget();
    intensity += (it - intensity) * 0.16;
    rasterizeAperture();
    light.render(aperture, {
      cx: centreX,
      cy: centreY, // disc centre (origin) in aperture px
      erode: Math.max(2, apW * 0.008), // kills the ~kerf-width hairlines, keeps
      // the larger crescents a receding wedge / open hole exposes
      blurTaps: 28,
      blurReach: 0.6, // shorter shafts: bright at the gap, quick falloff
      coreMix: 0.7,
      intensity,
      tint: [1.0, 1.0, 1.0], // brilliant white
    });
    lit = true;
    const easing = Math.abs(it - intensity) > 0.01;
    // Always keep rendering through the whole transition (pieces are moving every
    // frame), so the aperture never lags the recede / spin / door swing.
    const live = phase !== 'play' && phase !== 'intro';
    if (live || performance.now() < animateUntil || easing) rafId = requestAnimationFrame(frame);
  }

  // Keep the light rendering for `ms` (covers an animation), then idle.
  function pulse(ms: number) {
    animateUntil = Math.max(animateUntil, performance.now() + ms);
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  onMount(() => {
    let counterRaf = 0;
    let ro: ResizeObserver | null = null;
    if (import.meta.env.DEV) {
      // counter tick for the recording HUD: ms + frames since the current stage
      // (phase) began; reset by the phase $effect below.
      phaseStartT = performance.now();
      const tick = () => {
        clockMs = Math.round(performance.now() - phaseStartT);
        frameNo += 1;
        counterRaf = requestAnimationFrame(tick);
      };
      counterRaf = requestAnimationFrame(tick);
      // dev-only test hook: apply the next productive placement (drives solves in
      // the puppeteer light diagnostic without simulating pointer drags).
      (window as unknown as { __solve?: () => string | null }).__solve = () => {
        for (const p of lock.availablePlacements(keyring)) {
          if (!appliedLabels.has(p.label) && lock.probe(p).length > 0) {
            apply(p);
            return p.label;
          }
        }
        return null;
      };
    }
    if (glCanvas) {
      light = new GodLight(glCanvas);
      syncSize();
      ro = new ResizeObserver(() => {
        syncSize();
        pulse(60);
      });
      ro.observe(glCanvas);
      pulse(400);
    }
    return () => {
      if (counterRaf) cancelAnimationFrame(counterRaf);
      ro?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
      light?.dispose();
    };
  });

  // Re-light whenever the scene geometry changes: a solve (pins recede ~0.6s) or
  // a phase change (the transition runs for a few seconds).
  $effect(() => {
    solved.size; // track
    phase; // track
    if (light?.enabled) pulse(phase === 'play' ? 900 : 2600);
  });

  // ── Transition trace (dev) ──────────────────────────────────────────────────
  // Logs the SETTLED geometry of the lock and a sample pin at each phase, so we
  // can discuss what moves with shared numbers. Coords are viewBox units (puzzle
  // space); depth = on-screen scale where 1.000 = "forward" (rest). If a pin's
  // centre/depth is unchanged across phases, it did not move.
  function traceState(tag: string) {
    if (!svgEl) return;
    const root = svgEl.getScreenCTM();
    if (!root) return;
    const inv = toDM(root)!.inverse();
    const rootScale = Math.hypot(root.a, root.b);
    const read = (sel: string, x: number, y: number) => {
      const m = toDM(svgEl.querySelector<SVGGraphicsElement>(sel)?.getScreenCTM() ?? null);
      if (!m) return 'n/a';
      const c = inv.transformPoint(m.transformPoint(new DOMPoint(x, y)));
      return `depth=${(Math.hypot(m.a, m.b) / rootScale).toFixed(3)} centre=(${c.x.toFixed(1)},${c.y.toFixed(1)})`;
    };
    const a0 = drawn.angles[0];
    console.log(`[lock-anim ${tag.padEnd(10)}] lock { ${read('.lock', 0, 0)} }  pin "${a0.id}" { ${read('.pin-piece', a0.vx, a0.vy)} }`);
  }
  $effect(() => {
    const p = phase;
    if (!import.meta.env.DEV) return;
    phaseStartT = performance.now(); // reset the HUD stage clock
    frameNo = 0;
    clockMs = 0;
    // log the moment each phase begins; since the pin holds still once it's gone
    // back, every end-phase line should report the same pin centre/depth.
    requestAnimationFrame(() => traceState(p));
  });

  // Dragging a key off the tray.
  let drag = $state<null | { keyId: string; x: number; y: number }>(null);
  // Triangle key: the 3 corners of the triangle nearest the cursor while dragging.
  let preview = $state<string[] | null>(null);

  // A 2-part key mid-application: anchored on one angle, chain dangling.
  let chain = $state<null | { keyId: string; anchor: string }>(null);
  let ropeBeads: Bead[] = [];
  let ropeTick = $state(0);
  let grabbing = $state(false);
  let handlePt = { x: 0, y: 0 };
  let raf = 0;

  const keyring = $derived(unlockedKeys ?? []);
  const isUnlocked = (id: string) => keyring.includes(id);
  const arityOf = (id: string) => (id === 'semicircle' ? 1 : id === 'triangle-sum' ? 3 : 2);

  function placementsFor(keyId: string): Placement[] {
    return lock
      .availablePlacements(keyring)
      .filter((p) => p.keyId === keyId && !appliedLabels.has(p.label));
  }

  const vpos = (id: string) => {
    const a = angleMap.get(id)!;
    return { x: a.vx, y: a.vy };
  };
  function toSvg(cx: number, cy: number) {
    const m = svgEl?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  // Every geometric triangle in the figure (three points joined pairwise) — not
  // just the solvable ones — so a busy room has decoys and the highlight isn't a
  // solution oracle. The triangle key only catches the nearest one within reach.
  const TRI_REACH = 78; // svg units from a centroid
  const ptPos = new Map(drawn.points.map((p) => [p.id, { x: p.x, y: p.y }]));
  const hasSeg = (a: string, b: string) =>
    level.puzzle.segments.some((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a));
  const geomTriangles: Array<{ verts: string[]; cx: number; cy: number }> = (() => {
    const ids = level.puzzle.points.map((p) => p.id);
    const out: Array<{ verts: string[]; cx: number; cy: number }> = [];
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++)
        for (let k = j + 1; k < ids.length; k++) {
          const [a, b, c] = [ids[i], ids[j], ids[k]];
          if (hasSeg(a, b) && hasSeg(b, c) && hasSeg(a, c)) {
            const pa = ptPos.get(a)!, pb = ptPos.get(b)!, pc = ptPos.get(c)!;
            out.push({ verts: [a, b, c], cx: (pa.x + pb.x + pc.x) / 3, cy: (pa.y + pb.y + pc.y) / 3 });
          }
        }
    return out;
  })();
  function nearestTriangle(pt: { x: number; y: number }) {
    let best = null as (typeof geomTriangles)[number] | null;
    let bd = Infinity;
    for (const t of geomTriangles) {
      const d = (t.cx - pt.x) ** 2 + (t.cy - pt.y) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best && bd <= TRI_REACH ** 2 ? best : null;
  }
  // The triangle-sum placement matching a triangle's corners, if it's solvable.
  function placementForTriangle(verts: string[]): Placement | null {
    const vs = new Set(verts);
    return (
      placementsFor('triangle-sum').find((p) => {
        const pv = p.angleIds.map((id) => angleMap.get(id)?.vertex);
        return pv.length === 3 && pv.every((v) => v && vs.has(v));
      }) ?? null
    );
  }
  const previewPoly = $derived(
    preview ? preview.map((v) => { const p = ptPos.get(v)!; return `${p.x},${p.y}`; }).join(' ') : '',
  );

  // Live chain geometry for rendering (recomputes each animation frame).
  const chainPts = $derived.by(() => {
    ropeTick;
    return ropeBeads.map((b) => ({ x: b.x, y: b.y }));
  });

  function reject() {
    shake = true;
    setTimeout(() => (shake = false), 260);
  }

  // Is there any unplayed placement that would solve something right now?
  function anyProductiveMove(): boolean {
    for (const pl of lock.availablePlacements(keyring)) {
      if (appliedLabels.has(pl.label)) continue;
      if (lock.probe(pl).length > 0) return true;
    }
    return false;
  }

  function apply(p: Placement) {
    // A rule may only stick if it determines something now — unless nothing can
    // (a forced combination, e.g. two rules that only resolve together). This
    // stops a rule being applied out of order and silently pre-loading an
    // equation that makes a later rule solve two angles at once.
    if (lock.probe(p).length === 0 && anyProductiveMove()) {
      endChain();
      preview = null;
      reject();
      toast = 'Not yet — solve what it needs first.';
      setTimeout(() => (toast = ''), 2000);
      return;
    }
    const newIds = lock.apply(p);
    appliedLabels = new Set([...appliedLabels, p.label]);
    solved = new Set(lock.solvedIds());
    endChain();
    preview = null;
    if (newIds.length) {
      flash = new Set(newIds);
      setTimeout(() => (flash = new Set()), 900);
    } else {
      toast = 'The key turns — but nothing gives yet.';
      setTimeout(() => (toast = ''), 1800);
    }
    if (lock.isOpen) setTimeout(startTransition, 350);
  }

  // ── Chain lifecycle ─────────────────────────────────────────────────────────
  function startChain(keyId: string, anchor: string) {
    chain = { keyId, anchor };
    ropeBeads = makeRope(vpos(anchor).x, vpos(anchor).y, { x: drawn.circle.cx, y: drawn.circle.cy });
    grabbing = false;
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function endChain() {
    chain = null;
    grabbing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function loop() {
    if (!chain) {
      raf = 0;
      return;
    }
    stepRope(ropeBeads, vpos(chain.anchor), grabbing ? handlePt : null);
    ropeTick++;
    raf = requestAnimationFrame(loop);
  }

  // ── Dragging a key off the tray ─────────────────────────────────────────────
  function onKeyMove(e: PointerEvent) {
    if (!drag) return;
    drag = { ...drag, x: e.clientX, y: e.clientY };
    if (drag.keyId === 'triangle-sum') {
      const t = nearestTriangle(toSvg(e.clientX, e.clientY));
      preview = t ? t.verts : null;
    }
  }
  function onKeyUp(e: PointerEvent) {
    window.removeEventListener('pointermove', onKeyMove);
    window.removeEventListener('pointerup', onKeyUp);
    const d = drag;
    drag = null;
    preview = null;
    if (!d) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);

    if (d.keyId === 'triangle-sum') {
      const t = el?.closest('svg') ? nearestTriangle(toSvg(e.clientX, e.clientY)) : null;
      const p = t ? placementForTriangle(t.verts) : null;
      if (p) apply(p);
      else reject();
      return;
    }

    const angleEl = el?.closest('[data-angle]');
    if (!angleEl) return reject();
    const A = angleEl.getAttribute('data-angle')!;
    if (arityOf(d.keyId) === 1) {
      const p = placementsFor(d.keyId).find((q) => q.angleIds.includes(A));
      if (p) apply(p);
      else reject();
    } else {
      if (placementsFor(d.keyId).some((q) => q.angleIds.includes(A))) startChain(d.keyId, A);
      else reject();
    }
  }
  function startKeyDrag(e: PointerEvent, keyId: string) {
    if (!isUnlocked(keyId) || chain) return;
    e.preventDefault();
    drag = { keyId, x: e.clientX, y: e.clientY };
    window.addEventListener('pointermove', onKeyMove);
    window.addEventListener('pointerup', onKeyUp);
  }

  // ── Dragging the chain's loose end ──────────────────────────────────────────
  function onHandleMove(e: PointerEvent) {
    handlePt = toSvg(e.clientX, e.clientY);
  }
  function onHandleUp(e: PointerEvent) {
    window.removeEventListener('pointermove', onHandleMove);
    window.removeEventListener('pointerup', onHandleUp);
    grabbing = false;
    if (!chain) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const angleEl = el?.closest('[data-angle]');
    if (!angleEl) return;
    const B = angleEl.getAttribute('data-angle')!;
    if (B === chain.anchor) return;
    const done = placementsFor(chain.keyId).find(
      (p) => p.angleIds.length === 2 && p.angleIds.includes(chain!.anchor) && p.angleIds.includes(B),
    );
    if (done) apply(done);
    else reject();
  }
  function startHandleGrab(e: PointerEvent) {
    e.preventDefault();
    grabbing = true;
    handlePt = toSvg(e.clientX, e.clientY);
    window.addEventListener('pointermove', onHandleMove);
    window.addEventListener('pointerup', onHandleUp);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') endChain();
    if (e.key === 'd') debugTint = !debugTint;
    if (e.key === 'l') {
      debugAp = !debugAp;
      pulse(200);
    }
    if (e.key === 'f') showCounter = !showCounter;
  }

  const chainName = $derived(chain ? ALL_KEYS[chain.keyId].name : '');
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet keyIcon(id: string)}
  <svg class="ki" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {#if id === 'semicircle'}
      <path d="M4 4 V20 H20" />
      <path d="M4 14 H10 V20" />
    {:else if id === 'triangle-sum'}
      <path d="M12 4 L20.5 19.5 H3.5 Z" />
    {:else if id === 'same-segment'}
      <path d="M9 4 A 9 9 0 0 0 9 20" />
      <path d="M15 4 A 9 9 0 0 1 15 20" />
    {:else if id === 'angle-at-centre'}
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12 L12 3.5" />
      <path d="M12 12 L20 15" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    {:else if id === 'isosceles-radii'}
      <path d="M12 3 V16" />
      <path d="M5 8 H19" />
      <path d="M5 8 L2.5 13 H7.5 Z" />
      <path d="M19 8 L16.5 13 H21.5 Z" />
      <path d="M8 20 H16" />
    {/if}
  </svg>
{/snippet}

<div class="screen {phase}" class:shake>
      <svg bind:this={svgEl} viewBox={drawn.viewBox} class:open={transitioning} role="img" aria-label="lock puzzle">
        <defs>
          <!-- gunmetal: dark blue-grey steel, so the screen-blended god-light
               reads as a bright top layer instead of washing into pale steel -->
          <linearGradient id="steel" x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0%" stop-color="#5b636e" />
            <stop offset="48%" stop-color="#3d434d" />
            <stop offset="52%" stop-color="#363c45" />
            <stop offset="100%" stop-color="#23272f" />
          </linearGradient>
          <radialGradient id="disc" cx="38%" cy="32%" r="82%">
            <stop offset="0%" stop-color="#586069" />
            <stop offset="62%" stop-color="#3a404a" />
            <stop offset="100%" stop-color="#262a32" />
          </radialGradient>
          <!-- gunmetal fill for a sliced plate piece (per-piece bounding box, so
               each piece carries its own top-left-lit sheen) -->
          <radialGradient id="plate" cx="38%" cy="30%" r="85%">
            <stop offset="0%" stop-color="#5e6671" />
            <stop offset="55%" stop-color="#3c424c" />
            <stop offset="100%" stop-color="#23272f" />
          </radialGradient>
          <!-- per-piece bevel: blur the shape's own alpha into a height map and
               light it from the top-left (azimuth 225). Diffuse gives the matte
               chamfer, specular the glint; both are composited back INSIDE the
               shape and merged over the fill. No mix-blend-mode anywhere, so it
               can't fall into the overlay-isolation grey-cover trap. -->
          <filter id="bevel" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="b" />
            <!-- diffuse shading as a near-white MULTIPLIER: flat areas stay close
                 to the piece's own colour, the bevel walls darken/brighten. This
                 keeps each piece's hue (brass stays brass) instead of greying it. -->
            <feDiffuseLighting in="b" surfaceScale="3" diffuseConstant="1.15" lighting-color="#fff" result="df">
              <feDistantLight azimuth="225" elevation="55" />
            </feDiffuseLighting>
            <feComposite in="df" in2="SourceGraphic" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit" />
            <!-- specular glint on the lit wall, clipped to the shape, added on top -->
            <feSpecularLighting in="b" surfaceScale="3" specularConstant="0.4" specularExponent="22" lighting-color="#fff" result="sp">
              <feDistantLight azimuth="225" elevation="55" />
            </feSpecularLighting>
            <feComposite in="sp" in2="SourceAlpha" operator="in" result="spc" />
            <feComposite in="lit" in2="spc" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
          </filter>
          <!-- copper: warm orange-brown (kept golden, not pushed to red) -->
          <linearGradient id="brass" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stop-color="#e0a45f" />
            <stop offset="50%" stop-color="#b3702f" />
            <stop offset="100%" stop-color="#7d4a20" />
          </linearGradient>
          <radialGradient id="brassLit" cx="40%" cy="34%" r="78%">
            <stop offset="0%" stop-color="#f6cf97" />
            <stop offset="55%" stop-color="#d28e47" />
            <stop offset="100%" stop-color="#9c5e26" />
          </radialGradient>
          <radialGradient id="discShade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#000" stop-opacity="0" />
            <stop offset="80%" stop-color="#000" stop-opacity="0" />
            <stop offset="100%" stop-color="#000" stop-opacity="0.4" />
          </radialGradient>
          <filter id="brushed" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.011 0.5" numOctaves="2" seed="7" result="n" />
            <feColorMatrix in="n" type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="linear" slope="0.5" /></feComponentTransfer>
          </filter>

          <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          <clipPath id="discClip">
            <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} />
          </clipPath>
          <!-- each door is clipped to its own half so the evenodd hole can't
               spill filled steel across into the other half (behind the lock) -->
          <clipPath id="doorClipL"><rect x="-125" y="-175" width="124.4" height="550" /></clipPath>
          <clipPath id="doorClipR"><rect x="0.6" y="-175" width="124.4" height="550" /></clipPath>
          <!-- the inner vignette is masked out of the pin circles so a pin near
               the rim reads flat -->
          <mask id="shadeMask">
            <rect x="-125" y="-175" width="250" height="550" fill="white" />
            {#each drawn.angles as a (a.id)}
              <circle cx={a.vx} cy={a.vy} r={PIN_R} fill="black" />
            {/each}
          </mask>
          <!-- holes bored in the lock face at every pin, so the pins (rendered
               behind the face) show through and the face occludes them as they
               recede -->
          <mask id="plateHoles" maskUnits="userSpaceOnUse" x="-125" y="-175" width="250" height="550">
            <rect x="-125" y="-175" width="250" height="550" fill="white" />
            {#each drawn.angles as a (a.id)}
              <circle cx={a.vx} cy={a.vy} r={PIN_R} fill="black" />
            {/each}
          </mask>
        </defs>

        <!-- the dark depth behind the doors, revealed through the lock hole and
             through the seam, and when the doors swing open at the end -->
        <rect x="-125" y="-175" width="250" height="550" class="door-void" />

        <!-- the two doors as real beveled pieces (board half minus the lock
             outline). They swing open toward the viewer (3D rotateY about their
             outer edge) once the lock has turned — the reward for solving it. -->
        <g class="door door-L" clip-path="url(#doorClipL)">
          <path d={doorPath('L')} fill-rule="evenodd" class="door-steel" style:fill={debugTint ? tintColor(900) : null} filter="url(#bevel)" />
          <path d={doorPath('L')} fill-rule="evenodd" class="door-grain" filter="url(#brushed)" />
        </g>
        <g class="door door-R" clip-path="url(#doorClipR)">
          <path d={doorPath('R')} fill-rule="evenodd" class="door-steel" style:fill={debugTint ? tintColor(901) : null} filter="url(#bevel)" />
          <path d={doorPath('R')} fill-rule="evenodd" class="door-grain" filter="url(#brushed)" />
        </g>

        <!-- everything that recedes / rotates as the lock opens -->
        <g class="lock" transform={lockXf}>
        <!-- the dark backplate: shows through every kerf gap and bored pin hole -->
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="backplate" />

        <!-- PINS, rendered BEHIND the lock face so a receding wedge is occluded
             by the face — it reads as dropped back, not just shrunk. Each pin is
             sliced into wedge pieces by every line through its vertex. The marked
             wedge (the angle) is solid brass; solving drops just that wedge; the
             rest cascade down at the end, then every pin turns a quarter turn
             (the <g class="pin-spin"> rotation), all together. -->
        {#each drawn.angles as a, ai (a.id)}
          {@const given = givenSet.has(a.id)}
          {@const fresh = flash.has(a.id)}
          {@const rcx = (a.vx * wedgeBack).toFixed(3)}
          {@const rcy = (a.vy * wedgeBack).toFixed(3)}
          <!-- origin -> the wedge's CURRENT centre (scaled by wedgeBack), so the
               spin below is a clean rotate about that centre even after the
               wedges flush back; the inner group puts the pieces at their real
               coords. Matching the translate to the wedge scale is what keeps
               the pin dead still as the lock recedes. -->
          <g class="pin-back" transform="translate({rcx} {rcy})">
            <g class="pin-spin" transform={pinTurn}>
              <g class="pin-back" transform="translate({(-a.vx * wedgeBack).toFixed(3)} {(-a.vy * wedgeBack).toFixed(3)})">
                <!-- once the lock is closing up, a solid gunmetal disc behind the
                     wedges so a rim pin reads as one solid pin (not thin wedges
                     over the open void) and stays visible against the flood -->
                {#if endShow && !debugTint}
                  <circle cx={a.vx} cy={a.vy} r={PIN_R} class="pin-backing" transform={`scale(${wedgeBack})`} filter="url(#bevel)" />
                {/if}
                {#each a.pieces as pc, j (j)}
                  {@const dn = pieceDown(ai, j)}
                  <path
                    d={pc.d}
                    class="pin-piece"
                    class:brass={!debugTint && (given || pc.marked)}
                    class:lit={!debugTint && fresh && pc.marked}
                    class:down={dn}
                    style:fill={debugTint ? tintColor(pinBase[ai] + j) : null}
                    style:transition-delay={phase === 'drop' ? dropDelayMs(ai, j) : '0ms'}
                    transform={`scale(${dn ? wedgeBack : 1})`}
                    filter="url(#bevel)"
                  />
                {/each}
              </g>
            </g>
          </g>
        {/each}

        <!-- the lock face: the sliced plate, with a hole bored at every pin so
             the pin behind shows through (and the dark backplate shows in the
             kerf gaps). Everything here is cut by the pin holes, so nothing draws
             across a pin — including the rim edge and the line glow. -->
        <g mask="url(#plateHoles)">
          {#each drawn.faces as f (f.id)}
            <path d={f.inset} class="plate-piece" filter="url(#bevel)" />
          {/each}
          {#if debugTint}
            {#each drawn.faces as f, i (f.id)}
              <path d={f.inset} fill={tintColor(i)} class="debug-tint" />
            {/each}
          {/if}
          <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="#d2d8df" filter="url(#brushed)" opacity="0.10" clip-path="url(#discClip)" />
          <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="rim-edge" fill="none" />
          <g class="line-glow" filter="url(#lineGlow)">
            {#each drawn.segments as s (s.id)}
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="glow-line" />
            {/each}
            <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="glow-line" fill="none" />
          </g>
        </g>

        <!-- inner vignette over the face (masked off the pins) -->
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="url(#discShade)" mask="url(#shadeMask)" />
        </g>
        <!-- /lock — god-light now lives in the <canvas> overlay, derived from the
             real openings rather than painted cones -->

        {#if preview}
          <polygon points={previewPoly} class="tri-preview" />
        {/if}


        <!-- triangle-preview corner highlights (no permanent joint dots) -->
        {#each drawn.points as pt (pt.id)}
          {#if preview?.includes(pt.id)}
            <circle cx={pt.x} cy={pt.y} r="4" class="corner-dot" />
          {/if}
        {/each}

        <!-- physics chain for a 2-part key -->
        {#if chain && chainPts.length}
          <polyline points={chainPts.map((p) => `${p.x},${p.y}`).join(' ')} class="rope" />
          {#each chainPts as p, i (i)}
            <circle cx={p.x} cy={p.y} r={i === chainPts.length - 1 ? 8 : 3} class="bead" class:handle={i === chainPts.length - 1} />
          {/each}
          {@const h = chainPts[chainPts.length - 1]}
          <circle cx={h.x} cy={h.y} r="18" class="grab" onpointerdown={startHandleGrab} role="button" tabindex="-1" aria-label="chain end" />
        {/if}

        <!-- invisible drop targets, on top so elementFromPoint finds them -->
        {#each drawn.angles as a (a.id)}
          <circle cx={a.vx} cy={a.vy} r="26" class="hit" data-angle={a.id} />
        {/each}
      </svg>

      <!-- god-light: WebGL shafts streaming through the lock's real openings,
           screen-blended over the steel. Pure eye-candy — pointer-events none. -->
      <canvas bind:this={glCanvas} class="godlight" class:lit aria-hidden="true"></canvas>
      <!-- debug: press 'l' to see the raw aperture mask (white = light passes) -->
      <canvas bind:this={apDbg} class="apdbg" class:on={debugAp} aria-hidden="true"></canvas>

      {#if import.meta.env.DEV && showCounter}
        <!-- recording marker: <stage> +<ms into stage> · f<frames into stage>.
             Resets each stage, so e.g. "doors +650ms" points me at an exact
             moment regardless of how long earlier stages took. Toggle with 'f'. -->
        <div class="hud-frame">{phase} +{clockMs}ms · f{frameNo}</div>
      {/if}

      <div class="hud-top">
        <div class="titles">
          <span class="room-line"><b>Room {level.id}</b> · {level.title}</span>
          <span class="intro">{level.intro}</span>
        </div>
        <button class="rooms-btn" onclick={onOpenRooms} aria-label="Rooms">▦</button>
      </div>

      <div class="hud-bottom">
        {#if chain}
          <div class="prompt">
            Drag the <b>{chainName}</b>’s loose end onto the part it links to.
            <button class="cancel" onclick={endChain}>✕ cancel</button>
          </div>
        {:else if drag?.keyId === 'triangle-sum'}
          <div class="prompt">Hover a triangle — its three corners light up.</div>
        {:else}
          <div class="prompt subtle">Drag a key onto the lock. It only bites where its rule holds.</div>
        {/if}

        <div class="tray">
          {#each allKeys as k (k.id)}
            {@const locked = !isUnlocked(k.id)}
            {@const active = chain?.keyId === k.id}
            {@const dimmed = chain && !active}
            <div
              class="key"
              class:locked
              class:active
              class:dimmed
              title={locked ? 'Locked — win this key in an earlier room' : k.blurb}
              onpointerdown={(e) => startKeyDrag(e, k.id)}
            >
              {@render keyIcon(k.id)}
              {#if locked}<span class="lock-badge">🔒</span>{/if}
            </div>
          {/each}
        </div>
      </div>

  {#if toast}<div class="toast">{toast}</div>{/if}

  <!-- white flash: full on entry (fades in the level from white) and at the end
       of the transition (fades out to the next level) -->
  <div class="whiteout" class:on={phase === 'intro' || phase === 'flash'}></div>

  {#if drag}
    <div class="ghost" style="left:{drag.x}px; top:{drag.y}px">{@render keyIcon(drag.keyId)}</div>
  {/if}
</div>

<style>
  /* the play area is a tall 1:2.2 panel filling the screen, flush to the top */
  .screen {
    position: relative;
    height: 100dvh;
    aspect-ratio: 250 / 550;
    max-width: 100vw;
    margin: 0 auto;
    overflow: hidden;
    color: #e8edf7;
    user-select: none;
    touch-action: none;
  }
  .screen.shake {
    animation: shake 0.26s;
  }
  @keyframes shake {
    25% {
      transform: translateX(-5px);
    }
    75% {
      transform: translateX(5px);
    }
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    transition: filter 0.6s ease;
  }
  svg.open {
    filter: drop-shadow(0 0 24px rgba(255, 210, 120, 0.5));
  }

  /* HUD overlaid on the steel, with scrims for legibility */
  .hud-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.7rem 0.85rem 1.4rem;
    pointer-events: none;
    background: linear-gradient(to bottom, rgba(8, 12, 20, 0.6), rgba(8, 12, 20, 0));
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  .room-line {
    font-size: 0.9rem;
    letter-spacing: 0.02em;
  }
  .intro {
    font-size: 0.78rem;
    opacity: 0.72;
    max-width: 32ch;
  }
  .rooms-btn {
    pointer-events: auto;
    flex: none;
    background: rgba(20, 28, 44, 0.7);
    border: 1px solid #3a4a73;
    color: #dce4f5;
    border-radius: 8px;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
    font-size: 0.95rem;
  }
  .rooms-btn:hover {
    border-color: #ffe07a;
  }
  /* sits just below the lock (which bottoms out at ~50% of the tall board) so
     the game clusters near the top; steel + seam carry on down behind it */
  .hud-bottom {
    position: absolute;
    top: 51%;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.8rem;
    pointer-events: none;
  }
  .hud-bottom .prompt,
  .hud-bottom .tray,
  .hud-bottom .cancel {
    pointer-events: auto;
  }

  /* sliced-plate pieces: the dark void behind the gaps, the steel tiles, and
     the crisp outer rim of the disc */
  .backplate {
    fill: #0a0c10;
  }
  /* the void behind the doors, seen through the lock hole + seam, and when the
     doors swing open */
  .door-void {
    fill: #06070a;
  }
  /* the two doors: real beveled steel pieces with the lock outline cut out */
  .door-steel {
    fill: url(#steel);
  }
  .door-grain {
    fill: #d2d8df;
    opacity: 0.12;
  }
  /* the doors slide straight off to the sides (ease-out, no overshoot — a swing
     can't be tracked by the light, and bounce made them jump back). */
  .door {
    transform-box: fill-box;
    transition: transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .screen.doors .door-L,
  .screen.flash .door-L {
    transform: translateX(-118%);
  }
  .screen.doors .door-R,
  .screen.flash .door-R {
    transform: translateX(118%);
  }
  .plate-piece {
    fill: url(#plate);
  }
  /* DEBUG: translucent colour wash over each piece (steel/bevel stays visible) */
  .debug-tint {
    opacity: 0.45;
    pointer-events: none;
  }
  .rim-edge {
    stroke: #14171d;
    stroke-width: 1.2;
  }

  .corner-dot {
    fill: #ffe07a;
    stroke: #8a6320;
    stroke-width: 0.7;
    pointer-events: none;
  }

  /* a pin's wedge piece: a real beveled slice. Steel by default; brass for the
     marked angle (given / solved), brighter brass when freshly solved. */
  .pin-piece {
    fill: url(#plate);
  }
  /* solid gunmetal backing so a pin reads as one piece at the end */
  .pin-backing {
    fill: url(#plate);
  }
  .pin-piece.brass {
    fill: url(#brass);
  }
  .pin-piece.lit {
    fill: url(#brassLit);
  }
  /* needed/working angle: a brass arc on the angle portion of the steel ring */
  .pin-arc {
    fill: none;
    stroke: url(#brass);
    stroke-width: 2.8;
    stroke-linecap: butt;
  }
  .pin-arc.pending {
    stroke: url(#brassLit);
    stroke-width: 3.4;
  }
  /* solved: the angle's slice fills with brass (rest of the circle stays steel) */
  .pin-slice {
    fill: url(#brassLit);
    filter: drop-shadow(0 0 4px rgba(225, 150, 80, 0.5));
  }
  .pin-slice.flash {
    fill: #ffdcb0;
    filter: drop-shadow(0 0 9px rgba(230, 160, 90, 0.95));
  }
  /* bevel source for brass edges — ~half the steel cut girth */
  .brass-edge {
    fill: none;
    stroke: #fff;
    stroke-width: 1;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tri-preview {
    fill: rgba(230, 185, 80, 0.18);
    stroke: #e8b94e;
    stroke-width: 1.5;
    stroke-linejoin: round;
    pointer-events: none;
  }

  .hit {
    fill: transparent;
    cursor: default;
  }

  .rope {
    fill: none;
    stroke: #b9b29a;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bead {
    fill: #d8d2bd;
  }
  .bead.handle {
    fill: url(#brassLit);
    stroke: #8a6320;
    stroke-width: 1.4;
  }
  .grab {
    fill: transparent;
    cursor: grab;
  }
  .grab:active {
    cursor: grabbing;
  }

  .prompt {
    text-align: center;
    font-size: 0.85rem;
    min-height: 1.2rem;
    color: #1c222c;
    font-weight: 600;
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.25);
  }
  .prompt.subtle {
    opacity: 0.4;
  }
  .cancel {
    margin-left: 0.5rem;
    background: none;
    border: none;
    color: #ff9b9b;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .tray {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .key {
    position: relative;
    width: 54px;
    height: 54px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    border: 1px solid #474e5c;
    background: linear-gradient(160deg, #2c333f, #1b212b);
    color: #e7be5e;
    cursor: grab;
    touch-action: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 2px 4px rgba(0, 0, 0, 0.35);
    transition: opacity 0.15s, box-shadow 0.15s, border-color 0.15s, transform 0.1s;
  }
  .key:hover:not(.locked):not(.dimmed) {
    border-color: #e7be5e;
    transform: translateY(-1px);
  }
  .key:active {
    cursor: grabbing;
  }
  .ki {
    display: block;
    width: 28px;
    height: 28px;
  }
  .key.locked {
    color: #6b7280;
    cursor: not-allowed;
    border-style: dashed;
    opacity: 0.6;
  }
  .key.dimmed {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .key.active {
    border-color: #ffe07a;
    box-shadow: 0 0 0 2px rgba(255, 224, 122, 0.35);
    color: #ffe07a;
  }
  .lock-badge {
    position: absolute;
    right: 2px;
    bottom: 1px;
    font-size: 0.7rem;
    filter: grayscale(0.4);
  }

  .ghost {
    position: fixed;
    transform: translate(-50%, -50%);
    color: #ffe07a;
    pointer-events: none;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
    z-index: 50;
  }
  .ghost :global(.ki) {
    width: 38px;
    height: 38px;
  }

  .toast {
    position: absolute;
    bottom: 5.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: #10182b;
    border: 1px solid #3a4a73;
    padding: 0.5rem 0.9rem;
    border-radius: 10px;
    font-size: 0.85rem;
  }
  /* ── level transition ──
     Transforms are SVG attributes; these transitions just smooth them, with a
     bouncy back-out for a mechanical clunk.
     real easeOutBounce (a ball settling) — cubic-bezier can't multi-bounce, so
     use the linear() easing with the Penner bounce curve */
  .pin-piece,
  .pin-spin,
  .lock {
    --bounce: linear(
      0, 0.012, 0.069, 0.169, 0.302, 0.474, 0.681 35%, 1 36.4%, 0.892, 0.819,
      0.772, 0.75 54.5%, 0.764, 0.812, 0.892, 1 72.7%, 0.966, 0.939, 0.939 81.8%,
      0.966, 1 90.9%, 0.989, 0.984, 0.997, 1
    );
  }
  /* each wedge recedes (toward the vanishing point) on its own delay. Duration
     matches .lock (0.66s) so when the wedges flush back AS the lock recedes,
     the two scales stay in lock-step and the pin's net depth — hence its
     position — does not drift mid-tween. */
  .pin-piece {
    transition: transform 0.66s var(--bounce), opacity 0.45s ease;
  }
  .pin-piece.down {
    opacity: 0.9; /* a touch dimmer once dropped back */
  }
  /* the quarter turn: a clean in-place rotation, all pins together, bounce-out */
  .pin-spin {
    transition: transform 0.66s var(--bounce);
  }
  /* the nesting that positions the spin pivot at the wedge's current centre.
     Eases in lock-step with the wedge scale and the lock recede (all 0.66s
     --bounce) so the pivot tracks the wedge as it flushes — keeps the pin dead
     still through the recede instead of wobbling. */
  .pin-back {
    transition: transform 0.66s var(--bounce);
  }
  .lock {
    transition: transform 0.66s var(--bounce);
  }

  /* god-light: a WebGL canvas of volumetric shafts streaming through the lock's
     real openings, screen-blended (so its black background adds nothing) over
     the steel. Sits above the SVG, below the HUD. Fades in once it has rendered
     a frame so there's never a black flash before the first paint. */
  .godlight {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    mix-blend-mode: screen;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .godlight.lit {
    opacity: 1;
  }
  /* debug aperture overlay: opaque mask straight from the rasteriser */
  .apdbg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
    opacity: 0;
  }
  .apdbg.on {
    opacity: 0.92;
  }
  /* faint light off every engraved line, only once the lock is opening */
  .line-glow {
    mix-blend-mode: screen;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.6s ease;
  }
  .screen.rotate .line-glow,
  .screen.flash .line-glow {
    opacity: 0.5;
  }
  .glow-line {
    stroke: #fff3d8;
    stroke-width: 2;
    fill: none;
  }

  /* recording marker (dev): sits low-centre in the empty board area, well clear
     of the lock; high-contrast monospace so it's legible in a screen capture */
  .hud-frame {
    position: absolute;
    top: 63%; /* just below the key tray (which sits at ~51%) */
    left: 50%;
    transform: translateX(-50%);
    z-index: 60;
    pointer-events: none;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
    color: #d6ff7a;
    background: rgba(0, 0, 0, 0.72);
    border: 1px solid rgba(214, 255, 122, 0.35);
    border-radius: 7px;
    padding: 0.2rem 0.55rem;
    white-space: nowrap;
  }

  .whiteout {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 32%, #fff, #fbf7ee);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.5s ease;
  }
  .whiteout.on {
    opacity: 1;
  }
  /* on the flash, ramp in fast and hard */
  .screen.flash .whiteout {
    transition: opacity 0.45s ease-in;
  }
</style>
