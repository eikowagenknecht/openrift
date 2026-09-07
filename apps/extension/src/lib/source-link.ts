import { isAllowedLinkUrl } from "@openrift/shared/link-hosts";

const MAX_LINK_LENGTH = 500;

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = ["fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src"];

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    TRACKING_PARAMS.includes(lower) || TRACKING_PARAM_PREFIXES.some((p) => lower.startsWith(p))
  );
}

// OpenRift only stores links on an allowlisted host (link-hosts.ts); the
// import page re-checks the URL, this only avoids sending one it would drop.
export function deckSourceLink(pageUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return undefined;
  }
  // URLSearchParams is live: removing entries while iterating it skips some.
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
