/** Hosts a deck's video guide link may point at. */
const VIDEO_GUIDE_HOSTS: ReadonlySet<string> = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
]);

/**
 * Whether a string is an acceptable deck video-guide link: a well-formed
 * https URL on a YouTube host. Shared by the API contract and the editor
 * dialog so both reject the same inputs.
 *
 * @returns True when the URL is a YouTube https link.
 */
export function isVideoGuideUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && VIDEO_GUIDE_HOSTS.has(url.hostname.toLowerCase());
}
