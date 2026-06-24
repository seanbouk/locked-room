<script lang="ts">
  // Music dock — a carousel of OPTIONAL players below the puzzle. Every service
  // fills ONE fixed glass box (same size for all), with a chip row beneath.
  //
  // Silence (None) by default — a quiet empty glass panel, nothing pushed. Picking
  // a service loads its player; switching unloads the previous one (the only
  // reliable way to "mute" a cross-origin embed). Leads with the free, no-login
  // indie option (SomaFM); Spotify / YouTube are "bring your own".
  //
  // Lives in App (outside GameScreen's per-room {#key} remount) so playback
  // carries across rooms.
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  type Service = 'none' | 'radio' | 'spotify' | 'youtube' | 'local';

  // SomaFM: free, listener-supported, commercial-free indie radio. NOTE: their
  // direct streams are licensed "for personal use" — get their OK before shipping
  // this widely. Lofi/chill picks; swap or extend freely.
  const STATIONS = [
    { name: 'Fluid', desc: 'instrumental hiphop · future soul', url: 'https://ice5.somafm.com/fluid-128-mp3', alt: 'https://ice3.somafm.com/fluid-128-mp3' },
    { name: 'Beat Blender', desc: 'late-night downtempo beats', url: 'https://ice5.somafm.com/beatblender-128-mp3', alt: 'https://ice3.somafm.com/beatblender-128-mp3' },
    { name: 'Groove Salad', desc: 'chilled ambient · downtempo', url: 'https://ice5.somafm.com/groovesalad-128-mp3', alt: 'https://ice3.somafm.com/groovesalad-128-mp3' },
  ];
  // Recommended lofi sources (swap freely). Spotify: full playback only if the
  // viewer is logged into Spotify in this browser (no in-embed login exists);
  // others get 30s previews. YouTube: a lofi PLAYLIST embed (durable, unlike a
  // live-stream/video id) on the nocookie host. It is a VIDEO player — YouTube
  // Music has no embeddable player.
  const SPOTIFY = 'https://open.spotify.com/embed/playlist/0vvXsWCC9xrXsKd4FyS8kM?theme=0';
  const YOUTUBE = 'https://www.youtube-nocookie.com/embed/videoseries?list=PLyORnIW1xT6xL7lVBSCsEoI0NPlpcwzj2&rel=0';

  const KEY = 'locked-room/music/v1';
  let service = $state<Service>('none');
  let stationIdx = $state(0);
  let playing = $state(false);
  let audio = $state<HTMLAudioElement>();
  let boxW = $state(0); // surface width, for the slide distance
  let dir = $state(1); // slide direction: +1 = new enters from the right

  const wrap = (i: number) => ((i % STATIONS.length) + STATIONS.length) % STATIONS.length;
  onMount(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      if (typeof s.station === 'number') stationIdx = wrap(s.station);
    } catch {
      /* ignore */
    }
    // start silent — browsers block autoplay and the room should open quiet.
  });
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ station: stationIdx })); } catch { /* ignore */ }
  };

  const idxOf = (s: Service) => CHIPS.findIndex((c) => c.id === s);
  function pick(s: Service) {
    const next: Service = s === service && s !== 'none' ? 'none' : s; // tap active → silence
    if (next === service) return;
    dir = idxOf(next) >= idxOf(service) ? 1 : -1; // slide toward the chip's side
    if (service === 'radio' && next !== 'radio') {
      audio?.pause();
      playing = false;
    }
    service = next;
  }

  // Radio playback is fully IMPERATIVE (no reactive src attr) — binding src to
  // stationIdx made the browser reset the element on a switch and drop playback.
  function radioSrc() {
    return STATIONS[stationIdx].url;
  }
  function togglePlay() {
    if (!audio) return;
    if (playing) audio.pause();
    else {
      if (!audio.src) audio.src = radioSrc();
      audio.play().catch(() => {});
    }
  }
  function cycle(dir: number) {
    stationIdx = wrap(stationIdx + dir);
    persist();
    if (!audio) return;
    const wasPlaying = playing;
    audio.src = radioSrc();
    audio.load();
    if (wasPlaying) audio.play().catch(() => {}); // keep playing across the switch
  }
  function onAudioError() {
    if (audio && audio.src === STATIONS[stationIdx].url) {
      audio.src = STATIONS[stationIdx].alt; // fall back to the other mirror once
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

<div class="dock">
  <!-- one fixed glass frame; the active player slides in, the old slides out the
       other way (ease-out), so off players are physically off the frame -->
  <div class="surface" data-svc={service} bind:clientWidth={boxW}>
    {#key service}
      <div
        class="slot"
        in:fly={{ x: dir * (boxW || 300), duration: 380, easing: cubicOut }}
        out:fly={{ x: -dir * (boxW || 300), duration: 380, easing: cubicOut }}
      >
        {#if service === 'radio'}
          <div class="radiobar">
            <button class="ctl play" onclick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
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
        {:else if service === 'spotify'}
          <iframe
            class="fill"
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
          <div class="empty">Local tracks — coming soon</div>
        {:else}
          <div class="empty muted" aria-hidden="true">🔇</div>
        {/if}
      </div>
    {/key}
  </div>

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
    gap: 1.4cqw;
    pointer-events: auto;
  }

  /* the one shared box — same size for every service. Glass: translucent, a
     hairline edge, a little blur. Quiet, not busy. */
  .surface {
    position: relative;
    width: 100%;
    height: 16cqw;
    min-height: 120px;
    border-radius: 2cqw;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.045);
    border: 1px solid rgba(255, 255, 255, 0.11);
    backdrop-filter: blur(7px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1.5cqw 4cqw -2cqw #000;
  }

  /* the sliding layer — one per active service; clipped by .surface so the
     outgoing/incoming players are off the frame */
  .slot {
    position: absolute;
    inset: 0;
  }

  /* players fill the slot */
  .fill {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .yt {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .yt iframe {
    height: 100%;
    aspect-ratio: 16 / 9;
    max-width: 100%;
    border: 0;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #8b94a3;
    font-family: ui-monospace, Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 1.9cqw;
  }
  .empty.muted {
    font-size: 4.5cqw;
    opacity: 0.22;
    filter: grayscale(1);
  }

  /* ── SomaFM transport: uniform compact icon buttons, station name between ── */
  .radiobar {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: 1.6cqw;
    padding: 0 2.2cqw;
  }
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
    border-color: #00ad8e;
    color: #fff;
  }
  .ctl.play {
    color: #04130f;
    background: #00ad8e;
    border-color: transparent;
    font-size: 2.6cqw;
  }
  .ctl.play:hover {
    filter: brightness(1.12);
    color: #04130f;
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
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(20, 24, 31, 0.55);
    color: #aab2c0;
    border-radius: 99px;
    padding: 0.9cqw 1.6cqw;
    font-size: 2cqw;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .chip .glyph {
    font-size: 2.2cqw;
  }
  .chip:hover {
    color: #e8edf7;
  }
  .chip.on {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
  .chip.radio.on { border-color: #00ad8e; box-shadow: 0 0 0 1px #00ad8e; }
  .chip.spotify.on { border-color: #1db954; box-shadow: 0 0 0 1px #1db954; }
  .chip.youtube.on { border-color: #ff4d4d; box-shadow: 0 0 0 1px #ff4d4d; }
  .chip.local.on { border-color: #c8923f; box-shadow: 0 0 0 1px #c8923f; }
  .chip.none.on { border-color: #5b636e; }
</style>
