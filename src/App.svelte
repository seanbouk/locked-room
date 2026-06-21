<script lang="ts">
  import { LEVELS } from './lib/engine/levels';
  import { ALL_KEYS } from './lib/engine/theorems';
  import { progress } from './lib/stores/progress.svelte';
  import GameScreen from './lib/components/GameScreen.svelte';

  type View = 'map' | 'play' | 'reward';
  let view = $state<View>('map');
  let currentId = $state(1);
  let awardedKeyId = $state<string | null>(null);

  const currentLevel = $derived(LEVELS.find((l) => l.id === currentId)!);

  function openLevel(id: number) {
    if (!progress.isUnlocked(id)) return;
    currentId = id;
    view = 'play';
  }

  function handleComplete() {
    const awarded = progress.complete(currentId);
    if (awarded) {
      awardedKeyId = awarded;
      view = 'reward';
    } else {
      view = 'map';
    }
  }

  function afterReward() {
    awardedKeyId = null;
    view = 'map';
  }

  const nextId = $derived(LEVELS.find((l) => progress.isUnlocked(l.id) && !progress.isComplete(l.id))?.id);
</script>

<main>
  <div class="frame">
    {#if view === 'map'}
      <h1>Locked Room</h1>
      <p class="tag">Pick the lock with the theorems you carry.</p>

      <div class="rooms">
        {#each LEVELS as lvl (lvl.id)}
          {@const unlocked = progress.isUnlocked(lvl.id)}
          {@const done = progress.isComplete(lvl.id)}
          <button
            class="room"
            class:done
            class:locked={!unlocked}
            disabled={!unlocked}
            onclick={() => openLevel(lvl.id)}
          >
            <span class="rnum">{lvl.id}</span>
            <span class="rtitle">{unlocked ? lvl.title : 'Locked'}</span>
            <span class="rstate">{done ? '✓ open' : unlocked ? '○' : '🔒'}</span>
          </button>
        {/each}
      </div>

      <div class="kit">
        <span class="kit-label">Keys won</span>
        {#each progress.unlockedKeys as id (id)}
          <span class="kchip" title={ALL_KEYS[id]?.blurb}>⚷ {ALL_KEYS[id]?.name ?? id}</span>
        {/each}
      </div>

      {#if nextId}
        <button class="cta" onclick={() => openLevel(nextId)}>
          {progress.completed.length ? 'Continue' : 'Begin'} → Room {nextId}
        </button>
      {:else}
        <p class="tag">Every room open. More to come.</p>
      {/if}

      <button class="reset" onclick={() => progress.reset()}>reset progress</button>
    {:else if view === 'play'}
      <button class="back" onclick={() => (view = 'map')}>← rooms</button>
      <div class="playwrap">
        {#key currentId}
          <GameScreen level={currentLevel} onComplete={handleComplete} />
        {/key}
      </div>
    {:else if view === 'reward' && awardedKeyId}
      <div class="reward">
        <div class="bigkey">⚷</div>
        <h2>You won the {ALL_KEYS[awardedKeyId].name}</h2>
        <p class="tag">{ALL_KEYS[awardedKeyId].blurb}</p>
        <button class="cta" onclick={afterReward}>Add to keyring</button>
      </div>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 1rem;
  }
  .frame {
    width: min(880px, 100%);
    min-height: min(640px, 92vh);
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.07);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
  }
  h1 {
    margin: 0;
    font-size: 2rem;
    letter-spacing: 0.04em;
  }
  .tag {
    margin: 0;
    opacity: 0.7;
  }
  .rooms {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.7rem;
  }
  .room {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
    padding: 0.8rem;
    border-radius: 12px;
    border: 1px solid #2c3a5e;
    background: #141d33;
    color: #e8edf7;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }
  .room:hover:not(:disabled) {
    border-color: #ffe07a;
    transform: translateY(-2px);
  }
  .room.locked {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .room.done {
    border-color: #6ee1a5;
  }
  .rnum {
    font-size: 0.75rem;
    opacity: 0.5;
  }
  .rtitle {
    font-weight: 600;
  }
  .rstate {
    font-size: 0.8rem;
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
  .cta {
    align-self: flex-start;
    margin-top: auto;
    padding: 0.7rem 1.2rem;
    border-radius: 10px;
    border: none;
    background: #ffe07a;
    color: #1a1303;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .back,
  .reset {
    align-self: flex-start;
    background: none;
    border: none;
    color: #8aa0cc;
    cursor: pointer;
    font-size: 0.8rem;
    padding: 0;
  }
  .reset {
    margin-top: 0.25rem;
    opacity: 0.5;
  }
  .playwrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .reward {
    flex: 1;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.8rem;
    text-align: center;
  }
  .bigkey {
    font-size: 4rem;
    color: #ffe07a;
    filter: drop-shadow(0 0 20px rgba(255, 220, 120, 0.6));
    animation: rise 0.6s ease;
  }
  @keyframes rise {
    from {
      transform: translateY(12px) scale(0.7);
      opacity: 0;
    }
  }
</style>
