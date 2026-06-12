// Soft shape validation for a free-text Riot ID (ADR-028): `gameName#tagLine`,
// 3-16 characters before the `#` and a 3-5 character tag after it (Riot's
// published constraints). The value is self-reported display data — this
// catches "forgot the tag" typos, it does not verify ownership.

const RIOT_ID_PATTERN = /^[^#]{3,16}#[^#\s]{3,5}$/u;

export const RIOT_ID_FORMAT_MESSAGE =
  "Enter your Riot ID as gameName#tagLine, e.g. SummonerName#EUW.";

type ValidateRiotIdResult = { ok: true; value: string | null } | { ok: false; reason: string };

/**
 * Validates and normalizes a free-text Riot ID. The input is trimmed; an
 * empty, null, or undefined input is valid and normalizes to `null` (clears
 * the field).
 * @returns The trimmed value (or `null`) on success, or a user-facing reason.
 */
export function validateRiotId(input: unknown): ValidateRiotIdResult {
  if (input === null || input === undefined) {
    return { ok: true, value: null };
  }
  if (typeof input !== "string") {
    return { ok: false, reason: RIOT_ID_FORMAT_MESSAGE };
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }
  if (!RIOT_ID_PATTERN.test(trimmed)) {
    return { ok: false, reason: RIOT_ID_FORMAT_MESSAGE };
  }
  return { ok: true, value: trimmed };
}
