import type { AdminPrintingImage, CardSource, PrintingSource } from "@openrift/shared";
import { ART_VARIANT_ORDER } from "@openrift/shared";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  ImagePlusIcon,
  MoveIcon,
  PlusIcon,
  RefreshCwIcon,
  EyeIcon,
  EyeOffIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptCardField,
  useAcceptPrintingField,
  useAcceptPrintingGroup,
  useActivatePrintingImage,
  useAddImageFromUrl,
  useCardSourceDetail,
  useCheckAllCardSources,
  useCheckAllPrintingSources,
  useCheckCardSource,
  useCheckPrintingSource,
  useCopyPrintingSource,
  useDeletePrintingImage,
  useDeletePrintingSource,
  useLinkPrintingSources,
  useRehostPrintingImage,
  useRenameCard,
  useRenamePrinting,
  useSetPrintingSourceImage,
  useUnrehostPrintingImage,
  useUploadPrintingImage,
} from "@/hooks/use-card-sources";
import { useFavoriteSources } from "@/hooks/use-favorite-sources";

interface DetailData {
  card: Record<string, unknown>;
  sources: CardSource[];
  printings: Record<string, unknown>[];
  printingSources: PrintingSource[];
  printingImages: AdminPrintingImage[];
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
  const checkAllCardSources = useCheckAllCardSources();
  const checkPrintingSource = useCheckPrintingSource();
  const checkAllPrintingSources = useCheckAllPrintingSources();
  const acceptCardField = useAcceptCardField();
  const acceptPrintingField = useAcceptPrintingField();
  const renameCard = useRenameCard();
  const acceptPrintingGroup = useAcceptPrintingGroup();
  const copyPrintingSource = useCopyPrintingSource();
  const deletePrintingSource = useDeletePrintingSource();
  const linkPrintingSources = useLinkPrintingSources();
  const renamePrinting = useRenamePrinting();
  const { favorites } = useFavoriteSources();

