<script>
  export let tabindex = 0;
</script>

<article class="card app-card" {tabindex}>
  <slot />
</article>

<style>
  .app-card {
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .app-card:hover,
  .app-card:focus-within {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }
</style>
