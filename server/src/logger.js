function log(level, event, meta = {}) {
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

module.exports = {
  authInfo,
  authWarn
};
