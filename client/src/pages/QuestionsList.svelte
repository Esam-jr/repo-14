<script>
  import { createEventDispatcher } from "svelte";
  import { apiFetch } from "../lib/api";

  export let token = "";
  export let onUseFilters = null;
  export let savedState = null;

  const dispatch = createEventDispatcher();

  let loading = false;
  let error = "";
  let result = { items: [], pagination: { page: 1, per_page: 25, total: 0, total_pages: 1 } };

  let filters = savedState || {
    q: "",
    question_type: "",
    difficulty: "",
    tags: [],
    tagInput: "",
    knowledge_point: "",
    creator_id: "",
    status: "",
    start_date: "",
    end_date: "",
    school: "",
    major: "",
    cohort: "",
    sort_by: "created_at",
    sort_dir: "desc",
    page: 1,
    per_page: 25
  };

  function normalizeTags() {
    filters.tags = Array.from(new Set(filters.tagInput.split(",").map((x) => x.trim()).filter(Boolean)));
  }

  function buildQuery() {
    normalizeTags();
    const q = new URLSearchParams();

    const mapping = {
      q: filters.q,
      question_type: filters.question_type,
      difficulty: filters.difficulty,
      knowledge_point: filters.knowledge_point,
      creator_id: filters.creator_id,
      status: filters.status,
      start_date: filters.start_date,
      end_date: filters.end_date,
      school: filters.school,
      major: filters.major,
      cohort: filters.cohort,
      sort_by: filters.sort_by,
      sort_dir: filters.sort_dir,
      page: String(filters.page),
      per_page: String(Math.min(100, Math.max(1, Number(filters.per_page) || 25)))
    };

    Object.entries(mapping).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });

    if (filters.tags.length > 0) q.set("tag", filters.tags[0]);

    return q;
  }

  async function fetchList() {
    loading = true;
    error = "";
    try {
      const query = buildQuery();
      const data = await apiFetch(`/questions?${query.toString()}`, { token });
      if (filters.tags.length > 1) {
        data.items = data.items.filter((item) => filters.tags.every((t) => (item.tags || []).includes(t)));
      }
      result = data;
      if (onUseFilters) onUseFilters({ ...filters, tags: [...filters.tags] });
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  function resetFilters() {
    filters = {
      q: "", question_type: "", difficulty: "", tags: [], tagInput: "", knowledge_point: "",
      creator_id: "", status: "", start_date: "", end_date: "", school: "", major: "", cohort: "",
      sort_by: "created_at", sort_dir: "desc", page: 1, per_page: 25
    };
    fetchList();
  }

  function openQuestion(id) {
    dispatch("openQuestion", { id });
  }
</script>

<section>
  <h2>QuestionsList</h2>
  <div class="grid">
    <input placeholder="Keyword" bind:value={filters.q} />
    <input placeholder="question_type" bind:value={filters.question_type} />
    <input placeholder="difficulty" bind:value={filters.difficulty} />
    <input placeholder="tags (a,b,c)" bind:value={filters.tagInput} />
    <input placeholder="knowledge_point" bind:value={filters.knowledge_point} />
    <input placeholder="creator" bind:value={filters.creator_id} />
    <input placeholder="status" bind:value={filters.status} />
    <input type="date" bind:value={filters.start_date} />
    <input type="date" bind:value={filters.end_date} />
    <input placeholder="school" bind:value={filters.school} />
    <input placeholder="major" bind:value={filters.major} />
    <input placeholder="cohort" bind:value={filters.cohort} />
    <select bind:value={filters.sort_by}>
      <option value="created_at">created_at</option>
      <option value="updated_at">updated_at</option>
      <option value="title">title</option>
      <option value="status">status</option>
      <option value="difficulty">difficulty</option>
    </select>
    <select bind:value={filters.sort_dir}>
      <option value="desc">desc</option>
      <option value="asc">asc</option>
    </select>
    <input type="number" min="1" bind:value={filters.page} />
    <input type="number" min="1" max="100" bind:value={filters.per_page} />
  </div>

  <div class="actions">
    <button on:click={fetchList} disabled={loading}>Apply</button>
    <button on:click={resetFilters} disabled={loading}>Reset</button>
    <span>Count: {result.items.length} / Total: {result.pagination.total || 0}</span>
  </div>

  {#if error}<p class="error">{error}</p>{/if}
  {#if loading}<p>Loading...</p>{/if}

  <ul>
    {#each result.items as item}
      <li>
        <button on:click={() => openQuestion(item.id)}>{item.title}</button>
        <small> [{item.status}] [{item.difficulty}]</small>
      </li>
    {/each}
  </ul>
</section>

<style>
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:.5rem; }
  .actions { margin:.75rem 0; display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }
  .error { color:#a11; }
</style>
