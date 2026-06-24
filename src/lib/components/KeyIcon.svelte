<script lang="ts">
  // A single skeleton key, drawn as single-colour vector art. The bow (handle)
  // carries the rule; the bit (teeth) echoes it; the two-spot keys show a linked
  // pair of rings. Used by the tray, the drag ghost and the reward screen, so the
  // thing you win is the exact thing you drag. Colour comes from KEY_COLORS.
  import { KEY_COLORS } from '../render/keyStyle';

  let { id, glow = true }: { id: string; glow?: boolean } = $props();
</script>

<svg
  class="ki"
  class:glow
  viewBox="0 0 150 72"
  fill="currentColor"
  style:color={KEY_COLORS[id]}
  role="img"
  aria-label="{id} skeleton key"
>
  <!-- BOW: the handle, shaped to the rule -->
  {#if id === 'semicircle'}
    <!-- square handle + a right-angle tick -->
    <rect x="12" y="11" width="50" height="50" rx="11" fill="none" stroke="currentColor" stroke-width="9" />
    <path d="M28 47 V31 H44" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" />
  {:else if id === 'triangle-sum'}
    <path d="M38 8 L65 59 L11 59 Z" fill="none" stroke="currentColor" stroke-width="9" stroke-linejoin="round" />
  {:else if id === 'same-segment'}
    <!-- two equal interlocked rings: equality + linkage -->
    <circle cx="28" cy="36" r="17" fill="none" stroke="currentColor" stroke-width="8" />
    <circle cx="52" cy="36" r="17" fill="none" stroke="currentColor" stroke-width="8" />
  {:else if id === 'angle-at-centre'}
    <!-- big + small linked rings: 2:1 -->
    <circle cx="30" cy="38" r="21" fill="none" stroke="currentColor" stroke-width="9" />
    <circle cx="55" cy="20" r="11" fill="none" stroke="currentColor" stroke-width="6" />
  {:else if id === 'isosceles-radii'}
    <!-- balance: two equal rings on a level beam + fulcrum -->
    <rect x="10" y="14" width="56" height="6" rx="3" />
    <path d="M38 20 L31 33 H45 Z" />
    <rect x="20.5" y="20" width="3" height="9" />
    <rect x="52.5" y="20" width="3" height="9" />
    <circle cx="22" cy="44" r="12" fill="none" stroke="currentColor" stroke-width="6" />
    <circle cx="54" cy="44" r="12" fill="none" stroke="currentColor" stroke-width="6" />
  {/if}

  <!-- SHAFT (the balance beam doubles as its own bow, so its shaft is shorter) -->
  {#if id === 'isosceles-radii'}
    <rect x="60" y="31" width="64" height="10" rx="5" />
  {:else}
    <rect x="54" y="31" width="70" height="10" rx="5" />
  {/if}
  <!-- collar -->
  <rect x="104" y="22.5" width="7" height="27" rx="2.5" />
  <!-- bit shoulder -->
  <rect x="114" y="31" width="26" height="11" rx="3" />

  <!-- BIT: the teeth, echoing the rule -->
  {#if id === 'semicircle'}
    <path d="M118 42 H140 V60 H131 V51 H118 Z" />
  {:else if id === 'triangle-sum'}
    <rect x="118" y="42" width="4.5" height="9" rx="1" />
    <rect x="126" y="42" width="4.5" height="14" rx="1" />
    <rect x="134" y="42" width="4.5" height="9" rx="1" />
  {:else if id === 'angle-at-centre'}
    <rect x="120" y="42" width="5" height="16" rx="1.5" />
    <rect x="131" y="42" width="5" height="8" rx="1.5" />
  {:else}
    <rect x="121" y="42" width="5" height="13" rx="1.5" />
    <rect x="131" y="42" width="5" height="13" rx="1.5" />
  {/if}
</svg>

<style>
  .ki {
    display: block;
    width: 100%;
    height: auto;
  }
  .ki.glow {
    filter: drop-shadow(0 0 4px color-mix(in srgb, currentColor 60%, transparent));
  }
</style>
