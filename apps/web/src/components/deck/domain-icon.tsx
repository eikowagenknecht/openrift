import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnumOrders } from "@/hooks/use-enums";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Domain icon with a tooltip, as used on the deck tiles and rows.
 * @returns The icon, or null when the domain has no icon asset.
 */
export function DomainIcon({ domain, className }: { domain: string; className?: string }) {
  const { labels } = useEnumOrders();
  const domainIcon = getFilterIconPath("domains", domain);
  if (!domainIcon) {
    return null;
  }
  const label = labels.domains[domain];
  return (
    <Tooltip>
      {/* A span, not the default trigger element: Base UI renders that as a
          button, and a decorative icon that only shows a tooltip has no
          business taking a tab stop on every domain of every tile. The name
          reaches assistive tech through the image's alt instead. */}
      <TooltipTrigger render={<span />}>
        <img src={domainIcon} alt={label} className={cn("size-6", className)} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
