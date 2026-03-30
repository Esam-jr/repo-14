function redactedValue(field, value) {
  if (!value) return null;

  if (field === "phone") {
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 4) return "***";
    const first3 = digits.slice(0, 3);
    const last2 = digits.slice(-2);
    return `(${first3}) ***-**${last2}`;
  }

  if (field === "email") {
    const str = String(value);
    const parts = str.split("@");
    if (parts.length !== 2) return "***";
    const local = parts[0];
    const domain = parts[1];
    const prefix = local.slice(0, 1) || "*";
    return `${prefix}***@${domain}`;
  }

  if (field === "employer") {
    const str = String(value);
    if (str.length <= 2) return "**";
    return `${str.slice(0, 2)}***`;
  }

  return "***";
}

module.exports = {
  redactedValue
};
