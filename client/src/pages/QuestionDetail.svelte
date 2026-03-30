<script>
  import { onMount } from "svelte";
  import { apiFetch } from "../lib/api";

  export let token = "";
  export let questionId = "";
  let loading = false;
  let error = "";
  let question = null;

  async function load() {
    if (!questionId || !token) return;
    loading = true;
    error = "";
    question = null;
    try {
      const data = await apiFetch(`/questions/${questionId}`, { token });
      question = data.question;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $: if (questionId && token) load();
</script>

<section>
  <h2>Question Detail</h2>
  {#if loading}<p>Loading...</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if question}
    <h3>{question.title}</h3>
    <p>{question.body}</p>
    <p>Status: {question.status} | Difficulty: {question.difficulty}</p>
  {/if}
</section>

<style>.error{color:#a11;}</style>
