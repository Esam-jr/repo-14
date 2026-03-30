<script>
  import { decodeJwt, apiFetch } from "./lib/api";
  import Landing from "./pages/Landing.svelte";
  import QuestionsList from "./pages/QuestionsList.svelte";
  import QuestionDetail from "./pages/QuestionDetail.svelte";
  import AskQuestion from "./pages/AskQuestion.svelte";
  import SavedSearches from "./pages/SavedSearches.svelte";
  import Messages from "./pages/Messages.svelte";
  import Notifications from "./pages/Notifications.svelte";
  import Profile from "./pages/Profile.svelte";
  import AdminConsole from "./pages/AdminConsole.svelte";

  const pages = ["landing", "questions", "question-detail", "ask", "saved", "messages", "notifications", "profile", "admin"];

  let route = "landing";
  let routeQuestionId = "";
  let token = localStorage.getItem("cohortbridge_token") || "";
  let auth = token ? decodeJwt(token) : null;

  let login = { email: "student.fixture@cohortbridge.dev", password: "SeedStudent123!" };
  let loginLoading = false;
  let loginError = "";

  let toasts = [];
  let questionsFilterState = null;

  function pushToast(kind, text) {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, kind, text }];
    setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); }, 3000);
  }

  function setRoute(next, questionId = "") {
    route = pages.includes(next) ? next : "landing";
    routeQuestionId = questionId;
    location.hash = questionId ? `${route}/${questionId}` : route;
  }

  function parseHash() {
    const raw = location.hash.replace(/^#/, "").trim();
    if (!raw) { route = "landing"; routeQuestionId = ""; return; }
    const [name, maybeId] = raw.split("/");
    route = pages.includes(name) ? name : "landing";
    routeQuestionId = maybeId || "";
  }

  async function loginSubmit() {
    loginLoading = true;
    loginError = "";
    try {
      const data = await apiFetch("/auth/login", { method: "POST", body: login });
      token = data.access_token;
      localStorage.setItem("cohortbridge_token", token);
      auth = decodeJwt(token);
      pushToast("success", "Logged in.");
    } catch (e) {
      loginError = e.message;
      pushToast("error", e.message);
    } finally {
      loginLoading = false;
    }
  }

  function logout() {
    token = "";
    auth = null;
    localStorage.removeItem("cohortbridge_token");
    pushToast("info", "Logged out.");
  }

  function onQuestionOpen(event) {
    setRoute("question-detail", String(event.detail.id));
  }

  parseHash();
  window.addEventListener("hashchange", parseHash);
</script>

<main>
  <header>
    <h1>CohortBridge</h1>
    <nav>
      <button on:click={() => setRoute("landing")}>Landing</button>
      <button on:click={() => setRoute("questions")}>QuestionsList</button>
      <button on:click={() => setRoute("ask")}>AskQuestion</button>
      <button on:click={() => setRoute("saved")}>SavedSearches</button>
      <button on:click={() => setRoute("messages")}>Messages</button>
      <button on:click={() => setRoute("notifications")}>Notifications</button>
      <button on:click={() => setRoute("profile")}>Profile</button>
      <button on:click={() => setRoute("admin")} disabled={!(auth && auth.role === "admin")}>AdminConsole</button>
    </nav>

    <section class="auth">
      {#if !token}
        <input placeholder="email" bind:value={login.email} />
        <input placeholder="password" type="password" bind:value={login.password} />
        <button on:click={loginSubmit} disabled={loginLoading}>Login</button>
      {:else}
        <p>Signed in as user {auth && auth.sub} ({auth && auth.role})</p>
        <button on:click={logout}>Logout</button>
      {/if}
      {#if loginError}<small class="error">{loginError}</small>{/if}
    </section>
  </header>

  {#if route === "landing"}
    <Landing />
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
  {/if}

  <section class="toasts" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class={`toast ${toast.kind}`}>{toast.text}</div>
    {/each}
  </section>
</main>

<style>
  :global(body) { margin: 0; font-family: "Trebuchet MS", "Segoe UI", sans-serif; background: linear-gradient(180deg, #f4f1e8, #efe7d7); color: #222; }
  main { max-width: 1120px; margin: 0 auto; padding: 1rem; }
  header { position: sticky; top: 0; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); border: 1px solid #dacfb5; border-radius: 12px; padding: .75rem; margin-bottom: 1rem; }
  nav { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:.5rem; }
  button { border:1px solid #8f7f55; background:#fff; border-radius:8px; padding:.45rem .65rem; cursor:pointer; }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .auth { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }
  .toasts { position:fixed; right:1rem; bottom:1rem; display:grid; gap:.4rem; z-index:10; }
  .toast { background:#fff; border-left:4px solid #666; padding:.5rem .75rem; border-radius:6px; box-shadow:0 6px 16px rgba(0,0,0,.12); }
  .toast.success { border-left-color:#2d8a4b; }
  .toast.error { border-left-color:#ab2f2f; }
  .toast.info { border-left-color:#2e5fa5; }
  .error { color:#a11; }
</style>
