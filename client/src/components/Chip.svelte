<script>
  export let text = "";
  export let removable = false;
  export let onRemove = null;
</script>

<span class="chip">
  {text}
  {#if removable}
    <button class="chip-remove" type="button" aria-label={`Remove ${text}`} on:click={() => onRemove && onRemove(text)}>×</button>
  {/if}
</span>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border: 1px solid #bfd3c9;
    background: var(--accent-soft);
    color: #114b3c;
    border-radius: 999px;
    padding: 0.22rem 0.55rem;
    font-size: 0.85rem;
    line-height: 1.2;
  }

  .chip-remove {
    border: 0;
    background: transparent;
    color: inherit;
    padding: 0;
    width: 1rem;
    height: 1rem;
    line-height: 1rem;
  }
</style>
