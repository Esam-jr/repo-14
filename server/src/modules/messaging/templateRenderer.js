const variablePattern = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

function renderTemplate(text, variables = {}) {
  if (!text) return "";
  return String(text).replace(variablePattern, (_m, key) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });
}

module.exports = {
  renderTemplate
};
