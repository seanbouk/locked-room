<script lang="ts">
  // Music dock — a small carousel of OPTIONAL players below the puzzle.
  //
  // Silence by default (None): mostly transparent, so its look matches the quiet.
  // Nothing is pushed. Pick a service and its player loads; switching unloads the
  // previous one — which is also the only reliable way to "mute" a cross-origin
  // embed (you can't pause someone else's iframe from script). Leads with the
  // free, no-login indie option (SomaFM); Spotify / YouTube are "bring your own".
  //
  // Lives in App (outside GameScreen's per-room {#key} remount) so playback
  // carries across rooms.
  import { onMount } from 'svelte';

  type Service = 'none' | 'radio' | 'spotify' | 'youtube' | 'local';

  // SomaFM: free, listener-supported, commercial-free indie radio. NOTE: their
  // direct streams are licensed "for personal use" — get their OK before shipping
  // this widely. Lofi/chill picks; swap or extend freely.
  const STATIONS = [
    { name: 'Fluid', desc: 'instrumental hiphop · future soul', url: 'https://ice5.somafm.com/fluid-128-mp3', alt: 'https://ice3.somafm.com/fluid-128-mp3' },
    { name: 'Beat Blender', desc: 'late-night downtempo beats', url: 'https://ice5.somafm.com/beatblender-128-mp3', alt: 'https://ice3.somafm.com/beatblender-128-mp3' },
    { name: 'Groove Salad', desc: 'chilled ambient · downtempo', url: 'https://ice5.somafm.com/groovesalad-128-mp3', alt: 'https://ice3.somafm.com/groovesalad-128-mp3' },
  ];
  // Recommended lofi sources (swap freely). Spotify: full playback for logged-in
  // Premium, 30s previews otherwise. YouTube: a lofi PLAYLIST embed — durable,
  // unlike a live-stream/video id (the iconic jfKfPfyJRdk was pulled May 2026).
  const SPOTIFY = 'https://open.spotify.com/embed/playlist/0vvXsWCC9xrXsKd4FyS8kM?theme=0';
  const YOUTUBE = 'https://www.youtube.com/embed/videoseries?list=PLyORnIW1xT6xL7lVBSCsEoI0NPlpcwzj2';

  const KEY = 'locked-room/music/v1';
  let service = $state<Service>('none');
  let stationIdx = $state(0);
  let playing = $state(false);
  let audio = $state<HTMLAudioElement>();

  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (typeof s.station === 'number') stationIdx = ((s.station % STATIONS.length) + STATIONS.length) % STATIONS.length;
    } catch {
      /* ignore */
    }
    // Start silent on load — the room opens quiet, and browsers block autoplay
    // anyway, so we never restore a "playing" service.
  });
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ station: stationIdx })); } catch { /* ignore */ }
  };

  function pick(s: Service) {
    const next: Service = s === service && s !== 'none' ? 'none' : s; // tap active → silence
    if (service === 'radio' && next !== 'radio') {
      audio?.pause();
      playing = false;
    }
    service = next;
  }

  function toggleRadio() {
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play().catch(() => (playing = false));
  }
  function setStation(i: number) {
    stationIdx = ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
    persist();
    if (audio && playing) {
      audio.load();
      audio.play().catch(() => {});
    }
  }
  function onAudioError() {
    // primary mirror failed — fall back to the alternate host once
    if (audio && audio.src === STATIONS[stationIdx].url) {
      audio.src = STATIONS[stationIdx].alt;
      audio.load();
      if (playing) audio.play().catch(() => {});
    }
  }

  const CHIPS: { id: Service; label: string; glyph: string }[] = [
    { id: 'none', label: 'Silence', glyph: '🔇' },
    { id: 'radio', label: 'SomaFM radio', glyph: '📻' },
    { id: 'spotify', label: 'Spotify', glyph: '♫' },
    { id: 'youtube', label: 'YouTube', glyph: '▶' },
    { id: 'local', label: 'Local (soon)', glyph: '🎵' },
  ];
</script>

