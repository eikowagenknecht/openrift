import { isAllowedLinkUrl } from "@openrift/shared/link-hosts";

/** Deck links are capped at this length by `deckLinkSchema`. */
const MAX_LINK_LENGTH = 500;

/**
 * Query parameters stripped before the page URL becomes a deck link. Campaign
 * tags say how the user got to the page, which is noise on a link that ends up
 * on a public deck page.
 */
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = ["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"];

/**
 * Whether a query parameter is a tracking tag rather than part of the address.
 * @returns True when the parameter should be dropped.
 */
function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    TRACKING_PARAMS.includes(lower) || TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))
  );
}

/**
 * The page URL as a deck link, or undefined when it can't be one.
 *
 * OpenRift only stores links on an allowlisted host (`link-hosts.ts`), so on
 * any other site the import simply carries no link. The path, query and hash
 * are kept as they are, minus tracking tags: deck sites put the deck's identity
 * in all three, so trimming further would point the link at the wrong deck.
 * The import page re-checks the URL anyway; this only avoids sending one that
 * would be dropped there.
 * @returns The cleaned URL, or undefined when it is not an acceptable link.
 */
export function deckSourceLink(pageUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return undefined;
  }
  // Rebuilt rather than deleted in place: URLSearchParams is live, so removing
  // entries while iterating it skips some of them.
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!isTrackingParam(key)) {
      kept.append(key, value);
    }
  }
  url.search = kept.toString();
  const cleaned = url.toString();
  if (cleaned.length > MAX_LINK_LENGTH || !isAllowedLinkUrl(cleaned)) {
    return undefined;
  }
  return cleaned;
}
