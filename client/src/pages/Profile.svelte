<script>
  import { apiFetch, decodeJwt } from "../lib/api";
  import { redactedValue } from "../lib/redaction";

  export let token = "";

  let loading = false;
  let error = "";
  let user = null;
  let visibility = {
    phone_visibility: "private",
    email_visibility: "private",
    employer_visibility: "private"
  };

  let requestModalOpen = false;
  let requestForm = { target_user_id: "", fields_requested: "email", reason: "" };
  let requestInfo = "";

  function currentUserId() {
    const payload = decodeJwt(token);
    return payload && payload.sub ? Number(payload.sub) : null;
  }

  function updatePreview() {
    if (!user) return { phone: "", email: "", employer: "" };
    const profile = user.profile || {};
    return {
      phone: visibility.phone_visibility === "private" ? redactedValue("phone", profile.phone) : (profile.phone || ""),
      email: visibility.email_visibility === "private" ? redactedValue("email", profile.email) : (profile.email || ""),
      employer: visibility.employer_visibility === "private" ? redactedValue("employer", profile.employer) : (profile.employer || "")
    };
  }

  $: preview = updatePreview();

  async function loadProfile() {
    const id = currentUserId();
    if (!id || !token) return;
    loading = true;
    error = "";
    try {
      const data = await apiFetch(`/users/${id}`, { token });
      user = data.user;
      visibility = { ...user.visibility };
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function saveVisibility() {
    const id = currentUserId();
    if (!id || !token) return;
    loading = true;
    error = "";
    try {
      const data = await apiFetch(`/users/${id}/privacy`, { method: "PATCH", token, body: visibility });
      visibility = { ...data.privacy };
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  async function submitAccessRequest() {
    loading = true;
    error = "";
    requestInfo = "";
    try {
      const fields = requestForm.fields_requested.split(",").map((x) => x.trim()).filter(Boolean);
      const data = await apiFetch("/privacy_requests", {
        method: "POST",
        token,
        body: { target_user_id: Number(requestForm.target_user_id), fields_requested: fields, reason: requestForm.reason }
      });
      requestInfo = `Request submitted. Expires at ${data.request.expires_at}`;
      requestModalOpen = false;
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: if (token) loadProfile();
</script>

<section>
  <h2>Profile</h2>
  {#if loading}<p>Loading...</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if user}
    <div class="grid">
      <label>Phone visibility
        <select bind:value={visibility.phone_visibility}><option>public</option><option>cohort</option><option>advisor_mentor</option><option>private</option></select>
      </label>
      <label>Email visibility
        <select bind:value={visibility.email_visibility}><option>public</option><option>cohort</option><option>advisor_mentor</option><option>private</option></select>
      </label>
      <label>Employer visibility
        <select bind:value={visibility.employer_visibility}><option>public</option><option>cohort</option><option>advisor_mentor</option><option>private</option></select>
      </label>
    </div>

    <h3>Live Redaction Preview</h3>
    <p>Phone: {preview.phone}</p>
    <p>Email: {preview.email}</p>
    <p>Employer: {preview.employer}</p>

    <button on:click={saveVisibility} disabled={loading}>Save Privacy</button>

    <h3>Access Request</h3>
    <button on:click={() => (requestModalOpen = true)} disabled={loading}>Open Access Request Modal</button>
    {#if requestInfo}<p>{requestInfo}</p>{/if}

    {#if requestModalOpen}
      <div class="modal" role="dialog" aria-modal="true">
        <h4>Request Private Fields</h4>
        <input placeholder="Target user id" bind:value={requestForm.target_user_id} />
        <input placeholder="Fields (email,phone,employer)" bind:value={requestForm.fields_requested} />
        <textarea placeholder="Reason" bind:value={requestForm.reason}></textarea>
        <div class="actions">
          <button on:click={submitAccessRequest} disabled={loading}>Submit</button>
          <button on:click={() => (requestModalOpen = false)} disabled={loading}>Close</button>
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem}.modal{padding:1rem;background:#fff6d9;border:1px solid #e5d29d;border-radius:.5rem;margin-top:.5rem}.actions{display:flex;gap:.5rem}.error{color:#a11}</style>
