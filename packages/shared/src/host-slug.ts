/** `null` for a relative or malformed URL, e.g. an in-app upload path. */
export function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** The second-to-last hostname label, e.g. `i.imgur.com` → `imgur`. */
export function hostSlugFromUrl(url: string): string | null {
  const hostname = hostnameFromUrl(url);
  if (hostname === null) {
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
