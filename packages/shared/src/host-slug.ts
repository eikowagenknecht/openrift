/** The second-to-last hostname label, e.g. `i.imgur.com` → `imgur`. */
export function hostSlugFromUrl(url: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return null;
  }

  if (!hostname) {
    return null;
  }

  const labels = hostname.split(".").filter((label) => label.length > 0);
  if (labels.length === 0) {
    return null;
  }
  if (labels.length === 1) {
    return labels.at(0) ?? null;
  }
  return labels.at(-2) ?? null;
}
