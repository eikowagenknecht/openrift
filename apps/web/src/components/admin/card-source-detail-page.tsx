import type { CardSource, PrintingSource } from "@openrift/shared";
import { ART_VARIANT_ORDER } from "@openrift/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MoveIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";

import type { PrintingGroup } from "@/components/admin/source-spreadsheet";
import {
  CARD_SOURCE_FIELDS,
  PRINTING_SOURCE_FIELDS,
  SourceSpreadsheet,
  groupPrintingSources,
} from "@/components/admin/source-spreadsheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptCardField,
  useAcceptPrintingField,
  useAcceptPrintingGroup,
  useCardSourceDetail,
  useCheckCardSource,
  useCheckPrintingSource,
  useLinkPrintingSources,
  useRenameCard,
  useRenamePrinting,
} from "@/hooks/use-card-sources";

interface DetailData {
  card: Record<string, unknown>;
  sources: CardSource[];
  printings: Record<string, unknown>[];
  printingSources: PrintingSource[];
}

export function CardSourceDetailPage() {
  const navigate = useNavigate();
  const { cardId } = useParams({ from: "/_authenticated/admin/cards_/$cardId" });
  const { data, isLoading, isError } = useCardSourceDetail(cardId) as {
    data: DetailData | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  const checkCardSource = useCheckCardSource();
  const checkPrintingSource = useCheckPrintingSource();
  const acceptCardField = useAcceptCardField();
  const acceptPrintingField = useAcceptPrintingField();
  const renameCard = useRenameCard();
  const acceptPrintingGroup = useAcceptPrintingGroup();
  const linkPrintingSources = useLinkPrintingSources();
  const renamePrinting = useRenamePrinting();

  const [expandedPrintings, setExpandedPrintings] = useState<Set<string>>(new Set());

  if (isError) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Card not found</h2>
        <p className="text-sm text-muted-foreground">
          No card with ID &ldquo;{cardId}&rdquo; exists.
        </p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  function togglePrinting(id: string) {
    setExpandedPrintings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const sourceLabels = Object.fromEntries(data.sources.map((s) => [s.id, s.source]));
  const unmatchedGroups = groupPrintingSources(data.printingSources.filter((ps) => !ps.printingId));

  const expectedCardId = (() => {
    if (data.printingSources.length === 0) {
      return cardId;
    }
    const canonical = [...data.printingSources].sort(
      (a, b) =>
        (a.setId ?? "").localeCompare(b.setId ?? "") ||
        a.collectorNumber - b.collectorNumber ||
        ART_VARIANT_ORDER.indexOf(a.artVariant) - ART_VARIANT_ORDER.indexOf(b.artVariant),
    )[0];
    return canonical.sourceId.replace(/(?<=\d)[a-z*]+$/, "");
  })();
  const isCardIdStale = cardId !== expectedCardId;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{data.card.name as string}</h2>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={isCardIdStale ? "text-orange-600 line-through" : ""}>{cardId}</span>
          {isCardIdStale && (
            <>
              <span>&rarr; {expectedCardId}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-xs"
                disabled={renameCard.isPending}
                onClick={() =>
                  renameCard.mutate(
                    { cardId, newId: expectedCardId },
                    {
                      onSuccess: () => {
                        void navigate({
                          to: "/admin/cards/$cardId",
                          params: { cardId: expectedCardId },
                        });
                      },
                    },
                  )
                }
              >
                <RefreshCwIcon className="mr-1 size-3" />
                Regenerate
              </Button>
            </>
          )}
          <span>
            &mdash; {data.sources.length} source{data.sources.length === 1 ? "" : "s"}
          </span>
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-medium">Card Fields</h3>
        <SourceSpreadsheet
          fields={CARD_SOURCE_FIELDS}
          activeRow={{ ...data.card, sourceId: data.card.id }}
          sourceRows={data.sources}
          onCellClick={(field, value) => {
            acceptCardField.mutate({ cardId, field, value });
          }}
          onActiveChange={(field, value) => {
            if (value === null || value === undefined) {
              return;
            }
            acceptCardField.mutate({ cardId, field, value });
          }}
          onCheck={(sourceId) => checkCardSource.mutate(sourceId)}
        />
      </section>

      <section className="space-y-3">
        <h3 className="font-medium">Printings</h3>
        {data.printings.map((printing) => {
          const printingId = printing.id as string;
          const isExpanded = expandedPrintings.has(printingId);
          const relatedSources = data.printingSources.filter((ps) => ps.printingId === printingId);
          const expectedId = `${printing.sourceId as string}:${(printing.artVariant as string) ?? ""}:${(printing.isSigned as boolean) ? "signed" : ""}:${(printing.isPromo as boolean) ? "promo" : ""}:${printing.finish as string}`;
          const isStale = printingId !== expectedId;

          return (
            <div key={printingId} className="rounded-md border">
              <div className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium">
                <button
                  type="button"
                  className="flex items-center gap-2 hover:opacity-70"
                  onClick={() => togglePrinting(printingId)}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="size-4" />
                  ) : (
                    <ChevronRightIcon className="size-4" />
                  )}
                  <span className={isStale ? "text-orange-600 line-through" : ""}>
                    {printingId}
                  </span>
                </button>
                {isStale && (
                  <>
                    <span className="text-muted-foreground">&rarr; {expectedId}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      disabled={renamePrinting.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        renamePrinting.mutate({ printingId, newId: expectedId });
                      }}
                    >
                      <RefreshCwIcon className="mr-1 size-3" />
                      Regenerate
                    </Button>
                  </>
                )}
                {relatedSources.some((ps) => !ps.checkedAt) && (
                  <Badge variant="destructive" className="ml-auto">
                    {relatedSources.filter((ps) => !ps.checkedAt).length} unchecked
                  </Badge>
                )}
              </div>
              {isExpanded && (
                <div className="space-y-3 border-t p-3">
                  <SourceSpreadsheet
                    fields={PRINTING_SOURCE_FIELDS}
                    activeRow={printing}
                    sourceRows={relatedSources}
                    sourceLabels={sourceLabels}
                    onCellClick={(field, value) => {
                      acceptPrintingField.mutate({ printingId, field, value });
                    }}
                    onActiveChange={(field, value) => {
                      if (value === null || value === undefined) {
                        return;
                      }
                      acceptPrintingField.mutate({ printingId, field, value });
                    }}
                    onCheck={(id) => checkPrintingSource.mutate(id)}
                    columnActions={(row) => (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              title="Move or unassign…"
                              disabled={linkPrintingSources.isPending}
                            />
                          }
                        >
                          <MoveIcon className="size-3" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() =>
                              linkPrintingSources.mutate({
                                printingSourceIds: [row.id],
                                printingId: null,
                              })
                            }
                          >
                            <XIcon className="mr-2 size-3.5" />
                            Unassign
                          </DropdownMenuItem>
                          {data.printings
                            .filter((p) => (p.id as string) !== printingId)
                            .map((p) => (
                              <DropdownMenuItem
                                key={p.id as string}
                                onClick={() =>
                                  linkPrintingSources.mutate({
                                    printingSourceIds: [row.id],
                                    printingId: p.id as string,
                                  })
                                }
                              >
                                Move to {p.sourceId as string} · {p.finish as string}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Unmatched printing sources (printing_id is null), grouped */}
        {unmatchedGroups.map((group) => (
          <NewPrintingGroupCard
            key={group.key}
            cardId={cardId}
            group={group}
            existingPrintings={data.printings}
            sourceLabels={sourceLabels}
            onCheck={(id) => checkPrintingSource.mutate(id)}
            onAccept={(printingFields, printingSourceIds) => {
              acceptPrintingGroup.mutate({ cardId, printingFields, printingSourceIds });
            }}
            onLink={(printingId, printingSourceIds) => {
              linkPrintingSources.mutate({ printingId, printingSourceIds });
            }}
            isAccepting={acceptPrintingGroup.isPending}
            isLinking={linkPrintingSources.isPending}
          />
        ))}
      </section>
    </div>
  );
}

const REQUIRED_PRINTING_KEYS = ["sourceId", "setId", "rarity", "finish"];

function NewPrintingGroupCard({
  cardId: _cardId,
  group,
  existingPrintings,
  sourceLabels,
  onCheck,
  onAccept,
  onLink,
  isAccepting,
  isLinking,
}: {
  cardId: string;
  group: PrintingGroup;
  existingPrintings: Record<string, unknown>[];
  sourceLabels: Record<string, string>;
  onCheck: (id: string) => void;
  onAccept: (printingFields: Record<string, unknown>, printingSourceIds: string[]) => void;
  onLink: (printingId: string, printingSourceIds: string[]) => void;
  isAccepting: boolean;
  isLinking: boolean;
}) {
  const [activePrinting, setActivePrinting] = useState<Record<string, unknown>>({});
  const hasRequired = REQUIRED_PRINTING_KEYS.every((k) => {
    const v = activePrinting[k];
    return v !== undefined && v !== null && v !== "";
  });

  // Generate ID in the same format as the DB: "sourceId:artVariant:signed:promo:finish"
  const printingId = hasRequired
    ? `${activePrinting.sourceId}:${activePrinting.artVariant ?? ""}:${activePrinting.isSigned ? "signed" : ""}:${activePrinting.isPromo ? "promo" : ""}:${activePrinting.finish}`
    : "";

  return (
    <div className="rounded-md border border-dashed">
      <div className="flex flex-wrap items-end gap-3 px-3 py-2">
        <span className="text-sm font-medium">
          New: {printingId || group.label} &mdash; {group.sources.length} source
          {group.sources.length === 1 ? "" : "s"}
        </span>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!hasRequired || isAccepting}
            onClick={() =>
              onAccept(
                { id: printingId, ...activePrinting },
                group.sources.map((s) => s.id),
              )
            }
          >
            <PlusIcon className="mr-1 size-3.5" />
            Accept as new printing
          </Button>
        </div>
      </div>
      {!hasRequired && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">
          Click cells to select sourceId, setId, rarity, and finish.
        </p>
      )}
      <div className="border-t p-3">
        <SourceSpreadsheet
          fields={PRINTING_SOURCE_FIELDS}
          requiredKeys={REQUIRED_PRINTING_KEYS}
          activeRow={Object.keys(activePrinting).length > 0 ? activePrinting : null}
          sourceRows={group.sources}
          sourceLabels={sourceLabels}
          onCellClick={(field, value) => {
            setActivePrinting((prev) => ({ ...prev, [field]: value }));
          }}
          onActiveChange={(field, value) => {
            setActivePrinting((prev) =>
              value === null || value === undefined
                ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                : { ...prev, [field]: value },
            );
          }}
          onCheck={onCheck}
          columnActions={
            existingPrintings.length > 0
              ? (row) => (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          title="Assign to printing…"
                          disabled={isLinking}
                        />
                      }
                    >
                      <MoveIcon className="size-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {existingPrintings.map((p) => (
                        <DropdownMenuItem
                          key={p.id as string}
                          onClick={() => onLink(p.id as string, [row.id])}
                        >
                          {p.sourceId as string} · {p.finish as string}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}
