// `crypto.randomUUID()` is only defined in secure contexts: it throws/undefined
// over plain http (dev/preview reached by LAN IP) and on iOS Safari < 15.4.
// `crypto.getRandomValues()` has neither restriction, so fall back to it and
// assemble an RFC 4122 v4 string by hand when randomUUID is unavailable.

export function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes, (byte, index) => {
    if (index === 6) {
      return ((byte & 0x0f) | 0x40).toString(16).padStart(2, "0"); // version 4
    }
    if (index === 8) {
      return ((byte & 0x3f) | 0x80).toString(16).padStart(2, "0"); // variant 10xx
    }
    return byte.toString(16).padStart(2, "0");
  }).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