<div class="dock" class:silent={service === 'none'} data-svc={service}>
  {#if service !== 'none'}
    <div class="surface">
      {#if service === 'radio'}
        <div class="radio">
          <button class="play" onclick={toggleRadio} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div class="now">
            <span class="st-name">{STATIONS[stationIdx].name}</span>
            <span class="st-desc">{STATIONS[stationIdx].desc} · SomaFM</span>
          </div>
          <div class="st-nav">
            <button onclick={() => setStation(stationIdx - 1)} aria-label="Previous station">‹</button>
            <button onclick={() => setStation(stationIdx + 1)} aria-label="Next station">›</button>
          </div>
          <!-- svelte-ignore a11y_media_has_caption -->
          <audio
            bind:this={audio}
            src={STATIONS[stationIdx].url}
            preload="none"
            onerror={onAudioError}
            onplaying={() => (playing = true)}
            onpause={() => (playing = false)}
          ></audio>
        </div>
      {:else if service === 'spotify'}
        <iframe
          class="emb spotify"
          title="Spotify player"
          src={SPOTIFY}
          allow="encrypted-media; autoplay; clipboard-write; fullscreen; picture-in-picture"
          loading="lazy"
        ></iframe>
      {:else if service === 'youtube'}
        <div class="yt">
          <iframe
            title="YouTube lofi radio"
            src={YOUTUBE}
            allow="autoplay; encrypted-media; picture-in-picture"
            loading="lazy"
            allowfullscreen
          ></iframe>
        </div>
      {:else if service === 'local'}
        <div class="local">Local tracks — coming soon</div>
      {/if}
    </div>
  {/if}

  <div class="chips" role="tablist" aria-label="Music player">
    {#each CHIPS as c (c.id)}
      <button
        class="chip {c.id}"
        class:on={service === c.id}
        role="tab"
        aria-selected={service === c.id}
        title={c.label}
        onclick={() => pick(c.id)}
      >
        <span class="glyph">{c.glyph}</span>
        {#if c.id !== 'none' && c.id !== 'local'}<span class="txt">{c.label}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .dock {
    position: absolute;
    left: 7%;
    right: 7%;
    bottom: 3.5%;
    z-index: 5;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 1.4cqw;
    pointer-events: auto;
    transition: opacity 0.25s ease;
  }
  /* Silence: mostly transparent, just a faint chip row — its look matches the
     quiet. It wakes up on hover/focus so it's still discoverable. */
  .dock.silent {
    opacity: 0.4;
  }
  .dock.silent:hover,
  .dock.silent:focus-within {
    opacity: 1;
  }

  .surface {
    background: linear-gradient(180deg, rgba(20, 24, 31, 0.92), rgba(12, 15, 20, 0.92));
    border: 1px solid #2a2f3a;
    border-radius: 2cqw;
    padding: 1.6cqw;
    box-shadow: 0 1.5cqw 4cqw -2cqw #000;
    backdrop-filter: blur(2px);
  }

  /* ── SomaFM radio: our own minimal transport over an <audio> tag ── */
  .radio {
    display: flex;
    align-items: center;
    gap: 1.6cqw;
  }
  .play {
    flex: none;
    width: 9cqw;
    height: 9cqw;
    border-radius: 50%;
    border: none;
    background: #00ad8e;
    color: #04130f;
    font-size: 3.2cqw;
    line-height: 1;
    cursor: pointer;
    display: grid;
    place-items: center;
    box-shadow: 0 0 3cqw rgba(0, 173, 142, 0.5);
  }
  .play:hover {
    filter: brightness(1.12);
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
  .st-nav {
    flex: none;
    display: flex;
    gap: 0.8cqw;
  }
  .st-nav button {
    width: 6cqw;
    height: 6cqw;
    border-radius: 1.2cqw;
    border: 1px solid #2a2f3a;
    background: rgba(255, 255, 255, 0.04);
    color: #ccd3df;
    font-size: 3cqw;
    line-height: 1;
    cursor: pointer;
  }
  .st-nav button:hover {
    border-color: #00ad8e;
    color: #fff;
  }

  /* ── embeds ── */
  .emb.spotify {
    display: block;
    width: 100%;
    height: 15cqw;
    min-height: 80px;
    border: 0;
    border-radius: 1.5cqw;
  }
  .yt {
    width: 46cqw;
    margin: 0 auto;
  }
  .yt iframe {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 1.5cqw;
  }
  .local {
    text-align: center;
    color: #8b94a3;
    font-family: ui-monospace, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 2cqw;
    padding: 3cqw 0;
  }

  /* ── chip carousel ── */
  .chips {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1.2cqw;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.7cqw;
    border: 1px solid #2a2f3a;
    background: rgba(20, 24, 31, 0.7);
    color: #aab2c0;
    border-radius: 99px;
    padding: 0.9cqw 1.6cqw;
    font-size: 2cqw;
    line-height: 1;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .chip .glyph {
    font-size: 2.2cqw;
  }
  .chip:hover {
    color: #e8edf7;
  }
  /* in silence the chips are bare (no pill) so the row reads as a quiet hint */
  .dock.silent .chip {
    background: transparent;
    border-color: transparent;
  }
  /* active chip lights in its service's colour */
  .chip.on {
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
  }
  .chip.radio.on { border-color: #00ad8e; box-shadow: 0 0 0 1px #00ad8e; }
  .chip.spotify.on { border-color: #1db954; box-shadow: 0 0 0 1px #1db954; }
  .chip.youtube.on { border-color: #ff4d4d; box-shadow: 0 0 0 1px #ff4d4d; }
  .chip.local.on { border-color: #c8923f; box-shadow: 0 0 0 1px #c8923f; }
  .chip.none.on { border-color: #5b636e; }

  @media (prefers-reduced-motion: reduce) {
    .dock { transition: none; }
  }
</style>
