export interface LinkHost {
  label: string;
  kind: "video" | "site";
}

/**
 * Shared allowlist for deck links and inline markdown links; unlisted hosts
 * render as plain text or fail validation. Keys are lowercase, no `www.`.
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
  ["metafy.gg", { label: "Metafy", kind: "site" }],
  ["x.com", { label: "X", kind: "site" }],
  ["discord.gg", { label: "Discord", kind: "site" }],
]);

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
  // Bare host so www.X and X share an entry; stripping can't widen the
  // allowlist ("www.youtube.com.evil.test" still misses).
  const bare = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  return LINK_HOSTS.get(bare) ?? null;
}

export function isAllowedLinkUrl(value: string): boolean {
  return resolveLinkHost(value) !== null;
}

export function linkHostLabel(value: string): string | null {
  return resolveLinkHost(value)?.label ?? null;
}

export const ALLOWED_LINK_SITE_NAMES: readonly string[] = [
  ...new Set([...LINK_HOSTS.values()].map((host) => host.label)),
];
