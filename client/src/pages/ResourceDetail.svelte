<script>
  import { apiFetch } from "../lib/api";

  export let token = "";
  export let resourceId = "";

  let loading = false;
  let saving = false;
  let error = "";
  let success = "";
  let resource = null;
  let form = {
    title: "",
    body: "",
    resource_type: "",
    url: "",
    school: "",
    major: "",
    class_section: "",
    cohort: ""
  };

  async function load() {
    if (!resourceId || !token) return;
    loading = true;
    error = "";
    success = "";
    try {
      const data = await apiFetch(`/resources/${resourceId}`, { token });
      resource = data.resource;
      form = {
        title: resource.title || "",
        body: resource.body || "",
        resource_type: resource.resource_type || "",
        url: resource.url || "",
        school: resource.school || "",
        major: resource.major || "",
        class_section: resource.class_section || "",
        cohort: resource.cohort || ""
      };
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function save() {
    if (!token || !resourceId) return;
    saving = true;
    error = "";
    success = "";
    try {
      const payload = {
        title: form.title,
        body: form.body,
        resource_type: form.resource_type,
        url: form.url,
        school: form.school,
        major: form.major,
        class_section: form.class_section,
        cohort: form.cohort
      };
      const data = await apiFetch(`/resources/${resourceId}`, {
        method: "PATCH",
        token,
        body: payload
      });
      resource = data.resource;
      success = "Resource updated.";
    } catch (e) {
      error = e.message;
    } finally {
      saving = false;
    }
  }

  $: if (resourceId && token) load();
</script>

<section class="card" data-testid="resource-detail-page">
  <h2>Resource Detail</h2>
  {#if loading}<p>Loading...</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if resource}
    <div class="grid">
      <input placeholder="Title" bind:value={form.title} />
      <input placeholder="Resource type" bind:value={form.resource_type} />
      <input placeholder="URL" bind:value={form.url} />
      <input placeholder="School" bind:value={form.school} />
      <input placeholder="Major" bind:value={form.major} />
      <input placeholder="Class section" bind:value={form.class_section} />
      <input placeholder="Cohort" bind:value={form.cohort} />
    </div>
    <textarea placeholder="Body" bind:value={form.body}></textarea>
    <div class="row actions">
      <button class="primary" on:click={save} disabled={saving}>Save</button>
      {#if success}<span>{success}</span>{/if}
    </div>
  {/if}
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  textarea {
    width: 100%;
    min-height: 120px;
    margin-top: var(--space-2);
  }

  .actions {
    margin-top: var(--space-2);
  }
</style>
