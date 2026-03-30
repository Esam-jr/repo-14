function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function scopesOverlap(a = {}, b = {}, keys = ["school", "major", "class_section", "cohort"]) {
  return keys.some((key) => {
    const left = asArray(a[key]);
    const right = asArray(b[key]);
    if (left.length === 0 || right.length === 0) return false;
    return left.some((x) => right.includes(x));
  });
}

module.exports = {
  scopesOverlap
};
