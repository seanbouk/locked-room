<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock } from '../engine/game';
  import { drawPuzzle, PIN_R } from '../render/figure';
  import { makeRope, stepRope, type Bead } from '../render/rope';
  import { ALL_KEYS, type Placement } from '../engine/theorems';
  import { GodLight } from '../render/godlight';
  import { KEY_COLORS, KEY_INK } from '../render/keyStyle';
  import { sfx } from '../audio/sfx';
  import KeyIcon from './KeyIcon.svelte';
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
  // A "press-to-open" room: no pins, no theorem — just the lock itself. It opens
  // on a tap, reusing the end-of-puzzle release, so we drop straight into the
  // 'jiggle' phase (the trembling lock + tap target) instead of 'play'.
  const tutorial = drawn.angles.length === 0;
  // Cosmetic: a same-segment twin's sides, drawn as faint hairlines so the twin
  // doesn't read as a second solvable triangle (see the plate render below).
  const faintKeys = new Set((level.faintSegments ?? []).map(([a, b]) => [a, b].sort().join('|')));
  const isFaintSeg = (id: string) => faintKeys.has(id.split('-').sort().join('|'));
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
  // angle id -> the skeleton key that solved it, so the light its wedge reveals
  // glows in that key's colour (see rasterizeAperture / the god-light tint).
  let solvedBy = $state(new Map<string, string>());
  // angle id -> key that "loosened" it: a valid placement that doesn't yet solve
  // a value tints the affected segments to that key's colour (progress on the
  // board, instead of a toast).
  let loosenedBy = $state(new Map<string, string>());
  let flash = $state(new Set<string>());
  let appliedLabels = $state(new Set<string>());
  // a wrong drop jitters the ITEM it landed on (a pin, or a triangle) — never the
  // whole screen, which won't exist once the game fills its frame.
  let shakePins = $state(new Set<string>());
  let shakeTri = $state<string[]>([]);

  // Level-transition state machine. Recede works PER SEGMENT now: solving an
  // angle drops just its (brass) wedge. On the lock opening: drop the remaining
  // wedges in a heavily-overlapped cascade -> spin every pin a quarter turn ->
  // shrink the whole lock back -> rotate it 90deg -> flash white -> next level.
  const HB = 640;
  // 'jiggle' parks the sequence once every pin is down and turned: the lock face
  // rattles (each plate piece on its own axis) and waits for a tap before the
  // body recedes and opens — see startTransition / finishTransition.
  type Phase = 'intro' | 'play' | 'drop' | 'spin' | 'jiggle' | 'circleBack' | 'rotate' | 'doors' | 'flash';
  let phase = $state<Phase>('intro');
  // fade in from white, then play — or, for a press-to-open room, straight into
  // the trembling 'jiggle' that waits for the tap.
  setTimeout(() => phase === 'intro' && (phase = tutorial ? 'jiggle' : 'play'), 40);
  const transitioning = $derived(phase !== 'play' && phase !== 'intro');
  // From 'drop' on, every wedge is down; from 'spin' on, every pin is turned.
  const dropping = $derived(phase !== 'play' && phase !== 'intro');
  const spun = $derived(
    phase === 'spin' ||
      phase === 'jiggle' ||
      phase === 'circleBack' ||
      phase === 'rotate' ||
      phase === 'doors' ||
      phase === 'flash',
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

  // Per-plate-piece "rattle" params for the pre-open pause: each tile shakes on
  // its own axis, phase and tempo so the lock body buzzes as a loose collection
  // of parts, not one rigid block. Generated once; amplitudes are in viewBox
  // units (px maps to user units for an SVG element's CSS transform).
  const faceJiggle = drawn.faces.map(() => {
    const ang = Math.random() * Math.PI * 2;
    const amp = 0.35 + Math.random() * 0.5; // 0.35–0.85 user units of travel
    return {
      dx: +(Math.cos(ang) * amp).toFixed(2),
      dy: +(Math.sin(ang) * amp).toFixed(2),
      dr: +((Math.random() * 2 - 1) * 0.9).toFixed(2), // ±0.9°
      delay: +(-Math.random() * 0.25).toFixed(3), // negative: desync the starts
      dur: +(0.12 + Math.random() * 0.08).toFixed(3), // 0.12–0.20s per cycle
    };
  });

  function startTransition() {
    phase = 'drop'; // cascade the remaining wedges down
    const tDrop = Math.max(HB, dropOrder.size * DROP_STAGGER + 480);
    setTimeout(() => (phase = 'spin'), tDrop); // quarter-turn every pin together
    // ...then PARK: every pin is down and turned, so the lock face rattles and
    // waits for a tap (finishTransition) before the body recedes and opens.
    setTimeout(() => (phase = 'jiggle'), tDrop + 560);
  }

  // The tap that releases the parked lock: stop the rattle (the pieces snap home
  // the instant the 'jiggle' class drops), then run the original recede → turn →
  // doors → flash → complete sequence, preserving its timing.
  function finishTransition() {
    if (phase !== 'jiggle') return;
    sfx.clunk(); // the tap registers
    phase = 'circleBack';
    const tRot = 520;
    const tDoors = tRot + HB; // the lock has turned; now the doors swing open
    const tFlash = tDoors + HB + 520;
    setTimeout(() => (phase = 'rotate'), tRot);
    setTimeout(() => (phase = 'doors'), tDoors);
    setTimeout(() => (phase = 'flash'), tFlash); // flash once the doors are open
    setTimeout(() => onComplete(), tFlash + 600);
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
        ? `M -186 -196 L ${-SEAM} -196 L ${-SEAM} 300 L -186 300 Z`
        : `M ${SEAM} -196 L 186 -196 L 186 300 L ${SEAM} 300 Z`;
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
  const VB = { x: -186, y: -196, w: 372, h: 496 }; // = drawn.viewBox
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
  // 0 during play (each opening glows its solving key's colour) -> 1 as the lock
  // seats at round-end (the coloured shafts wash up to a white flood).
  let whiten = 0;
  let lit = $state(false); // started raining light at least once (fades canvas in)

  // ── Dev HUD counter ─────────────────────────────────────────────────────────
  // An on-screen marker so a recorded video can be referenced precisely. The
  // clock RESETS at the start of each stage (phase), so the reading is always
  // "stage + ms into that stage" — independent of how long earlier stages (e.g.
  // the variable-length drop cascade) took. So "doors +650ms" maps straight to
  // 650ms into the door swing. Reads "<phase> +<ms>ms · f<frame>". Toggle 'f'.
  let showCounter = $state(false); // hidden; press 'f' to show for recording
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
  // The coloured solve-light holds through play and the wedge cascade, then washes
  // up to white as the lock recedes, turns and the doors open (the lock "going in").
  const whitenTarget = () => {
    switch (phase) {
      case 'circleBack':
        return 0.55;
      case 'rotate':
        return 0.85;
      case 'doors':
      case 'flash':
        return 1;
      default:
        return 0; // intro / play / drop / spin: keep the key colours
    }
  };

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
      clip.rect(side === 'L' ? -186 : SEAM, -196, 186 - SEAM, 496);
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
      for (const a of drawn.angles) {
        // the bright room behind this pin is tinted by the key that solved it, so
        // when its wedge drops the light spilling through glows that colour. Given
        // / not-yet-solved pins stay white. (The whole field washes white at the
        // end via the god-light `whiten`, so given pins don't read as "dead".)
        const by = solvedBy.get(a.id);
        apCtx.fillStyle = by ? KEY_COLORS[by] : '#fff';
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
    const wt = whitenTarget();
    whiten += (wt - whiten) * 0.16;
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
      whiten, // key-colour during play -> white as the lock seats
    });
    lit = true;
    const easing = Math.abs(it - intensity) > 0.01 || Math.abs(wt - whiten) > 0.01;
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

  // Rough wedge size (0..1) from its path bbox — drives drop pitch/volume so big
  // pieces land low + loud, small ones high + quiet. Approximate is fine: it's
  // only for variety.
  function wedgeSize(d: string): number {
    const n = d.match(/-?\d+(?:\.\d+)?/g);
    if (!n) return 0.5;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i + 1 < n.length; i += 2) {
      const x = +n[i], y = +n[i + 1];
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
    const area = Math.max(0, maxx - minx) * Math.max(0, maxy - miny);
    return Math.max(0, Math.min(1, Math.sqrt(area) / 30));
  }
  // Schedule a sized drop sound for every wedge in the end cascade, each at its
  // own stagger delay + the bounce's first-contact (~0.22s into the tween).
  function scheduleDropFoley() {
    for (const [k, idx] of dropOrder) {
      const dash = k.indexOf('-');
      const ai = +k.slice(0, dash);
      const pc = drawn.angles[ai]?.pieces[+k.slice(dash + 1)];
      if (pc) sfx.drop(wedgeSize(pc.d), (idx * DROP_STAGGER) / 1000 + 0.22);
    }
  }

  // End-sequence foley: one sound per stage of the lock opening.
  $effect(() => {
    switch (phase) {
      case 'drop': scheduleDropFoley(); break; // every wedge lands (sized)
      case 'spin': sfx.slide(); break; // pins turn a quarter
      case 'jiggle': {
        // continuous metal rattle while the parked lock buzzes; cleared the
        // moment the tap moves us off 'jiggle'
        sfx.rattle();
        const iv = setInterval(() => sfx.rattle(), 110);
        return () => clearInterval(iv);
      }
      case 'circleBack': sfx.lockSlide(); break; // the whole lock slides/seats
      case 'doors': sfx.door(); break; // doors slide open
      case 'flash': sfx.thud(); break; // it opens
    }
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
  // Dropping the loose end on a wrong node: the key comes off rather than waiting
  // for a cancel. The anchor lets go first (the chain twangs toward the cursor),
  // then a beat later the held end lets go too and the whole key falls off-screen.
  let failing = $state(false);
  let failPt = { x: 0, y: 0 }; // where the cursor released — the brief pin point
  let failHeld = false; // is the loose end still pinned to failPt (phase 1)?

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

  // While a key is in hand — pressed/dragged off the tray, or a 2-part key
  // mid-link — name what it does below the tray (the caption) and give its valid
  // drop spots a soft, colour-coded aura, so players who click rather than drag
  // can still see where it goes.
  const activeKeyId = $derived(chain?.keyId ?? drag?.keyId ?? null);
  const hint = $derived.by(() => {
    if (!activeKeyId) return null;
    // The aura shows WHERE a key can be dropped, not where it belongs — so glow
    // EVERY candidate, never just the solving ones (that gave the game away).
    if (activeKeyId === 'triangle-sum')
      return { keyId: activeKeyId, nodes: [] as string[], tris: geomTriangles.map((t) => t.verts) };
    // every pin is a legal drop spot; skip only the chain's anchor (it already
    // holds the chain — you drop the loose end on one of the others).
    const nodes = drawn.angles.map((a) => a.id).filter((id) => id !== chain?.anchor);
    return { keyId: activeKeyId, nodes, tris: [] as string[][] };
  });
  const auraTriPoly = (verts: string[]) =>
    verts.map((v) => { const p = ptPos.get(v)!; return `${p.x},${p.y}`; }).join(' ');

  // Live chain geometry for rendering (recomputes each animation frame).
  const chainPts = $derived.by(() => {
    ropeTick;
    return ropeBeads.map((b) => ({ x: b.x, y: b.y }));
  });

  // Reject feedback: the reject sound, and a brief jitter on whatever it was
  // dropped on — `pins` (angle ids) or a `tri` (the triangle's corner points).
  // No target (dropped in empty space) = just the sound.
  function reject(target?: { pins?: string[]; tri?: string[] }) {
    sfx.reject();
    if (target?.pins?.length) {
      shakePins = new Set(target.pins);
      setTimeout(() => (shakePins = new Set()), 320);
    } else if (target?.tri?.length) {
      shakeTri = target.tri;
      setTimeout(() => (shakeTri = []), 320);
    }
  }
  const shakeTriPoly = $derived(
    shakeTri.length ? shakeTri.map((v) => { const p = ptPos.get(v)!; return `${p.x},${p.y}`; }).join(' ') : '',
  );

  function apply(p: Placement) {
    // Apply the rule wherever it legally fits — even if it determines no value
    // yet (a forced combination resolves with a later key). No "not yet" copy:
    // the board shows progress by tinting the affected segments (see below).
    const newIds = lock.apply(p);
    appliedLabels = new Set([...appliedLabels, p.label]);
    solved = new Set(lock.solvedIds());
    endChain();
    preview = null;
    if (newIds.length) {
      // Colour EVERY node this key acts on, not just the one it newly solved — a
      // two-part key opens both its nodes, so the light from both glows its
      // colour (until the round-end whitening), even if the partner was already
      // known. The latest key to act on a node owns its colour.
      const sb = new Map(solvedBy);
      for (const id of p.angleIds) sb.set(id, p.keyId);
      solvedBy = sb;
      sfx.latch(); // a key bit and solved something
      // ...and each freshly-solved wedge drops back (sized like the cascade)
      for (const id of newIds) {
        if (givenSet.has(id)) continue;
        const pc = drawn.angles.find((x) => x.id === id)?.pieces.find((q) => q.marked);
        if (pc) sfx.drop(wedgeSize(pc.d), 0.2);
      }
      flash = new Set(newIds);
      setTimeout(() => (flash = new Set()), 900);
    } else {
      // valid but nothing resolves yet — mark EVERY touched node as "loosened"
      // (tinted to this key's colour) so progress reads on the board. Colour all
      // of them, including a given vertex: a triangle key engages all three of
      // its angles, so all three should carry the mark (a freshly-solved
      // non-given wedge still keeps its brass — the template guards that).
      const lb = new Map(loosenedBy);
      for (const id of p.angleIds) lb.set(id, p.keyId);
      loosenedBy = lb;
      sfx.clunk(); // the key engaged / loosened it
    }
    if (lock.isOpen) setTimeout(startTransition, 350);
  }

  // ── Chain lifecycle ─────────────────────────────────────────────────────────
  function startChain(keyId: string, anchor: string) {
    sfx.clunk(); // first part of a two-part key latches onto its anchor
    chain = { keyId, anchor };
    const a = vpos(anchor);
    const c = { x: drawn.circle.cx, y: drawn.circle.cy };
    // The chain spawns pointing from the anchor toward the centre (so a rim pin's
    // chain hangs inward). But the angle-at-centre key anchors on the CENTRE pin,
    // where "toward centre" is zero-length — the beads spawn stacked on the pin
    // and barely un-stack. So when the anchor is the centre, dangle straight down.
    const toward = Math.hypot(a.x - c.x, a.y - c.y) < 1 ? { x: c.x, y: c.y + 100 } : c;
    ropeBeads = makeRope(a.x, a.y, toward);
    grabbing = false;
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function endChain() {
    chain = null;
    grabbing = false;
    failing = false;
    failHeld = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  // Wrong second node: let the key fall off instead of needing the cancel button.
  // Free the anchor now (the chain whips toward the held cursor), drop the held
  // end a beat later, then clear once it's fallen off-screen.
  function failChain(pt: { x: number; y: number }) {
    if (!chain || failing) return;
    sfx.reject(); // wrong node — the key comes off
    failPt = pt;
    failing = true;
    failHeld = true;
    grabbing = false;
    // kill the drag velocity so the key swings cleanly from the cursor and drops,
    // instead of flinging off in whatever direction it was last yanked.
    for (const b of ropeBeads) {
      b.px = b.x;
      b.py = b.y;
    }
    setTimeout(() => (failHeld = false), 190); // release the second part
    setTimeout(endChain, 1100); // it's left the screen by now
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop() {
    if (!chain) {
      raf = 0;
      return;
    }
    if (failing) {
      // Phase 1 (failHeld): anchor free, held end pinned at the cursor, still
      // bounded — the chain snaps/twangs toward the cursor on-screen. Phase 2:
      // both ends free, unbounded + heavier gravity, so the key drops off-screen.
      stepRope(ropeBeads, null, failHeld ? failPt : null, {
        bound: failHeld,
        gravity: failHeld ? 0.35 : 0.75,
      });
    } else {
      stepRope(ropeBeads, vpos(chain.anchor), grabbing ? handlePt : null);
    }
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
      else reject(t ? { tri: t.verts } : undefined); // jitter the triangle it landed on
      return;
    }

    const angleEl = el?.closest('[data-angle]');
    if (!angleEl) return reject();
    const A = angleEl.getAttribute('data-angle')!;
    if (arityOf(d.keyId) === 1) {
      const p = placementsFor(d.keyId).find((q) => q.angleIds.includes(A));
      if (p) apply(p);
      else reject({ pins: [A] }); // jitter the pin it landed on
    } else {
      // A two-part key anchors on ANY node you drop it on — don't reject up front.
      // You then drag the loose end to the second node, and it only fails (in
      // onHandleUp) if that pair isn't a valid placement. Lets the player try the
      // link rather than noping the first half.
      startChain(d.keyId, A);
    }
  }
  function startKeyDrag(e: PointerEvent, keyId: string) {
    if (!isUnlocked(keyId) || chain) return;
    e.preventDefault();
    sfx.clunk(); // lifting a key off the tray
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
    // the chain layer sits on top, so the grab/rope would shadow the node under
    // the cursor — scan the whole hit-stack for the drop target instead.
    const angleEl = document
      .elementsFromPoint(e.clientX, e.clientY)
      .map((el) => el.closest('[data-angle]'))
      .find(Boolean);
    if (!angleEl) return;
    const B = angleEl.getAttribute('data-angle')!;
    if (B === chain.anchor) return;
    const done = placementsFor(chain.keyId).find(
      (p) => p.angleIds.length === 2 && p.angleIds.includes(chain!.anchor) && p.angleIds.includes(B),
    );
    if (done) apply(done);
    else failChain(handlePt); // wrong node — the key twangs off and falls away
  }
  function startHandleGrab(e: PointerEvent) {
    e.preventDefault();
    grabbing = true;
    handlePt = toSvg(e.clientX, e.clientY);
    window.addEventListener('pointermove', onHandleMove);
    window.addEventListener('pointerup', onHandleUp);
  }

  // Changed your mind? Tap the pin a two-part key hangs from and it just drops.
  function onPinTap(e: PointerEvent, id: string) {
    if (!chain || failing || id !== chain.anchor) return;
    e.preventDefault();
    e.stopPropagation();
    const last = ropeBeads[ropeBeads.length - 1];
    failChain(last ? { x: last.x, y: last.y } : vpos(chain.anchor)); // falls from where it hangs
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

</script>

<svelte:window onkeydown={onKeydown} />

<div class="screen {phase}">
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
          <!-- soft drop-hint aura, one off-centre radial per key colour (a shared
               gradient with currentColor resolves inconsistently across browsers,
               so we bake one per colour). Spun for a gentle swirl, blurred and
               screen-blended so it reads as a glow rather than a shape. -->
          {#each Object.entries(KEY_COLORS) as [kid, col] (kid)}
            <radialGradient id="aura-{kid}" cx="40%" cy="38%" r="60%">
              <stop offset="0%" stop-color={col} stop-opacity="0.85" />
              <stop offset="45%" stop-color={col} stop-opacity="0.4" />
              <stop offset="100%" stop-color={col} stop-opacity="0" />
            </radialGradient>
          {/each}
          <filter id="auraSoft" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
          <clipPath id="discClip">
            <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} />
          </clipPath>
          <!-- each door is clipped to its own half so the evenodd hole can't
               spill filled steel across into the other half (behind the lock) -->
          <clipPath id="doorClipL"><rect x="-186" y="-196" width="185.4" height="496" /></clipPath>
          <clipPath id="doorClipR"><rect x="0.6" y="-196" width="185.4" height="496" /></clipPath>
          <!-- the inner vignette is masked out of the pin circles so a pin near
               the rim reads flat -->
          <mask id="shadeMask">
            <rect x="-186" y="-196" width="372" height="496" fill="white" />
            {#each drawn.angles as a (a.id)}
              <circle cx={a.vx} cy={a.vy} r={PIN_R} fill="black" />
            {/each}
          </mask>
          <!-- holes bored in the lock face at every pin, so the pins (rendered
               behind the face) show through and the face occludes them as they
               recede -->
          <mask id="plateHoles" maskUnits="userSpaceOnUse" x="-186" y="-196" width="372" height="496">
            <rect x="-186" y="-196" width="372" height="496" fill="white" />
            {#each drawn.angles as a (a.id)}
              <circle cx={a.vx} cy={a.vy} r={PIN_R} fill="black" />
            {/each}
          </mask>
        </defs>

        <!-- the dark depth behind the doors, revealed through the lock hole and
             through the seam, and when the doors swing open at the end -->
        <rect x="-186" y="-196" width="372" height="496" class="door-void" />

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
          <g class="pin-jitter" class:shaking={shakePins.has(a.id)}>
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
                  <!-- a marked segment a key has ACTED on takes that key's colour:
                       loosened (not yet solved) OR a known/given end of a 2-part key,
                       so both ends carry the mark. A freshly-solved non-given wedge
                       keeps its brass drop/flash. -->
                  {@const actedKey =
                    pc.marked && (given || !solved.has(a.id))
                      ? (solvedBy.get(a.id) ?? loosenedBy.get(a.id))
                      : undefined}
                  <path
                    d={pc.d}
                    class="pin-piece"
                    class:brass={!debugTint && (given || pc.marked) && !actedKey}
                    class:lit={!debugTint && fresh && pc.marked}
                    class:down={dn}
                    style:fill={debugTint ? tintColor(pinBase[ai] + j) : actedKey ? KEY_COLORS[actedKey] : null}
                    style:transition-delay={phase === 'drop' ? dropDelayMs(ai, j) : '0ms'}
                    transform={`scale(${dn ? wedgeBack : 1})`}
                    filter="url(#bevel)"
                  />
                {/each}
              </g>
            </g>
          </g>
          </g>
        {/each}

        <!-- the lock face: the sliced plate, with a hole bored at every pin so
             the pin behind shows through (and the dark backplate shows in the
             kerf gaps). Everything here is cut by the pin holes, so nothing draws
             across a pin — including the rim edge and the line glow. -->
        <g mask="url(#plateHoles)">
          {#each drawn.faces as f, i (f.id)}
            <path
              d={f.inset}
              class="plate-piece"
              style:--jx="{faceJiggle[i].dx}px"
              style:--jy="{faceJiggle[i].dy}px"
              style:--jr="{faceJiggle[i].dr}deg"
              style:--jd="{faceJiggle[i].delay}s"
              style:--jt="{faceJiggle[i].dur}s"
              filter="url(#bevel)"
            />
          {/each}
          {#if debugTint}
            {#each drawn.faces as f, i (f.id)}
              <path d={f.inset} fill={tintColor(i)} class="debug-tint" />
            {/each}
          {/if}
          <!-- soften a same-segment twin's sides: a plate-toned line laid over
               those kerfs so they read as faint hairlines, not a second solvable
               triangle. Masked like the plate, so it never covers a pin. -->
          {#if !debugTint}
            {#each drawn.segments as s (s.id)}
              {#if isFaintSeg(s.id)}
                <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="faint-edge" />
              {/if}
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

        <!-- soft colour-coded auras over every spot the held key can go (pins for
             1/2-part keys, triangles for the triangle key) -->
        {#if hint && phase === 'play'}
          <g class="aura-layer" aria-hidden="true">
            {#each hint.nodes as id (id)}
              {@const v = vpos(id)}
              <g transform="translate({v.x} {v.y})">
                <g class="aura-node">
                  <circle r="28" fill="url(#aura-{hint.keyId})" filter="url(#auraSoft)" />
                </g>
              </g>
            {/each}
            {#each hint.tris as verts, i (i)}
              <polygon points={auraTriPoly(verts)} fill="url(#aura-{hint.keyId})" filter="url(#auraSoft)" />
            {/each}
          </g>
        {/if}

        {#if preview}
          <polygon points={previewPoly} class="tri-preview" />
        {/if}
        {#if shakeTri.length}
          <polygon points={shakeTriPoly} class="tri-shake" />
        {/if}


        <!-- triangle-preview corner highlights (no permanent joint dots) -->
        {#each drawn.points as pt (pt.id)}
          {#if preview?.includes(pt.id)}
            <circle cx={pt.x} cy={pt.y} r="4" class="corner-dot" />
          {/if}
        {/each}

        <!-- invisible drop targets, on top so elementFromPoint finds them -->
        {#each drawn.angles as a (a.id)}
          <circle cx={a.vx} cy={a.vy} r="26" class="hit" data-angle={a.id} onpointerdown={(e) => onPinTap(e, a.id)} role="button" tabindex="-1" aria-label="angle {a.id}" />
        {/each}

        <!-- the parked lock: a full-board tap target (above the pin hits) so a
             tap anywhere releases the rattling lock and finishes the level -->
        {#if phase === 'jiggle'}
          <rect x="-186" y="-196" width="372" height="496" class="jiggle-tap" onpointerdown={finishTransition} role="button" tabindex="-1" aria-label="open the lock" />
        {/if}
      </svg>

      <!-- the 2-part key's chain, in its own layer ABOVE the HUD (same viewBox)
           so the handle can be grabbed even where it crosses the key tray, and
           isn't hidden behind the buttons. pointer-events: none except the grab,
           so drops still fall through to the .hit targets below. -->
      {#if chain && chainPts.length}
        <svg class="chain-layer" viewBox={drawn.viewBox} aria-hidden="true">
          <polyline points={chainPts.map((p) => `${p.x},${p.y}`).join(' ')} class="rope" />
          {#each chainPts as p, i (i)}
            {@const isHandle = i === chainPts.length - 1}
            <circle
              cx={p.x}
              cy={p.y}
              r={isHandle ? 8 : 3}
              class="bead"
              class:handle={isHandle}
              style:color={isHandle ? KEY_COLORS[chain.keyId] : null}
            />
          {/each}
          {#if !failing}
            {@const h = chainPts[chainPts.length - 1]}
            <circle cx={h.x} cy={h.y} r="18" class="grab" onpointerdown={startHandleGrab} role="button" tabindex="-1" aria-label="chain end" />
          {/if}
        </svg>
      {/if}

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
              onpointerdown={(e) => startKeyDrag(e, k.id)}
            >
              <KeyIcon id={k.id} />
              {#if locked}<span class="lock-badge">🔒</span>{/if}
            </div>
          {/each}
        </div>
        <!-- the native tray tooltip was unreliable; while a key is in hand show
             what it does here, large and in the key's colour -->
        <div class="key-caption" class:show={!!activeKeyId} style:color={activeKeyId ? KEY_INK[activeKeyId] : null}>
          {activeKeyId ? ALL_KEYS[activeKeyId]?.blurb : ''}
        </div>
      </div>


  <!-- white flash: full on entry (fades in the level from white) and at the end
       of the transition (fades out to the next level) -->
  <div class="whiteout" class:on={phase === 'intro' || phase === 'flash'}></div>

  {#if drag}
    <div class="ghost" style="left:{drag.x}px; top:{drag.y}px"><KeyIcon id={drag.keyId} /></div>
  {/if}
</div>

<style>
  /* The play area is a 3:4 portrait panel pegged to its WIDTH (960 max), so it
     scales as one unit on any host and itch can fit it to a fixed width. Capped
     to the viewport height too, so it never overflows a short frame. It's a query
     container: every HUD size below is in cqw (% of this panel's width), so the
     text, buttons and key tray always fill the same fraction at any scale. */
  /* GameScreen fills the .panel (App owns the 3:4 sizing now). It's a query
     container so the HUD below sizes in cqw and scales with the panel. */
  .screen {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #14171d;
    color: #e8edf7;
    user-select: none;
    -webkit-user-select: none;
    /* no blue tap flash / text-selection on the nodes — they're drag/drop
       targets, not selectable text (click-preferring players were seeing a
       "selected" state and thinking the tap did something) */
    -webkit-tap-highlight-color: transparent;
    touch-action: none;
    container-type: inline-size;
  }
  .screen :global(*) {
    -webkit-tap-highlight-color: transparent;
  }
  /* wrong-drop jitter, applied to the ITEM dropped on (a pin or a triangle).
     translate values are SVG user units; the wrapper carries no base transform
     so this composes cleanly with the pin's inner transforms. */
  @keyframes itemShake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-3.5px); }
    40% { transform: translateX(3.5px); }
    60% { transform: translateX(-2px); }
    80% { transform: translateX(2px); }
  }
  .pin-jitter.shaking {
    animation: itemShake 0.3s ease;
  }
  .tri-shake {
    fill: rgba(255, 92, 92, 0.16);
    stroke: #ff5c5c;
    stroke-width: 1.6;
    stroke-linejoin: round;
    pointer-events: none;
    animation: itemShake 0.3s ease, triFade 0.32s ease forwards;
  }
  @keyframes triFade {
    to { opacity: 0; }
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
  /* the 2-part key's chain rides above everything (HUD + dock) so it's visible
     and grabbable over the tray; only the grab takes pointer events, the rest
     lets clicks/drops fall through to what's beneath. */
  .chain-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
  }
  .chain-layer .grab {
    pointer-events: auto;
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
    gap: 1.5cqw;
    padding: 2.4cqw 2.6cqw 5cqw;
    pointer-events: none;
    background: linear-gradient(to bottom, rgba(8, 12, 20, 0.6), rgba(8, 12, 20, 0));
  }
  .titles {
    display: flex;
    flex-direction: column;
    gap: 0.4cqw;
  }
  .room-line {
    font-size: 2.5cqw;
    letter-spacing: 0.02em;
  }
  .intro {
    font-size: 2.1cqw;
    opacity: 0.72;
    max-width: 34ch;
  }
  .rooms-btn {
    pointer-events: auto;
    flex: none;
    background: rgba(20, 28, 44, 0.7);
    border: 1px solid #3a4a73;
    color: #dce4f5;
    border-radius: 1.2cqw;
    padding: 1cqw 1.6cqw;
    cursor: pointer;
    font-size: 2.7cqw;
    line-height: 1;
  }
  .rooms-btn:hover {
    border-color: #ffe07a;
  }
  /* the key cluster sits just below the disc (which bottoms out at ~60% of the
     portrait panel); the music dock sits below it. Steel fills the panel behind. */
  .hud-bottom {
    position: absolute;
    top: 64.5%;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.4cqw;
    padding: 1cqw 2cqw;
    pointer-events: none;
  }
  .hud-bottom .tray {
    pointer-events: auto;
  }
  /* what the held key does — large, in the key's colour, in the space below the
     tray. Always present (reserves its height so the tray doesn't jump); fades
     in only while a key is in hand. */
  .key-caption {
    min-height: 7.5cqw;
    max-width: 82%;
    text-align: center;
    font-size: 3cqw;
    font-weight: 600;
    line-height: 1.25;
    text-wrap: balance;
    /* dark shadow first for legibility on the variable steel, then a faint
       coloured glow for vibe */
    text-shadow: 0 0.2cqw 0.5cqw rgba(0, 0, 0, 0.75), 0 0 1.6cqw color-mix(in srgb, currentColor 40%, transparent);
    opacity: 0;
    transition: opacity 0.18s ease;
    pointer-events: none;
  }
  .key-caption.show {
    opacity: 1;
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
  /* the pre-open rattle: while parked in 'jiggle', every plate piece shakes on
     its own axis/phase/tempo (custom props set inline per piece). Pivots about
     each piece's own box centre. Dropping the class snaps them home instantly —
     no transform transition on .plate-piece — which is the "snap back" before
     the lock recedes. */
  @keyframes pieceJiggle {
    0% { transform: translate(0, 0) rotate(0deg); }
    25% { transform: translate(var(--jx), var(--jy)) rotate(var(--jr)); }
    50% { transform: translate(0, 0) rotate(0deg); }
    75% { transform: translate(calc(var(--jx) * -1), calc(var(--jy) * -1)) rotate(calc(var(--jr) * -1)); }
    100% { transform: translate(0, 0) rotate(0deg); }
  }
  .screen.jiggle .plate-piece {
    transform-box: fill-box;
    transform-origin: center;
    animation: pieceJiggle var(--jt, 0.16s) ease-in-out var(--jd, 0s) infinite;
  }
  /* full-board tap target while the lock is parked */
  .jiggle-tap {
    fill: transparent;
    cursor: pointer;
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
  /* faint twin-edge: a plate-toned line filling the kerf so the cut reads as a
     shallow hairline rather than a deep gap (a same-segment twin's sides). */
  .faint-edge {
    stroke: #434a56;
    stroke-width: 1.5;
    stroke-linecap: round;
    opacity: 0.92;
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
    outline: none; /* no focus ring — clicking a bare node should read as "nothing yet" */
  }
  .hit:focus,
  .hit:focus-visible {
    outline: none;
  }

  /* drop-hint auras: soft, screen-blended glows in the held key's colour. The
     node aura slowly spins its off-centre highlight (the "swirl"); the whole
     layer breathes so it reads as a living hint, not a static ring. */
  .aura-layer {
    pointer-events: none;
    mix-blend-mode: screen;
    animation: auraBreath 1.8s ease-in-out infinite;
  }
  @keyframes auraBreath {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 0.95; }
  }
  .aura-node {
    transform-origin: 0 0; /* the circle is centred on the group origin */
    animation: auraSpin 6s linear infinite;
  }
  @keyframes auraSpin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .aura-layer, .aura-node { animation: none; }
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
  /* the dangling handle takes the key's colour (set inline); a dark rim + glow
     read against any hue */
  .bead.handle {
    fill: currentColor;
    stroke: rgba(0, 0, 0, 0.45);
    stroke-width: 1.4;
    filter: drop-shadow(0 0 5px color-mix(in srgb, currentColor 70%, transparent));
  }
  .grab {
    fill: transparent;
    cursor: grab;
  }
  .grab:active {
    cursor: grabbing;
  }

  .tray {
    display: flex;
    gap: 1.4cqw;
    flex-wrap: wrap;
    justify-content: center;
  }
  .key {
    position: relative;
    width: 9.5cqw;
    height: 9.5cqw;
    display: grid;
    place-items: center;
    border-radius: 1.6cqw;
    border: 1px solid #474e5c;
    background: linear-gradient(160deg, #2c333f, #1b212b);
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
  /* the skeleton key icon is its own colour; the tray just sizes it */
  .key :global(.ki) {
    width: 7cqw;
  }
  .key.locked {
    cursor: not-allowed;
    border-style: dashed;
    opacity: 0.6;
    filter: grayscale(0.7) brightness(0.8);
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
    right: 0.4cqw;
    bottom: 0.2cqw;
    font-size: 2cqw;
    filter: grayscale(0.4);
  }

  .ghost {
    position: fixed;
    transform: translate(-50%, -50%);
    pointer-events: none;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
    z-index: 50;
  }
  .ghost :global(.ki) {
    width: 8.5cqw;
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
  /* intro: the room opens ALREADY white (no ramp-in) and a plain, fully opaque
     white, then fades out to the board — so the split-second intro is solid
     white, never the grey board flashing through a half-faded overlay. */
  .screen.intro .whiteout {
    background: #fff;
    opacity: 1;
    transition: none;
  }
  /* on the flash, ramp in fast and hard */
  .screen.flash .whiteout {
    transition: opacity 0.45s ease-in;
  }
</style>
