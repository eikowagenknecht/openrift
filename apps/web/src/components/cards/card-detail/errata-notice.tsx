import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { CardText } from "@/components/cards/card-text";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ErrataNoticeProps {
  printedText: string;
  source: string;
  sourceUrl?: string | null;
  effectiveDate?: string | null;
  onKeywordClick?: (keyword: string) => void;
}

function formatSource(source: string, effectiveDate?: string | null): string {
  if (effectiveDate) {
    return `${source}, ${effectiveDate.slice(0, 7)}`;
  }
  return source;
}

export function ErrataNotice({
  printedText,
  source,
  sourceUrl,
  effectiveDate,
  onKeywordClick,
}: ErrataNoticeProps) {
  const [open, setOpen] = useState(false);
  const sourceLabel = formatSource(source, effectiveDate);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="mt-1.5 space-y-1">
        <div className="text-muted-foreground/70 flex items-center gap-1 text-xs">
          <TriangleAlertIcon className="size-3 shrink-0 text-amber-500 dark:text-amber-400" />
          <span>
            Errata (
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-amber-500 dark:hover:text-amber-400"
              >
                {sourceLabel}
              </a>
            ) : (
              sourceLabel
            )}
            )
          </span>
        </div>
        <CollapsibleTrigger className="text-muted-foreground/50 flex cursor-pointer items-center gap-1 text-xs hover:text-amber-500 dark:hover:text-amber-400">
          <ChevronDownIcon
            className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")}
          />
          <span>{open ? "Hide" : "Show"} original printed text</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-border/30 bg-muted/20 mt-1 rounded border border-dashed px-2.5 py-2">
            <p className="text-muted-foreground/50 text-xs leading-relaxed">
              <CardText text={printedText} onKeywordClick={onKeywordClick} />
            </p>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
