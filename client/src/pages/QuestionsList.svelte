<script>
  import { slide } from "svelte/transition";
  import { createEventDispatcher } from "svelte";
  import { apiFetch } from "../lib/api";
  import Card from "../components/Card.svelte";
  import Chip from "../components/Chip.svelte";

  export let token = "";
  export let onUseFilters = null;
  export let savedState = null;

  const dispatch = createEventDispatcher();

  let loading = false;
  let error = "";
  let showAdvanced = false;
  let debouncedKeywordTimer = null;
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

  function parseTagsFromInput() {
    const parsed = filters.tagInput
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    filters.tags = Array.from(new Set(parsed));
  }

  function normalizeTagsToInput() {
    filters.tagInput = (filters.tags || []).join(", ");
  }

  function buildQuery() {
    parseTagsFromInput();
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

  function excerpt(value) {
    const text = String(value || "").trim();
    if (!text) return "No description provided.";
    return text.length > 110 ? `${text.slice(0, 110)}...` : text;
  }

  function toDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toISOString().slice(0, 10);
  }

  function removeTag(tag) {
    filters.tags = filters.tags.filter((x) => x !== tag);
    normalizeTagsToInput();
    fetchList();
  }

  function onTagInputBlur() {
    parseTagsFromInput();
    normalizeTagsToInput();
  }

  function queueKeywordSearch(value) {
    if (debouncedKeywordTimer) clearTimeout(debouncedKeywordTimer);
    debouncedKeywordTimer = setTimeout(() => {
      const normalized = String(value || "").trim();
      if (normalized.length === 0 || normalized.length >= 2) {
        filters.page = 1;
        fetchList();
      }
    }, 300);
  }

  $: queueKeywordSearch(filters.q);
</script>

<section class="card">
  <h2>Questions List</h2>

  <div class="filter-shell">
    <div class="top-grid">
      <label class="keyword-wrap">
        <span class="visually-hidden">Keyword</span>
        <input placeholder="Keyword" bind:value={filters.q} />
      </label>

      <label>
        <span class="visually-hidden">Question type</span>
        <input placeholder="question_type" bind:value={filters.question_type} />
      </label>

      <label>
        <span class="visually-hidden">Difficulty</span>
        <input placeholder="difficulty" bind:value={filters.difficulty} />
      </label>

      <div class="row top-actions">
        <button
          class="secondary"
          on:click={() => (showAdvanced = !showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="advanced-filters-panel"
        >
          Advanced filters
        </button>
        <button class="primary" on:click={fetchList} disabled={loading}>Apply</button>
        <button on:click={resetFilters} disabled={loading}>Reset</button>
      </div>
    </div>

    {#if showAdvanced}
      <div id="advanced-filters-panel" class="advanced-panel" transition:slide={{ duration: 170 }}>
        <div class="advanced-grid">
          <input placeholder="knowledge_point" bind:value={filters.knowledge_point} />
          <input placeholder="creator" bind:value={filters.creator_id} />
          <input placeholder="status" bind:value={filters.status} />
          <input type="date" bind:value={filters.start_date} />
          <input type="date" bind:value={filters.end_date} />
          <input placeholder="school" bind:value={filters.school} />
          <input placeholder="major" bind:value={filters.major} />
          <input placeholder="cohort" bind:value={filters.cohort} />
          <input placeholder="tags (a,b,c)" bind:value={filters.tagInput} on:blur={onTagInputBlur} />
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
      </div>
    {/if}

    <div class="row chips-row">
      {#each filters.tags as tag}
        <Chip text={tag} removable={true} onRemove={removeTag} />
      {/each}
    </div>
  </div>

  <div class="row count-row">
    <span class="muted">Count: {result.items.length} / Total: {result.pagination.total || 0}</span>
    {#if loading}<span class="muted">Loading...</span>{/if}
  </div>
  {#if error}<p class="error">{error}</p>{/if}

  {#if loading}
    <div class="result-grid">
      {#each Array(6) as _, i}
        <div class="card skeleton" aria-hidden="true" data-key={i}>
          <div class="line w70"></div>
          <div class="line w100"></div>
          <div class="line w80"></div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="result-grid">
      {#each result.items as item}
        <Card tabindex={0}>
          <div class="question-card">
            <div class="row title-row">
              <h3>{item.title}</h3>
              <button class="secondary" on:click={() => openQuestion(item.id)}>Open</button>
            </div>
            <p class="muted">{excerpt(item.body)}</p>
            <div class="row">
              {#each (item.tags || []) as tag}
                <Chip text={tag} />
              {/each}
            </div>
            <div class="meta-row muted">
              <span>Status: {item.status || "-"}</span>
              <span>Difficulty: {item.difficulty || "-"}</span>
              <span>Date: {toDate(item.created_at)}</span>
            </div>
          </div>
        </Card>
      {/each}
    </div>
  {/if}
</section>

<style>
  .filter-shell {
    display: grid;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .top-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr auto;
    gap: var(--space-2);
    align-items: end;
  }

  .keyword-wrap input {
    border-width: 2px;
  }

  .top-actions {
    justify-content: flex-end;
  }

  .advanced-panel {
    border: 1px solid var(--line);
    background: #fbfcfb;
    border-radius: var(--radius-sm);
    padding: var(--space-3);
  }

  .advanced-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-2);
  }

  .chips-row {
    min-height: 1.75rem;
  }

  .count-row {
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-3);
  }

  .question-card h3 {
    margin: 0;
    font-size: 1.03rem;
  }

  .title-row {
    justify-content: space-between;
    align-items: flex-start;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: 0.9rem;
  }

  .skeleton {
    overflow: hidden;
  }

  .line {
    height: 0.85rem;
    border-radius: 999px;
    margin-bottom: 0.55rem;
    background: linear-gradient(90deg, #eef3f0 25%, #dde6e1 37%, #eef3f0 63%);
    background-size: 400% 100%;
    animation: shimmer 1.1s infinite linear;
  }

  .w70 { width: 70%; }
  .w80 { width: 80%; }
  .w100 { width: 100%; }

  @keyframes shimmer {
    from { background-position: 100% 0; }
    to { background-position: 0 0; }
  }

  @media (max-width: 960px) {
    .top-grid {
      grid-template-columns: 1fr;
    }

    .top-actions {
      justify-content: flex-start;
    }
  }
</style>
