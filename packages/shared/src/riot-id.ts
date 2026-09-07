const RIOT_ID_PATTERN = /^[^#]{3,16}#[^#\s]{3,5}$/u;

export const RIOT_ID_FORMAT_MESSAGE =
  "Enter your Riot ID as gameName#tagLine, e.g. SummonerName#EUW.";

type ValidateRiotIdResult = { ok: true; value: string | null } | { ok: false; reason: string };

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
