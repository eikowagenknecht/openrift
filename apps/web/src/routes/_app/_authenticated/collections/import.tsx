import type { Printing } from "@openrift/shared";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
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
import { useAddCopies } from "@/hooks/use-copies";
import { formatCardId, formatPrintingLabel } from "@/lib/format";
import type { MatchStatus, MatchedEntry } from "@/lib/import-matcher";
import { matchEntries } from "@/lib/import-matcher";
import { parseImportData } from "@/lib/import-parsers";
import { cn } from "@/lib/utils";

import { useCollectionTitle } from "./route";

export const Route = createFileRoute("/_app/_authenticated/collections/import")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(collectionsQueryOptions),
    ]);
  },
  component: ImportPage,
});

type ImportStep = "input" | "preview";

function ImportPage() {
  useCollectionTitle("Import Collection");

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
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = (text: string) => {
    const { entries, errors } = parseImportData(text);
    setParseErrors(errors);

    if (entries.length === 0) {
      return;
    }

    const matched = matchEntries(entries, allPrintings);
    setMatchedEntries(matched);
    setSkippedIndices(new Set());
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
      toast.success(`Imported ${totalCards} card${totalCards === 1 ? "" : "s"}.`);
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
      <InputStep
        rawText={rawText}
        onTextChange={setRawText}
        onParse={handleParse}
        onFileUpload={handleFileUpload}
        fileRef={fileRef}
        parseErrors={parseErrors}
      />
    );
  }

  return (
    <PreviewStep
      matchedEntries={matchedEntries}
      skippedIndices={skippedIndices}
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
      onCollectionChange={setCollectionId}
      onNewCollectionNameChange={setNewCollectionName}
      onImport={handleImport}
      onBack={() => setStep("input")}
    />
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
          Paste or upload a CSV export from Piltover Archive or RiftCore.
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
  skippedIndices,
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
  onCollectionChange,
  onNewCollectionNameChange,
  onImport,
  onBack,
}: {
  matchedEntries: MatchedEntry[];
  skippedIndices: Set<number>;
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
            {matchedEntries.length} line{matchedEntries.length === 1 ? "" : "s"} parsed
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
            onResolve={onResolve}
            onSkip={onSkip}
            onUnskip={onUnskip}
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
                Import {totalCards} card{totalCards === 1 ? "" : "s"}
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
  onResolve,
  onSkip,
  onUnskip,
}: {
  entry: MatchedEntry;
  index: number;
  isSkipped: boolean;
  onResolve: (index: number, printing: Printing) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
}) {
  const { icon: StatusIcon, className: statusColor } = STATUS_CONFIG[entry.status];

  return (
    <div className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", isSkipped && "opacity-40")}>
      <StatusIcon className={cn("size-4 shrink-0", statusColor)} />

      <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
        {entry.entry.quantity}&times;
      </span>

      <span className="min-w-0 flex-1 truncate font-medium">{entry.entry.cardName}</span>

      <div className="flex shrink-0 items-center gap-2">
        {entry.status === "exact" && entry.resolvedPrinting && (
          <PrintingLabel printing={entry.resolvedPrinting} />
        )}

        {entry.status === "ambiguous" && (
          <VariantPicker
            candidates={entry.candidates}
            resolved={entry.resolvedPrinting}
            onSelect={(printing) => onResolve(index, printing)}
          />
        )}

        {entry.status === "fuzzy" && (
          <>
            <span className="text-muted-foreground text-xs">
              Did you mean <em>{entry.suggestedName}</em>?
            </span>
            {entry.resolvedPrinting ? (
              <PrintingLabel printing={entry.resolvedPrinting} />
            ) : (
              <VariantPicker
                candidates={entry.candidates}
                resolved={null}
                onSelect={(printing) => onResolve(index, printing)}
              />
            )}
          </>
        )}

        {entry.status === "unresolved" && (
          <span className="text-muted-foreground text-xs">No match found</span>
        )}

        {isSkipped ? (
          <Button variant="ghost" size="xs" onClick={() => onUnskip(index)}>
            Undo
          </Button>
        ) : (
          (entry.status === "unresolved" ||
            (entry.status !== "exact" && !entry.resolvedPrinting)) && (
            <Button variant="ghost" size="xs" onClick={() => onSkip(index)}>
              Skip
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function PrintingLabel({ printing }: { printing: Printing }) {
  return (
    <span className="text-muted-foreground text-xs">
      {formatCardId(printing)} &middot; {formatPrintingLabel(printing)}
    </span>
  );
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
        <SelectValue placeholder="Pick variant..." />
      </SelectTrigger>
      <SelectContent>
        {candidates.map((printing) => (
          <SelectItem key={printing.id} value={printing.id}>
            {formatCardId(printing)} &middot; {formatPrintingLabel(printing, candidates)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
