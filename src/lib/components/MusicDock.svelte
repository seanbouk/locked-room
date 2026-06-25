<script lang="ts">
  // Music dock — a single, optional SomaFM radio player below the puzzle.
  //
  // SomaFM is free, no-login, commercial-free, listener-supported indie radio —
  // the right fit for a quiet puzzle game (we tried Spotify/YouTube too; they
  // weren't). Play/pause is the on/off; it opens silent. Neutral glass skin so it
  // sits quietly under the lock.
  //
  // Lives in App (outside GameScreen's per-room {#key} remount) so playback
  // carries across rooms. NOTE: SomaFM's direct streams are licensed "for personal
  // use" — get their OK before shipping this widely.
  import { onMount } from 'svelte';

  // lofi / chill / beats stations. Swap or extend freely (id = the somafm slug).
  const STATIONS = [
    { name: 'Fluid', desc: 'instrumental hiphop · future soul', id: 'fluid' },
    { name: 'Beat Blender', desc: 'late-night downtempo beats', id: 'beatblender' },
    { name: 'Groove Salad', desc: 'chilled ambient · downtempo', id: 'groovesalad' },
    { name: 'Lush', desc: 'mellow vocals · downtempo', id: 'lush' },
    { name: 'Cliqhop', desc: 'glitchy IDM · chill beats', id: 'cliqhop' },
  ];
  const streamUrl = (id: string, host: 5 | 3 = 5) => `https://ice${host}.somafm.com/${id}-128-mp3`;
  const MUSIC_VOLUME = 0.25; // sits well under the (limited, louder) sound effects

  const KEY = 'locked-room/music/v1';
  let stationIdx = $state(0);
  let playing = $state(false);
  let audio = $state<HTMLAudioElement>();

  const wrap = (i: number) => ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (typeof s.station === 'number') stationIdx = wrap(s.station);
    } catch {
      /* ignore */
    }
    // opens silent — browsers block autoplay and the room should start quiet.
  });
  // keep the radio at half level so it sits under the sound effects
  $effect(() => {
    if (audio) audio.volume = MUSIC_VOLUME;
  });
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ station: stationIdx })); } catch { /* ignore */ }
  };

  // Playback is fully imperative (no reactive src attr — that dropped playback on
  // a station switch).
  function togglePlay() {
    if (!audio) return;
    if (playing) audio.pause();
    else {
      if (!audio.src) audio.src = streamUrl(STATIONS[stationIdx].id);
      audio.play().catch(() => {});
    }
  }
  function cycle(dir: number) {
    stationIdx = wrap(stationIdx + dir);
    persist();
    if (!audio) return;
    const wasPlaying = playing;
    audio.src = streamUrl(STATIONS[stationIdx].id);
    audio.load();
    if (wasPlaying) audio.play().catch(() => {}); // keep playing across the switch
  }
  function onAudioError() {
    // primary mirror failed — fall back to the other host once
    const primary = streamUrl(STATIONS[stationIdx].id);
    if (audio && audio.src === primary) {
      audio.src = streamUrl(STATIONS[stationIdx].id, 3);
      audio.load();
      if (playing) audio.play().catch(() => {});
    }
  }
</script>

<div class="dock">
  <div class="surface">
    <button class="ctl play" class:playing onclick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
      {playing ? '❚❚' : '▶'}
    </button>
    <div class="now">
      <span class="st-name">{STATIONS[stationIdx].name}</span>
      <span class="st-desc">{STATIONS[stationIdx].desc} · SomaFM</span>
    </div>
    <button class="ctl" onclick={() => cycle(-1)} aria-label="Previous station">‹</button>
    <button class="ctl" onclick={() => cycle(1)} aria-label="Next station">›</button>
    <!-- svelte-ignore a11y_media_has_caption -->
    <audio
      bind:this={audio}
      preload="none"
      onerror={onAudioError}
      onplaying={() => (playing = true)}
      onpause={() => (playing = false)}
    ></audio>
  </div>
</div>

<style>
  .dock {
    position: absolute;
    left: 7%;
    right: 7%;
    bottom: 3.5%;
    z-index: 5;
    pointer-events: auto;
  }
  /* a quiet glass bar — neutral, sits under the lock without shouting. Height is
     panel-relative (cqw) with NO px floor, so it scales with the game on slender
     phones instead of looking pinned to the page. */
  .surface {
    height: 13cqw;
    display: flex;
    align-items: center;
    gap: 1.6cqw;
    padding: 0 2.4cqw;
    border-radius: 2cqw;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid rgba(255, 255, 255, 0.11);
    backdrop-filter: blur(7px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1.5cqw 4cqw -2cqw #000;
  }
  /* uniform glass icon buttons; the play button takes a faint fill while playing */
  .ctl {
    flex: none;
    width: 7.5cqw;
    height: 7.5cqw;
    display: grid;
    place-items: center;
    border-radius: 1.5cqw;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: #ccd3df;
    font-size: 3cqw;
    line-height: 1;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
  }
  .ctl:hover {
    border-color: rgba(255, 255, 255, 0.4);
    color: #fff;
  }
  .ctl.play {
    font-size: 2.6cqw;
  }
  .ctl.play.playing {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }
  .now {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3cqw;
    min-width: 0;
  }
  .st-name {
    font-weight: 700;
    font-size: 2.6cqw;
    color: #e8edf7;
  }
  .st-desc {
    font-size: 1.9cqw;
    color: #8b94a3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
