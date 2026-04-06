import type { DeckFormat, DeckResponse, DeckZone, Printing } from "@openrift/shared";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  FileUpIcon,
  Loader2Icon,
  SearchIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { catalogQueryOptions, useCards } from "@/hooks/use-cards";
import { useDebounce } from "@/hooks/use-debounce";
import { useCreateDeck, useSaveDeckCards } from "@/hooks/use-decks";
import { enumsQueryOptions, useZoneOrder } from "@/hooks/use-enums";
import type { DeckMatchStatus, DeckMatchedEntry, ResolvedCard } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import type { DeckImportFormat } from "@/lib/deck-import-parsers";
import { parseDeckImportData } from "@/lib/deck-import-parsers";
import { cn } from "@/lib/utils";

const STATUS_SORT_ORDER: Record<DeckMatchStatus, number> = {
  exact: 0,
  ambiguous: 1,
  fuzzy: 2,
  unresolved: 3,
};

export const Route = createFileRoute("/_app/_authenticated/decks/import")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(catalogQueryOptions),
      context.queryClient.ensureQueryData(enumsQueryOptions),
    ]);
  },
  component: DeckImportPage,
});

type ImportStep = "input" | "preview";

const DECK_FORMAT_LABELS: Record<string, string> = {
  standard: "Standard",
  freeform: "Freeform",
};

const IMPORT_PLACEHOLDERS: Record<DeckImportFormat, string> = {
  piltover: "Paste a Piltover Archive deck code...",
  text: "Legend:\n1 Card Name\n\nMainDeck:\n3 Card Name\n...",
  tts: "OGN-001 OGN-002 OGN-003 ...",
};

