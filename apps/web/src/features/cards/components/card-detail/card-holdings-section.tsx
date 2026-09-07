import type { Printing } from "@openrift/shared/types/catalog";

import { Callout } from "@/components/ui/callout";
import { SectionHeading } from "@/components/ui/section-heading";
import { useCardHoldingLines } from "@/features/cards/hooks/use-card-holdings";
import { cn } from "@/lib/utils";

/** Where the viewer's copies of this card are, when some are lent, borrowed or in a trade. */
export function CardHoldingsSection({
  printing,
  printings,
}: {
  printing: Printing;
  printings?: readonly Printing[];
}) {
  const siblingIds = (printings ?? []).map((sibling) => sibling.id);
  const lines = useCardHoldingLines(siblingIds.length > 0 ? siblingIds : [printing.id]);

  if (lines.length === 0) {
    return null;
  }

  return (
    <Callout className="space-y-2 px-3 py-2.5 text-sm">
      <SectionHeading as="h3">Loans and trades</SectionHeading>
      <ul className="space-y-1">
        {lines.map((line) => (
          <li key={line.key} className="flex items-center gap-2">
            <line.icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            <span className={cn(line.tone === "committed" ? "text-foreground" : "opacity-70")}>
              {line.text}
            </span>
          </li>
        ))}
      </ul>
    </Callout>
  );
}
