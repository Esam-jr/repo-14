<script>
  import { apiFetch, decodeJwt, hasRole } from "../lib/api";
  export let token = "";

  let templates = [];
  let loading = false;
  let error = "";
  let preview = { subject: "", body: "", recipients: [] };

  let form = {
    template_id: "",
    recipient_user_ids: "",
    scope_school: "",
    scope_major: "",
    scope_class_section: "",
    scope_cohort: "",
    subject: "",
    body: "",
    variables: "",
    is_critical: false
  };

  function currentAuth() {
    return decodeJwt(token);
  }

  $: auth = currentAuth();
  $: canCompose = hasRole(auth, ["faculty", "mentor", "admin"]);

  function parseVariables() {
    const obj = {};
    form.variables.split(",").map((x) => x.trim()).filter(Boolean).forEach((pair) => {
      const [k, ...rest] = pair.split(":");
      if (k && rest.length) obj[k.trim()] = rest.join(":").trim();
    });
    return obj;
  }

  function parseSelector() {
    const selector = {};
    const userIds = form.recipient_user_ids.split(",").map((x) => Number.parseInt(x.trim(), 10)).filter((x) => Number.isInteger(x) && x > 0);
    if (userIds.length) selector.user_ids = userIds;

    const scope = {};
    if (form.scope_school) scope.school = form.scope_school.split(",").map((x) => x.trim()).filter(Boolean);
    if (form.scope_major) scope.major = form.scope_major.split(",").map((x) => x.trim()).filter(Boolean);
    if (form.scope_class_section) scope.class_section = form.scope_class_section.split(",").map((x) => x.trim()).filter(Boolean);
    if (form.scope_cohort) scope.cohort = form.scope_cohort.split(",").map((x) => x.trim()).filter(Boolean);
    if (Object.keys(scope).length) selector.scope = scope;

    return selector;
  }

  function renderLocal(templateText, vars) {
    return String(templateText || "").replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_m, key) => vars[key] || "");
  }

  function buildPreview() {
    const vars = parseVariables();
    const template = templates.find((t) => String(t.id) === String(form.template_id));
    const subject = template ? renderLocal(template.subject, vars) : form.subject;
    const body = template ? renderLocal(template.body, vars) : form.body;
    preview = { subject, body, recipients: parseSelector() };
  }

  async function loadTemplates() {
    if (!token || !canCompose) return;
    try {
      const data = await apiFetch("/templates", { token });
      templates = data.items || [];
    } catch (_e) {
      templates = [];
    }
  }

  async function send() {
    if (!canCompose) return;
    loading = true;
    error = "";
    try {
      await apiFetch("/messages/send", {
        method: "POST",
        token,
        body: {
          recipient_selector: parseSelector(),
          template_id: form.template_id ? Number(form.template_id) : null,
          subject: form.subject,
          body: form.body,
          variables: parseVariables(),
          is_critical: form.is_critical
        }
      });
      form = { ...form, subject: "", body: "", variables: "", recipient_user_ids: "" };
      buildPreview();
    } catch (e) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  $: if (token && canCompose) loadTemplates();
  $: buildPreview();
</script>

<section>
  <h2>Messages</h2>
  {#if !canCompose}
    <div class="denied-card" data-testid="messages-denied">
      <p class="error">You do not have permission to send messages or manage templates.</p>
      <p>Only faculty, mentors, and admins can access messaging controls.</p>
    </div>
  {:else}
  <div class="grid">
    <select bind:value={form.template_id}>
      <option value="">No template</option>
      {#each templates as t}<option value={t.id}>{t.name}</option>{/each}
    </select>
    <input placeholder="Recipient user IDs" bind:value={form.recipient_user_ids} />
    <input placeholder="Scope school" bind:value={form.scope_school} />
    <input placeholder="Scope major" bind:value={form.scope_major} />
    <input placeholder="Scope class_section" bind:value={form.scope_class_section} />
    <input placeholder="Scope cohort" bind:value={form.scope_cohort} />
    <input placeholder="Subject" bind:value={form.subject} />
    <textarea placeholder="Body" bind:value={form.body}></textarea>
    <input placeholder="Variables k:v,k:v" bind:value={form.variables} />
    <label><input type="checkbox" bind:checked={form.is_critical} /> Critical</label>
  </div>

  <h3>Send Preview</h3>
  <p><strong>{preview.subject}</strong></p>
  <p>{preview.body}</p>
  <pre>{JSON.stringify(preview.recipients, null, 2)}</pre>

  <button on:click={send} disabled={loading || !token}>Send</button>
  {#if loading}<p>Sending...</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {/if}
</section>

<style>.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem}textarea{min-height:120px}.error{color:#a11}.denied-card{border:1px solid #e0b3b3;background:#fff4f4;padding:.75rem;border-radius:.5rem}</style>
