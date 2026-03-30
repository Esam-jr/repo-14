<script>
  import { apiFetch, decodeJwt } from "../lib/api";
  export let token = "";

  let loading = false;
  let error = "";
  let requests = [];
  let reindexResult = "";

  function role() {
    const payload = decodeJwt(token);
    return payload && payload.role ? payload.role : "";
  }

  $: currentRole = role();
  $: allowed = currentRole === "admin";

  async function loadRequests() {
    if (!token || !allowed) return;
    loading = true;
    error = "";
    try {
      const data = await apiFetch("/privacy_requests", { token });
      requests = data.items || [];
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function act(id, action) {
    loading = true;
    error = "";
    try {
      await apiFetch(`/privacy_requests/${id}/${action}`, { method: "PATCH", token, body: { note: `${action}d in admin console` } });
      await loadRequests();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function reindex() {
    loading = true;
    error = "";
    reindexResult = "";
    try {
      const data = await apiFetch("/admin/reindex", { method: "POST", token, body: {} });
      reindexResult = JSON.stringify(data.result);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: if (token && allowed) loadRequests();
</script>

<section>
  <h2>AdminConsole</h2>
  {#if !allowed}
    <p>Role-limited: admin only.</p>
  {:else}
    <button on:click={reindex} disabled={loading}>Run Reindex</button>
    {#if reindexResult}<p>Reindex: {reindexResult}</p>{/if}
    {#if loading}<p>Loading...</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}

    <ul>
      {#each requests as r}
        <li>
          <strong>Request #{r.id}</strong> status={r.status} target={r.target_user_id}
          {#if r.status === "pending"}
            <button on:click={() => act(r.id, "approve")} disabled={loading}>Approve</button>
            <button on:click={() => act(r.id, "deny")} disabled={loading}>Deny</button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>.error{color:#a11}</style>
