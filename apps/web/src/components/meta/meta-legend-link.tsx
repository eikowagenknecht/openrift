import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

/**
 * A legend's name on a public archive surface, leading to its card page. The
 * archive denormalizes the slug alongside the name, so the link needs no
 * catalog lookup; a row from before the slug was carried falls back to the name
 * as plain text rather than a dead link.
 *
 * Only for a name that stands on its own. A legend rendered inside a deck tile
 * or row cannot use this: those wrappers are themselves links, and an anchor
 * inside an anchor is invalid.
 *
 * @param name - The legend's display name, already composed by the API.
 * @param slug - The card's slug, when the payload carries one.
 * @param className - Extra classes for the call site's typography.
 * @returns The linked name, the plain name, or null when there is no legend.
 */
export function MetaLegendLink({
  name,
  slug,
  className,
}: {
  name?: string | null;
  slug?: string | null;
  className?: string;
}) {
  if (name === null || name === undefined || name === "") {
    return null;
  }
  if (slug === null || slug === undefined || slug === "") {
    return <span className={className}>{name}</span>;
  }
  return (
    <Link
      to="/cards/$cardSlug"
      params={{ cardSlug: slug }}
      className={cn("hover:underline", className)}
    >
      {name}
    </Link>
  );
}
