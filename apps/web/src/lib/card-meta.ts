import type {
  CardDetailResponse,
  CatalogPrintingResponse,
  CatalogSetResponse,
  Printing,
} from "@openrift/shared";
import { PREFERENCE_DEFAULTS, preferredPrinting } from "@openrift/shared";

const META_DESCRIPTION_LIMIT = 155;

/**
 * Picks the printing whose metadata (rules text, front art) should drive
 * the page's SSR meta tags. Mirrors the page component's own
 * `preferredPrinting(printings, setOrderMap, finishOrder, languages)` call,
 * using default language preferences — so the og:image / og:description a
 * crawler or social-unfurl bot sees matches what a fresh visitor lands on.
 *
 * @param finishOrder Live finish sort order from `/api/enums` (callers fetch
 *   via `initQueryOptions`). Required — there's no fallback, so admin
 *   re-ordering of the finishes table takes effect in SSR head tags.
 * @returns The preferred printing, or `undefined` when there are none.
 */
export function pickCardMetaPrinting(
  printings: CatalogPrintingResponse[],
  sets: CatalogSetResponse[],
  finishOrder: readonly string[],
): CatalogPrintingResponse | undefined {
  if (printings.length === 0) {
    return undefined;
  }
  const setOrderMap = new Map(sets.map((s, i) => [s.id, i]));
  // preferredPrinting only reads fields that exist on CatalogPrintingResponse
  // (language, finish, shortCode, setId, markers) — never the Printing-only
  // `setSlug` / `card` fields — so this structural cast is safe.
  return (
    preferredPrinting(
      printings as unknown as Printing[],
      setOrderMap,
      finishOrder,
      PREFERENCE_DEFAULTS.languages,
    ) ?? printings[0]
  );
}

/**
 * Builds a meta-description string for a card-detail SSR head.
 * Strips rules-text markup so emoji shortcodes (`:rb_energy_2:`) and
 * `[keyword:foo]` macros don't leak into WhatsApp / Telegram / Twitter
 * unfurls. Truncates with an ellipsis when over the standard ~155-char
 * description budget.
 *
 * @returns A clean, truncated description suitable for `og:description`.
 */
export function buildCardMetaDescription(
  card: CardDetailResponse["card"],
  printing: CatalogPrintingResponse | undefined,
): string {
  const parts: string[] = [];

  const domains = card.domains.length > 0 ? card.domains.join("/") : null;
  const typeLine = domains ? `${domains} ${card.type}` : card.type;
  parts.push(`${card.name} is a ${typeLine} card from Riftbound.`);

  const rulesText = printing?.printedRulesText;
  if (rulesText) {
    const cleaned = rulesText
      .replaceAll(/\[.*?\]/g, "")
      .replaceAll(/:[a-z0-9_]+:/gi, "")
      .replaceAll(/\s+/g, " ")
      .trim();
    if (cleaned.length > 0) {
      const remaining = META_DESCRIPTION_LIMIT - parts.join(" ").length - 1;
      if (cleaned.length > remaining) {
        parts.push(`${cleaned.slice(0, remaining - 3)}...`);
      } else {
        parts.push(cleaned);
      }
    }
  }

  return parts.join(" ");
}

/**
 * Picks the front-face image URL for the given printing — meant for og:image.
 *
 * @returns The full-size front image URL, or undefined when the printing has none.
 */
export function getCardFrontImageFullUrl(
  printing: CatalogPrintingResponse | undefined,
): string | undefined {
  return printing?.images.find((i) => i.face === "front")?.full;
}
