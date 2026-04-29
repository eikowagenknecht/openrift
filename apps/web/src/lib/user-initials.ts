/** Two-letter avatar fallback derived from a display name or email.
 * @returns Up to two uppercase initials, or "?" when no usable input is available.
 */
export function getUserInitials(name: string | undefined, email: string | undefined): string {
  return (name ?? email ?? "?")
    .split(/[\s@]/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
