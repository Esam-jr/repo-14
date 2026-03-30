<script>
  import { apiFetch } from "../lib/api";
  export let token = "";
  export let currentFilters = null;

  let items = [];
  let label = "";
  let pinned = false;
  let loading = false;
  let error = "";
  let applyResult = null;

  async function load() {
    if (!token) return;
    loading = true;
    error = "";
    try {
      const data = await apiFetch("/saved_searches", { token });
      items = data.items || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function saveCurrent() {
    if (!token || !currentFilters) return;
    loading = true;
    error = "";
    try {
      const filters = {
        ...currentFilters,
        tag: currentFilters.tags && currentFilters.tags[0] ? currentFilters.tags[0] : currentFilters.tag
      };
      await apiFetch("/saved_searches", {
        method: "POST",
        token,
        body: { label, is_frequently_used: pinned, filters }
      });
      label = "";
      pinned = false;
      await load();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function applySearch(id) {
    loading = true;
    error = "";
    try {
      applyResult = await apiFetch(`/saved_searches/${id}/apply`, { method: "POST", token, body: {} });
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: if (token) load();
</script>

<section>
  <h2>SavedSearches</h2>
  <div class="actions">
    <input placeholder="Search name" bind:value={label} />
    <label><input type="checkbox" bind:checked={pinned} /> Frequently Used</label>
    <button on:click={saveCurrent} disabled={loading || !token || !label || !currentFilters}>Save current filter</button>
  </div>

  {#if loading}<p>Loading...</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  <ul>
    {#each items as item}
      <li>
        <strong>{item.label}</strong>
        {#if item.is_frequently_used}<small> (Pinned)</small>{/if}
        <button on:click={() => applySearch(item.id)} disabled={loading}>Apply</button>
      </li>
    {/each}
  </ul>

  {#if applyResult}
    <p>Applied: {applyResult.saved_search.label}. Result count: {applyResult.items.length}</p>
  {/if}
</section>

<style>.actions{display:flex;gap:.5rem;flex-wrap:wrap}.error{color:#a11}</style>
