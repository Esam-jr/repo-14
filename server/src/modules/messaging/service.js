const { AppError } = require("../../errors");
const { authInfo } = require("../../logger");
const { renderTemplate } = require("./templateRenderer");
const { ALLOWED_SCOPE_KEYS } = require("./validators");

function nowDate() {
  return new Date();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function scopeOverlap(actorScopes = {}, targetScopes = {}) {
  return ALLOWED_SCOPE_KEYS.some((key) => {
    const left = asArray(actorScopes[key]);
    const right = asArray(targetScopes[key]);
    if (left.length === 0 || right.length === 0) return false;
    return left.some((x) => right.includes(x));
  });
}

function canManageTemplates(actor) {
  return ["faculty", "mentor", "admin"].includes(actor.role);
}

function canSendMessages(actor) {
  return ["faculty", "mentor", "admin"].includes(actor.role);
}

async function createTemplate(pool, actor, payload) {
  if (!canManageTemplates(actor)) {
    throw new AppError(403, "forbidden", "Insufficient permission to create templates.");
  }

  const result = await pool.query(
    `INSERT INTO message_templates (name, subject, body, variables, created_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (created_by, name)
     DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, variables = EXCLUDED.variables, updated_at = NOW()
     RETURNING id, name, subject, body, variables, created_by, created_at, updated_at`,
    [payload.name, payload.subject, payload.body, JSON.stringify(payload.variables), actor.userId]
  );

  return result.rows[0];
}

async function listTemplates(pool, actor) {
  if (!canManageTemplates(actor)) {
    throw new AppError(403, "forbidden", "Insufficient permission to list templates.");
  }

  const isAdmin = actor.role === "admin";
  const result = isAdmin
    ? await pool.query(
      `SELECT id, name, subject, body, variables, created_by, created_at, updated_at
       FROM message_templates
       ORDER BY updated_at DESC`
    )
    : await pool.query(
      `SELECT id, name, subject, body, variables, created_by, created_at, updated_at
       FROM message_templates
       WHERE created_by = $1
       ORDER BY updated_at DESC`,
      [actor.userId]
    );

  return result.rows;
}

async function getTemplateById(pool, templateId) {
  const result = await pool.query(
    `SELECT id, name, subject, body, variables, created_by, created_at, updated_at
     FROM message_templates
     WHERE id = $1`,
    [templateId]
  );

  return result.rows[0] || null;
}

async function updateTemplate(pool, actor, templateId, payload) {
  if (!canManageTemplates(actor)) {
    throw new AppError(403, "forbidden", "Insufficient permission to update templates.");
  }

  const existing = await getTemplateById(pool, templateId);
  if (!existing) {
    throw new AppError(404, "not_found", "Template not found.");
  }

  if (actor.role !== "admin" && Number(existing.created_by) !== Number(actor.userId)) {
    throw new AppError(403, "forbidden", "You can only update templates you created.");
  }

  const result = await pool.query(
    `UPDATE message_templates
     SET name = $2,
         subject = $3,
         body = $4,
         variables = $5::jsonb,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, subject, body, variables, created_by, created_at, updated_at`,
    [templateId, payload.name, payload.subject, payload.body, JSON.stringify(payload.variables)]
  );

  return result.rows[0];
}

async function deleteTemplate(pool, actor, templateId) {
  if (!canManageTemplates(actor)) {
    throw new AppError(403, "forbidden", "Insufficient permission to delete templates.");
  }

  const existing = await getTemplateById(pool, templateId);
  if (!existing) {
    throw new AppError(404, "not_found", "Template not found.");
  }

  if (actor.role !== "admin" && Number(existing.created_by) !== Number(actor.userId)) {
    throw new AppError(403, "forbidden", "You can only delete templates you created.");
  }

  const result = await pool.query("DELETE FROM message_templates WHERE id = $1", [templateId]);
  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Template not found.");
  }
}

async function fetchTemplate(pool, templateId) {
  const result = await pool.query(
    `SELECT id, name, subject, body, variables FROM message_templates WHERE id = $1`,
    [templateId]
  );
  return result.rows[0] || null;
}

function buildScopeWhere(scope, values, alias = "u") {
  const clauses = [];

  for (const key of ALLOWED_SCOPE_KEYS) {
    const selection = scope[key];
    if (!selection || selection.length === 0) continue;

    values.push(selection);
    clauses.push(`${alias}.scopes->'${key}' ?| $${values.length}`);
  }

  if (clauses.length === 0) {
    return "";
  }

  return clauses.join(" AND ");
}

async function resolveRecipients(pool, actor, selector) {
  const recipientSet = new Set();

  if (selector.user_ids) {
    const ids = selector.user_ids;
    const result = await pool.query(
      `SELECT id, scopes FROM users WHERE id = ANY($1::bigint[])`,
      [ids]
    );

    for (const user of result.rows) {
      if (actor.role !== "admin" && !scopeOverlap(actor.scopes || {}, user.scopes || {})) {
        continue;
      }
      recipientSet.add(Number(user.id));
    }
  }

  if (selector.scope) {
    if (actor.role !== "admin") {
      for (const key of ALLOWED_SCOPE_KEYS) {
        const targetVals = asArray(selector.scope[key]);
        if (targetVals.length === 0) continue;

        const actorVals = asArray((actor.scopes || {})[key]);
        const overlap = targetVals.some((x) => actorVals.includes(x));
        if (!overlap) {
          throw new AppError(403, "forbidden", `Cannot target scope outside your ${key}.`);
        }
      }
    }

    const values = [];
    const where = buildScopeWhere(selector.scope, values);
    const query = where
      ? `SELECT id FROM users u WHERE ${where}`
      : "SELECT id FROM users u";

    const result = await pool.query(query, values);
    for (const row of result.rows) recipientSet.add(Number(row.id));
  }

  recipientSet.delete(actor.userId);

  const recipients = Array.from(recipientSet);
  if (recipients.length === 0) {
    throw new AppError(400, "validation_error", "No recipients resolved for selector.");
  }

  return recipients;
}

