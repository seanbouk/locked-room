<script lang="ts">
  import { Lock } from '../engine/game';
  import { drawPuzzle, PIN_R } from '../render/figure';
  import { makeRope, stepRope, type Bead } from '../render/rope';
  import { ALL_KEYS, type Placement } from '../engine/theorems';
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

  let solved = $state(new Set<string>(lock.solvedIds()));
  let flash = $state(new Set<string>());
  let appliedLabels = $state(new Set<string>());
  let toast = $state('');
  let shake = $state(false);

  // Level-transition state machine. A solved angle "sets back" (recedes toward
  // the centre, behind). On the lock opening, a ~0.64s heartbeat: all nodes
  // back -> the whole lock back -> rotate 90deg -> flash white -> next level.
  const HB = 640;
  type Phase = 'intro' | 'play' | 'allBack' | 'circleBack' | 'rotate' | 'flash';
  let phase = $state<Phase>('intro');
  setTimeout(() => phase === 'intro' && (phase = 'play'), 40); // fade in from white
  const transitioning = $derived(phase !== 'play' && phase !== 'intro');
  // During play a solved (non-given) angle is set back; in transition, all are.
  const nodeBack = (id: string) => (transitioning ? true : solved.has(id) && !givenSet.has(id));

  function startTransition() {
    setTimeout(() => (phase = 'allBack'), HB);
    setTimeout(() => (phase = 'circleBack'), HB * 2);
    setTimeout(() => (phase = 'rotate'), HB * 3);
    setTimeout(() => (phase = 'flash'), HB * 4);
    setTimeout(() => onComplete(), HB * 4 + 650);
  }

  // SVG transforms are about the user origin (0,0) = the circle centre, so a
  // plain scale() recedes everything toward the middle (no origin math needed).
  const nodeXf = (id: string) => (nodeBack(id) ? 'scale(0.82)' : 'scale(1)');
  const lockXf = $derived(
    phase === 'rotate' || phase === 'flash'
      ? 'scale(0.6) rotate(90)'
      : phase === 'circleBack'
        ? 'scale(0.6)'
        : 'scale(1)',
  );

  let svgEl: SVGSVGElement;

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

  // given (whole point known) | pending (mid multi-drag) | flash (just solved)
  // | solved | unknown (a needed/working angle not yet found)
  function angleState(id: string): 'given' | 'pending' | 'flash' | 'solved' | 'unknown' {
    if (givenSet.has(id)) return 'given';
    if (chain?.anchor === id) return 'pending';
    if (flash.has(id)) return 'flash';
    if (solved.has(id)) return 'solved';
    return 'unknown';
  }

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
          <linearGradient id="steel" x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0%" stop-color="#bcc3cc" />
            <stop offset="48%" stop-color="#9aa2ad" />
            <stop offset="52%" stop-color="#8d96a1" />
            <stop offset="100%" stop-color="#6c727d" />
          </linearGradient>
          <radialGradient id="disc" cx="38%" cy="32%" r="82%">
            <stop offset="0%" stop-color="#b7bec8" />
            <stop offset="62%" stop-color="#949ca8" />
            <stop offset="100%" stop-color="#767d89" />
          </radialGradient>
          <linearGradient id="brass" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0%" stop-color="#e9c668" />
            <stop offset="50%" stop-color="#c2922f" />
            <stop offset="100%" stop-color="#8f6a1e" />
          </linearGradient>
          <radialGradient id="brassLit" cx="40%" cy="34%" r="78%">
            <stop offset="0%" stop-color="#ffe9a8" />
            <stop offset="55%" stop-color="#f1bd54" />
            <stop offset="100%" stop-color="#b07f28" />
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

          <!-- Real engraved bevels: blur the stroke alpha into a height map and
               DIFFUSE-light it from the top-left. surfaceScale is negative so it
               reads as cut INTO the steel; the two walls of the groove shade
               oppositely on their own. The grey relief is `overlay`-blended onto
               the steel (flat areas ~neutral) so the cut sits in the surface. A
               little specular adds a glint on the lit wall. -->
          <!-- Bevel only: blur the stroke alpha into a height map and diffuse-
               light it from the top-left (negative surfaceScale = chamfered into
               the steel). Flat level is overlay-neutral. The sharp black kerf is
               drawn as a separate line on top, NOT in here. -->
          <filter id="relief" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceAlpha" stdDeviation="0.8" result="b" />
            <feDiffuseLighting in="b" surfaceScale="-7" diffuseConstant="1" lighting-color="#a7a7a7" result="d">
              <feDistantLight azimuth="225" elevation="50" />
            </feDiffuseLighting>
            <!-- compress around neutral: lift the shadow floor, tame highlights,
                 keep flat=0.5 so overlay stays a no-op off the cuts -->
            <feComponentTransfer>
              <feFuncR type="linear" slope="0.62" intercept="0.19" />
              <feFuncG type="linear" slope="0.62" intercept="0.19" />
              <feFuncB type="linear" slope="0.62" intercept="0.19" />
            </feComponentTransfer>
          </filter>
          <clipPath id="discClip">
            <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} />
          </clipPath>
          <!-- the inner vignette is masked out of the pin circles so a pin near
               the rim reads flat -->
          <mask id="shadeMask">
            <rect x="-125" y="-175" width="250" height="550" fill="white" />
            {#each drawn.angles as a (a.id)}
              <circle cx={a.vx} cy={a.vy} r={PIN_R} fill="black" />
            {/each}
          </mask>
        </defs>

        <!-- the two doors (brushed steel) -->
        <rect x="-125" y="-175" width="250" height="550" fill="url(#steel)" />
        <rect x="-125" y="-175" width="250" height="550" fill="#d2d8df" filter="url(#brushed)" opacity="0.16" />

        <!-- seam between the doors; the lock disc covers the middle. Bevelled
             with explicit offset lips (the relief filter can't resolve a bevel
             on a full-height hairline). Vertical, lit top-left: bright lip left,
             shadow lip right, black kerf down the centre. -->
        <line x1="0" y1="-175" x2="0" y2="375" class="seam-lip shadow" transform="translate(-0.95 0)" />
        <line x1="0" y1="-175" x2="0" y2="375" class="seam-lip light" transform="translate(0.95 0)" />
        <line x1="0" y1="-175" x2="0" y2="375" class="kerf seam" />

        <!-- everything that recedes / rotates as the lock opens -->
        <g class="lock" transform={lockXf}>
        <!-- the lock disc -->
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="url(#disc)" />
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="#d2d8df" filter="url(#brushed)" opacity="0.13" clip-path="url(#discClip)" />
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="url(#discShade)" mask="url(#shadeMask)" />

        <!-- brass workings, one group per node so each can "set back" when
             solved: given = full brass disc; needed = steel ring + brass arc;
             solved adds a brass slice -->
        {#each drawn.angles as a (a.id)}
          {@const st = angleState(a.id)}
          <g class="node" transform={nodeXf(a.id)}>
            {#if st === 'given'}
              <circle cx={a.vx} cy={a.vy} r={PIN_R} class="pin-disc" />
              <g class="relief" filter="url(#relief)">
                <circle cx={a.vx} cy={a.vy} r={PIN_R} class="brass-edge" fill="none" />
              </g>
            {:else}
              <g class="relief" filter="url(#relief)">
                <circle cx={a.vx} cy={a.vy} r={PIN_R} class="cut" fill="none" />
              </g>
              <circle cx={a.vx} cy={a.vy} r={PIN_R} class="kerf" fill="none" />
              {#if st === 'solved' || st === 'flash'}
                <path d={a.sector} class="pin-slice {st}" />
              {/if}
              <path d={a.arc} class="pin-arc {st}" />
              <g class="relief" filter="url(#relief)">
                <path d={a.arc} class="brass-edge" fill="none" />
                {#if st === 'solved' || st === 'flash'}
                  <path d={a.sector} class="brass-edge" fill="none" />
                {/if}
              </g>
            {/if}
          </g>
        {/each}

        <!-- chords, engraved as bevelled grooves -->
        <g class="relief" clip-path="url(#discClip)" filter="url(#relief)">
          {#each drawn.segments as s (s.id)}
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="cut {s.kind}" />
          {/each}
        </g>
        <g clip-path="url(#discClip)">
          {#each drawn.segments as s (s.id)}
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="kerf {s.kind}" />
          {/each}
        </g>

        <!-- the outer circle, drawn last so it runs through every node (brass
             and steel alike) — a uniform policy for all game nodes -->
        <g class="relief" filter="url(#relief)">
          <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="cut rim" fill="none" />
        </g>
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="kerf rim" fill="none" />
        </g>
        <!-- /lock -->

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

  /* the raw groove stroke; the #relief filter lights it into a real bevel,
     and overlay-blends the grey relief onto the steel so it sits in the surface */
  .relief {
    mix-blend-mode: overlay;
  }
  .cut {
    stroke: #fff;
    stroke-width: 1.9;
    stroke-linecap: round;
  }
  .cut.seam {
    stroke-width: 2.1;
  }
  .cut.rim {
    stroke-width: 2.2;
  }
  /* the machined cut itself: a sharp, near-black line laid over the bevel */
  .kerf {
    stroke: #0b0d11;
    stroke-width: 1;
    stroke-linecap: round;
  }
  .kerf.seam {
    stroke-width: 1.1;
  }
  .kerf.rim {
    stroke-width: 1.2;
  }
  /* explicit bevel lips for the vertical seam */
  .seam-lip {
    stroke-width: 1.3;
    stroke-linecap: round;
  }
  .seam-lip.light {
    stroke: #d4dae1;
  }
  .seam-lip.shadow {
    stroke: #353b44;
  }

  .corner-dot {
    fill: #ffe07a;
    stroke: #8a6320;
    stroke-width: 0.7;
    pointer-events: none;
  }

  /* brass workings */
  /* given: a full brass disc (all angles at the point are known) */
  .pin-disc {
    fill: url(#brass);
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
    filter: drop-shadow(0 0 4px rgba(255, 205, 100, 0.5));
  }
  .pin-slice.flash {
    fill: #fff2cf;
    filter: drop-shadow(0 0 9px rgba(255, 220, 120, 0.95));
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
  /* ── level transition: nodes/lock "set back" toward the centre ──
     The transform is set as an SVG attribute (scale about the user origin =
     circle centre); these transitions just smooth the change. */
  .node {
    transition: transform 0.6s cubic-bezier(0.5, 0, 0.2, 1);
  }
  .lock {
    transition: transform 0.62s cubic-bezier(0.5, 0, 0.2, 1);
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
