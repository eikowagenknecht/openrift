export const MAX_DISPLAY_NAME_LENGTH = 50;

const ALLOWED_CHARS = /^[\p{L}\p{N} ._-]+$/u;
const DISALLOWED_CHARS = /[^\p{L}\p{N} ._-]/gu;

type ValidateResult = { ok: true; value: string } | { ok: false; reason: string };

export function validateDisplayName(input: unknown): ValidateResult {
  if (typeof input !== "string") {
    return { ok: false, reason: "Name is required." };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Name is required." };
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return {
      ok: false,
      reason: `Name must be ${String(MAX_DISPLAY_NAME_LENGTH)} characters or fewer.`,
    };
  }
  if (!ALLOWED_CHARS.test(trimmed)) {
    return {
      ok: false,
      reason: "Name may only contain letters, digits, spaces, periods, underscores, and hyphens.",
    };
  }
  return { ok: true, value: trimmed };
}

// For OAuth-provided names (Google/Discord display name): be permissive — strip
// disallowed characters and truncate rather than rejecting, so signup never
// fails on unusual but harmless display names. Falls back to `fallback` if the
// sanitized result is empty.
export function sanitizeDisplayName(raw: unknown, fallback: string): string {
  const source = typeof raw === "string" ? raw : "";
  const cleaned = source
    .replaceAll(DISALLOWED_CHARS, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  if (cleaned.length > 0) {
    return cleaned;
  }
  const fallbackCleaned = fallback
    .replaceAll(DISALLOWED_CHARS, "")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DISPLAY_NAME_LENGTH);
  return fallbackCleaned.length > 0 ? fallbackCleaned : "User";
}
