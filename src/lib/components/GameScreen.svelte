<script lang="ts">
  import { Lock } from '../engine/game';
  import { drawPuzzle } from '../render/figure';
  import { ALL_KEYS, type Placement } from '../engine/theorems';
  import type { Level } from '../engine/levels';

  let {
    level,
    unlockedKeys,
    onComplete,
  }: { level: Level; unlockedKeys: string[]; onComplete: () => void } = $props();

  // Stable display order for the full keyring (locked keys are shown too).
  const KEY_ORDER = ['semicircle', 'triangle-sum', 'same-segment', 'angle-at-centre', 'isosceles-radii'];
  const allKeys = KEY_ORDER.map((id) => ALL_KEYS[id]).filter(Boolean);

  const lock = new Lock(level.puzzle);
  const drawn = drawPuzzle(level.puzzle);
  const givenSet = new Set(level.puzzle.givens);
  const targetSet = new Set(level.puzzle.targets);

  let solved = $state(new Set<string>(lock.solvedIds()));
  let isOpen = $state(lock.isOpen);
  let flash = $state(new Set<string>());
  let appliedLabels = $state(new Set<string>());
  let toast = $state('');
  let shake = $state(false);

  // A key being dragged from the tray toward the board.
  let drag = $state<null | { keyId: string; x: number; y: number }>(null);
  // A multi-part theorem mid-application: the active key + angles chosen so far.
  let pending = $state<null | { keyId: string; chosen: string[] }>(null);

  // Tolerate a transient undefined prop (e.g. mid-HMR) so a stray render can
  // never throw and wedge the runtime.
  const keyring = $derived(unlockedKeys ?? []);

  function isUnlocked(id: string) {
    return keyring.includes(id);
  }

  // Placements over the player's whole keyring (not just the level's intended
  // set) so any unlocked theorem can be tried anywhere it genuinely holds.
  function placementsFor(keyId: string): Placement[] {
    return lock
      .availablePlacements(keyring)
      .filter((p) => p.keyId === keyId && !appliedLabels.has(p.label));
  }

  function angleClass(id: string): string {
    if (pending?.chosen.includes(id)) return 'angle pending';
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
    pending = null;
    if (newIds.length) {
      flash = new Set(newIds);
      setTimeout(() => (flash = new Set()), 900);
    } else {
      toast = 'The key turns — but nothing gives yet.';
      setTimeout(() => (toast = ''), 1800);
    }
    if (lock.isOpen) setTimeout(() => (isOpen = true), 650);
  }

  function processDrop(keyId: string, angleId: string) {
    const places = placementsFor(keyId);
    if (!pending) {
      const containing = places.filter((p) => p.angleIds.includes(angleId));
      if (!containing.length) return reject();
      if (containing[0].angleIds.length === 1) return apply(containing[0]);
      pending = { keyId, chosen: [angleId] }; // begin a multi-part pick
    } else {
      if (keyId !== pending.keyId) return;
      if (pending.chosen.includes(angleId)) return;
      const chosen = [...pending.chosen, angleId];
      const compat = places.filter((p) => chosen.every((a) => p.angleIds.includes(a)));
      if (!compat.length) return reject(); // this angle isn't linked — stay pending
      const done = compat.find((p) => p.angleIds.length === chosen.length);
      if (done) apply(done);
      else pending = { keyId, chosen };
    }
  }

  // ── Pointer-based drag (works for mouse and touch) ──────────────────────────
  function onMove(e: PointerEvent) {
    if (drag) drag = { ...drag, x: e.clientX, y: e.clientY };
  }
  function onUp(e: PointerEvent) {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    const d = drag;
    drag = null;
    if (!d) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest('[data-angle]');
    if (target) processDrop(d.keyId, target.getAttribute('data-angle')!);
    else reject();
  }
  function startDrag(e: PointerEvent, keyId: string) {
    if (!isUnlocked(keyId)) return;
    if (pending && pending.keyId !== keyId) return; // only the active key while pending
    e.preventDefault();
    drag = { keyId, x: e.clientX, y: e.clientY };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') pending = null;
  }

  const pendingName = $derived(pending ? ALL_KEYS[pending.keyId].name : '');
</script>

<svelte:window onkeydown={onKeydown} />

<div class="screen" class:shake>
  <div class="stage">
    <div class="board">
    <svg viewBox={drawn.viewBox} class:open={isOpen} role="img" aria-label="circle puzzle">
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
        {#if targetSet.has(a.id) && !solved.has(a.id) && !pending?.chosen.includes(a.id)}
          <text x={a.ix} y={a.iy} class="qmark">?</text>
        {/if}
      {/each}

      <!-- invisible drop targets, on top so elementFromPoint finds them -->
      {#each drawn.angles as a (a.id)}
        <circle cx={a.vx} cy={a.vy} r="28" class="hit" data-angle={a.id} />
      {/each}
    </svg>
    </div>
  </div>

  {#if pending}
    <div class="prompt">
      Keep applying the <b>{pendingName}</b> — link it to the angles it connects.
      <button class="cancel" onclick={() => (pending = null)}>✕ cancel</button>
    </div>
  {:else}
    <div class="prompt subtle">Drag a key onto the figure. It only catches where its rule is true.</div>
  {/if}

  <div class="tray">
    {#each allKeys as k (k.id)}
      {@const locked = !isUnlocked(k.id)}
      {@const active = pending?.keyId === k.id}
      {@const dimmed = pending && !active}
      <div
        class="key"
        class:locked
        class:active
        class:dimmed
        title={locked ? 'Locked — win this key in an earlier room' : k.blurb}
        onpointerdown={(e) => startDrag(e, k.id)}
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
  /* Largest square that fits BOTH the stage's width and height — using the
     container's own dimensions, so it fills the space without ever overflowing
     and covering the tray / header. */
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
    animation: pulse 1.1s ease-in-out infinite;
  }
  .angle.flash {
    fill: rgba(160, 255, 200, 0.7);
    stroke: #b6ffd6;
    stroke-width: 2.4;
  }
  @keyframes pulse {
    50% {
      stroke-opacity: 0.4;
    }
  }
  .qmark {
    fill: #6db6ff;
    font-size: 13px;
    font-weight: 700;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
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
    animation: pulse 1.1s ease-in-out infinite;
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
