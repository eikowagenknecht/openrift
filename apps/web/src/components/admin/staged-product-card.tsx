import { BanIcon, CheckIcon, LinkIcon, Undo2Icon, XIcon } from "lucide-react";
import { useState } from "react";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { AssignableCard, SourceMappingConfig, StagedProduct } from "./price-mappings-types";
import { formatCents, ProductLink } from "./price-mappings-utils";

export function StagedProductCard({
  config,
  product: sp,
  onIgnore,
  isIgnoring,
  onUnignore,
  isUnignoring,
  allCards,
  onAssignToCard,
  isAssigning,
  onUnassign,
  isUnassigning,
  assignLabel = "Assign",
  isAssigned,
}: {
  config: SourceMappingConfig;
  product: StagedProduct;
  onIgnore?: () => void;
  isIgnoring?: boolean;
  onUnignore?: () => void;
  isUnignoring?: boolean;
  allCards?: AssignableCard[];
  onAssignToCard?: (cardId: string) => void;
  isAssigning?: boolean;
  onUnassign?: () => void;
  isUnassigning?: boolean;
  assignLabel?: string;
  isAssigned?: boolean;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [cardSearchQuery, setCardSearchQuery] = useState("");

  const filteredResults: CardSearchResult[] =
    allCards && cardSearchQuery.length >= 2
      ? allCards
          .filter((g) => g.cardName.toLowerCase().includes(cardSearchQuery.toLowerCase()))
          .slice(0, 10)
          .map((g) => {
            const firstId = g.printings.toSorted((a, b) =>
              a.shortCode.localeCompare(b.shortCode),
            )[0].shortCode;
            return { id: g.cardId, label: g.cardName, sublabel: firstId, detail: g.setName };
          })
      : [];

  return (
    <div className="bg-background rounded-lg border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1 text-sm font-medium" title={sp.productName}>
          {isAssigned && (
            <CheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
          )}
          <span className="truncate">{sp.productName}</span>
        </p>
        <Badge variant="outline" className="shrink-0">
          <ProductLink config={config} externalId={sp.externalId}>
            #{sp.externalId}
          </ProductLink>
        </Badge>
      </div>
      {sp.groupName && (
        <p className="text-muted-foreground truncate" title={sp.groupName}>
          {sp.groupName}
        </p>
      )}
      <div className="mt-1.5 flex items-baseline gap-2">
        {sp.marketCents > 0 && (
          <span className="text-lg font-semibold tabular-nums">
            {formatCents(sp.marketCents, sp.currency)}
          </span>
        )}
        {sp.finish && (
          <Badge variant="outline" className="shrink-0">
            {sp.finish}
          </Badge>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <p
          className={cn(
            "w-fit rounded px-1.5 py-0.5",
            Date.now() - new Date(sp.recordedAt).getTime() > 48 * 60 * 60 * 1000 // 48 hours
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
          )}
        >
          {sp.recordedAt.slice(0, 16).replace("T", " ")}
        </p>
        <div className="flex flex-wrap gap-1">
          {onAssignToCard && allCards && (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-primary"
              onClick={() => setShowAssign((v) => !v)}
              title={`${assignLabel} to a card`}
            >
              {showAssign ? <XIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
              {showAssign ? "Cancel" : assignLabel}
            </Button>
          )}
          {onIgnore && (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onIgnore}
              disabled={isIgnoring}
              title="Ignore this product"
            >
              <BanIcon className="size-3.5" />
              Ignore
            </Button>
          )}
          {onUnignore && (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={onUnignore}
              disabled={isUnignoring}
              title="Unignore — product will reappear on next refresh"
            >
              <Undo2Icon className="size-3.5" />
              Unignore
            </Button>
          )}
          {sp.isOverride && onUnassign && (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onUnassign}
              disabled={isUnassigning}
              title="Unassign — remove manual card assignment"
            >
              <XIcon className="size-3.5" />
              Unassign
            </Button>
          )}
        </div>
      </div>
      {showAssign && onAssignToCard && (
        <div className="mt-2 border-t pt-2">
          <CardSearchDropdown
            results={filteredResults}
            onSearch={setCardSearchQuery}
            onSelect={(cardId) => {
              onAssignToCard(cardId);
              setShowAssign(false);
              setCardSearchQuery("");
            }}
            disabled={isAssigning}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
            autoFocus
          />
        </div>
      )}
    </div>
  );
}
