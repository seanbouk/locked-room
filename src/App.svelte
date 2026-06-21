<script lang="ts">
  import { LEVELS } from './lib/engine/levels';
  import { ALL_KEYS } from './lib/engine/theorems';
  import { progress } from './lib/stores/progress.svelte';
  import GameScreen from './lib/components/GameScreen.svelte';

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
  <div class="frame">
    <header class="bar">
      <span class="brand">Locked&nbsp;Room</span>
      <span class="here">Room {currentLevel.id} · {currentLevel.title}</span>
      <button class="rooms-btn" onclick={() => (showRooms = true)}>▦ Rooms</button>
    </header>

    <p class="intro">{currentLevel.intro}</p>

    <div class="playwrap">
      {#key currentId}
        <GameScreen
          level={currentLevel}
          unlockedKeys={progress.unlockedKeys}
          onComplete={handleComplete}
        />
      {/key}
    </div>
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
    <div class="modal-bg" role="presentation">
      <div class="modal reward" role="dialog" aria-label="New key">
        <div class="bigkey">⚷</div>
        <h2>You won the {ALL_KEYS[rewardKeyId].name}</h2>
        <p class="blurb">{ALL_KEYS[rewardKeyId].blurb}</p>
        <button class="continue" onclick={dismissReward}>Add to keyring & continue →</button>
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    place-items: start center;
    padding: 1.5rem 1rem 2rem;
  }
  .frame {
    width: min(620px, 94vw, 76vh);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .brand {
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .here {
    flex: 1;
    opacity: 0.65;
    font-size: 0.9rem;
  }
  .rooms-btn {
    background: #18233d;
    border: 1px solid #3a4a73;
    color: #dce4f5;
    border-radius: 9px;
    padding: 0.35rem 0.7rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .rooms-btn:hover {
    border-color: #ffe07a;
  }
  .intro {
    margin: 0;
    opacity: 0.7;
    font-size: 0.9rem;
    min-height: 1.2rem;
  }
  .playwrap {
    display: block;
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
  .reward {
    align-items: center;
    text-align: center;
  }
  .blurb {
    margin: 0;
    opacity: 0.7;
  }
  .bigkey {
    font-size: 3.5rem;
    color: #ffe07a;
    filter: drop-shadow(0 0 20px rgba(255, 220, 120, 0.6));
    animation: rise 0.6s ease;
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
  @keyframes rise {
    from {
      transform: translateY(12px) scale(0.7);
      opacity: 0;
    }
  }
</style>