  const [collapsedPrintings, setCollapsedPrintings] = useState<Set<string>>(new Set());

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
    setCollapsedPrintings((prev) => {
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
    const linked = data.printingSources.filter((ps) => ps.printingId);
    if (linked.length === 0) {
      return cardId;
    }
    const isGallery = (ps: (typeof linked)[0]) => sourceLabels[ps.cardSourceId] === "gallery";
    const matchesCurrent = (ps: (typeof linked)[0]) =>
      ps.sourceId.replace(/(?<=\d)[a-z*]+$/, "") === cardId;
    const canonical = [...linked].sort(
      (a, b) =>
        Number(isGallery(b)) - Number(isGallery(a)) ||
        Number(matchesCurrent(b)) - Number(matchesCurrent(a)) ||
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
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Card Fields</h3>
          {data.sources.some((s) => !s.checkedAt) && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs"
                disabled={checkAllCardSources.isPending}
                onClick={() => checkAllCardSources.mutate(cardId)}
              >
                <CheckCheckIcon className="mr-1 size-3" />
                Check all
              </Button>
              <Badge variant="destructive">
                {data.sources.filter((s) => !s.checkedAt).length} unchecked
              </Badge>
            </>
          )}
        </div>
        <SourceSpreadsheet
          fields={CARD_SOURCE_FIELDS}
          activeRow={{ ...data.card, sourceId: data.card.id }}
          sourceRows={data.sources}
          favoriteSources={favorites}
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
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Printings</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs"
            onClick={() => {
              const allKeys = [
                ...data.printings.map((p) => p.id as string),
                ...unmatchedGroups.map((g) => g.key),
              ];
              setCollapsedPrintings((prev) =>
                prev.size === allKeys.length ? new Set() : new Set(allKeys),
              );
            }}
          >
            {collapsedPrintings.size === data.printings.length + unmatchedGroups.length
              ? "Expand all"
              : "Collapse all"}
          </Button>
        </div>
        {data.printings.map((printing) => {
          const printingId = printing.id as string;
          const isExpanded = !collapsedPrintings.has(printingId);
          const relatedSources = data.printingSources.filter((ps) => ps.printingId === printingId);
          const activeImage = data.printingImages.find(
            (pi) => pi.printingId === printingId && pi.isActive,
          );
          const printingWithImage = {
            ...printing,
            imageUrl: activeImage?.originalUrl ?? null,
          };
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
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto h-6 text-xs"
                      disabled={checkAllPrintingSources.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        checkAllPrintingSources.mutate(printingId);
                      }}
                    >
                      <CheckCheckIcon className="mr-1 size-3" />
                      Check all
                    </Button>
                    <Badge variant="destructive">
                      {relatedSources.filter((ps) => !ps.checkedAt).length} unchecked
                    </Badge>
                  </>
                )}
              </div>
              {isExpanded && (
                <div className="space-y-3 border-t p-3">
                  <SourceSpreadsheet
                    fields={PRINTING_SOURCE_FIELDS}
                    activeRow={printingWithImage}
                    sourceRows={relatedSources}
                    sourceLabels={sourceLabels}
                    favoriteSources={favorites}
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
                        <DropdownMenuContent align="end" className="w-64">
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
                          <DropdownMenuItem onClick={() => deletePrintingSource.mutate(row.id)}>
                            <Trash2Icon className="mr-2 size-3.5" />
                            Delete
                          </DropdownMenuItem>
                          {data.printings
                            .filter((p) => (p.id as string) !== printingId)
                            .map((p) => (
                              <DropdownMenuItem
                                key={`move-${p.id as string}`}
                                onClick={() =>
                                  linkPrintingSources.mutate({
                                    printingSourceIds: [row.id],
                                    printingId: p.id as string,
                                  })
                                }
                              >
                                <MoveIcon className="mr-2 size-3.5" />
                                Move to {p.sourceId as string} · {p.finish as string}
                              </DropdownMenuItem>
                            ))}
                          {data.printings
                            .filter((p) => (p.id as string) !== printingId)
                            .map((p) => (
                              <DropdownMenuItem
                                key={`copy-${p.id as string}`}
                                onClick={() =>
                                  copyPrintingSource.mutate({
                                    id: row.id,
                                    printingId: p.id as string,
                                  })
                                }
                              >
                                <CopyIcon className="mr-2 size-3.5" />
                                Copy to {p.sourceId as string} · {p.finish as string}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  />
                  <PrintingImagesSection
                    printingId={printingId}
                    images={data.printingImages.filter((pi) => pi.printingId === printingId)}
                    sourceImages={relatedSources
                      .filter(
                        (ps) =>
                          ps.imageUrl &&
                          !data.printingImages.some((pi) => pi.originalUrl === ps.imageUrl),
                      )
                      .map((ps) => ({
                        printingSourceId: ps.id,
                        url: ps.imageUrl as string,
                        source: sourceLabels[ps.cardSourceId] ?? "unknown",
                      }))}
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
            favoriteSources={favorites}
            isExpanded={!collapsedPrintings.has(group.key)}
            onToggle={() => togglePrinting(group.key)}
            onCheck={(id) => checkPrintingSource.mutate(id)}
            onAccept={(printingFields, printingSourceIds) => {
              acceptPrintingGroup.mutate({ cardId, printingFields, printingSourceIds });
            }}
            onLink={(printingId, printingSourceIds) => {
              linkPrintingSources.mutate({ printingId, printingSourceIds });
            }}
            onCopy={(id, printingId) => {
              copyPrintingSource.mutate({ id, printingId });
            }}
            onDelete={(id) => {
              deletePrintingSource.mutate(id);
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
  favoriteSources,
  isExpanded,
  onToggle,
  onCheck,
  onAccept,
  onLink,
  onCopy,
  onDelete,
  isAccepting,
  isLinking,
}: {
  cardId: string;
  group: PrintingGroup;
  existingPrintings: Record<string, unknown>[];
  sourceLabels: Record<string, string>;
  favoriteSources: Set<string>;
  isExpanded: boolean;
  onToggle: () => void;
  onCheck: (id: string) => void;
  onAccept: (printingFields: Record<string, unknown>, printingSourceIds: string[]) => void;
  onLink: (printingId: string, printingSourceIds: string[]) => void;
  onCopy: (id: string, printingId: string) => void;
  onDelete: (id: string) => void;
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

  // Guess the most likely ID from source data before fields are selected
  const { differentiators: d } = group;
  const guessedSourceId = (() => {
    const counts = new Map<string, number>();
    for (const s of group.sources) {
      counts.set(s.sourceId, (counts.get(s.sourceId) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  })();
  const guessedId = `${guessedSourceId}:${d.artVariant}:${d.isSigned ? "signed" : ""}:${d.isPromo ? "promo" : ""}:${d.finish}`;

  return (
    <div className="rounded-md border border-dashed">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        <button
          type="button"
          className="flex items-center gap-2 text-sm font-medium hover:opacity-70"
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
          <span>
            New: <span className="text-muted-foreground">{printingId || guessedId}</span> &mdash;{" "}
            {group.sources.length} source
            {group.sources.length === 1 ? "" : "s"}
          </span>
        </button>
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
      {isExpanded && (
        <>
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
              favoriteSources={favoriteSources}
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
                        <DropdownMenuContent align="end" className="w-64">
                          {existingPrintings.map((p) => (
                            <DropdownMenuItem
                              key={`link-${p.id as string}`}
                              onClick={() => onLink(p.id as string, [row.id])}
                            >
                              <MoveIcon className="mr-2 size-3.5" />
                              {p.sourceId as string} · {p.finish as string}
                            </DropdownMenuItem>
                          ))}
                          {existingPrintings.map((p) => (
                            <DropdownMenuItem
                              key={`copy-${p.id as string}`}
                              onClick={() => onCopy(row.id, p.id as string)}
                            >
                              <CopyIcon className="mr-2 size-3.5" />
                              Copy to {p.sourceId as string} · {p.finish as string}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem onClick={() => onDelete(row.id)}>
                            <Trash2Icon className="mr-2 size-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  : undefined
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Image hover link ─────────────────────────────────────────────────────────

function ImageHoverLink({ url, children }: { url: string; children?: React.ReactNode }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block truncate text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        title={url}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {children ?? url}
      </HoverCardTrigger>
      <HoverCardContent side="right" className="w-auto p-1">
        <img src={url} alt="Preview" className="max-h-[80vh] max-w-[40vw] rounded object-contain" />
      </HoverCardContent>
    </HoverCard>
  );
}

// ── Printing images management ───────────────────────────────────────────────

function PrintingImagesSection({
  printingId,
  images,
  sourceImages,
}: {
  printingId: string;
  images: AdminPrintingImage[];
  sourceImages: { printingSourceId: string; url: string; source: string }[];
}) {
  const deletePrintingImage = useDeletePrintingImage();
  const activatePrintingImage = useActivatePrintingImage();
  const rehostPrintingImage = useRehostPrintingImage();
  const unrehostPrintingImage = useUnrehostPrintingImage();
  const addImageFromUrl = useAddImageFromUrl();
  const uploadPrintingImage = useUploadPrintingImage();
  const setPrintingSourceImage = useSetPrintingSourceImage();

  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = images.length > 0 || sourceImages.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">Images</h4>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setShowUrlInput((v) => !v)}
          >
            <ImagePlusIcon className="mr-1 size-3" />
            Add URL
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPrintingImage.isPending}
          >
            <UploadIcon className="mr-1 size-3" />
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                uploadPrintingImage.mutate({ printingId, file, mode: "main" });
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>

      {showUrlInput && (
        <div className="flex items-center gap-2">
          <Input
            placeholder="Image URL…"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            className="h-7 flex-1 text-xs"
          />
          <Input
            placeholder="Source name"
            value={urlSource}
            onChange={(e) => setUrlSource(e.target.value)}
            className="h-7 w-32 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={!urlValue.trim() || addImageFromUrl.isPending}
            onClick={() => {
              addImageFromUrl.mutate(
                {
                  printingId,
                  url: urlValue.trim(),
                  source: urlSource.trim() || undefined,
                  mode: "main",
                },
                {
                  onSuccess: () => {
                    setUrlValue("");
                    setUrlSource("");
                    setShowUrlInput(false);
                  },
                },
              );
            }}
          >
            <PlusIcon className="mr-1 size-3" />
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setShowUrlInput(false);
              setUrlValue("");
              setUrlSource("");
            }}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      )}

      {hasContent && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-1 pr-2 font-medium">Status</th>
              <th className="pb-1 pr-2 font-medium">Source</th>
              <th className="pb-1 pr-2 font-medium">Image</th>
              <th className="pb-1 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {images.map((img) => {
              const displayUrl = img.rehostedUrl ? `${img.rehostedUrl}-full.webp` : img.originalUrl;

              return (
                <tr key={img.id} className="border-b last:border-b-0">
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1">
                      {img.isActive ? (
                        <Badge variant="default" className="text-[10px]">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactive
                        </Badge>
                      )}
                      {img.rehostedUrl ? (
                        <Badge variant="outline" className="text-[10px] text-green-600">
                          Rehosted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-orange-600">
                          External
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2">{img.source}</td>
                  <td className="max-w-64 py-1.5 pr-2">
                    {displayUrl ? (
                      img.rehostedUrl ? (
                        <ImageHoverLink url={displayUrl}>
                          {img.rehostedUrl.split("/").pop()}
                        </ImageHoverLink>
                      ) : (
                        <ImageHoverLink url={displayUrl} />
                      )
                    ) : (
                      <span className="text-muted-foreground">No URL</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-1">
                      {img.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          title="Deactivate"
                          disabled={activatePrintingImage.isPending}
                          onClick={() =>
                            activatePrintingImage.mutate({ imageId: img.id, active: false })
                          }
                        >
                          <EyeIcon className="size-3" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          title="Set as active"
                          disabled={activatePrintingImage.isPending}
                          onClick={() =>
                            activatePrintingImage.mutate({ imageId: img.id, active: true })
                          }
                        >
                          <EyeOffIcon className="size-3" />
                        </Button>
                      )}
                      {!img.rehostedUrl && img.originalUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          title="Rehost"
                          disabled={rehostPrintingImage.isPending}
                          onClick={() => rehostPrintingImage.mutate(img.id)}
                        >
                          <DownloadIcon className="size-3" />
                        </Button>
                      )}
                      {img.rehostedUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          title="Un-rehost (delete files)"
                          disabled={unrehostPrintingImage.isPending}
                          onClick={() => unrehostPrintingImage.mutate(img.id)}
                        >
                          <XIcon className="size-3" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-destructive"
                        title="Remove"
                        disabled={deletePrintingImage.isPending}
                        onClick={() => deletePrintingImage.mutate(img.id)}
                      >
                        <Trash2Icon className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {sourceImages.map(({ printingSourceId, url, source }) => (
              <tr key={printingSourceId} className="border-b last:border-b-0 opacity-60">
                <td className="py-1.5 pr-2">
                  <Badge variant="outline" className="text-[10px]">
                    Source
                  </Badge>
                </td>
                <td className="py-1.5 pr-2">{source}</td>
                <td className="max-w-64 py-1.5 pr-2">
                  <ImageHoverLink url={url} />
                </td>
                <td className="py-1.5">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      disabled={setPrintingSourceImage.isPending}
                      onClick={() =>
                        setPrintingSourceImage.mutate({
                          printingSourceId,
                          mode: "main",
                        })
                      }
                    >
                      <PlusIcon className="mr-0.5 size-3" />
                      Main
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px]"
                      disabled={setPrintingSourceImage.isPending}
                      onClick={() =>
                        setPrintingSourceImage.mutate({
                          printingSourceId,
                          mode: "additional",
                        })
                      }
                    >
                      <PlusIcon className="mr-0.5 size-3" />
                      Alt
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!hasContent && <p className="text-xs text-muted-foreground">No images available.</p>}
    </div>
  );
}
