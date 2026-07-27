/** Two-letter avatar fallback derived from a display name or email. "&" is a
 * separator, not a word, so a 2v2 team name ("Ashe & Braum") yields both
 * members' initials.
 * @returns Up to two uppercase initials, or "?" when no usable input is available.
 */
export function getUserInitials(name: string | undefined, email: string | undefined): string {
  return (name ?? email ?? "?")
    .split(/[\s@&]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
