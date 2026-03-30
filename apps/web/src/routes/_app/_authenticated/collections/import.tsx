import type { Printing } from "@openrift/shared";
import { sortCards } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  DownloadIcon,
  FileUpIcon,
  Loader2Icon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";
import { catalogQueryOptions, useCards } from "@/hooks/use-cards";
import {
  collectionsQueryOptions,
  useCollections,
  useCreateCollection,
} from "@/hooks/use-collections";
import { copiesQueryOptions, useAddCopies } from "@/hooks/use-copies";
import { downloadCSV, generateExportCSV } from "@/lib/csv-export";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import type { MatchStatus, MatchedEntry } from "@/lib/import-matcher";
import { matchEntries } from "@/lib/import-matcher";
import { parseImportData } from "@/lib/import-parsers";
import { cn } from "@/lib/utils";

import { useCollectionTitle } from "./route";

const STATUS_SORT_ORDER: Record<MatchStatus, number> = {
  exact: 0,
  ambiguous: 1,
  fuzzy: 2,
  unresolved: 3,
};

export const Route = createFileRoute("/_app/_authenticated/collections/import")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(collectionsQueryOptions),
    ]);
  },
  component: ImportExportPage,
});

type ImportStep = "input" | "preview";

function ImportExportPage() {
  useCollectionTitle("Import / Export");

  const { allPrintings } = useCards();
  const { data: collections } = useCollections();
  const addCopies = useAddCopies();
  const createCollection = useCreateCollection();
  const navigate = useNavigate();

  const [step, setStep] = useState<ImportStep>("input");
  const [rawText, setRawText] = useState("");
  const [matchedEntries, setMatchedEntries] = useState<MatchedEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [collectionId, setCollectionId] = useState<string>("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [rowCount, setRowCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = (text: string) => {
    const { entries, errors, rowCount: parsedRowCount } = parseImportData(text);
    setRowCount(parsedRowCount);
    setParseErrors(errors);

    if (entries.length === 0) {
      return;
    }

    const matched = matchEntries(entries, allPrintings);
    const sorted = matched.toSorted(
      (entryA, entryB) => STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status],
    );
    setMatchedEntries(sorted);
    setSkippedIndices(new Set());

    // Auto-expand non-exact entries so the user sees details that need attention
    const nonExact = new Set<number>();
    for (let index = 0; index < sorted.length; index++) {
      if (sorted[index].status !== "exact") {
        nonExact.add(index);
      }
    }
    setExpandedIndices(nonExact);

    setStep("preview");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const text = await file.text();
    setRawText(text);
    handleParse(text);
    // Reset file input so the same file can be re-selected
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const handleResolve = (index: number, printing: Printing) => {
    setMatchedEntries((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index
          ? { ...entry, resolvedPrinting: printing, status: "exact" as MatchStatus }
          : entry,
      ),
    );
  };

  const handleSkip = (index: number) => {
    setSkippedIndices((prev) => new Set([...prev, index]));
  };

  const handleUnskip = (index: number) => {
    setSkippedIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleToggleExpand = (index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const readyEntries = matchedEntries.filter(
    (entry, index) => entry.resolvedPrinting && !skippedIndices.has(index),
  );
  const needsAttention = matchedEntries.filter(
    (entry, index) => !entry.resolvedPrinting && !skippedIndices.has(index),
  );
  const skippedCount = skippedIndices.size;
  const totalCards = readyEntries.reduce((sum, entry) => sum + entry.entry.quantity, 0);

  const handleImport = async () => {
    let targetCollectionId = collectionId;

    // Create new collection if needed
    if (targetCollectionId === "__new__") {
      const trimmed = newCollectionName.trim();
      if (!trimmed) {
        toast.error("Please enter a collection name.");
        return;
      }
      setIsCreatingCollection(true);
      try {
        const result = await createCollection.mutateAsync({ name: trimmed });
        targetCollectionId = result.id;
      } catch {
        toast.error("Failed to create collection.");
        setIsCreatingCollection(false);
        return;
      }
      setIsCreatingCollection(false);
    }

    if (!targetCollectionId || targetCollectionId === "__new__") {
      toast.error("Please select a target collection.");
      return;
    }

    setIsImporting(true);

    // Build copies payload — expand quantities into individual entries
    const copies: { printingId: string; collectionId: string }[] = [];
    for (const entry of readyEntries) {
      for (let count = 0; count < entry.entry.quantity; count++) {
        copies.push({
          printingId: entry.resolvedPrinting?.id ?? "",
          collectionId: targetCollectionId,
        });
      }
    }

    // Batch in groups of 500
    const batchSize = 500;
    try {
      for (let offset = 0; offset < copies.length; offset += batchSize) {
        const batch = copies.slice(offset, offset + batchSize);
        await addCopies.mutateAsync({ copies: batch });
      }
      toast.success(`Imported ${totalCards} ${totalCards === 1 ? "copy" : "copies"}.`);
      navigate({
        to: "/collections/$collectionId",
        params: { collectionId: targetCollectionId },
      });
    } catch {
      toast.error("Import failed. Some cards may have been added.");
      setIsImporting(false);
    }
  };

  if (step === "input") {
    return (
      <div className="space-y-10">
        <ExportSection />
        <InputStep
          rawText={rawText}
          onTextChange={setRawText}
          onParse={handleParse}
          onFileUpload={handleFileUpload}
          fileRef={fileRef}
          parseErrors={parseErrors}
        />
      </div>
    );
  }

  return (
    <PreviewStep
      matchedEntries={matchedEntries}
      rowCount={rowCount}
      skippedIndices={skippedIndices}
      expandedIndices={expandedIndices}
      collections={collections ?? []}
      collectionId={collectionId}
      newCollectionName={newCollectionName}
      readyCount={readyEntries.length}
      needsAttentionCount={needsAttention.length}
      skippedCount={skippedCount}
      totalCards={totalCards}
      isImporting={isImporting || isCreatingCollection}
      onResolve={handleResolve}
      onSkip={handleSkip}
      onUnskip={handleUnskip}
      onToggleExpand={handleToggleExpand}
      onCollectionChange={setCollectionId}
      onNewCollectionNameChange={setNewCollectionName}
      onImport={handleImport}
      onBack={() => setStep("input")}
    />
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Export Collection</h2>
        <p className="text-muted-foreground text-sm">Download your collection as a CSV file.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="export-collection">
            Collection
          </label>
          <Select
            value={exportCollectionId}
            onValueChange={(value) => setExportCollectionId(value ?? "__all__")}
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
        </div>

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
          Paste or upload a CSV export from Piltover Archive or RiftCore. Want another source
          supported?{" "}
          <a
            href="https://github.com/eikowagenknecht/openrift/issues"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Open a GitHub issue
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
  rowCount,
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
  rowCount: number;
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="target-collection">
              Target collection
            </label>
            <Select value={collectionId} onValueChange={(value) => onCollectionChange(value ?? "")}>
              <SelectTrigger className="w-[240px]" id="target-collection">
                <SelectValue placeholder="Select collection..." />
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
          </div>

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
  index,
  isSkipped,
  isExpanded,
  onResolve,
  onSkip,
  onUnskip,
  onToggleExpand,
}: {
  entry: MatchedEntry;
  index: number;
  isSkipped: boolean;
  isExpanded: boolean;
  onResolve: (index: number, printing: Printing) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onToggleExpand: (index: number) => void;
}) {
  const { icon: StatusIcon, className: statusColor } = STATUS_CONFIG[entry.status];
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronRightIcon;
  const rawFieldEntries = Object.entries(entry.entry.rawFields);

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

          {entry.status === "unresolved" && (
            <span className="text-muted-foreground text-xs">No match found</span>
          )}

          {entry.candidates.length > 0 && (
            <VariantPicker
              candidates={entry.candidates}
              resolved={entry.resolvedPrinting}
              onSelect={(printing) => onResolve(index, printing)}
            />
          )}

          {isSkipped ? (
            <Button variant="ghost" size="xs" onClick={() => onUnskip(index)}>
              Undo
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

function formatImportPrintingLabel(printing: Printing): string {
  const label = formatPrintingLabel(printing);
  if (label === "Standard") {
    return formatCardId(printing);
  }
  return `${formatCardId(printing)} · ${label}`;
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
    >
      <SelectTrigger size="sm" className="h-7 w-auto text-xs">
        <SelectValue placeholder="Pick variant...">
          {resolved ? formatImportPrintingLabel(resolved) : undefined}
        </SelectValue>
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
