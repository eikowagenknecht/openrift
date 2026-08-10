/** A site user-supplied links may point at. */
export interface LinkHost {
  /** Display name, used when a link carries no title of its own. */
  label: string;
  /** Video hosts render with a play icon instead of the external-link one. */
  kind: "video" | "site";
}

/**
 * The one allowlist for links users write: deck links and the inline links in
 * markdown descriptions. Both surfaces end up on public share pages, so an
 * open URL field would be a spam vector — anything not listed here renders as
 * plain text (markdown) or fails validation (deck links).
 *
 * Keys are lowercase hostnames without a leading `www.`, which
 * {@link resolveLinkHost} strips before looking up.
 */
const LINK_HOSTS: ReadonlyMap<string, LinkHost> = new Map([
  ["youtube.com", { label: "YouTube", kind: "video" }],
  ["m.youtube.com", { label: "YouTube", kind: "video" }],
  ["youtu.be", { label: "YouTube", kind: "video" }],
  ["openrift.app", { label: "OpenRift", kind: "site" }],
  ["riftdecks.com", { label: "RiftDecks", kind: "site" }],
  ["riftmana.com", { label: "RiftMana", kind: "site" }],
  ["piltoverarchive.com", { label: "Piltover Archive", kind: "site" }],
  ["topdeck.gg", { label: "TopDeck.gg", kind: "site" }],
  ["x.com", { label: "X", kind: "site" }],
  ["discord.gg", { label: "Discord", kind: "site" }],
]);

/**
 * The allowlist entry a URL points at, or null when the URL is malformed, not
 * https, or on a host we don't accept. Shared by the API contract, the deck
 * editor and the markdown renderer so all three judge a link the same way.
 * @returns The matching host entry, or null.
 */
export function resolveLinkHost(value: string): LinkHost | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  // A leading `www.` is the same site, so match on the bare host rather than
  // listing both spellings. Stripping can't widen the allowlist: anything
  // beyond the registrable domain ("www.youtube.com.evil.test") still misses.
  const bare = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return LINK_HOSTS.get(bare) ?? null;
}

/**
 * Whether a link may be stored and rendered as a real link.
 * @returns True when the URL is an https link on an allowlisted host.
 */
export function isAllowedLinkUrl(value: string): boolean {
  return resolveLinkHost(value) !== null;
}

/**
 * What a link's chip should read when it carries no title: the site's name.
 * @returns The host label, or null when the URL isn't allowlisted.
 */
export function linkHostLabel(value: string): string | null {
  return resolveLinkHost(value)?.label ?? null;
}

/**
 * The site names behind the allowlist, deduplicated (YouTube spans several
 * hostnames) and in insertion order. For error copy that has to name what is
 * accepted, so the message can't drift from the list itself.
 */
export const ALLOWED_LINK_SITE_NAMES: readonly string[] = [
  ...new Set([...LINK_HOSTS.values()].map((host) => host.label)),
];
