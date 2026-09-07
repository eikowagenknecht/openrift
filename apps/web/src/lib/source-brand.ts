import {
  siBluesky,
  siDiscord,
  siFacebook,
  siInstagram,
  siReddit,
  siTiktok,
  siTwitch,
  siWikipedia,
  siX,
  siYoutube,
} from "simple-icons";

/**
 * Declared structurally rather than imported as `SimpleIcon`, so a caller can
 * hand over a hand-rolled glyph without the package's whole type coming along.
 */
export interface BrandIconData {
  /** A single path, drawn against simple-icons' 24x24 viewBox. */
  path: string;
}

const BRANDS_BY_HOST: Record<string, BrandIconData> = {
  "youtube.com": siYoutube,
  "youtu.be": siYoutube,
  "twitch.tv": siTwitch,
  "x.com": siX,
  "twitter.com": siX,
  "reddit.com": siReddit,
  "redd.it": siReddit,
  "bsky.app": siBluesky,
  "discord.com": siDiscord,
  "discord.gg": siDiscord,
  "instagram.com": siInstagram,
  "tiktok.com": siTiktok,
  "facebook.com": siFacebook,
  "wikipedia.org": siWikipedia,
};

/**
 * Resolved from the URL's host, not the label: labels are free text an admin
 * types and could name the wrong platform.
 */
export function sourceBrand(url: string | null | undefined): BrandIconData | undefined {
  if (url === null || url === undefined || url === "") {
    return undefined;
  }

  // `new URL` in a try, not `URL.parse`: the static parser needs Safari 18,
  // this app's floor is 16.4.
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }

  const exact = BRANDS_BY_HOST[host];
  if (exact) {
    return exact;
  }
  // Suffix match so every subdomain resolves without its own entry. The leading
  // dot is what stops "notyoutube.com" matching "youtube.com".
  for (const [key, icon] of Object.entries(BRANDS_BY_HOST)) {
    if (host.endsWith(`.${key}`)) {
      return icon;
    }
  }
  return undefined;
}
