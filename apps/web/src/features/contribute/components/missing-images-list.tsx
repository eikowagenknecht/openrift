import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import { enumLabel } from "@openrift/shared/enum-label";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { CardList } from "@/components/ui/card-list";
import { CountPill } from "@/components/ui/count-pill";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";

const VISIBLE_LIMIT = 10;

interface MissingImagesListProps {
  items: readonly MissingImagePrinting[];
}

export function MissingImagesList({ items }: MissingImagesListProps) {
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? items : items.slice(0, VISIBLE_LIMIT);

  return (
    <div className="flex flex-col gap-3">
      <CardList>
        {visible.map((item) => (
          <li key={item.printingId}>
            <Link
              to="/contribute/card/$cardSlug/printing/$printingId/image"
              params={{ cardSlug: item.cardSlug, printingId: item.printingId }}
              className="hover:bg-muted flex items-center justify-between gap-3 rounded-md px-3 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{item.cardName}</span>
                <span className="text-muted-foreground truncate text-sm">
                  {item.setName} · {item.publicCode} · {enumLabel(labels.finishes, item.finish)} ·{" "}
                  {enumLabel(languageLabels, item.language)}
                </span>
              </span>
              <CountPill title={`${item.copies} in your collections`}>{item.copies}</CountPill>
            </Link>
          </li>
        ))}
      </CardList>
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
