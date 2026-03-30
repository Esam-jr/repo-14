<script>
  import { createEventDispatcher } from "svelte";
  import { apiFetch } from "../lib/api";

  const dispatch = createEventDispatcher();

  let mode = "login";
  let loading = false;
  let error = "";
  let message = "";

  let loginForm = {
    email: "student.fixture@cohortbridge.dev",
    password: "SeedStudent123!"
  };

  let registerForm = {
    email: "",
    password: "",
    role: "student"
  };

  async function submitLogin() {
    loading = true;
    error = "";
    message = "";
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: loginForm
      });
      dispatch("loggedIn", { accessToken: data.access_token });
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function submitRegister() {
    loading = true;
    error = "";
    message = "";
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: registerForm
      });
      message = "Account created. You can now log in.";
      loginForm = { email: registerForm.email, password: registerForm.password };
      mode = "login";
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }
</script>

<section class="auth-page">
  <h2>Account Access</h2>
  <p class="muted">Use a dedicated login/register flow before accessing protected pages.</p>

  <div class="tabs">
    <button class:primary={mode === "login"} on:click={() => (mode = "login")} disabled={loading}>Login</button>
    <button class:primary={mode === "register"} on:click={() => (mode = "register")} disabled={loading}>Register</button>
  </div>

  {#if mode === "login"}
    <div class="stack">
      <label>Email <input placeholder="you@example.com" bind:value={loginForm.email} /></label>
      <label>Password <input type="password" placeholder="Password" bind:value={loginForm.password} /></label>
      <button class="primary" on:click={submitLogin} disabled={loading}>Sign In</button>
    </div>
  {:else}
    <div class="stack">
      <label>Email <input placeholder="you@example.com" bind:value={registerForm.email} /></label>
      <label>Password <input type="password" placeholder="At least 8 characters" bind:value={registerForm.password} /></label>
      <label>Role
        <select bind:value={registerForm.role}>
          <option value="student">student</option>
          <option value="alumni">alumni</option>
          <option value="faculty">faculty</option>
          <option value="mentor">mentor</option>
        </select>
      </label>
      <button class="primary" on:click={submitRegister} disabled={loading}>Create Account</button>
    </div>
  {/if}

  {#if loading}<p>Processing...</p>{/if}
  {#if message}<p>{message}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
</section>

<style>
  .auth-page {
    max-width: 520px;
    margin: 0 auto 1rem auto;
  }

  .muted {
    color: #5e6b64;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    margin: 0.75rem 0 1rem 0;
  }

  .stack {
    display: grid;
    gap: 0.65rem;
  }

  label {
    display: grid;
    gap: 0.35rem;
  }
</style>
