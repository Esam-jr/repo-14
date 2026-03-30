// Logging policy:
// - Do not include PII (raw emails, phone numbers, access tokens) in logs.
// - Prefer hashed/masked identifiers for troubleshooting.
// - Use LOG_LEVEL env var to control verbosity (debug|info|warn|error).
const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function getMinLevel() {
  const configured = String(process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVELS[configured] || LEVELS.info;
}

function log(level, event, meta = {}) {
  const current = LEVELS[level] || LEVELS.info;
  if (current < getMinLevel()) {
    return;
  }

  const payload = {
    level,
    event,
    time: new Date().toISOString(),
    ...meta
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function authInfo(event, meta) {
  log("info", event, meta);
}

function authWarn(event, meta) {
  log("warn", event, meta);
}

function authDebug(event, meta) {
  log("debug", event, meta);
}

module.exports = {
  authInfo,
  authWarn,
  authDebug
};
