import { enumLabel } from "@openrift/shared";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnumOrders } from "@/hooks/use-enums";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

export function DomainIcon({ domain, className }: { domain: string; className?: string }) {
  const { labels } = useEnumOrders();
  const domainIcon = getFilterIconPath("domains", domain);
  if (!domainIcon) {
    return null;
  }
  const label = enumLabel(labels.domains, domain);
  return (
    <Tooltip>
      {/* Base UI's default trigger element renders as a button, which would
          make a decorative icon a tab stop on every domain of every tile. */}
      <TooltipTrigger render={<span />}>
        <img src={domainIcon} alt={label} className={cn("size-6", className)} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
