import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import { enumLabel } from "@openrift/shared/enum-label";
import { Link } from "@tanstack/react-router";
import { CameraIcon } from "lucide-react";
import { useState } from "react";

import { CardContent } from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";

const VISIBLE_LIMIT = 10;

interface MissingImagesTilesProps {
  items: readonly MissingImagePrinting[];
}

export function MissingImagesTiles({ items }: MissingImagesTilesProps) {
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? items : items.slice(0, VISIBLE_LIMIT);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((item) => (
          <CardLink
            key={item.printingId}
            size="sm"
            render={
              <Link
                to="/contribute/card/$cardSlug/printing/$printingId/image"
                params={{ cardSlug: item.cardSlug, printingId: item.printingId }}
              />
            }
          >
            <CardContent className="flex flex-col gap-1.5">
              <div className="aspect-card border-border bg-card text-muted-foreground flex w-full flex-col items-center justify-center gap-1.5 rounded-md border border-dashed">
                <CameraIcon className="size-5" />
                <span className="text-2xs">No image yet</span>
              </div>
              <span className="truncate font-medium">{item.cardName}</span>
              <span className="text-muted-foreground truncate text-xs">
                {item.publicCode} · {enumLabel(labels.finishes, item.finish)} ·{" "}
                {enumLabel(languageLabels, item.language)}
              </span>
            </CardContent>
          </CardLink>
        ))}
      </div>
      {items.length > VISIBLE_LIMIT && (
        <ExpandToggle
          expanded={showAll}
          chevronPosition="end"
          onClick={() => setShowAll(!showAll)}
          className="text-muted-foreground hover:text-foreground self-start text-sm"
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </ExpandToggle>
      )}
    </div>
  );
}
