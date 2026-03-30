<script>
  import { onMount } from "svelte";
  import { apiFetch } from "../lib/api";

  let status = "loading";
  let detail = "Contacting API...";

  onMount(async () => {
    try {
      const data = await apiFetch("/health");
      status = data.status || "ok";
      detail = "System is healthy.";
    } catch (error) {
      status = "unreachable";
      detail = error.message;
    }
  });
</script>

<section>
  <h2>Landing</h2>
  <p>Welcome to CohortBridge.</p>
  <p>Health: <strong>{status}</strong></p>
  <small>{detail}</small>
</section>
