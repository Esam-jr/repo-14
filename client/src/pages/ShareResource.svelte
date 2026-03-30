<script>
  import { apiFetch } from "../lib/api";

  export let token = "";

  let form = {
    title: "",
    body: "",
    resource_type: "reflection",
    url: "",
    school: "",
    major: "",
    class_section: "",
    cohort: ""
  };

  let loading = false;
  let message = "";
  let error = "";

  async function submit() {
    loading = true;
    error = "";
    message = "";
    try {
      await apiFetch("/resources", { method: "POST", token, body: form });
      message = "Resource shared.";
      form = { ...form, title: "", body: "", url: "" };
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<section class="card" data-testid="share-resource-page">
  <h2>Share Resource</h2>
  <p class="muted">Post reflections, employer tips, and learning resources for your cohort.</p>

  <div class="grid">
    <input placeholder="Title" bind:value={form.title} />
    <select bind:value={form.resource_type}>
      <option value="reflection">reflection</option>
      <option value="employer_tip">employer_tip</option>
      <option value="note">note</option>
      <option value="link">link</option>
    </select>
    <input placeholder="URL (optional)" bind:value={form.url} />
    <input placeholder="School" bind:value={form.school} />
    <input placeholder="Major" bind:value={form.major} />
    <input placeholder="Class section" bind:value={form.class_section} />
    <input placeholder="Cohort" bind:value={form.cohort} />
  </div>
  <textarea placeholder="Body" bind:value={form.body}></textarea>

  <button class="primary" on:click={submit} disabled={loading || !token}>Share</button>
  {#if message}<p>{message}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  textarea {
    width: 100%;
    min-height: 130px;
    margin-bottom: var(--space-2);
  }
</style>
