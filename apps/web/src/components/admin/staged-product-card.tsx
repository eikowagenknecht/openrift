import { BanIcon, CheckIcon, LinkIcon, Undo2Icon, XIcon } from "lucide-react";
import { useState } from "react";

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
  const [search, setSearch] = useState("");

  const filteredCards =
    allCards && search.length >= 2
      ? allCards.filter((g) => g.cardName.toLowerCase().includes(search.toLowerCase())).slice(0, 10)
      : [];

  return (
    <div className="rounded-lg border bg-background px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p
          className="flex min-w-0 items-center gap-1 truncate text-sm font-medium"
          title={sp.productName}
        >
          {isAssigned && (
            <CheckIcon className="size-3.5 shrink-0 text-green-600 dark:text-green-400" />
          )}
          <span className="truncate">{sp.productName}</span>
        </p>
        <div className="flex shrink-0 gap-1">
          {onAssignToCard && allCards && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-primary"
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
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
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
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
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
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
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
        <Badge variant="outline" className="shrink-0">
          <ProductLink config={config} externalId={sp.externalId}>
            #{sp.externalId}
          </ProductLink>
        </Badge>
      </div>
      <p
        className={cn(
          "mt-1.5 w-fit rounded px-1.5 py-0.5 text-xs",
          Date.now() - new Date(sp.recordedAt).getTime() > 48 * 60 * 60 * 1000
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground",
        )}
      >
        {sp.recordedAt.slice(0, 16).replace("T", " ")}
      </p>
      {showAssign && onAssignToCard && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <input
            type="text"
            className="w-full rounded border bg-muted px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
            placeholder="Search card name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- admin-only UI, autofocus is intentional
            autoFocus
          />
          {filteredCards.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {filteredCards.map((g) => {
                const firstId = g.printings.reduce((best, p) =>
                  p.collectorNumber < best.collectorNumber ? p : best,
                ).sourceId;
                return (
                  <button
                    key={g.cardId}
                    type="button"
                    className="w-full rounded bg-muted/50 px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50"
                    disabled={isAssigning}
                    onClick={() => {
                      onAssignToCard(g.cardId);
                      setShowAssign(false);
                      setSearch("");
                    }}
                  >
                    <p className="text-xs font-medium">
                      <span className="mr-1.5 font-normal text-muted-foreground">{firstId}</span>
                      {g.cardName}
                    </p>
                    <p className="text-xs text-muted-foreground">{g.setName}</p>
                  </button>
                );
              })}
            </div>
          )}
          {search.length >= 2 && filteredCards.length === 0 && (
            <p className="text-xs text-muted-foreground">No matching cards</p>
          )}
        </div>
      )}
    </div>
  );
}
