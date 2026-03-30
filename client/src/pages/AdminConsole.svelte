<script>
  import { apiFetch } from "../lib/api";

  export let token = "";
  export let auth = null;

  let loading = false;
  let error = "";

  let users = [];
  let userQuery = "";
  let privacyRequests = [];
  let exportsList = [];

  let exportType = "users";
  let exportStatus = "";

  $: currentRole = auth && auth.role ? auth.role : "";
  $: allowed = ["admin", "faculty", "mentor"].includes(currentRole);
  $: canManageUsers = currentRole === "admin";

  async function loadUsers() {
    if (!allowed) return;
    const query = new URLSearchParams();
    if (userQuery.trim()) query.set("q", userQuery.trim());
    const data = await apiFetch(`/admin/users${query.toString() ? `?${query.toString()}` : ""}`, { token });
    users = data.items || [];
  }

  async function loadPrivacyRequests() {
    if (!["admin", "faculty"].includes(currentRole)) return;
    const data = await apiFetch("/admin/privacy_requests", { token });
    privacyRequests = data.items || [];
  }

  async function loadExports() {
    if (!allowed) return;
    const data = await apiFetch("/admin/exports", { token });
    exportsList = data.items || [];
  }

  async function runLoad() {
    if (!token || !allowed) return;
    loading = true;
    error = "";
    try {
      await Promise.all([loadUsers(), loadPrivacyRequests(), loadExports()]);
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function updateUserRole(user, roleValue) {
    loading = true;
    error = "";
    try {
      await apiFetch("/admin/users", {
        method: "PUT",
        token,
        body: { id: user.id, role: roleValue }
      });
      await loadUsers();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function toggleFreeze(user) {
    loading = true;
    error = "";
    try {
      await apiFetch(`/admin/users/${user.id}/freeze`, {
        method: "POST",
        token,
        body: { is_frozen: !user.is_frozen }
      });
      await loadUsers();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function reviewRequest(id, action) {
    loading = true;
    error = "";
    try {
      await apiFetch(`/admin/privacy_requests/${id}/${action}`, {
        method: "POST",
        token,
        body: { note: `${action}d in admin console` }
      });
      await loadPrivacyRequests();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function createExport() {
    loading = true;
    error = "";
    exportStatus = "";
    try {
      const created = await apiFetch("/admin/exports", {
        method: "POST",
        token,
        body: { export_type: exportType, filters: {} }
      });
      exportStatus = `Export #${created.export.id} ready (${created.export.row_count} rows).`;
      await loadExports();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: if (token && allowed) runLoad();
</script>

<section>
  <h2>Admin Console</h2>
  {#if !allowed}
    <p>Role-limited area: admin/faculty/mentor only.</p>
  {:else}
    {#if loading}<p>Loading...</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}

    <h3>Users</h3>
    <div class="actions">
      <input placeholder="Search users by email/name" bind:value={userQuery} />
      <button on:click={loadUsers} disabled={loading}>Search</button>
    </div>
    <ul>
      {#each users as user}
        <li>
          <strong>{user.email}</strong> role={user.role} frozen={String(user.is_frozen)}
          {#if canManageUsers}
            <div class="actions">
              <select value={user.role} on:change={(e) => updateUserRole(user, e.currentTarget.value)} disabled={loading}>
                <option value="student">student</option>
                <option value="alumni">alumni</option>
                <option value="faculty">faculty</option>
                <option value="mentor">mentor</option>
                <option value="admin">admin</option>
              </select>
              <button on:click={() => toggleFreeze(user)} disabled={loading}>
                {user.is_frozen ? "Unfreeze" : "Freeze"}
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <h3>Privacy Requests</h3>
    <ul>
      {#each privacyRequests as r}
        <li>
          <strong>#{r.id}</strong> target={r.target_user_id} status={r.status}
          {#if r.status === "pending"}
            <div class="actions">
              <button on:click={() => reviewRequest(r.id, "approve")} disabled={loading}>Approve</button>
              <button on:click={() => reviewRequest(r.id, "deny")} disabled={loading}>Deny</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <h3>Exports</h3>
    <div class="actions">
      <select bind:value={exportType}>
        <option value="users">users</option>
        <option value="privacy_requests">privacy_requests</option>
        <option value="questions">questions</option>
      </select>
      <button on:click={createExport} disabled={loading}>Create Export</button>
      <button on:click={loadExports} disabled={loading}>Refresh Exports</button>
    </div>
    {#if exportStatus}<p>{exportStatus}</p>{/if}
    <ul>
      {#each exportsList as item}
        <li>
          <strong>Export #{item.id}</strong> type={item.export_type} rows={item.row_count}
          <a href={`http://localhost:4000${item.download_url}`} target="_blank" rel="noreferrer">Download</a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .actions { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; margin: .35rem 0; }
  .error { color: #a11; }
</style>