function DeckImportPage() {
  const { allPrintings } = useCards();
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const createDeck = useCreateDeck();
  const saveDeckCards = useSaveDeckCards();
  const navigate = useNavigate();

  const [step, setStep] = useState<ImportStep>("input");
  const [rawText, setRawText] = useState("");
  const [importFormat, setImportFormat] = useState<DeckImportFormat>("piltover");
  const [deckName, setDeckName] = useState("Imported Deck");
  const [deckFormat, setDeckFormat] = useState<DeckFormat>("standard");
  const [matchedEntries, setMatchedEntries] = useState<DeckMatchedEntry[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleParse = (text: string) => {
    const { entries, warnings } = parseDeckImportData(text, importFormat);
    setParseWarnings(warnings);

    if (entries.length === 0) {
      return;
    }

    const matched = matchDeckEntries(entries, allPrintings);
    const zoneIndex = Object.fromEntries(zoneOrder.map((slug, index) => [slug, index]));
    const sorted = matched.toSorted((entryA, entryB) => {
      const zoneDiff = (zoneIndex[entryA.zone] ?? 99) - (zoneIndex[entryB.zone] ?? 99);
      if (zoneDiff !== 0) {
        return zoneDiff;
      }
      return STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status];
    });
    setMatchedEntries(sorted);
    setSkippedIndices(new Set());

    // Auto-expand non-exact entries so the user sees what needs attention
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
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const handleResolve = (index: number, card: ResolvedCard) => {
    setMatchedEntries((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              resolvedCard: card,
              status: "exact" as DeckMatchStatus,
              zone: entry.entry.explicitZone ?? entry.zone,
            }
          : entry,
      ),
    );
  };

  const handleZoneChange = (index: number, zone: DeckZone) => {
    setMatchedEntries((prev) =>
      prev.map((entry, entryIndex) => (entryIndex === index ? { ...entry, zone } : entry)),
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
    (entry, index) => entry.resolvedCard && !skippedIndices.has(index),
  );
  const needsAttention = matchedEntries.filter(
    (entry, index) => !entry.resolvedCard && !skippedIndices.has(index),
  );
  const skippedCount = skippedIndices.size;
  const totalCards = readyEntries.reduce((sum, entry) => sum + entry.entry.quantity, 0);

  const handleImport = () => {
    const trimmedName = deckName.trim();
    if (!trimmedName) {
      toast.error("Please enter a deck name.");
      return;
    }

    setIsImporting(true);

    // Build deck cards payload — group by cardId + zone, summing quantities
    const cardMap = new Map<string, { cardId: string; zone: DeckZone; quantity: number }>();
    for (const entry of readyEntries) {
      if (!entry.resolvedCard) {
        continue;
      }
      const key = `${entry.resolvedCard.cardId}::${entry.zone}`;
      const existing = cardMap.get(key);
      if (existing) {
        existing.quantity += entry.entry.quantity;
      } else {
        cardMap.set(key, {
          cardId: entry.resolvedCard.cardId,
          zone: entry.zone,
          quantity: entry.entry.quantity,
        });
      }
    }
    const cards = [...cardMap.values()];

    createDeck.mutate(
      { name: trimmedName, format: deckFormat },
      {
        onSuccess: (data) => {
          const deck = data as DeckResponse;
          saveDeckCards.mutate(
            { deckId: deck.id, cards },
            {
              onSuccess: () => {
                toast.success(`Imported deck "${trimmedName}" with ${totalCards} cards.`);
                void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
              },
              onError: () => {
                toast.error("Failed to save deck cards.");
                setIsImporting(false);
              },
            },
          );
        },
        onError: () => {
          toast.error("Failed to create deck.");
          setIsImporting(false);
        },
      },
    );
  };

  if (step === "input") {
    return (
      <InputStep
        rawText={rawText}
        onTextChange={setRawText}
        importFormat={importFormat}
        onImportFormatChange={setImportFormat}
        onParse={handleParse}
        onFileUpload={handleFileUpload}
        fileRef={fileRef}
        parseWarnings={parseWarnings}
      />
    );
  }

  return (
    <PreviewStep
      matchedEntries={matchedEntries}
      allPrintings={allPrintings}
      parseWarnings={parseWarnings}
      skippedIndices={skippedIndices}
      expandedIndices={expandedIndices}
      deckName={deckName}
      deckFormat={deckFormat}
      zoneOrder={zoneOrder}
      zoneLabels={zoneLabels}
      readyCount={readyEntries.length}
      needsAttentionCount={needsAttention.length}
      skippedCount={skippedCount}
      totalCards={totalCards}
      isImporting={isImporting}
      onResolve={handleResolve}
      onZoneChange={handleZoneChange}
      onSkip={handleSkip}
      onUnskip={handleUnskip}
      onToggleExpand={handleToggleExpand}
      onDeckNameChange={setDeckName}
      onDeckFormatChange={setDeckFormat}
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
  importFormat,
  onImportFormatChange,
  onParse,
  onFileUpload,
  fileRef,
  parseWarnings,
}: {
  rawText: string;
  onTextChange: (text: string) => void;
  importFormat: DeckImportFormat;
  onImportFormatChange: (format: DeckImportFormat) => void;
  onParse: (text: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  parseWarnings: string[];
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <h2 className="text-lg font-semibold">Import Deck</h2>
        <p className="text-muted-foreground text-sm">
          Paste a deck code, text list, or TTS string to import a deck. Want another format
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

      <Tabs
        value={importFormat}
        onValueChange={(value) => onImportFormatChange(value as DeckImportFormat)}
      >
        <TabsList>
          <TabsTrigger value="piltover">Deck Code</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="tts">TTS</TabsTrigger>
        </TabsList>

        <TabsContent value={importFormat}>
          <div className="space-y-3">
            <Textarea
              value={rawText}
              onChange={(event) => onTextChange(event.target.value)}
              placeholder={IMPORT_PLACEHOLDERS[importFormat]}
              className={cn(
                "font-mono text-xs",
                importFormat === "piltover" ? "min-h-[80px]" : "min-h-[200px]",
              )}
            />

            <div className="flex items-center gap-3">
              <Button onClick={() => onParse(rawText)} disabled={rawText.trim().length === 0}>
                <UploadIcon className="mr-2 size-4" />
                Parse
              </Button>

              {importFormat === "text" && (
                <>
                  <div className="text-muted-foreground text-sm">or</div>
                  <Button variant="outline" onClick={() => fileRef.current?.click()}>
                    <FileUpIcon className="mr-2 size-4" />
                    Upload file
                  </Button>
                  <Input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.csv,text/plain"
                    onChange={onFileUpload}
                    className="hidden"
                  />
                </>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {parseWarnings.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
          {parseWarnings.map((warning) => (
            <p key={warning} className="text-sm text-red-700 dark:text-red-400">
              {warning}
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

function PreviewStep({
  matchedEntries,
  allPrintings,
  parseWarnings,
  skippedIndices,
  expandedIndices,
  deckName,
  deckFormat,
  zoneOrder,
  zoneLabels,
  readyCount,
  needsAttentionCount,
  skippedCount,
  totalCards,
  isImporting,
  onResolve,
  onZoneChange,
  onSkip,
  onUnskip,
  onToggleExpand,
  onDeckNameChange,
  onDeckFormatChange,
  onImport,
  onBack,
}: {
  matchedEntries: DeckMatchedEntry[];
  allPrintings: Printing[];
  parseWarnings: string[];
  skippedIndices: Set<number>;
  expandedIndices: Set<number>;
  deckName: string;
  deckFormat: DeckFormat;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  readyCount: number;
  needsAttentionCount: number;
  skippedCount: number;
  totalCards: number;
  isImporting: boolean;
  onResolve: (index: number, card: ResolvedCard) => void;
  onZoneChange: (index: number, zone: DeckZone) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onToggleExpand: (index: number) => void;
  onDeckNameChange: (name: string) => void;
  onDeckFormatChange: (format: DeckFormat) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const canImport = readyCount > 0 && deckName.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Import Preview</h2>
          <p className="text-muted-foreground text-sm">
            {matchedEntries.length} card{matchedEntries.length === 1 ? "" : "s"} parsed
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>
          Back
        </Button>
      </div>

      {/* Entry list */}
      <div className="divide-border divide-y rounded-md border">
        {matchedEntries.map((entry, index) => (
          <DeckImportEntryRow
            key={`${entry.entry.shortCode ?? entry.entry.cardName ?? ""}-${entry.zone}-${index}`}
            entry={entry}
            allPrintings={allPrintings}
            index={index}
            zoneOrder={zoneOrder}
            zoneLabels={zoneLabels}
            isSkipped={skippedIndices.has(index)}
            isExpanded={expandedIndices.has(index)}
            onResolve={onResolve}
            onZoneChange={onZoneChange}
            onSkip={onSkip}
            onUnskip={onUnskip}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>

      {/* Parse warnings */}
      {parseWarnings.length > 0 && (
        <details className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            {parseWarnings.length} warning{parseWarnings.length === 1 ? "" : "s"}
          </summary>
          <div className="border-t border-amber-200 px-3 py-2 dark:border-amber-900">
            {parseWarnings.map((warning) => (
              <p key={warning} className="text-sm text-amber-700 dark:text-amber-400">
                {warning}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Summary + deck options + import button */}
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
            <Label htmlFor="preview-deck-name">Deck name</Label>
            <Input
              id="preview-deck-name"
              value={deckName}
              onChange={(event) => onDeckNameChange(event.target.value)}
              className="w-[200px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preview-deck-format">Format</Label>
            <Select
              value={deckFormat}
              onValueChange={(value) => onDeckFormatChange(value as DeckFormat)}
            >
              <SelectTrigger id="preview-deck-format" className="mb-0 w-[140px]">
                <SelectValue>{(value: string) => DECK_FORMAT_LABELS[value] ?? value}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="freeform">Freeform</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={onImport} disabled={!canImport || isImporting}>
            {isImporting ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Import {totalCards} {totalCards === 1 ? "card" : "cards"}
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

const STATUS_CONFIG: Record<DeckMatchStatus, { icon: React.ElementType; className: string }> = {
  exact: { icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  ambiguous: { icon: AlertTriangleIcon, className: "text-amber-600 dark:text-amber-400" },
  fuzzy: { icon: CircleHelpIcon, className: "text-amber-600 dark:text-amber-400" },
  unresolved: { icon: XCircleIcon, className: "text-red-600 dark:text-red-400" },
};

function DeckImportEntryRow({
  entry,
  allPrintings,
  index,
  zoneOrder,
  zoneLabels,
  isSkipped,
  isExpanded,
  onResolve,
  onZoneChange,
  onSkip,
  onUnskip,
  onToggleExpand,
}: {
  entry: DeckMatchedEntry;
  allPrintings: Printing[];
  index: number;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  isSkipped: boolean;
  isExpanded: boolean;
  onResolve: (index: number, card: ResolvedCard) => void;
  onZoneChange: (index: number, zone: DeckZone) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onToggleExpand: (index: number) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const { icon: StatusIcon, className: statusColor } = STATUS_CONFIG[entry.status];
  const ChevronIcon = isExpanded ? ChevronDownIcon : ChevronRightIcon;
  const rawFieldEntries = Object.entries(entry.entry.rawFields);
  const displayName =
    entry.resolvedCard?.cardName ?? entry.entry.cardName ?? entry.entry.shortCode ?? "Unknown";

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

        {entry.entry.shortCode && (
          <span className="text-muted-foreground shrink-0 text-xs">{entry.entry.shortCode}</span>
        )}

        <span className="min-w-0 flex-1 truncate font-medium">
          {displayName}
          <span className="text-muted-foreground ml-1.5 text-xs font-normal">
            {zoneLabels[entry.zone]}
          </span>
        </span>

        <div className="flex shrink-0 items-center gap-2">
          {entry.status === "fuzzy" && (
            <span className="text-muted-foreground text-xs">
              Did you mean <em>{entry.suggestedName}</em>?
            </span>
          )}

          {showSearch ? (
            <CardSearch
              allPrintings={allPrintings}
              onSelect={(card) => {
                onResolve(index, card);
                setShowSearch(false);
              }}
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

          <ZonePicker
            zone={entry.zone}
            zoneOrder={zoneOrder}
            zoneLabels={zoneLabels}
            onZoneChange={(zone) => onZoneChange(index, zone)}
          />

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

// ---------------------------------------------------------------------------
// Zone picker
// ---------------------------------------------------------------------------

function ZonePicker({
  zone,
  zoneOrder,
  zoneLabels,
  onZoneChange,
}: {
  zone: DeckZone;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  onZoneChange: (zone: DeckZone) => void;
}) {
  // Overflow is not user-assignable
  const assignableZones = zoneOrder.filter((zoneSlug) => zoneSlug !== "overflow");

  return (
    <Select
      value={zone}
      onValueChange={(value) => onZoneChange(value as DeckZone)}
      items={Object.fromEntries(assignableZones.map((zoneKey) => [zoneKey, zoneLabels[zoneKey]]))}
    >
      <SelectTrigger size="sm" className="h-7 w-auto text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-auto">
        {assignableZones.map((zoneKey) => (
          <SelectItem key={zoneKey} value={zoneKey} className="py-1.5">
            {zoneLabels[zoneKey]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Card search (for correction UI)
// ---------------------------------------------------------------------------

function CardSearch({
  allPrintings,
  onSelect,
}: {
  allPrintings: Printing[];
  onSelect: (card: ResolvedCard) => void;
}) {
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const debouncedSearch = useDebounce(search, 150);

  // Deduplicate to unique cards (not printings)
  const results =
    debouncedSearch.length >= 2
      ? deduplicateToCards(allPrintings, debouncedSearch).slice(0, 20)
      : [];

  const visible = showResults && search.length >= 2;
  const activeOptionId = activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  function scrollActiveIntoView(index: number) {
    const item = listRef.current?.children[index] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!visible || results.length === 0) {
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = activeIndex < results.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(next);
        scrollActiveIntoView(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prev = activeIndex > 0 ? activeIndex - 1 : results.length - 1;
        setActiveIndex(prev);
        scrollActiveIntoView(prev);
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          onSelect(results[activeIndex]);
          setShowResults(false);
          setActiveIndex(-1);
        }
        break;
      }
      case "Escape": {
        event.preventDefault();
        setShowResults(false);
        setActiveIndex(-1);
        break;
      }
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        role="combobox"
        aria-expanded={visible && results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        placeholder="Search cards..."
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setShowResults(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setShowResults(true)}
        onBlur={(event) => {
          if (!containerRef.current?.contains(event.relatedTarget)) {
            setShowResults(false);
            setActiveIndex(-1);
          }
        }}
        onKeyDown={handleKeyDown}
        className="border-input bg-background placeholder:text-muted-foreground focus:ring-ring h-7 w-44 rounded-md border px-2 text-xs focus:ring-1 focus:outline-none"
      />
      {visible && results.length > 0 && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="bg-popover absolute top-full right-0 z-50 mt-1 max-h-60 w-max min-w-full overflow-y-auto rounded-md border shadow-md"
        >
          {results.map((card, resultIndex) => (
            <button
              key={card.cardId}
              id={`${listboxId}-option-${resultIndex}`}
              role="option"
              aria-selected={resultIndex === activeIndex}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                resultIndex === activeIndex ? "bg-muted" : "hover:bg-muted",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(resultIndex)}
              onClick={() => {
                onSelect(card);
                setShowResults(false);
                setActiveIndex(-1);
              }}
            >
              <span className="truncate font-medium">{card.cardName}</span>
              <span className="text-muted-foreground shrink-0">{card.shortCode}</span>
            </button>
          ))}
        </div>
      )}
      {visible && results.length === 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="bg-popover absolute top-full right-0 z-50 mt-1 w-full rounded-md border px-3 py-2 shadow-md"
        >
          <p className="text-muted-foreground text-xs">No matching cards</p>
        </div>
      )}
    </div>
  );
}

/**
 * Filters printings by query and deduplicates to unique cards.
 * @returns ResolvedCard array with one entry per unique card.
 */
function deduplicateToCards(allPrintings: Printing[], query: string): ResolvedCard[] {
  const lower = query.toLowerCase();
  const seen = new Set<string>();
  const results: ResolvedCard[] = [];

  for (const printing of allPrintings) {
    if (seen.has(printing.card.id)) {
      continue;
    }
    if (
      printing.card.name.toLowerCase().includes(lower) ||
      printing.shortCode.toLowerCase().includes(lower)
    ) {
      seen.add(printing.card.id);
      results.push({
        cardId: printing.card.id,
        cardName: printing.card.name,
        cardType: printing.card.type,
        superTypes: printing.card.superTypes,
        domains: printing.card.domains,
        shortCode: printing.shortCode,
      });
    }
  }

  return results;
}
