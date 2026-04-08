import type { Printing } from "@openrift/shared";
import { sortCards } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  DownloadIcon,
  FileUpIcon,
  Loader2Icon,
  SearchIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import { use, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { PrintingSearch, formatImportPrintingLabel } from "@/components/printing-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { catalogQueryOptions, useCards } from "@/hooks/use-cards";
import { collectionsQueryOptions, useCollections } from "@/hooks/use-collections";
import { copiesQueryOptions } from "@/hooks/use-copies";
import { useImportFlow } from "@/hooks/use-import-flow";
import { downloadCSV, generateExportCSV } from "@/lib/csv-export";
import type { MatchStatus, MatchedEntry } from "@/lib/import-matcher";
import { cn } from "@/lib/utils";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";

export const Route = createFileRoute("/_app/_authenticated/collections/import")({
  head: () => ({ meta: [{ title: "Import / Export — OpenRift" }] }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(collectionsQueryOptions),
    ]);
  },
  component: ImportExportPage,
});

function ImportExportPage() {
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data: collections } = useCollections();
  const flow = useImportFlow();

  const topBarPortal =
    topBarSlot &&
    createPortal(
      <PageTopBar>
        <PageTopBarTitle onToggleSidebar={toggleSidebar}>Import / Export</PageTopBarTitle>
      </PageTopBar>,
      topBarSlot,
    );

  if (flow.step === "input") {
    return (
      <div className="space-y-10">
        {topBarPortal}
        <ExportSection />
        <InputStep
          rawText={flow.rawText}
          onTextChange={flow.handleRawTextChange}
          onParse={flow.handleParse}
          onFileUpload={flow.handleFileUpload}
          fileRef={flow.fileRef}
          parseErrors={flow.parseErrors}
        />
      </div>
    );
  }

  return (
    <>
      {topBarPortal}
      <PreviewStep
        matchedEntries={flow.matchedEntries}
        allPrintings={flow.allPrintings}
        rowCount={flow.rowCount}
        parseErrors={flow.parseErrors}
        skippedIndices={flow.skippedIndices}
        expandedIndices={flow.expandedIndices}
        collections={collections ?? []}
        collectionId={flow.collectionId}
        newCollectionName={flow.newCollectionName}
        readyCount={flow.readyCount}
        needsAttentionCount={flow.needsAttentionCount}
        skippedCount={flow.skippedCount}
        totalCards={flow.totalCards}
        isImporting={flow.isImporting}
        onResolve={flow.handleResolve}
        onSkip={flow.handleSkip}
        onUnskip={flow.handleUnskip}
        onToggleExpand={flow.handleToggleExpand}
        onCollectionChange={flow.handleCollectionChange}
        onNewCollectionNameChange={flow.handleNewCollectionNameChange}
        onImport={flow.handleImport}
        onBack={flow.handleBack}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function ExportSection() {
  const { data: collections } = useCollections();
  const { allPrintings } = useCards();
  const [exportCollectionId, setExportCollectionId] = useState<string>("__all__");

  const queryCollectionId = exportCollectionId === "__all__" ? undefined : exportCollectionId;
  const { data: copies, isLoading } = useQuery(copiesQueryOptions(queryCollectionId));

  const handleExport = () => {
    if (!copies) {
      return;
    }

    const printingById = new Map<string, Printing>();
    for (const printing of allPrintings) {
      printingById.set(printing.id, printing);
    }

    // Build stacks grouped by printingId
    const stackMap = new Map<
      string,
      { printingId: string; printing: Printing; copyIds: string[] }
    >();
    for (const copy of copies) {
      const printing = printingById.get(copy.printingId);
      if (!printing) {
        continue;
      }
      const existing = stackMap.get(copy.printingId);
      if (existing) {
        existing.copyIds.push(copy.id);
      } else {
        stackMap.set(copy.printingId, {
          printingId: copy.printingId,
          printing,
          copyIds: [copy.id],
        });
      }
    }

    // Sort by card ID
    const stacks = [...stackMap.values()];
    const sortedPrintings = sortCards(
      stacks.map((stack) => stack.printing),
      "id",
    );
    const byPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));
    const sortedStacks = sortedPrintings
      .map((printing) => byPrintingId.get(printing.id))
      .filter(
        (stack): stack is { printingId: string; printing: Printing; copyIds: string[] } =>
          stack !== undefined,
      );

    const csv = generateExportCSV(sortedStacks);

    const collectionName =
      exportCollectionId === "__all__"
        ? "all-cards"
        : (collections?.find((col) => col.id === exportCollectionId)?.name ?? "collection")
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/g, "-")
            .replaceAll(/^-|-$/g, "");

    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `openrift-${collectionName}-${date}.csv`);
    toast.success("Collection exported.");
  };

  const copyCount = copies?.length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-3">
      <div>
        <h2 className="text-lg font-semibold">Export Collection</h2>
        <p className="text-muted-foreground text-sm">Download your collection as a CSV file.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="export-collection">
          Collection
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={exportCollectionId}
            onValueChange={(value) => setExportCollectionId(value ?? "__all__")}
            items={{
              __all__: "All Cards",
              ...Object.fromEntries(collections?.map((col) => [col.id, col.name]) ?? []),
            }}
          >
            <SelectTrigger className="w-[240px]" id="export-collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Cards</SelectItem>
              <SelectSeparator />
              {collections?.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleExport} disabled={isLoading || copyCount === 0}>
            {isLoading ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <DownloadIcon className="mr-2 size-4" />
                Export {copyCount} {copyCount === 1 ? "copy" : "copies"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Input
// ---------------------------------------------------------------------------

function InputStep({
  rawText,
  onTextChange,
  onParse,
  onFileUpload,
  fileRef,
  parseErrors,
}: {
  rawText: string;
  onTextChange: (text: string) => void;
  onParse: (text: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  parseErrors: string[];
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Import Collection</h2>
        <p className="text-muted-foreground text-sm">
          Paste or upload a CSV export from{" "}
          <a
            href="https://piltoverarchive.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Piltover Archive
          </a>
          ,{" "}
          <a
            href="https://riftcore.app"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            RiftCore
          </a>
          , or OpenRift itself. Having trouble or need support for another source? Let us know on{" "}
          <a
            href="https://discord.gg/Qb6RcjXq6z"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Discord
          </a>{" "}
          or{" "}
          <a
            href="https://github.com/eikowagenknecht/openrift/issues"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            GitHub
          </a>
          .
        </p>
      </div>

      <div className="space-y-3">
        <Textarea
          value={rawText}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste your CSV data here..."
          className="min-h-[200px] font-mono text-xs"
        />

        <div className="flex items-center gap-3">
          <Button onClick={() => onParse(rawText)} disabled={rawText.trim().length === 0}>
            <UploadIcon className="mr-2 size-4" />
            Parse
          </Button>

          <div className="text-muted-foreground text-sm">or</div>

          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUpIcon className="mr-2 size-4" />
            Upload CSV file
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {parseErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
          {parseErrors.map((error) => (
            <p key={error} className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Preview
// ---------------------------------------------------------------------------

interface CollectionOption {
  id: string;
  name: string;
  isInbox: boolean;
}

function PreviewStep({
  matchedEntries,
  allPrintings,
  rowCount,
  parseErrors,
  skippedIndices,
  expandedIndices,
  collections,
  collectionId,
  newCollectionName,
  readyCount,
  needsAttentionCount,
  skippedCount,
  totalCards,
  isImporting,
  onResolve,
  onSkip,
  onUnskip,
  onToggleExpand,
  onCollectionChange,
  onNewCollectionNameChange,
  onImport,
  onBack,
}: {
  matchedEntries: MatchedEntry[];
  allPrintings: Printing[];
  rowCount: number;
  parseErrors: string[];
  skippedIndices: Set<number>;
  expandedIndices: Set<number>;
  collections: CollectionOption[];
  collectionId: string;
  newCollectionName: string;
  readyCount: number;
  needsAttentionCount: number;
  skippedCount: number;
  totalCards: number;
  isImporting: boolean;
  onResolve: (index: number, printing: Printing) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onToggleExpand: (index: number) => void;
  onCollectionChange: (id: string) => void;
  onNewCollectionNameChange: (name: string) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const canImport =
    readyCount > 0 &&
    collectionId !== "" &&
    (collectionId !== "__new__" || newCollectionName.trim().length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Import Preview</h2>
          <p className="text-muted-foreground text-sm">
            {rowCount} row{rowCount === 1 ? "" : "s"} parsed, {matchedEntries.length} unique
            printing{matchedEntries.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>

      {/* Entry list */}
      <div className="divide-border divide-y rounded-md border">
        {matchedEntries.map((entry, index) => (
          <ImportEntryRow
            key={`${entry.entry.sourceCode}-${entry.entry.finish}-${index}`}
            entry={entry}
            allPrintings={allPrintings}
            index={index}
            isSkipped={skippedIndices.has(index)}
            isExpanded={expandedIndices.has(index)}
            onResolve={onResolve}
            onSkip={onSkip}
            onUnskip={onUnskip}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>

      {/* Parse errors — cards that couldn't be recognized at all */}
      {parseErrors.length > 0 && (
        <details className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            {parseErrors.length} {parseErrors.length === 1 ? "row" : "rows"} could not be recognized
          </summary>
          <div className="border-t border-amber-200 px-3 py-2 dark:border-amber-900">
            {parseErrors.map((error) => (
              <p key={error} className="text-sm text-amber-700 dark:text-amber-400">
                {error}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Summary + target collection + import button */}
      <div className="bg-muted/50 space-y-4 rounded-md border p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{readyCount} ready</Badge>
          {needsAttentionCount > 0 && (
            <Badge variant="default">{needsAttentionCount} need attention</Badge>
          )}
          {skippedCount > 0 && <Badge variant="ghost">{skippedCount} skipped</Badge>}
        </div>

        {needsAttentionCount > 0 && (
          <p className="text-muted-foreground text-sm">
            Having trouble importing?{" "}
            <a
              href="https://github.com/eikowagenknecht/openrift/issues"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline"
            >
              Open a GitHub issue
            </a>{" "}
            and we&apos;ll take a look.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <Select
            value={collectionId}
            onValueChange={(value) => onCollectionChange(value ?? "")}
            items={{
              ...Object.fromEntries(collections.map((col) => [col.id, col.name])),
              __new__: "+ Create new collection",
            }}
          >
            <SelectTrigger className="mb-0 w-[240px]">
              <SelectValue placeholder="Target collection..." />
            </SelectTrigger>
            <SelectContent>
              {collections.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.name}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="__new__">+ Create new collection</SelectItem>
            </SelectContent>
          </Select>

          {collectionId === "__new__" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-collection-name">
                Collection name
              </label>
              <Input
                id="new-collection-name"
                value={newCollectionName}
                onChange={(event) => onNewCollectionNameChange(event.target.value)}
                placeholder="My imported cards"
                className="w-[240px]"
              />
            </div>
          )}

          <Button onClick={onImport} disabled={!canImport || isImporting}>
            {isImporting ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import {totalCards} {totalCards === 1 ? "copy" : "copies"}
              </>
            )}
          </Button>
          {needsAttentionCount > 0 && !isImporting && (
            <span className="text-muted-foreground text-sm">
              (skips {needsAttentionCount} unmatched)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single entry row
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<MatchStatus, { icon: React.ElementType; className: string }> = {
  exact: { icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  ambiguous: { icon: AlertTriangleIcon, className: "text-amber-600 dark:text-amber-400" },
  fuzzy: { icon: CircleHelpIcon, className: "text-amber-600 dark:text-amber-400" },
  unresolved: { icon: XCircleIcon, className: "text-red-600 dark:text-red-400" },
};

function ImportEntryRow({
  entry,
  allPrintings,
  index,
  isSkipped,
  isExpanded,
  onResolve,
  onSkip,
  onUnskip,
  onToggleExpand,
}: {
  entry: MatchedEntry;
  allPrintings: Printing[];
  index: number;
  isSkipped: boolean;
  isExpanded: boolean;
  onResolve: (index: number, printing: Printing) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onToggleExpand: (index: number) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const { icon: StatusIcon, className: statusColor } = STATUS_CONFIG[entry.status];
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronRightIcon;
  const rawFieldEntries = Object.entries(entry.entry.rawFields);
  const hasCandidates = entry.candidates.length > 0;

  return (
    <div className={cn(isSkipped && "opacity-40")}>
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0"
          onClick={() => onToggleExpand(index)}
        >
          <ChevronIcon className="size-4" />
        </button>

        <StatusIcon className={cn("size-4 shrink-0", statusColor)} />

        <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
          {entry.entry.quantity}&times;
        </span>

        <span className="text-muted-foreground shrink-0 text-xs">{entry.entry.sourceCode}</span>

        <span className="min-w-0 flex-1 truncate font-medium">
          {entry.entry.cardName}
          {formatEntrySpecialties(entry) && (
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">
              {formatEntrySpecialties(entry)}
            </span>
          )}
        </span>

        <div className="flex shrink-0 items-center gap-2">
          {entry.status === "fuzzy" && (
            <span className="text-muted-foreground text-xs">
              Did you mean <em>{entry.suggestedName}</em>?
            </span>
          )}

          {showSearch ? (
            <PrintingSearch
              allPrintings={allPrintings}
              onSelect={(printing) => {
                onResolve(index, printing);
                setShowSearch(false);
              }}
            />
          ) : hasCandidates ? (
            <VariantPicker
              candidates={entry.candidates}
              resolved={entry.resolvedPrinting}
              onSelect={(printing) => onResolve(index, printing)}
            />
          ) : null}

          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowSearch(!showSearch)}
            aria-label={showSearch ? "Close search" : "Search catalog"}
          >
            {showSearch ? (
              <XCircleIcon className="size-3.5" />
            ) : (
              <SearchIcon className="size-3.5" />
            )}
          </Button>

          {isSkipped ? (
            <Button variant="ghost" size="xs" onClick={() => onUnskip(index)}>
              Unskip
            </Button>
          ) : (
            <Button variant="ghost" size="xs" onClick={() => onSkip(index)}>
              Skip
            </Button>
          )}
        </div>
      </div>

      {isExpanded && rawFieldEntries.length > 0 && (
        <div className="bg-muted/30 border-border border-t px-4 py-2">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {rawFieldEntries.map(([key, value]) => (
              <div key={key}>
                <span className="text-muted-foreground">{key}: </span>
                <span>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatEntrySpecialties(entry: MatchedEntry): string | null {
  const parts: string[] = [];
  if (entry.entry.finish === "foil") {
    parts.push("Foil");
  }
  if (entry.entry.artVariant === "altart") {
    parts.push("Alt Art");
  }
  if (entry.entry.artVariant === "overnumbered") {
    parts.push("Overnumbered");
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function VariantPicker({
  candidates,
  resolved,
  onSelect,
}: {
  candidates: Printing[];
  resolved: Printing | null;
  onSelect: (printing: Printing) => void;
}) {
  return (
    <Select
      value={resolved?.id ?? ""}
      onValueChange={(value) => {
        const printing = candidates.find((candidate) => candidate.id === value);
        if (printing) {
          onSelect(printing);
        }
      }}
      items={Object.fromEntries(
        candidates.map((printing) => [printing.id, formatImportPrintingLabel(printing)]),
      )}
    >
      <SelectTrigger size="sm" className="h-7 w-auto text-xs">
        <SelectValue placeholder="Pick variant..." />
      </SelectTrigger>
      <SelectContent className="w-auto">
        {candidates.map((printing) => (
          <SelectItem key={printing.id} value={printing.id} className="py-1.5">
            {formatImportPrintingLabel(printing)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
