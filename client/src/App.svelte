<script>
  import { decodeJwt } from "./lib/api";
  import Landing from "./pages/Landing.svelte";
  import QuestionsList from "./pages/QuestionsList.svelte";
  import QuestionDetail from "./pages/QuestionDetail.svelte";
  import AskQuestion from "./pages/AskQuestion.svelte";
  import SavedSearches from "./pages/SavedSearches.svelte";
  import Messages from "./pages/Messages.svelte";
  import Notifications from "./pages/Notifications.svelte";
  import Profile from "./pages/Profile.svelte";
  import AdminConsole from "./pages/AdminConsole.svelte";
  import Auth from "./pages/Auth.svelte";
  import NotFound from "./pages/NotFound.svelte";

  const protectedRoutes = ["questions", "question-detail", "ask", "saved", "messages", "notifications", "profile", "admin"];
  const knownRoutes = ["landing", "auth", ...protectedRoutes];

  let route = "landing";
  let routeQuestionId = "";
  let token = localStorage.getItem("cohortbridge_token") || "";
  let auth = token ? decodeJwt(token) : null;

  let toasts = [];
  let questionsFilterState = null;

  function pushToast(kind, text) {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, kind, text }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 3000);
  }

  function isAdminConsoleAllowed() {
    return auth && ["admin", "faculty", "mentor"].includes(auth.role);
  }

  function setRoute(next, questionId = "") {
    const name = knownRoutes.includes(next) ? next : "landing";
    route = name;
    routeQuestionId = questionId;
    location.hash = questionId ? `${name}/${questionId}` : name;
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, "").trim();
    if (!raw) {
      route = "landing";
      routeQuestionId = "";
      return;
    }
    const [name, maybeId] = raw.split("/");
    route = knownRoutes.includes(name) ? name : "not-found";
    routeQuestionId = maybeId || "";
  }

  function onLoggedIn(event) {
    token = event.detail.accessToken;
    auth = decodeJwt(token);
    localStorage.setItem("cohortbridge_token", token);
    pushToast("success", "Welcome back.");
    setRoute("landing");
  }

  function logout() {
    token = "";
    auth = null;
    localStorage.removeItem("cohortbridge_token");
    pushToast("info", "Logged out.");
    setRoute("auth");
  }

  function onQuestionOpen(event) {
    setRoute("question-detail", String(event.detail.id));
  }

  $: if (!token && protectedRoutes.includes(route)) {
    setRoute("auth");
  }

  $: if (route === "admin" && !isAdminConsoleAllowed()) {
    setRoute("landing");
  }

  parseHash();
  window.addEventListener("hashchange", parseHash);
</script>

<main class="app-shell">
  <header class="topbar">
    <div class="brand-row">
      <h1>CohortBridge</h1>
      <p>Bridge cohorts, knowledge, and mentorship with clarity.</p>
    </div>

    <nav>
      <button on:click={() => setRoute("landing")}>Landing</button>
      <button on:click={() => setRoute("questions")} disabled={!token}>Questions</button>
      <button on:click={() => setRoute("ask")} disabled={!token}>Ask</button>
      <button on:click={() => setRoute("saved")} disabled={!token}>Saved</button>
      <button on:click={() => setRoute("messages")} disabled={!token}>Messages</button>
      <button on:click={() => setRoute("notifications")} disabled={!token}>Notifications</button>
      <button on:click={() => setRoute("profile")} disabled={!token}>Profile</button>
      <button on:click={() => setRoute("admin")} disabled={!isAdminConsoleAllowed()}>Admin</button>
      {#if !token}
        <button class="primary" on:click={() => setRoute("auth")}>Login / Register</button>
      {:else}
        <button on:click={logout}>Logout</button>
      {/if}
    </nav>
  </header>

  {#if route === "landing"}
    <Landing />
  {:else if route === "auth"}
    <Auth on:loggedIn={onLoggedIn} />
  {:else if route === "questions"}
    <QuestionsList token={token} onUseFilters={(s) => (questionsFilterState = s)} on:openQuestion={onQuestionOpen} />
  {:else if route === "question-detail"}
    <QuestionDetail questionId={routeQuestionId} />
  {:else if route === "ask"}
    <AskQuestion token={token} />
  {:else if route === "saved"}
    <SavedSearches token={token} currentFilters={questionsFilterState} />
  {:else if route === "messages"}
    <Messages token={token} />
  {:else if route === "notifications"}
    <Notifications token={token} />
  {:else if route === "profile"}
    <Profile token={token} />
  {:else if route === "admin"}
    <AdminConsole token={token} />
  {:else}
    <NotFound />
  {/if}

  <section class="toasts" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class={`toast ${toast.kind}`}>{toast.text}</div>
    {/each}
  </section>
</main>

<style>
  :global(:root) {
    --bg: #f3f6f4;
    --surface: #ffffff;
    --line: #d7e2dc;
    --text: #1e2a25;
    --muted: #596a61;
    --accent: #2f6f56;
    --accent-soft: #e6f1ec;
    --danger: #9f2f2f;
  }

  :global(body) {
    margin: 0;
    background: radial-gradient(circle at top right, #dbece2 0%, var(--bg) 40%);
    color: var(--text);
    font-family: "Segoe UI", "Trebuchet MS", sans-serif;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(section) {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  :global(input, select, textarea, button) {
    font: inherit;
  }

  :global(input, select, textarea) {
    width: 100%;
    border: 1px solid #c8d5ce;
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
    background: #fff;
  }

  :global(button) {
    border: 1px solid #789587;
    border-radius: 8px;
    padding: 0.48rem 0.72rem;
    background: #fff;
    color: var(--text);
    cursor: pointer;
  }

  :global(button.primary) {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  :global(button:disabled) {
    opacity: 0.55;
    cursor: not-allowed;
  }

  :global(h2, h3) {
    margin-top: 0;
  }

  :global(ul) {
    margin: 0;
    padding-left: 1rem;
    display: grid;
    gap: 0.45rem;
  }

  :global(.error) {
    color: var(--danger);
  }

  .app-shell {
    max-width: 1100px;
    margin: 0 auto;
    padding: 1rem;
  }

  .topbar {
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .brand-row p {
    margin-top: 0.2rem;
    margin-bottom: 0.8rem;
    color: var(--muted);
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .toasts {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    display: grid;
    gap: 0.4rem;
    z-index: 10;
  }

  .toast {
    background: #fff;
    border-left: 4px solid #74857b;
    border-radius: 6px;
    padding: 0.5rem 0.7rem;
    box-shadow: 0 5px 14px rgba(0, 0, 0, 0.12);
  }

  .toast.success {
    border-left-color: #2f6f56;
  }

  .toast.error {
    border-left-color: #9f2f2f;
  }

  .toast.info {
    border-left-color: #2d5f8a;
  }
</style>
