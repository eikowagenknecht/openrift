import type { CardSource, PrintingSource } from "@openrift/shared";
import { ART_VARIANT_ORDER } from "@openrift/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowRightIcon, LinkIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import type { CardSearchResult } from "@/components/admin/card-search-dropdown";
import { CardSearchDropdown } from "@/components/admin/card-search-dropdown";
import {
  CARD_SOURCE_FIELDS,
  PRINTING_SOURCE_FIELDS,
  SourceSpreadsheet,
  groupPrintingSources,
} from "@/components/admin/source-spreadsheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptNewCard,
  useAllCards,
  useCheckCardSource,
  useCheckPrintingSource,
  useLinkCard,
  useReassignPrintingSource,
  useUnmatchedCardDetail,
} from "@/hooks/use-card-sources";
import { useFavoriteSources } from "@/hooks/use-favorite-sources";

interface UnmatchedData {
  name: string;
  sources: CardSource[];
  printingSources: PrintingSource[];
}

export function CardSourceUnmatchedPage() {
  const navigate = useNavigate();
  const { name: normalizedName } = useParams({ from: "/_authenticated/admin/cards_/new/$name" });
  const decodedName = decodeURIComponent(normalizedName);
  const { data, isLoading } = useUnmatchedCardDetail(decodedName) as {
    data: UnmatchedData | undefined;
    isLoading: boolean;
  };

  const checkCardSource = useCheckCardSource();
  const checkPrintingSource = useCheckPrintingSource();
  const { favorites } = useFavoriteSources();
  const acceptNewCard = useAcceptNewCard();
  const linkCard = useLinkCard();
  const reassignPrinting = useReassignPrintingSource();

  // Local state for building up the "active" row by clicking source cells
  const [activeCard, setActiveCard] = useState<Record<string, unknown>>({});
  const [newCardId, setNewCardId] = useState("");
  const [linkCardId, setLinkCardId] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const { data: allCards } = useAllCards();

  const cardSearchResults: CardSearchResult[] =
    allCards && linkSearch.length >= 2
      ? allCards
          .filter((c) => c.name.toLowerCase().includes(linkSearch.toLowerCase()))
          .slice(0, 20)
          .map((c) => ({ id: c.id, label: c.name, sublabel: c.id, detail: c.type }))
      : [];

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const hasRequiredFields = activeCard.name && activeCard.type && activeCard.domains;

  // Derive default card ID from canonical printing (earliest set, lowest collector #, normal art)
  const defaultCardId = (() => {
    if (data.printingSources.length === 0) {
      return "";
    }
    const canonical = [...data.printingSources].sort(
      (a, b) =>
        (a.setId ?? "").localeCompare(b.setId ?? "") ||
        a.collectorNumber - b.collectorNumber ||
        ART_VARIANT_ORDER.indexOf(a.artVariant) - ART_VARIANT_ORDER.indexOf(b.artVariant),
    )[0];
    return canonical.sourceId.replace(/(?<=\d)[a-z*]+$/, "");
  })();

  const cardId = newCardId || defaultCardId;

  function handleAcceptAsNew() {
    if (!hasRequiredFields || !cardId.trim() || !data) {
      return;
    }

    const id = cardId.trim();
    acceptNewCard.mutate(
      {
        name: decodedName,
        cardFields: {
          id,
          ...activeCard,
        },
      },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardId", params: { cardId: id } });
        },
      },
    );
  }

  function handleLink() {
    if (!linkCardId.trim()) {
      return;
    }
    const targetId = linkCardId.trim();
    linkCard.mutate(
      { name: decodedName, cardId: targetId },
      {
        onSuccess: () => {
          void navigate({ to: "/admin/cards/$cardId", params: { cardId: targetId } });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{data.name}</h2>
        <p className="text-sm text-muted-foreground">
          Unmatched card &mdash; {data.sources.length} source
          {data.sources.length === 1 ? "" : "s"}
        </p>
      </div>

      <section className="flex flex-wrap items-end gap-4 rounded-md border p-4">
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label>Link to existing card</Label>
            <CardSearchDropdown
              results={cardSearchResults}
              onSearch={(q) => {
                setLinkSearch(q);
                setLinkCardId("");
              }}
              onSelect={(id) => setLinkCardId(id)}
              placeholder="Search by name…"
              className="w-64"
            />
          </div>
          <Button
            variant="outline"
            disabled={!linkCardId.trim() || linkCard.isPending}
            onClick={handleLink}
          >
            <LinkIcon className="mr-1 size-4" />
            Link
          </Button>
        </div>

        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label>Card ID</Label>
            <Input
              value={cardId}
              onChange={(e) => setNewCardId(e.target.value)}
              placeholder={defaultCardId || "e.g. SFD-T02"}
              className="w-40 font-mono"
            />
          </div>
          <Button
            disabled={!hasRequiredFields || !cardId.trim() || acceptNewCard.isPending}
            onClick={handleAcceptAsNew}
          >
            <PlusIcon className="mr-1 size-4" />
            Accept as new card
          </Button>
        </div>
        {!hasRequiredFields && (
          <p className="text-xs text-muted-foreground">Select name, type, and domains first.</p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">Card Fields</h3>
        <p className="text-sm text-muted-foreground">
          Click a cell to select it for the new card. The Active column shows your selections.
        </p>
        <SourceSpreadsheet
          fields={CARD_SOURCE_FIELDS}
          requiredKeys={["name", "type", "domains"]}
          activeRow={Object.keys(activeCard).length > 0 ? activeCard : null}
          sourceRows={data.sources}
          favoriteSources={favorites}
          onCellClick={(field, value) => {
            setActiveCard((prev) => ({ ...prev, [field]: value }));
          }}
          onActiveChange={(field, value) => {
            setActiveCard((prev) =>
              value === null || value === undefined
                ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                : { ...prev, [field]: value },
            );
          }}
          onCheck={(sourceId) => checkCardSource.mutate(sourceId)}
        />
      </section>

      <PrintingsSection
        printingSources={data.printingSources}
        cardSources={data.sources}
        favoriteSources={favorites}
        onCheck={(id) => checkPrintingSource.mutate(id)}
        onReassign={(ids, target) => {
          for (const id of ids) {
            reassignPrinting.mutate({ id, fields: target });
          }
        }}
        isReassigning={reassignPrinting.isPending}
      />
    </div>
  );
}

function PrintingsSection({
  printingSources,
  cardSources,
  favoriteSources,
  onCheck,
  onReassign,
  isReassigning,
}: {
  printingSources: PrintingSource[];
  cardSources: CardSource[];
  favoriteSources: Set<string>;
  onCheck: (id: string) => void;
  onReassign: (
    printingSourceIds: string[],
    targetFields: { artVariant: string; isSigned: boolean; isPromo: boolean; finish: string },
  ) => void;
  isReassigning: boolean;
}) {
  const groups = groupPrintingSources(printingSources);
  const sourceLabels = Object.fromEntries(cardSources.map((s) => [s.id, s.source]));

  return (
    <section className="space-y-3">
      <h3 className="font-medium">Printings</h3>
      {groups.map((group) => (
        <div key={group.key} className="rounded-md border border-dashed">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium">
              {group.label} &mdash; {group.sources.length} source
              {group.sources.length === 1 ? "" : "s"}
            </span>
            {groups.length > 1 && (
              <span className="flex items-center gap-1">
                {groups
                  .filter((g) => g.key !== group.key)
                  .map((target) => (
                    <Button
                      key={target.key}
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={isReassigning}
                      onClick={() =>
                        onReassign(
                          group.sources.map((s) => s.id),
                          target.differentiators,
                        )
                      }
                    >
                      <ArrowRightIcon className="size-3" />
                      Merge into {target.label}
                    </Button>
                  ))}
              </span>
            )}
          </div>
          <div className="border-t p-3">
            <SourceSpreadsheet
              fields={PRINTING_SOURCE_FIELDS}
              activeRow={null}
              sourceRows={group.sources}
              sourceLabels={sourceLabels}
              favoriteSources={favoriteSources}
              onCheck={onCheck}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
