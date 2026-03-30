export function redactedValue(field, value) {
  if (!value) return "";

  if (field === "phone") {
    const digits = String(value).replace(/\D/g, "");
    if (digits.length < 4) return "***";
    const first3 = digits.slice(0, 3);
    const last2 = digits.slice(-2);
    return `(${first3}) ***-**${last2}`;
  }

  if (field === "email") {
    const [local, domain] = String(value).split("@");
    if (!local || !domain) return "***";
    return `${local[0]}***@${domain}`;
  }

  if (field === "employer") {
    const str = String(value);
    if (str.length < 3) return "**";
    return `${str.slice(0, 2)}***`;
  }

  return "***";
}
