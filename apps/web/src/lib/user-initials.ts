// "&" splits as a separator, not a word, so a team name ("Ashe & Braum")
// yields both members' initials.
export function getUserInitials(name: string | undefined, email: string | undefined): string {
  return (name ?? email ?? "?")
    .split(/[\s@&]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
