<script>
  import { tick } from "svelte";
  import { fade } from "svelte/transition";
  import { decodeJwt, getStoredToken, storeToken, clearStoredToken, hasRole } from "./lib/api";
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
  let token = getStoredToken();
  let auth = token ? decodeJwt(token) : null;
  let toasts = [];
  let questionsFilterState = null;

  let menuOpen = false;
  let firstNavControl;

  function pushToast(kind, text) {
    const id = Date.now() + Math.random();
    toasts = [...toasts, { id, kind, text }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 3000);
  }

  const STAFF_ROLES = ["faculty", "mentor", "admin"];

  function isAdminConsoleAllowed() {
    return hasRole(auth, STAFF_ROLES);
  }

  function isMessagingAllowed() {
    return hasRole(auth, STAFF_ROLES);
  }

  function setRoute(next, questionId = "") {
    const name = knownRoutes.includes(next) ? next : "landing";
    route = name;
    routeQuestionId = questionId;
    location.hash = questionId ? `${name}/${questionId}` : name;
    menuOpen = false;
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

  async function toggleMenu() {
    menuOpen = !menuOpen;
    if (menuOpen) {
      await tick();
      if (firstNavControl) firstNavControl.focus();
    }
  }

  function onLoggedIn(event) {
    token = event.detail.accessToken;
    auth = decodeJwt(token);
    storeToken(token);
    pushToast("success", "Welcome back.");
    setRoute("landing");
  }

  function logout() {
    token = "";
    auth = null;
    clearStoredToken();
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
    // Keep route so denied-state UI can be shown.
  }

  $: if (route === "messages" && token && !isMessagingAllowed()) {
    // Keep route so denied-state UI can be shown.
  }

  parseHash();
  window.addEventListener("hashchange", parseHash);
</script>

<main class="container">
  <header class="card topbar">
    <div class="brand">
      <h1>CohortBridge</h1>
      <p class="muted">Bridge cohorts, questions, and mentorship with clarity.</p>
    </div>

    <button
      class="secondary menu-toggle"
      on:click={toggleMenu}
      aria-expanded={menuOpen}
      aria-controls="primary-navigation"
    >
      Menu
    </button>

    <nav aria-label="Primary">
      <ul id="primary-navigation" class:open={menuOpen}>
        <li><button data-testid="nav-landing" bind:this={firstNavControl} on:click={() => setRoute("landing")}>Landing</button></li>
        <li><button data-testid="nav-questions" on:click={() => setRoute("questions")} disabled={!token}>Questions</button></li>
        <li><button data-testid="nav-ask" on:click={() => setRoute("ask")} disabled={!token}>Ask</button></li>
        <li><button data-testid="nav-saved" on:click={() => setRoute("saved")} disabled={!token}>Saved</button></li>
        <li><button data-testid="nav-messages" on:click={() => setRoute("messages")} disabled={!token || !isMessagingAllowed()}>Messages</button></li>
        <li><button data-testid="nav-notifications" on:click={() => setRoute("notifications")} disabled={!token}>Notifications</button></li>
        <li><button data-testid="nav-profile" on:click={() => setRoute("profile")} disabled={!token}>Profile</button></li>
        <li><button data-testid="nav-admin" on:click={() => setRoute("admin")} disabled={!token || !isAdminConsoleAllowed()}>Admin</button></li>
        <li>
          {#if !token}
            <button data-testid="nav-auth" class="primary" on:click={() => setRoute("auth")}>Login / Register</button>
          {:else}
            <button data-testid="nav-auth" on:click={logout}>Logout</button>
          {/if}
        </li>
      </ul>
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
    {#if !token}
      <Auth on:loggedIn={onLoggedIn} />
    {:else if isMessagingAllowed()}
      <Messages token={token} />
    {:else}
      <section class="card denied" data-testid="denied-messages">
        <h2>Access Restricted</h2>
        <p class="muted">Messaging and template controls are available to faculty, mentors, and admins.</p>
        <div class="row">
          <button on:click={() => setRoute("notifications")}>Go to Notifications</button>
          <a class="contact-link" href="mailto:admin@cohortbridge.local">Contact Administrator</a>
        </div>
      </section>
    {/if}
  {:else if route === "notifications"}
    <Notifications token={token} />
  {:else if route === "profile"}
    <Profile token={token} />
  {:else if route === "admin"}
    {#if !token}
      <Auth on:loggedIn={onLoggedIn} />
    {:else if isAdminConsoleAllowed()}
      <AdminConsole token={token} />
    {:else}
      <section class="card denied" data-testid="denied-admin">
        <h2>Access Restricted</h2>
        <p class="muted">Admin tools require delegated staff permissions.</p>
        <a class="contact-link" href="mailto:admin@cohortbridge.local">Request Access</a>
      </section>
    {/if}
  {:else}
    <NotFound />
  {/if}

  <section class="toasts" role="status" aria-live="polite" aria-atomic="true">
    {#each toasts as toast (toast.id)}
      <div class={`toast ${toast.kind}`} in:fade={{ duration: 180 }} out:fade={{ duration: 180 }}>
        {toast.text}
      </div>
    {/each}
  </section>
</main>

<style>
  :global(:root) {
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 24px;
    --space-6: 32px;

    --fs-base: 16px;
    --fs-sm: 0.875rem;
    --fs-md: 1rem;
    --fs-lg: 1.25rem;
    --fs-xl: 1.5rem;
    --fs-2xl: 1.875rem;

    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;

    --shadow-sm: 0 2px 10px rgba(16, 24, 20, 0.08);
    --shadow-md: 0 8px 22px rgba(16, 24, 20, 0.12);
    --shadow-lg: 0 14px 30px rgba(16, 24, 20, 0.16);

    --bg: #f3f6f4;
    --surface: #ffffff;
    --text: #1f2b25;
    --muted: #5a6a62;
    --line: #d5e0da;
    --accent: #116149;
    --accent-soft: #e6f2ed;
    --danger: #9e2f2f;
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: var(--fs-base);
    line-height: 1.55;
    color: var(--text);
    background: radial-gradient(circle at top right, #dcece4 0%, var(--bg) 40%);
  }

  :global(section) {
    margin-bottom: var(--space-4);
  }

  :global(h1) {
    margin: 0;
    font-size: var(--fs-2xl);
    line-height: 1.2;
  }

  :global(h2) {
    margin-top: 0;
    font-size: var(--fs-xl);
    line-height: 1.25;
  }

  :global(h3) {
    margin-top: 0;
    font-size: var(--fs-lg);
    line-height: 1.3;
  }

  :global(input, select, textarea, button) {
    font: inherit;
  }

  :global(input, select, textarea) {
    width: 100%;
    border: 1px solid #c8d4ce;
    border-radius: var(--radius-sm);
    padding: 0.6rem 0.7rem;
    background: #fff;
    color: var(--text);
  }

  :global(button) {
    border: 1px solid #86a095;
    border-radius: var(--radius-sm);
    padding: 0.55rem 0.85rem;
    background: #fff;
    color: var(--text);
    cursor: pointer;
    transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
  }

  :global(button.primary) {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  :global(button.secondary) {
    background: var(--surface);
    border-color: #9aada4;
  }

  :global(button:hover:not(:disabled)) {
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  :global(button:disabled) {
    opacity: 0.6;
    cursor: not-allowed;
  }

  :global(button:focus-visible),
  :global(input:focus-visible),
  :global(select:focus-visible),
  :global(textarea:focus-visible),
  :global(a:focus-visible) {
    outline: 3px solid color-mix(in srgb, var(--accent) 55%, transparent);
    outline-offset: 2px;
  }

  :global(.container) {
    width: min(1120px, 100%);
    margin: 0 auto;
    padding: var(--space-4);
  }

  :global(.card) {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    padding: var(--space-4);
  }

  :global(.row) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
  }

  :global(.muted) {
    color: var(--muted);
  }

  :global(.visually-hidden) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  :global(.error) {
    color: var(--danger);
  }

  .topbar {
    margin-bottom: var(--space-4);
  }

  .brand p {
    margin-top: var(--space-1);
    margin-bottom: var(--space-3);
  }

  .menu-toggle {
    display: none;
  }

  nav ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .toasts {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    display: grid;
    gap: var(--space-2);
    z-index: 10;
  }

  .toast {
    background: #fff;
    border-left: 4px solid #7a8d84;
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    box-shadow: var(--shadow-md);
  }

  .toast.success {
    border-left-color: var(--accent);
  }

  .toast.error {
    border-left-color: var(--danger);
  }

  .toast.info {
    border-left-color: #245e8e;
  }

  .denied {
    display: grid;
    gap: var(--space-2);
  }

  .contact-link {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  @media (max-width: 880px) {
    .menu-toggle {
      display: inline-flex;
      margin-bottom: var(--space-2);
    }

    nav ul {
      display: none;
      flex-direction: column;
      align-items: stretch;
    }

    nav ul.open {
      display: flex;
    }
  }
</style>
