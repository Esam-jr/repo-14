<script>
  import { apiFetch } from "../lib/api";
  export let token = "";

  let readFilter = "";
  let loading = false;
  let error = "";
  let items = [];

  async function load() {
    if (!token) return;
    loading = true;
    error = "";
    try {
      const query = new URLSearchParams();
      if (readFilter) query.set("read", readFilter);
      const data = await apiFetch(`/notifications${query.toString() ? `?${query.toString()}` : ""}`, { token });
      items = data.items || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function markRead(id, value) {
    await apiFetch(`/notifications/${id}/read`, { method: "PATCH", token, body: { is_read: value } });
    load();
  }

  async function mute(id) {
    await apiFetch(`/notifications/${id}/mute`, { method: "PATCH", token, body: {} });
    load();
  }

  $: if (token) load();
</script>

<section>
  <h2>Notifications</h2>
  <div class="actions">
    <select bind:value={readFilter} on:change={load}>
      <option value="">All</option>
      <option value="false">Unread</option>
      <option value="true">Read</option>
    </select>
    <button on:click={load} disabled={loading}>Refresh</button>
  </div>

  {#if loading}<p>Loading...</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  <ul>
    {#each items as n}
      <li>
        <strong>{n.subject}</strong>
        <p>{n.body}</p>
        <small>critical: {String(n.is_critical)} | read: {String(n.is_read)}</small>
        <div>
          <button on:click={() => markRead(n.id, !n.is_read)}>{n.is_read ? "Mark unread" : "Mark read"}</button>
          <button on:click={() => mute(n.id)}>Mute 7 days</button>
        </div>
      </li>
    {/each}
  </ul>
</section>

<style>.actions{display:flex;gap:.5rem}.error{color:#a11}</style>
