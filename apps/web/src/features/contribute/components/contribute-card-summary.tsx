import { enumLabel } from "@openrift/shared/enum-label";
import { Link } from "@tanstack/react-router";
import { PencilLineIcon } from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContributeFormCard } from "@/features/contribute/lib/contribute-json";
import { useEnumOrders } from "@/hooks/use-enums";

interface ContributeCardSummaryProps {
  card: ContributeFormCard;
  cardSlug?: string;
}

export function ContributeCardSummary({ card, cardSlug }: ContributeCardSummaryProps) {
  const { labels } = useEnumOrders();
  const facts = [
    card.domains.map((slug) => enumLabel(labels.domains, slug)).join(", "),
    [
      ...card.superTypes.map((slug) => enumLabel(labels.superTypes, slug)),
      ...card.types.map((slug) => enumLabel(labels.cardTypes, slug)),
    ].join(" "),
    card.energy === null ? "" : `${card.energy.toString()} energy`,
    card.might === null ? "" : `${card.might.toString()} might`,
  ].filter((entry) => entry !== "");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{card.name}</CardTitle>
        {cardSlug !== undefined && (
          <CardAction>
            <Link
              to="/contribute/card/$cardSlug"
              params={{ cardSlug }}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              <PencilLineIcon className="size-4" />
              Fix the card itself
            </Link>
          </CardAction>
        )}
      </CardHeader>
      {facts.length > 0 && (
        <CardContent>
          <p className="text-muted-foreground text-sm">{facts.join(" · ")}</p>
        </CardContent>
      )}
    </Card>
  );
}
