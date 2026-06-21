<script lang="ts">
  import { Lock } from '../engine/game';
  import { drawPuzzle } from '../render/figure';
  import { makeRope, stepRope, type Bead } from '../render/rope';
  import { ALL_KEYS, type Placement } from '../engine/theorems';
  import type { Level } from '../engine/levels';

  let {
    level,
    unlockedKeys,
    onComplete,
  }: { level: Level; unlockedKeys: string[]; onComplete: () => void } = $props();

  const KEY_ORDER = ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'];
  const allKeys = KEY_ORDER.map((id) => ALL_KEYS[id]).filter(Boolean);

  const lock = new Lock(level.puzzle);
  const drawn = drawPuzzle(level.puzzle);
  const givenSet = new Set(level.puzzle.givens);
  const targetSet = new Set(level.puzzle.targets);
  const angleMap = new Map(drawn.angles.map((a) => [a.id, a]));

  let solved = $state(new Set<string>(lock.solvedIds()));
  let isOpen = $state(lock.isOpen);
  let flash = $state(new Set<string>());
  let appliedLabels = $state(new Set<string>());
  let toast = $state('');
  let shake = $state(false);

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

  function angleClass(id: string): string {
    if (chain?.anchor === id) return 'angle pending';
    if (flash.has(id)) return 'angle flash';
    if (solved.has(id) && !givenSet.has(id)) return 'angle solved';
    if (givenSet.has(id)) return 'angle given';
    if (targetSet.has(id)) return 'angle target';
    return 'angle';
  }

  function reject() {
    shake = true;
    setTimeout(() => (shake = false), 260);
  }

  function apply(p: Placement) {
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
    if (lock.isOpen) setTimeout(() => (isOpen = true), 650);
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

<div class="screen" class:shake>
  <div class="stage">
    <div class="board">
      <svg bind:this={svgEl} viewBox={drawn.viewBox} class:open={isOpen} role="img" aria-label="lock puzzle">
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
          <clipPath id="discClip">
            <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} />
          </clipPath>
        </defs>

        <!-- the two doors (brushed steel) -->
        <rect x="-125" y="-125" width="250" height="250" fill="url(#steel)" />
        <rect x="-125" y="-125" width="250" height="250" fill="#d2d8df" filter="url(#brushed)" opacity="0.16" />

        <!-- seam between the doors; the lock disc covers the middle -->
        <g class="groove">
          <line x1="0" y1="-125" x2="0" y2="125" class="cut-core seam" />
          <line x1="0" y1="-125" x2="0" y2="125" class="cut-sh seam" transform="translate(0.95 0)" />
          <line x1="0" y1="-125" x2="0" y2="125" class="cut-hi seam" transform="translate(-0.95 0)" />
        </g>

        <!-- the lock disc -->
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="url(#disc)" />
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="#d2d8df" filter="url(#brushed)" opacity="0.13" clip-path="url(#discClip)" />
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} fill="url(#discShade)" />
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="rim-shadow" transform="translate(0.8 0.8)" />
        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="rim-light" transform="translate(-0.8 -0.8)" />

        <!-- chords, engraved as bevelled grooves -->
        <g clip-path="url(#discClip)">
          {#each drawn.segments as s (s.id)}
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="cut-core {s.kind}" />
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="cut-sh {s.kind}" transform="translate({s.sh.x} {s.sh.y})" />
            <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="cut-hi {s.kind}" transform="translate({s.hi.x} {s.hi.y})" />
          {/each}
        </g>

        {#if preview}
          <polygon points={previewPoly} class="tri-preview" />
        {/if}

        <!-- the brass workings -->
        {#each drawn.angles as a (a.id)}
          <path d={a.wedge} class={angleClass(a.id)} />
        {/each}

        <!-- rivets at the joints (no letters — the algebra stays hidden) -->
        {#each drawn.points as pt (pt.id)}
          <circle cx={pt.x} cy={pt.y} r={preview?.includes(pt.id) ? 4 : 2.6} class="rivet" class:corner={preview?.includes(pt.id)} />
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
    </div>
  </div>

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

  {#if toast}<div class="toast">{toast}</div>{/if}

  {#if isOpen}
    <div class="opened">
      <div class="door"></div>
      <h3>The lock opens.</h3>
      <button class="continue" onclick={onComplete}>Step through →</button>
    </div>
  {/if}

  {#if drag}
    <div class="ghost" style="left:{drag.x}px; top:{drag.y}px">{@render keyIcon(drag.keyId)}</div>
  {/if}
</div>

<style>
  .screen {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    color: #e8edf7;
    user-select: none;
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
  .stage {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
  }
  .board {
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    transition: filter 0.6s ease;
    touch-action: none;
  }
  svg.open {
    filter: drop-shadow(0 0 24px rgba(255, 210, 120, 0.5));
  }

  /* a fine cut in steel: a dark core, a bright lip on the top-left (lit) side,
     a dark lip on the shadow side */
  .cut-core {
    stroke: #444b54;
    stroke-width: 0.8;
    stroke-linecap: round;
  }
  .cut-hi {
    stroke: #f1f5f9;
    stroke-width: 1.05;
    stroke-linecap: round;
  }
  .cut-sh {
    stroke: #23272e;
    stroke-width: 1.05;
    stroke-linecap: round;
  }
  .cut-core.seam {
    stroke-width: 1.1;
  }
  .cut-hi.seam,
  .cut-sh.seam {
    stroke-width: 1.4;
  }
  .cut-core.radius,
  .cut-hi.radius,
  .cut-sh.radius {
    stroke-dasharray: 6 5;
  }
  .rim-shadow,
  .rim-light {
    fill: none;
    stroke-width: 2.2;
  }
  .rim-shadow {
    stroke: #41474f;
  }
  .rim-light {
    stroke: #d3d9e0;
  }

  .rivet {
    fill: #cdd3db;
    stroke: #5b626d;
    stroke-width: 0.7;
    transition: r 0.15s;
  }
  .rivet.corner {
    fill: #ffe07a;
    stroke: #8a6320;
  }

  /* brass workings */
  .angle {
    fill: rgba(150, 160, 175, 0.1);
    stroke: rgba(120, 130, 145, 0.4);
    stroke-width: 1;
    transition: fill 0.3s, stroke 0.3s;
  }
  .angle.given {
    fill: url(#brass);
    stroke: #6f521a;
    stroke-width: 1;
  }
  .angle.target {
    fill: url(#brass);
    fill-opacity: 0.5;
    stroke: #e8b94e;
    stroke-width: 1.6;
    stroke-dasharray: 3.5 3;
  }
  .angle.solved {
    fill: url(#brassLit);
    stroke: #8a6320;
    stroke-width: 1.3;
    filter: drop-shadow(0 0 4px rgba(255, 205, 100, 0.6));
  }
  .angle.pending {
    fill: url(#brassLit);
    stroke: #ffe07a;
    stroke-width: 2;
  }
  .angle.flash {
    fill: url(#brassLit);
    stroke: #fff0c4;
    stroke-width: 2.4;
    filter: drop-shadow(0 0 8px rgba(255, 220, 120, 0.9));
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
  .opened {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.8rem;
    background: rgba(8, 12, 22, 0.72);
    backdrop-filter: blur(2px);
    animation: fade 0.5s ease;
  }
  .door {
    width: 90px;
    height: 130px;
    border-radius: 45px 45px 6px 6px;
    background: linear-gradient(180deg, #ffe9a8, #ffd166);
    box-shadow: 0 0 40px rgba(255, 220, 120, 0.7);
    animation: swing 0.9s ease;
    transform-origin: left center;
  }
  .opened h3 {
    margin: 0;
  }
  .continue {
    padding: 0.6rem 1.1rem;
    border-radius: 10px;
    border: none;
    background: #ffe07a;
    color: #1a1303;
    font-weight: 700;
    cursor: pointer;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes swing {
    from {
      transform: perspective(400px) rotateY(0);
    }
    to {
      transform: perspective(400px) rotateY(-55deg);
    }
  }
</style>
