import { ExternalLinkIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Archive pages live outside the admin shell, so this is a plain anchor, not a router `Link`. */
export function MetaPublicLinkButton({
  href,
  label,
  ariaLabel,
  mono = false,
}: {
  href: string;
  label: string;
  ariaLabel: string;
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
