<script>
  import { apiFetch } from "../lib/api";
  export let token = "";

  let form = {
    title: "",
    body: "",
    question_type: "discussion",
    difficulty: "beginner",
    status: "open",
    school: "",
    major: "",
    class_section: "",
    cohort: "",
    tags: "",
    knowledge_point: ""
  };

  let loading = false;
  let message = "";
  let error = "";

  async function submit() {
    loading = true;
    error = "";
    message = "";
    try {
      const payload = {
        ...form,
        tags: form.tags.split(",").map((x) => x.trim()).filter(Boolean)
      };
      await apiFetch("/questions", { method: "POST", token, body: payload });
      message = "Question created.";
      form = { ...form, title: "", body: "", tags: "" };
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<section>
  <h2>Ask Question</h2>
  <input placeholder="Title" bind:value={form.title} />
  <textarea placeholder="Body" bind:value={form.body}></textarea>
  <div class="grid">
    <input placeholder="Type" bind:value={form.question_type} />
    <input placeholder="Difficulty" bind:value={form.difficulty} />
    <input placeholder="Status" bind:value={form.status} />
    <input placeholder="School" bind:value={form.school} />
    <input placeholder="Major" bind:value={form.major} />
    <input placeholder="Class section" bind:value={form.class_section} />
    <input placeholder="Cohort" bind:value={form.cohort} />
    <input placeholder="Tags (comma separated)" bind:value={form.tags} />
    <input placeholder="Knowledge point" bind:value={form.knowledge_point} />
  </div>
  <button on:click={submit} disabled={loading || !token}>Submit</button>
  {#if message}<p>{message}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.5rem;margin:.5rem 0}
  textarea{width:100%;min-height:120px}
  .error{color:#a11}
</style>
