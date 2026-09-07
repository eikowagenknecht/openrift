import { RENAMED_LANGUAGES, WellKnown } from "@openrift/shared/well-known";

/** Must stay in sync with `NAME_TO_CODE` below. */
const CODE_TO_NAME: Record<string, string> = {
  EN: "English",
  FR: "French",
  SC: "Chinese (Simplified)",
};

/** Traditional Chinese has no catalog code and is intentionally left out, not folded into `SC`. */
const NAME_TO_CODE: Record<string, string> = {
  english: WellKnown.language.EN,
  french: "FR",
  français: "FR",
  chinese: WellKnown.language.SC,
  "chinese (simplified)": WellKnown.language.SC,
};

/** `languageCodeFromSource` accepts a bare code back, so this round-trips even without a name entry. */
export function languageNameForCode(code: string): string {
  return CODE_TO_NAME[code] ?? code;
}

const LANGUAGE_CODE = /^[A-Za-z]{2}$/u;

/** Unrecognized free text returns undefined, not a junk code. */
export function languageCodeFromSource(language: string | undefined): string | undefined {
  const trimmed = language?.trim();
  if (!trimmed) {
    return undefined;
  }
  const named = NAME_TO_CODE[trimmed.toLowerCase()];
  if (named) {
    return named;
  }
  if (!LANGUAGE_CODE.test(trimmed)) {
    return undefined;
  }
  const code = trimmed.toUpperCase();
  return RENAMED_LANGUAGES[code] ?? code;
}
