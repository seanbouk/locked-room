<script lang="ts">
  import { LEVELS } from './lib/engine/levels';
  import { ALL_KEYS } from './lib/engine/theorems';
  import { KEY_COLORS } from './lib/render/keyStyle';
  import { progress } from './lib/stores/progress.svelte';
  import GameScreen from './lib/components/GameScreen.svelte';
  import KeyIcon from './lib/components/KeyIcon.svelte';
  import MusicDock from './lib/components/MusicDock.svelte';

  function firstUnfinished(): number {
    const inc = LEVELS.find((l) => progress.isUnlocked(l.id) && !progress.isComplete(l.id));
    return inc ? inc.id : LEVELS[LEVELS.length - 1].id;
  }

  let currentId = $state(firstUnfinished());
  let showRooms = $state(false);
  let rewardKeyId = $state<string | null>(null);
  let nextAfterReward = $state<number | null>(null);

  const currentLevel = $derived(LEVELS.find((l) => l.id === currentId)!);

  function goTo(id: number) {
    if (!progress.isUnlocked(id)) return;
    currentId = id;
    showRooms = false;
  }

  function advance(next: number | null) {
    if (next) currentId = next;
    else showRooms = true; // finished the last room — show the overview
  }

  function handleComplete() {
    const awarded = progress.complete(currentId);
    const next = currentId < LEVELS.length ? currentId + 1 : null;
    if (awarded) {
      rewardKeyId = awarded;
      nextAfterReward = next;
    } else {
      advance(next);
    }
  }

  function dismissReward() {
    const next = nextAfterReward;
    rewardKeyId = null;
    nextAfterReward = null;
    advance(next);
  }
</script>