async function sendMessage(pool, actor, payload) {
  if (!canSendMessages(actor)) {
    throw new AppError(403, "forbidden", "Insufficient permission to send messages.");
  }

  const recipients = await resolveRecipients(pool, actor, payload.recipient_selector);

  let subject = payload.subject;
  let body = payload.body;
  let templateId = payload.template_id;

  if (templateId) {
    const template = await fetchTemplate(pool, templateId);
    if (!template) {
      throw new AppError(404, "not_found", "Template not found.");
    }
    subject = renderTemplate(template.subject, payload.variables || {});
    body = renderTemplate(template.body, payload.variables || {});
  }

  const createdAt = nowDate().toISOString();
  const messageRows = [];

  await pool.query("BEGIN");
  try {
    for (const userId of recipients) {
      // eslint-disable-next-line no-await-in-loop
      const inserted = await pool.query(
        `INSERT INTO messages (
          sender_id,
          recipient_id,
          recipient_selector,
          template_id,
          status,
          subject,
          body,
          metadata,
          is_critical,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8::jsonb, $9, $10, $10)
        RETURNING id, sender_id, recipient_id, subject, body, is_critical, created_at`,
        [
          actor.userId,
          userId,
          JSON.stringify(payload.recipient_selector),
          templateId,
          "sent",
          subject,
          body,
          JSON.stringify({ recipient_count: recipients.length, recipient_id: userId }),
          payload.is_critical,
          createdAt
        ]
      );

      const message = inserted.rows[0];
      messageRows.push(message);

      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO notifications (user_id, message_id, is_read, muted_until, type, status, title, body, metadata, created_at)
         VALUES ($1, $2, FALSE, NULL, 'message', 'unread', $3, $4, $5::jsonb, $6)`,
        [
          userId,
          message.id,
          subject,
          body,
          JSON.stringify({ is_critical: payload.is_critical, recipient_id: userId }),
          createdAt
        ]
      );
    }

    const recipientTrace = messageRows.map((row) => ({
      recipient_id: Number(row.recipient_id),
      message_id: Number(row.id)
    }));

    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
       VALUES ($1, 'message_sent', 'message_batch', $2, $3::jsonb)`,
      [
        actor.userId,
        String(messageRows[0].id),
        JSON.stringify({
          recipient_count: recipients.length,
          is_critical: payload.is_critical,
          recipients: recipientTrace
        })
      ]
    );

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  authInfo("message_sent", {
    messageId: messageRows[0].id,
    senderId: actor.userId,
    recipientCount: recipients.length
  });

  return {
    message: messageRows[0],
    messages: messageRows,
    recipient_count: recipients.length,
    recipient_ids: recipients
  };
}

async function listNotifications(pool, actor, query) {
  const values = [actor.userId, nowDate().toISOString()];
  const clauses = ["n.user_id = $1"];

  const readFilter = query.read;
  if (readFilter === "true" || readFilter === "false") {
    values.push(readFilter === "true");
    clauses.push(`n.is_read = $${values.length}`);
  }

  clauses.push("(n.muted_until IS NULL OR n.muted_until <= $2 OR COALESCE(m.is_critical, FALSE) = TRUE)");

  const result = await pool.query(
    `SELECT
      n.id,
      n.user_id,
      n.message_id,
      n.is_read,
      n.muted_until,
      n.created_at,
      m.subject,
      m.body,
      COALESCE(m.is_critical, FALSE) AS is_critical
     FROM notifications n
     LEFT JOIN messages m ON m.id = n.message_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY n.created_at DESC`,
    values
  );

  return result.rows;
}

async function setNotificationRead(pool, actor, notificationId, isRead) {
  const result = await pool.query(
    `UPDATE notifications
     SET is_read = $3,
         status = CASE WHEN $3 THEN 'read' ELSE 'unread' END,
         read_at = CASE WHEN $3 THEN NOW() ELSE NULL END
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, is_read, muted_until, created_at`,
    [notificationId, actor.userId, isRead]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Notification not found.");
  }

  return result.rows[0];
}

async function muteNotification(pool, actor, notificationId) {
  const mutedUntil = addDays(nowDate(), 7).toISOString();

  const result = await pool.query(
    `UPDATE notifications
     SET muted_until = $3
     WHERE id = $1 AND user_id = $2
     RETURNING id, user_id, is_read, muted_until, created_at`,
    [notificationId, actor.userId, mutedUntil]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, "not_found", "Notification not found.");
  }

  return result.rows[0];
}

module.exports = {
  createTemplate,
  listTemplates,
  updateTemplate,
  deleteTemplate,
  sendMessage,
  listNotifications,
  setNotificationRead,
  muteNotification,
  resolveRecipients
};
