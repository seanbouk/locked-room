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
  const centroid = (p: Placement) => {
    const ps = p.angleIds.map(vpos);
    return { x: ps.reduce((s, q) => s + q.x, 0) / ps.length, y: ps.reduce((s, q) => s + q.y, 0) / ps.length };
  };
  function toSvg(cx: number, cy: number) {
    const m = svgEl?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }
  function nearestTriangleAt(pt: { x: number; y: number }): Placement | null {
    let best: Placement | null = null;
    let bd = Infinity;
    for (const t of placementsFor('triangle-sum')) {
      const c = centroid(t);
      const d = (c.x - pt.x) ** 2 + (c.y - pt.y) ** 2;
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  // Live chain geometry for rendering (recomputes each animation frame).
  const chainPts = $derived.by(() => {
    ropeTick;
    return ropeBeads.map((b) => ({ x: b.x, y: b.y }));
  });

  function angleClass(id: string): string {
    if (preview?.includes(id)) return 'angle preview';
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
      const t = nearestTriangleAt(toSvg(e.clientX, e.clientY));
      preview = t ? t.angleIds : null;
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
      if (el?.closest('svg')) {
        const t = nearestTriangleAt(toSvg(e.clientX, e.clientY));
        if (t) apply(t);
        else reject();
      } else reject();
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

<div class="screen" class:shake>
  <div class="stage">
    <div class="board">
      <svg bind:this={svgEl} viewBox={drawn.viewBox} class:open={isOpen} role="img" aria-label="circle puzzle">
        <defs>
          <radialGradient id="glass" cx="40%" cy="35%" r="75%">
            <stop offset="0%" stop-color="#1b2640" />
            <stop offset="100%" stop-color="#0d1424" />
          </radialGradient>
        </defs>

        <circle cx={drawn.circle.cx} cy={drawn.circle.cy} r={drawn.circle.r} class="rim" />

        {#each drawn.segments as s (s.id)}
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} class="seg {s.kind}" />
        {/each}

        {#each drawn.angles as a (a.id)}
          <path d={a.wedge} class={angleClass(a.id)} />
        {/each}

        {#each drawn.points as pt (pt.id)}
          <circle cx={pt.x} cy={pt.y} r="3.2" class="vertex" />
          <text x={pt.lx} y={pt.ly} class="plabel">{pt.id}</text>
        {/each}

        {#each drawn.angles as a (a.id)}
          {#if targetSet.has(a.id) && !solved.has(a.id) && chain?.anchor !== a.id}
            <text x={a.ix} y={a.iy} class="qmark">?</text>
          {/if}
        {/each}

        <!-- the physics chain for a 2-part key -->
        {#if chain && chainPts.length}
          <polyline points={chainPts.map((p) => `${p.x},${p.y}`).join(' ')} class="rope" />
          {#each chainPts as p, i (i)}
            <circle cx={p.x} cy={p.y} r={i === chainPts.length - 1 ? 9 : 3.5} class="bead" class:handle={i === chainPts.length - 1} />
          {/each}
          {@const h = chainPts[chainPts.length - 1]}
          <text x={h.x} y={h.y + 0.5} class="bead-glyph">⚷</text>
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
      Drag the <b>{chainName}</b>’s loose end onto the angle it links to.
      <button class="cancel" onclick={endChain}>✕ cancel</button>
    </div>
  {:else if drag?.keyId === 'triangle-sum'}
    <div class="prompt">Drop on a triangle — its three corners light up.</div>
  {:else}
    <div class="prompt subtle">Drag a key onto the figure. It only catches where its rule is true.</div>
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
        <span class="key-glyph">{locked ? '🔒' : '⚷'}</span>
        <span class="key-name">{k.name}</span>
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
    <div class="ghost" style="left:{drag.x}px; top:{drag.y}px">⚷</div>
  {/if}
</div>

<style>
  .screen {
    position: relative;
    display: grid;
    grid-template-rows: 1fr auto auto;
    gap: 0.6rem;
    height: 100%;
    min-height: 0;
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
    display: grid;
    place-items: center;
    min-height: 0;
    overflow: hidden;
    container-type: size;
  }
  .board {
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
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
    filter: drop-shadow(0 0 24px rgba(120, 220, 170, 0.55));
  }
  .rim {
    fill: url(#glass);
    stroke: #4a608f;
    stroke-width: 1.5;
  }
  .seg {
    stroke: #6f86b8;
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .seg.radius {
    stroke-dasharray: 5 4;
    opacity: 0.85;
  }
  .vertex {
    fill: #cdd8f0;
  }
  .plabel {
    fill: #aab6d4;
    font-size: 11px;
    text-anchor: middle;
    dominant-baseline: middle;
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .hit {
    fill: transparent;
    cursor: default;
  }
  .angle {
    fill: rgba(150, 170, 210, 0.08);
    stroke: rgba(150, 170, 210, 0.3);
    stroke-width: 1;
    transition: fill 0.3s, stroke 0.3s;
  }
  .angle.given {
    fill: rgba(240, 196, 90, 0.22);
    stroke: #f0c45a;
  }
  .angle.target {
    fill: rgba(120, 200, 255, 0.06);
    stroke: #6db6ff;
    stroke-dasharray: 4 3;
  }
  .angle.solved {
    fill: rgba(110, 225, 165, 0.3);
    stroke: #6ee1a5;
    stroke-width: 1.6;
  }
  .angle.pending {
    fill: rgba(255, 224, 122, 0.3);
    stroke: #ffe07a;
    stroke-width: 2;
  }
  .angle.preview {
    fill: rgba(255, 224, 122, 0.28);
    stroke: #ffe07a;
    stroke-width: 2;
  }
  .angle.flash {
    fill: rgba(160, 255, 200, 0.7);
    stroke: #b6ffd6;
    stroke-width: 2.4;
  }
  .qmark {
    fill: #6db6ff;
    font-size: 13px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
  }
  .rope {
    fill: none;
    stroke: #c9b067;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .bead {
    fill: #e6cf86;
  }
  .bead.handle {
    fill: rgba(255, 224, 122, 0.25);
    stroke: #ffe07a;
    stroke-width: 1.6;
  }
  .bead-glyph {
    fill: #ffe07a;
    font-size: 12px;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
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
    opacity: 0.45;
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
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 12px;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.7rem;
    border-radius: 10px;
    border: 1px solid #3a4a73;
    background: #18233d;
    color: #dce4f5;
    cursor: grab;
    font-size: 0.85rem;
    touch-action: none;
    transition: opacity 0.15s, box-shadow 0.15s, border-color 0.15s;
  }
  .key:active {
    cursor: grabbing;
  }
  .key .key-glyph {
    color: #ffe07a;
  }
  .key.locked {
    opacity: 0.4;
    cursor: not-allowed;
    border-style: dashed;
  }
  .key.locked .key-glyph {
    color: #8aa0cc;
  }
  .key.dimmed {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .key.active {
    border-color: #ffe07a;
    box-shadow: 0 0 0 2px rgba(255, 224, 122, 0.35);
    background: #2b3a60;
  }
  .ghost {
    position: fixed;
    transform: translate(-50%, -50%);
    font-size: 1.8rem;
    color: #ffe07a;
    pointer-events: none;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.6));
    z-index: 50;
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
    border-radius: 16px;
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
