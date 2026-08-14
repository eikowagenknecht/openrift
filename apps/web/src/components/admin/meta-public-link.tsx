import { ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A link out to the public archive, shown wherever an admin row already has a
 * live counterpart. The archive pages live outside the admin shell, so this is
 * a plain anchor opening its own tab rather than a router `Link`.
 *
 * @returns The link button.
 */
export function MetaPublicLinkButton({
  href,
  label,
  ariaLabel,
  mono = false,
}: {
  href: string;
  label: string;
  ariaLabel: string;
  /** Set when the label is a slug or token rather than prose. */
  mono?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      render={<a href={href} target="_blank" rel="noreferrer" aria-label={ariaLabel} />}
    >
      <span className={mono ? "font-mono" : undefined}>{label}</span>
      <ExternalLinkIcon />
    </Button>
  );
}