<main>
  <!-- the 3:4 panel: GameScreen remounts per room ({#key}), but the music dock
       lives here too so playback carries across rooms -->
  <div class="panel">
    {#key currentId}
      <GameScreen
        level={currentLevel}
        unlockedKeys={progress.unlockedKeys}
        onComplete={handleComplete}
        onOpenRooms={() => (showRooms = true)}
      />
    {/key}
    <MusicDock />
  </div>

  {#if showRooms}
    <div class="modal-bg" onclick={() => (showRooms = false)} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Rooms">
        <div class="modal-head">
          <h2>Rooms</h2>
          <button class="x" onclick={() => (showRooms = false)}>✕</button>
        </div>
        <div class="rooms">
          {#each LEVELS as lvl (lvl.id)}
            {@const unlocked = progress.isUnlocked(lvl.id)}
            {@const done = progress.isComplete(lvl.id)}
            <button
              class="room"
              class:done
              class:locked={!unlocked}
              class:current={lvl.id === currentId}
              disabled={!unlocked}
              onclick={() => goTo(lvl.id)}
            >
              <span class="rnum">Room {lvl.id}</span>
              <span class="rtitle">{unlocked ? lvl.title : 'Locked'}</span>
              <span class="rstate">{done ? '✓ open' : unlocked ? '○ open it' : '🔒'}</span>
            </button>
          {/each}
        </div>
        <div class="kit">
          <span class="kit-label">Keys won</span>
          {#each progress.unlockedKeys as id (id)}
            <span class="kchip" title={ALL_KEYS[id]?.blurb}>⚷ {ALL_KEYS[id]?.name ?? id}</span>
          {/each}
        </div>
        <button class="reset" onclick={() => { progress.reset(); currentId = 1; showRooms = false; }}>
          reset all progress
        </button>
      </div>
    </div>
  {/if}

  {#if rewardKeyId}
    <!-- the round has ended on white (the lock seats and floods); the reward
         holds on that white — no box, no dark backdrop, no button. The won key
         (the exact tray icon, in its colour) is the centrepiece. Tap anywhere. -->
    <div
      class="reward-screen"
      style:--c={KEY_COLORS[rewardKeyId]}
      role="button"
      tabindex="0"
      aria-label="You won the {ALL_KEYS[rewardKeyId].name}. Tap to continue."
      onclick={dismissReward}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && dismissReward()}
    >
      <div class="eyebrow">New skeleton key</div>
      <div class="rname">{ALL_KEYS[rewardKeyId].name}</div>
      <KeyIcon id={rewardKeyId} glow={false} />
      <p class="rblurb">{ALL_KEYS[rewardKeyId].blurb}</p>
      <div class="tap">Tap to continue…</div>
    </div>
  {/if}
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 0;
  }
  /* the 3:4 portrait panel: as large as fits the parent while keeping ratio, so
     it always touches top+bottom or left+right (itch pegs the iframe to 960). A
     query container, so the panel's children size in cqw and scale as one unit.
     GameScreen fills it; the music dock sits at its bottom and persists across
     room remounts. */
  .panel {
    position: relative;
    width: min(100%, calc(100dvh * 372 / 496));
    aspect-ratio: 372 / 496;
    container-type: inline-size;
    overflow: hidden;
  }

  .modal-bg {
    position: fixed;
    inset: 0;
    background: rgba(4, 7, 14, 0.7);
    backdrop-filter: blur(3px);
    display: grid;
    place-items: center;
    padding: 1rem;
    z-index: 100;
    animation: fade 0.2s ease;
  }
  .modal {
    width: min(560px, 100%);
    background: #111a2e;
    border: 1px solid #2c3a5e;
    border-radius: 16px;
    padding: 1.2rem 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  }
  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .modal-head h2 {
    margin: 0;
  }
  .x {
    background: none;
    border: none;
    color: #8aa0cc;
    font-size: 1.1rem;
    cursor: pointer;
  }
  .rooms {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.6rem;
  }
  .room {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.2rem;
    padding: 0.7rem;
    border-radius: 11px;
    border: 1px solid #2c3a5e;
    background: #141d33;
    color: #e8edf7;
    cursor: pointer;
    text-align: left;
  }
  .room:hover:not(:disabled) {
    border-color: #ffe07a;
  }
  .room.locked {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .room.done {
    border-color: #6ee1a5;
  }
  .room.current {
    box-shadow: 0 0 0 2px rgba(255, 224, 122, 0.4);
  }
  .rnum {
    font-size: 0.72rem;
    opacity: 0.5;
  }
  .rtitle {
    font-weight: 600;
  }
  .rstate {
    font-size: 0.78rem;
    opacity: 0.7;
  }
  .kit {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .kit-label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.5;
  }
  .kchip {
    font-size: 0.8rem;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    background: rgba(255, 224, 122, 0.12);
    border: 1px solid rgba(255, 224, 122, 0.4);
    color: #ffe7a8;
  }
  .reset {
    align-self: flex-start;
    background: none;
    border: none;
    color: #8aa0cc;
    cursor: pointer;
    font-size: 0.78rem;
    opacity: 0.6;
    padding: 0;
  }
  /* ── reward screen ──
     A full-screen white hold (the round already flooded white as the lock
     seated). No card, no backdrop, no button — the won key is the centrepiece
     and the whole surface is the "continue" control. Themed in the key colour. */
  .reward-screen {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: radial-gradient(120% 90% at 50% 32%, #ffffff, #f4f0e6);
    color: #1a1d24;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    text-align: center;
    padding: 2rem 1.8rem;
    cursor: pointer;
    animation: fade 0.35s ease;
  }
  .reward-screen:focus-visible {
    outline: none;
  }
  .eyebrow {
    font-family: ui-monospace, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 0.66rem;
    color: color-mix(in srgb, var(--c) 62%, #6a5320);
  }
  .rname {
    font-size: clamp(1.6rem, 7vw, 2.3rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.05;
    margin: 0.2rem 0 0.5rem;
    max-width: 14ch;
  }
  .reward-screen :global(.ki) {
    width: min(62vw, 240px);
    margin: 0.3rem 0 1rem;
    animation: rise 0.55s ease;
    filter: drop-shadow(0 12px 26px color-mix(in srgb, var(--c) 45%, transparent));
  }
  .rblurb {
    margin: 0;
    color: #4a5160;
    font-size: 1rem;
    line-height: 1.45;
    max-width: 28ch;
  }
  .tap {
    margin-top: 1.8rem;
    font-family: ui-monospace, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.72rem;
    color: #8a90a0;
    animation: pulse 1.8s ease-in-out infinite;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes rise {
    from {
      transform: translateY(12px) scale(0.8);
      opacity: 0;
    }
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .reward-screen,
    .reward-screen :global(.ki),
    .tap {
      animation: none;
    }
  }
</style>
