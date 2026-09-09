import { enumLabel } from "@openrift/shared/enum-label";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { CardList } from "@/components/ui/card-list";
import { CountPill } from "@/components/ui/count-pill";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { useMyMissingImages } from "@/features/contribute/hooks/use-missing-images";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";

const VISIBLE_LIMIT = 20;

export function MyMissingImagesSection() {
  const { data } = useMyMissingImages();
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const [showAll, setShowAll] = useState(false);

  const items = data?.items ?? [];
  const first = items[0];
  if (first === undefined) {
    return null;
  }
  const visible = showAll ? items : items.slice(0, VISIBLE_LIMIT);

  return (
    <section className="flex flex-col gap-3">
      <Heading level={2}>Cards you own that have no image</Heading>
      <p className="text-muted-foreground">
        You have these in hand, so a quick phone photo from you is the fastest way to fill the gap.
      </p>
      <Button
        className="self-start"
        render={
          <Link
            to="/contribute/$cardSlug/image/$printingId"
            params={{ cardSlug: first.cardSlug, printingId: first.printingId }}
          />
        }
      >
        Start with the first card
      </Button>
      <CardList>
        {visible.map((item) => (
          <li key={item.printingId}>
            <Link
              to="/contribute/$cardSlug/image/$printingId"
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
    </section>
  );
}
