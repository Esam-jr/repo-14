<script>
  import { onMount } from "svelte";

  let status = "loading";
  let detail = "Contacting server...";

  async function loadHealth() {
    try {
      const response = await fetch("http://server:4000/health");
      const payload = await response.json();
      status = payload.status || "unknown";
      detail = response.ok ? "Server is reachable from client container." : "Server returned a non-OK status.";
    } catch (error) {
      status = "unreachable";
      detail = "Browser cannot resolve http://server:4000 from host context. API container is still available at http://localhost:4000/health.";
    }
  }

  onMount(loadHealth);
</script>

<main>
  <h1>CohortBridge</h1>
  <p>API health status: <strong>{status}</strong></p>
  <p>{detail}</p>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: sans-serif;
    background: #f6f7fb;
    color: #1b1f2a;
  }

  main {
    max-width: 720px;
    margin: 4rem auto;
    padding: 2rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
  }

  h1 {
    margin-top: 0;
  }
</style>
