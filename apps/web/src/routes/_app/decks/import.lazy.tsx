import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { linkHostLabel } from "@openrift/shared/link-hosts";
import type {
  DeckFormatConfig,
  DeckResponse,
  PublicDeckDetailResponse,
} from "@openrift/shared/types/api/deck";
import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import { cardSearchAltNames, legendDisplayName } from "@openrift/shared/utils";
import { WellKnown } from "@openrift/shared/well-known";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileUpIcon,
  Loader2Icon,
  SearchIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CardSearchDropdown } from "@/components/cards/card-search-dropdown";
import { CardThumbnail } from "@/components/cards/printing-option-content";
import { DeckImportSummary } from "@/components/deck/deck-import-summary";
import {
  ImportStatusBadges,
  ImportToVerifyNote,
  ImportTroubleNote,
} from "@/components/import/import-preview-chrome";
import { ImportRowRawFields, ImportRowShell } from "@/components/import/import-row-shell";
import {
  PageDescription,
  PageTopBar,
  PageTopBarIconButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Accordion, AccordionContent, AccordionItem } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { handleImportFileUpload } from "@/hooks/import-flow-shared";
import { useCardSearch } from "@/hooks/use-card-search";
import { useCards } from "@/hooks/use-cards";
import {
  deckDetailQueryOptions,
  publicDeckQueryOptions,
  useCreateDeck,
  useSaveDeckCards,
} from "@/hooks/use-decks";
import { useDeckFormatList, useZoneOrder } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useUserId } from "@/lib/auth-session";
import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { dedupeMatchedEntries } from "@/lib/deck-import-cards";
import type { DeckMatchStatus, DeckMatchedEntry, ResolvedCard } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import type { DeckImportEntry, DeckImportFormat } from "@/lib/deck-import-parsers";
import {
  entriesFromSharedDeck,
  extractDeckFromUrl,
  parseDeckImportAuto,
  parseDeckImportData,
  sniffDeckImportFormat,
} from "@/lib/deck-import-parsers";
import { resolveReplaceTarget } from "@/lib/deck-import-replace";
import type { ImportBucket } from "@/lib/import-summary";
import { classifyBucket } from "@/lib/import-summary";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";
import { useLocalDecksStore } from "@/stores/local-decks-store";

export const Route = createLazyFileRoute("/_app/decks/import")({
  component: DeckImportPage,
});

const DEFAULT_IMPORT_DECK_NAME = "Imported Deck";

function entryRowId(index: number): string {
  return `deck-import-entry-${index}`;
}

const STATUS_SORT_ORDER: Record<DeckMatchStatus, number> = {
  unresolved: 0,
  "needs-review": 1,
  exact: 2,
};

function entryDisplayName(entry: DeckMatchedEntry): string {
  return (
    entry.resolvedCard?.cardName ??
    entry.entry.cardName ??
    entry.entry.shortCode ??
    ""
  ).toLowerCase();
}

type ImportStep = "input" | "preview";

type DeckImportMode = "auto" | DeckImportFormat;

const IMPORT_MODE_LABELS: Record<DeckImportMode, string> = {
  auto: "Detect automatically",
  text: "Text",
  piltover: "Deck Code",
  tts: "TTS",
};

const IMPORT_MODE_ORDER: DeckImportMode[] = ["auto", "text", "piltover", "tts"];

const DETECTED_FORMAT_LABELS: Record<DeckImportFormat, string> = {
  piltover: "deck code",
  text: "text list",
  tts: "TTS string",
};

const IMPORT_PLACEHOLDERS: Record<DeckImportMode, string> = {
  auto: "Paste your deck here...",
  piltover: "Paste a Piltover Archive deck code...",
  text: "Legend:\n1 Card Name\n\nMainDeck:\n3 Card Name\n...",
  tts: "OGN-001-1 OGN-002-1 OGN-003-1 ...",
};

const IMPORT_DESCRIPTIONS: Record<DeckImportMode, React.ReactNode> = {
  auto: <>The format is detected automatically. Pick one above if detection gets it wrong.</>,
  piltover: (
    <>
      A compact code generated by{" "}
      <a
        href="https://piltoverarchive.com"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Piltover Archive
      </a>
      . Copy it from the deck builder&apos;s share/export button.
    </>
  ),
  text: (
    <>
      One card per line as &quot;quantity name&quot;, with optional zone headers like
      &quot;Legend:&quot;. Without headers, cards are sorted into zones by type.
    </>
  ),
  tts: (
    <>
      A space-separated list of short codes (e.g. OGN-001) used by the{" "}
      <a
        href="https://steamcommunity.com/sharedfiles/filedetails/?id=3606647746"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Tabletop Simulator mod
      </a>
      .
    </>
  ),
};

function DeckImportPage() {
  const userId = useUserId();
  const {
    replaceDeckId,
    code: prefillCode,
    name: prefillName,
    source: prefillSource,
  } = Route.useSearch();
  const { allPrintings } = useCards();
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const { formats: deckFormats, labels: deckFormatLabels } = useDeckFormatList();
  const createDeck = useCreateDeck();
  const saveDeckCards = useSaveDeckCards();
  const navigate = useNavigate();

  const localDecks = useLocalDecksStore((state) => state.decks);
  const replaceTarget = resolveReplaceTarget(
    replaceDeckId,
    Boolean(userId),
    (id) => localDecks[id] !== undefined,
  );
  const replaceDeckQuery = useQuery({
    ...deckDetailQueryOptions(userId ?? "", replaceDeckId ?? ""),
    enabled: replaceTarget.mode === "server",
  });
  // Replace mode keeps the target's own name, format, and format config.
  const replaceTargetDeck =
    replaceTarget.mode === "local"
      ? localDecks[replaceTarget.deckId]
      : replaceTarget.mode === "server"
        ? replaceDeckQuery.data?.deck
        : undefined;
  const replaceDeckName = replaceTargetDeck?.name;
  const isReplaceMode = replaceTarget.mode !== "none";

  const queryClient = useQueryClient();

  const [step, setStep] = useState<ImportStep>("input");
  const [rawText, setRawText] = useState("");
  const [importMode, setImportMode] = useState<DeckImportMode>("auto");
  const [deckName, setDeckName] = useState("");
  const [deckFormat, setDeckFormat] = useState<DeckFormat>(deckFormats[0]?.slug ?? "");
  const [matchedEntries, setMatchedEntries] = useState<DeckMatchedEntry[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [expandedValues, setExpandedValues] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [sourceLinkDropped, setSourceLinkDropped] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sourceLink = sourceLinkDropped || isReplaceMode ? undefined : prefillSource;

  const finishParse = (entries: DeckImportEntry[], warnings: string[]) => {
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
      const nameA = entryDisplayName(entryA);
      const nameB = entryDisplayName(entryB);
      if (nameA !== nameB) {
        return nameA.localeCompare(nameB);
      }
      return STATUS_SORT_ORDER[entryA.status] - STATUS_SORT_ORDER[entryB.status];
    });
    setMatchedEntries(sorted);
    setSkippedIndices(new Set());

    const nonExact: string[] = [];
    for (const [index, entry] of sorted.entries()) {
      if (entry.status !== "exact") {
        nonExact.push(String(index));
      }
    }
    setExpandedValues(nonExact);

    setStep("preview");
  };

  const resolveShareLink = async (token: string) => {
    setIsResolvingLink(true);
    // No try/finally: the React Compiler can't yet compile finalizer clauses.
    // The catch never rethrows, so the reset below still runs on both paths.
    let data: PublicDeckDetailResponse | null = null;
    try {
      data = await queryClient.query(publicDeckQueryOptions(token));
    } catch (error) {
      setParseWarnings([
        error instanceof Error && error.message === "NOT_FOUND"
          ? "That share link doesn't point to a shared deck anymore. It may have been unshared or the link rotated."
          : "Couldn't load the shared deck. Please try again.",
      ]);
    }
    setIsResolvingLink(false);
    if (!data) {
      return;
    }

    if (!isReplaceMode) {
      setDeckName(data.deck.name);
      if (deckFormats.some((format) => format.slug === data.deck.format)) {
        setDeckFormat(data.deck.format);
      }
    }
    if (data.cards.length === 0) {
      setParseWarnings(["That shared deck has no cards to import."]);
      return;
    }
    setSourceNote("from a shared deck link");
    finishParse(entriesFromSharedDeck(data.cards), []);
  };

  const handleParse = async (text: string) => {
    setSourceNote(null);

    // A pasted URL is always resolved as a share link or embedded deck code, never parsed as deck content.
    const urlSniff = extractDeckFromUrl(text);
    if (urlSniff) {
      switch (urlSniff.kind) {
        case "share-token": {
          await resolveShareLink(urlSniff.token);
          return;
        }
        case "deck-code": {
          setSourceNote("deck code found in the pasted link");
          const { entries, warnings } = parseDeckImportData(urlSniff.code, "piltover");
          finishParse(entries, warnings);
          return;
        }
        case "url-no-deck": {
          setParseWarnings([
            "Couldn't find a deck code or share link in that URL. Paste the deck itself instead.",
          ]);
          return;
        }
      }
    }

    const format = importMode === "auto" ? sniffDeckImportFormat(text) : importMode;
    if (importMode === "auto") {
      setSourceNote(`detected as ${DETECTED_FORMAT_LABELS[format]}`);
    }
    const { entries, warnings } = parseDeckImportData(text, format);
    finishParse(entries, warnings);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    void handleImportFileUpload(event, fileRef, setRawText, handleParse);
  };

  // ?code=<deck code or URL-encoded text list> auto-parses; no manual Parse click required.
  const autoParsedRef = useRef(false);
  useEffect(() => {
    if (!prefillCode || autoParsedRef.current) {
      return;
    }
    autoParsedRef.current = true;
    setRawText(prefillCode);
    if (prefillName) {
      setDeckName(prefillName);
    }
    const { format, entries, warnings } = parseDeckImportAuto(prefillCode);
    setSourceNote(`${DETECTED_FORMAT_LABELS[format]} from the link`);
    finishParse(entries, warnings);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount; the ref guard keeps re-runs out
  }, [prefillCode]);

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

  const importableEntries = matchedEntries.filter(
    (entry, index) => entry.resolvedCard && !skippedIndices.has(index),
  );
  const importCards = dedupeMatchedEntries(importableEntries);
  const summaryFormat = replaceTargetDeck?.format ?? deckFormat;
  const summaryFormatConfig = replaceTargetDeck?.formatConfig ?? null;
  const visibleBuckets = matchedEntries
    .filter((_entry, index) => !skippedIndices.has(index))
    .map((entry) => classifyBucket(entry.status, entry.resolvedCard !== null));
  const readyCount = visibleBuckets.filter((bucket) => bucket === "ready").length;
  const toVerifyCount = visibleBuckets.filter((bucket) => bucket === "to-verify").length;
  const needsAttentionCount = visibleBuckets.filter((bucket) => bucket === "need-attention").length;
  const skippedCount = skippedIndices.size;
  const totalCards = importableEntries.reduce((sum, entry) => sum + entry.entry.quantity, 0);

  const executeReplace = () => {
    if (replaceTarget.mode === "none") {
      return;
    }
    const targetName = replaceDeckName ?? "deck";
    setIsImporting(true);
    if (replaceTarget.mode === "local") {
      useLocalDecksStore.getState().setCards(replaceTarget.deckId, importCards);
      toast.success(`Replaced cards in "${targetName}" with ${totalCards} cards.`);
      void navigate({ to: "/decks/$deckId", params: { deckId: replaceTarget.deckId } });
      return;
    }
    saveDeckCards.mutate(
      { deckId: replaceTarget.deckId, cards: importCards },
      {
        onSuccess: () => {
          toast.success(`Replaced cards in "${targetName}" with ${totalCards} cards.`);
          void navigate({ to: "/decks/$deckId", params: { deckId: replaceTarget.deckId } });
        },
        // The failure itself is toasted by the global mutation onError; this
        // handler only releases the importing state.
        onError: () => {
          setIsImporting(false);
        },
      },
    );
  };

  const executeCreate = () => {
    const trimmedName = deckName.trim() || DEFAULT_IMPORT_DECK_NAME;
    const links = sourceLink ? [{ url: sourceLink }] : undefined;

    setIsImporting(true);

    if (!userId) {
      const localId = useLocalDecksStore.getState().createDeck(deckFormat, trimmedName);
      useLocalDecksStore.getState().setCards(localId, importCards);
      if (links) {
        useLocalDecksStore.getState().updateDeck(localId, { links });
      }
      toast.success(`Imported deck "${trimmedName}" with ${totalCards} cards.`);
      void navigate({ to: "/decks/$deckId", params: { deckId: localId } });
      return;
    }

    createDeck.mutate(
      { name: trimmedName, format: deckFormat, links },
      {
        onSuccess: (data) => {
          const deck = data as DeckResponse;
          saveDeckCards.mutate(
            { deckId: deck.id, cards: importCards },
            {
              onSuccess: () => {
                toast.success(`Imported deck "${trimmedName}" with ${totalCards} cards.`);
                void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
              },
              onError: () => {
                setIsImporting(false);
              },
            },
          );
        },
        // The failure itself is toasted by the global mutation onError; these
        // handlers only release the importing state.
        onError: () => {
          setIsImporting(false);
        },
      },
    );
  };

  const handleImport = () => {
    if (isReplaceMode) {
      setConfirmReplaceOpen(true);
      return;
    }
    executeCreate();
  };

  if (step === "input") {
    return (
      <InputStep
        rawText={rawText}
        onTextChange={setRawText}
        importMode={importMode}
        onImportModeChange={setImportMode}
        onParse={(text) => void handleParse(text)}
        onFileUpload={handleFileUpload}
        fileRef={fileRef}
        isParsing={isResolvingLink}
        parseWarnings={parseWarnings}
        replaceDeckName={isReplaceMode ? (replaceDeckName ?? "") : undefined}
      />
    );
  }

  return (
    <>
      <PreviewStep
        matchedEntries={matchedEntries}
        allPrintings={allPrintings}
        parseWarnings={parseWarnings}
        sourceNote={sourceNote}
        skippedIndices={skippedIndices}
        expandedValues={expandedValues}
        deckName={deckName}
        deckFormat={deckFormat}
        deckFormats={deckFormats}
        deckFormatLabels={deckFormatLabels}
        zoneOrder={zoneOrder}
        zoneLabels={zoneLabels}
        readyCount={readyCount}
        toVerifyCount={toVerifyCount}
        needsAttentionCount={needsAttentionCount}
        importableCount={importableEntries.length}
        skippedCount={skippedCount}
        totalCards={totalCards}
        importCards={importCards}
        summaryFormat={summaryFormat}
        summaryFormatConfig={summaryFormatConfig}
        isLoggedIn={Boolean(userId)}
        isImporting={isImporting}
        replaceDeckName={isReplaceMode ? (replaceDeckName ?? "") : undefined}
        sourceLink={sourceLink}
        onDropSourceLink={() => setSourceLinkDropped(true)}
        onResolve={handleResolve}
        onZoneChange={handleZoneChange}
        onSkip={handleSkip}
        onUnskip={handleUnskip}
        onExpandedValuesChange={setExpandedValues}
        onDeckNameChange={setDeckName}
        onDeckFormatChange={setDeckFormat}
        onImport={handleImport}
        onBack={() => setStep("input")}
      />
      <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <AlertDialogContent>
          <DialogForm
            onSubmit={() => {
              setConfirmReplaceOpen(false);
              executeReplace();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Replace deck contents?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all existing cards in &ldquo;{replaceDeckName ?? "this deck"}
                &rdquo; and replace them with the {totalCards} imported{" "}
                {totalCards === 1 ? "card" : "cards"}. The deck&apos;s name and format are kept.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" variant="destructive">
                Replace
              </AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InputStep({
  rawText,
  onTextChange,
  importMode,
  onImportModeChange,
  onParse,
  onFileUpload,
  fileRef,
  isParsing,
  parseWarnings,
  replaceDeckName,
}: {
  rawText: string;
  onTextChange: (text: string) => void;
  importMode: DeckImportMode;
  onImportModeChange: (mode: DeckImportMode) => void;
  onParse: (text: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: RefObject<HTMLInputElement | null>;
  isParsing: boolean;
  parseWarnings: string[];
  replaceDeckName?: string;
}) {
  const isReplaceMode = replaceDeckName !== undefined;
  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarTitle>
            {isReplaceMode ? "Replace deck contents" : "Import Deck"}
          </PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "space-y-6 pt-3", PAGE_PADDING_NO_TOP)}>
        <PageDescription>
          {isReplaceMode ? (
            <>
              Paste a text list, deck code, TTS string, or share link, or upload a file. Cards in
              {replaceDeckName ? (
                <>
                  {" "}
                  <strong className="text-foreground">&ldquo;{replaceDeckName}&rdquo;</strong>
                </>
              ) : (
                " this deck"
              )}{" "}
              are replaced. Name and format are kept.
            </>
          ) : (
            <>Paste a text list, deck code, TTS string, or share link, or upload a file.</>
          )}
        </PageDescription>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="import-mode">Format</Label>
            <Select
              value={importMode}
              onValueChange={(value) => {
                if (value !== null) {
                  onImportModeChange(value as DeckImportMode);
                }
              }}
              items={IMPORT_MODE_LABELS}
            >
              <SelectTrigger id="import-mode" className="mb-0 w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_MODE_ORDER.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {IMPORT_MODE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-muted-foreground text-sm">{IMPORT_DESCRIPTIONS[importMode]}</p>
          <Textarea
            value={rawText}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={IMPORT_PLACEHOLDERS[importMode]}
            className={cn(
              // text-base below md: iOS Safari zooms the viewport when a focused
              // field is under 16px, and there is no maximum-scale to stop it.
              "font-mono text-base md:text-xs",
              importMode === "piltover" ? "min-h-[120px]" : "min-h-[240px] sm:min-h-[320px]",
            )}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => onParse(rawText)}
              disabled={rawText.trim().length === 0 || isParsing}
            >
              {isParsing ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <UploadIcon className="mr-2 size-4" />
              )}
              Parse
            </Button>

            <div className="text-muted-foreground text-sm">or</div>

            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileUpIcon className="mr-2 size-4" />
              Upload file
            </Button>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.txt,text/plain"
              onChange={onFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {parseWarnings.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              {parseWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}

function PreviewStep({
  matchedEntries,
  allPrintings,
  parseWarnings,
  sourceNote,
  skippedIndices,
  expandedValues,
  deckName,
  deckFormat,
  deckFormats,
  deckFormatLabels,
  zoneOrder,
  zoneLabels,
  readyCount,
  toVerifyCount,
  needsAttentionCount,
  importableCount,
  skippedCount,
  totalCards,
  importCards,
  summaryFormat,
  summaryFormatConfig,
  isLoggedIn,
  isImporting,
  replaceDeckName,
  sourceLink,
  onDropSourceLink,
  onResolve,
  onZoneChange,
  onSkip,
  onUnskip,
  onExpandedValuesChange,
  onDeckNameChange,
  onDeckFormatChange,
  onImport,
  onBack,
}: {
  matchedEntries: DeckMatchedEntry[];
  allPrintings: Printing[];
  parseWarnings: string[];
  sourceNote: string | null;
  skippedIndices: Set<number>;
  expandedValues: string[];
  deckName: string;
  deckFormat: DeckFormat;
  deckFormats: { slug: string; label: string }[];
  deckFormatLabels: Record<string, string>;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  readyCount: number;
  toVerifyCount: number;
  needsAttentionCount: number;
  importableCount: number;
  skippedCount: number;
  totalCards: number;
  importCards: ImportedDeckCard[];
  summaryFormat: DeckFormat;
  summaryFormatConfig: DeckFormatConfig | null;
  isLoggedIn: boolean;
  isImporting: boolean;
  replaceDeckName?: string;
  sourceLink?: string;
  onDropSourceLink: () => void;
  onResolve: (index: number, card: ResolvedCard) => void;
  onZoneChange: (index: number, zone: DeckZone) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onExpandedValuesChange: (values: string[]) => void;
  onDeckNameChange: (name: string) => void;
  onDeckFormatChange: (format: DeckFormat) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const isReplaceMode = replaceDeckName !== undefined;
  const canImport = importableCount > 0;
  const isMobile = useIsMobile();

  const jumpToFirstNeedsAttention = () => {
    const index = matchedEntries.findIndex(
      (entry, entryIndex) =>
        !skippedIndices.has(entryIndex) &&
        classifyBucket(entry.status, entry.resolvedCard !== null) === "need-attention",
    );
    if (index === -1) {
      return;
    }
    document
      .querySelector(`#${entryRowId(index)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const importButton = (
    <Button
      variant={isReplaceMode ? "destructive" : "default"}
      onClick={onImport}
      disabled={!canImport || isImporting}
      className="w-full sm:w-auto"
    >
      {isImporting ? (
        <>
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          {isReplaceMode ? "Replacing..." : "Importing..."}
        </>
      ) : isReplaceMode ? (
        <>
          Replace with {totalCards} {totalCards === 1 ? "card" : "cards"}
        </>
      ) : (
        <>
          Import {totalCards} {totalCards === 1 ? "card" : "cards"}
        </>
      )}
    </Button>
  );

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarIconButton aria-label="Back" className="mr-1 -ml-2" onClick={onBack}>
            <ArrowLeftIcon />
          </PageTopBarIconButton>
          <PageTopBarTitle>{isReplaceMode ? "Replace Preview" : "Import Preview"}</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "space-y-4 pt-3", PAGE_PADDING_NO_TOP)}>
        <PageDescription>
          {matchedEntries.length} card{matchedEntries.length === 1 ? "" : "s"} parsed
          {sourceNote ? ` (${sourceNote})` : null}
        </PageDescription>

        <DeckImportSummary
          cards={importCards}
          format={summaryFormat}
          formatConfig={summaryFormatConfig}
          deckName={replaceDeckName || deckName.trim() || DEFAULT_IMPORT_DECK_NAME}
          isLoggedIn={isLoggedIn}
        />

        <Accordion
          multiple
          value={expandedValues}
          onValueChange={(value) => onExpandedValuesChange(value as string[])}
          className="divide-border divide-y rounded-md border"
        >
          {matchedEntries.map((entry, index) => (
            <DeckImportEntryRow
              key={`${entry.entry.shortCode ?? entry.entry.cardName ?? ""}-${entry.zone}-${index}`}
              entry={entry}
              allPrintings={allPrintings}
              index={index}
              zoneOrder={zoneOrder}
              zoneLabels={zoneLabels}
              isSkipped={skippedIndices.has(index)}
              onResolve={onResolve}
              onZoneChange={onZoneChange}
              onSkip={onSkip}
              onUnskip={onUnskip}
            />
          ))}
        </Accordion>

        {parseWarnings.length > 0 && (
          <Alert variant="warning">
            <AlertTitle>
              {parseWarnings.length} warning{parseWarnings.length === 1 ? "" : "s"} while parsing
            </AlertTitle>
            <AlertDescription>
              {parseWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-muted/30 space-y-4 rounded-md border p-4">
          <ImportStatusBadges
            readyCount={readyCount}
            toVerifyCount={toVerifyCount}
            needsAttentionCount={needsAttentionCount}
            skippedCount={skippedCount}
            onJumpToNeedsAttention={jumpToFirstNeedsAttention}
          />

          <ImportToVerifyNote count={toVerifyCount} />

          <ImportTroubleNote needsAttentionCount={needsAttentionCount} />

          {sourceLink !== undefined && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Save a link to</span>
              <Badge variant="outline" title={sourceLink}>
                <ExternalLinkIcon className="size-3" />
                {linkHostLabel(sourceLink) ?? sourceLink}
                <ChipRemoveButton
                  aria-label="Don't save the source link"
                  onClick={onDropSourceLink}
                />
              </Badge>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {!isReplaceMode && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="preview-deck-name">Deck name</Label>
                  <Input
                    id="preview-deck-name"
                    value={deckName}
                    onChange={(event) => onDeckNameChange(event.target.value)}
                    placeholder={DEFAULT_IMPORT_DECK_NAME}
                    className="w-full sm:w-[200px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="preview-deck-format">Format</Label>
                  <Select
                    value={deckFormat}
                    onValueChange={(value) => {
                      if (value !== null) {
                        onDeckFormatChange(value);
                      }
                    }}
                  >
                    <SelectTrigger id="preview-deck-format" className="mb-0 w-full sm:w-[140px]">
                      <SelectValue>
                        {(value: string) => deckFormatLabels[value] ?? value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {deckFormats.map((entry) => (
                        <SelectItem key={entry.slug} value={entry.slug}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {!isMobile && importButton}
            {needsAttentionCount > 0 && !isImporting && (
              <span className="text-muted-foreground text-sm">
                (skips {needsAttentionCount} unmatched)
              </span>
            )}
          </div>
        </div>

        {isMobile && (
          <div className="bg-background/80 mx-safe-neg px-safe pb-safe sticky bottom-0 z-20 pt-2 backdrop-blur-lg">
            {importButton}
          </div>
        )}
      </div>
    </>
  );
}

const BUCKET_CONFIG: Record<ImportBucket, { icon: React.ElementType; className: string }> = {
  ready: { icon: CheckCircle2Icon, className: "text-success" },
  "to-verify": { icon: AlertTriangleIcon, className: "text-warning" },
  "need-attention": { icon: XCircleIcon, className: "text-destructive" },
};

function DeckImportEntryRow({
  entry,
  allPrintings,
  index,
  zoneOrder,
  zoneLabels,
  isSkipped,
  onResolve,
  onZoneChange,
  onSkip,
  onUnskip,
}: {
  entry: DeckMatchedEntry;
  allPrintings: Printing[];
  index: number;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  isSkipped: boolean;
  onResolve: (index: number, card: ResolvedCard) => void;
  onZoneChange: (index: number, zone: DeckZone) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
}) {
  const [showSearch, setShowSearch] = useState(false);
  const bucket = classifyBucket(entry.status, entry.resolvedCard !== null);
  const { icon: StatusIcon, className: statusColor } = BUCKET_CONFIG[bucket];
  const rawFieldEntries = Object.entries(entry.entry.rawFields);
  const displayName =
    entry.resolvedCard?.cardName ?? entry.entry.cardName ?? entry.entry.shortCode ?? "Unknown";
  const isMobile = useIsMobile();
  const foldActions = isMobile && bucket === "ready" && !isSkipped;

  const sourceName = entry.entry.cardName?.trim();
  const resolved = entry.resolvedCard;
  const matchedNote =
    resolved && (!sourceName || sourceName.toLowerCase() !== resolved.cardName.toLowerCase()) ? (
      <>
        Matched to <span className="text-foreground font-medium">{resolved.cardName}</span> (
        {resolved.shortCode})
      </>
    ) : null;

  const actions = (
    <>
      {entry.suggestedName && (
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
        size={isMobile ? "icon" : "xs"}
        onClick={() => setShowSearch(!showSearch)}
        aria-label={showSearch ? "Close search" : "Search catalog"}
      >
        {showSearch ? <XCircleIcon className="size-3.5" /> : <SearchIcon className="size-3.5" />}
      </Button>
      <ZonePicker
        zone={entry.zone}
        zoneOrder={zoneOrder}
        zoneLabels={zoneLabels}
        isMobile={isMobile}
        onZoneChange={(zone) => onZoneChange(index, zone)}
      />
      {isSkipped ? (
        <Button variant="ghost" size={isMobile ? "default" : "xs"} onClick={() => onUnskip(index)}>
          Unskip
        </Button>
      ) : (
        <Button variant="ghost" size={isMobile ? "default" : "xs"} onClick={() => onSkip(index)}>
          Skip
        </Button>
      )}
    </>
  );

  const hasDetails = rawFieldEntries.length > 0 || matchedNote !== null;
  const hasPanel = hasDetails || foldActions;

  // `group` sits on whichever element is the accordion trigger, so the
  // chevron's rotation class follows the panel either way.
  const chevronIcon = (
    <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
  );

  const row = (
    <ImportRowShell
      chevron={
        foldActions ? (
          <span className="text-muted-foreground">{chevronIcon}</span>
        ) : (
          <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
              className="group text-muted-foreground hover:text-foreground -m-2 shrink-0 p-2 outline-none"
              disabled={!hasPanel}
              aria-label="Toggle import details"
            >
              {chevronIcon}
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
        )
      }
      statusIcon={<StatusIcon className={cn("size-4 shrink-0", statusColor)} />}
      quantity={entry.entry.quantity}
      code={entry.entry.shortCode}
      name={displayName}
      actions={foldActions ? null : actions}
      trailing={
        // Hidden via CSS, not unmounted: unmounting mid-click inside the row-wide
        // trigger registers as a new open, not a toggle-close.
        foldActions ? (
          <span className="text-muted-foreground text-xs group-data-[panel-open]:hidden">
            {zoneLabels[entry.zone]}
          </span>
        ) : null
      }
    />
  );

  return (
    <AccordionItem
      id={entryRowId(index)}
      value={String(index)}
      className={cn("not-last:border-b-0", isSkipped && "opacity-40")}
    >
      {/* Whole row is the trigger only when folded: rows that keep their
          controls can't do this, or the buttons and zone select would end
          up nested inside the trigger. */}
      {foldActions ? (
        <AccordionPrimitive.Header className="flex">
          <AccordionPrimitive.Trigger className="group focus-visible:ring-ring hover:bg-muted w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-inset">
            {row}
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
      ) : (
        row
      )}
      {hasPanel && (
        <AccordionContent className="bg-muted/30 px-4 py-2">
          <div className="space-y-2">
            {foldActions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            {hasDetails && <ImportRowRawFields entries={rawFieldEntries} matched={matchedNote} />}
          </div>
        </AccordionContent>
      )}
    </AccordionItem>
  );
}

function ZonePicker({
  zone,
  zoneOrder,
  zoneLabels,
  isMobile,
  onZoneChange,
}: {
  zone: DeckZone;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  isMobile: boolean;
  onZoneChange: (zone: DeckZone) => void;
}) {
  // Overflow is not user-assignable
  const assignableZones = zoneOrder.filter((zoneSlug) => zoneSlug !== WellKnown.deckZone.OVERFLOW);

  return (
    <Select
      value={zone}
      onValueChange={(value) => onZoneChange(value as DeckZone)}
      items={Object.fromEntries(assignableZones.map((zoneKey) => [zoneKey, zoneLabels[zoneKey]]))}
    >
      <SelectTrigger
        size={isMobile ? "default" : "sm"}
        className={cn("w-auto", !isMobile && "h-7 text-xs")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-auto">
        {assignableZones.map((zoneKey) => (
          <SelectItem key={zoneKey} value={zoneKey} className={isMobile ? "py-2.5" : "py-1.5"}>
            {zoneLabels[zoneKey]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const MAX_SEARCH_RESULTS = 20;

const MIN_QUERY_LENGTH = 1;

function CardSearch({
  allPrintings,
  onSelect,
}: {
  allPrintings: Printing[];
  onSelect: (card: ResolvedCard) => void;
}) {
  const [query, setQuery] = useState("");
  const { rows, codesByCardId } = useResolvedCardIndex(allPrintings);
  const matches = useCardSearch(rows, query, codesByCardId, MAX_SEARCH_RESULTS, MIN_QUERY_LENGTH);
  const results = matches.map((row) => ({
    id: row.id,
    label: row.name,
    sublabel: row.card.shortCode,
    leading: <CardThumbnail cardId={row.id} className="h-8" />,
    card: row.card,
  }));

  return (
    <CardSearchDropdown
      ariaLabel="Search cards"
      placeholder="Search cards..."
      className="h-8 w-full sm:h-7 sm:w-44"
      results={results}
      onSearch={setQuery}
      onSelect={(_id, result) => onSelect(result.card)}
    />
  );
}

/** Deduplicates the catalog to one {@link ResolvedCard} per card, keeping each card's first printing as its representative. */
function useResolvedCardIndex(allPrintings: Printing[]) {
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const results: {
      id: string;
      slug: string;
      name: string;
      altNames: string[];
      card: ResolvedCard;
    }[] = [];
    for (const printing of allPrintings) {
      if (seen.has(printing.cardId)) {
        continue;
      }
      seen.add(printing.cardId);
      const displayName = legendDisplayName(printing.card);
      results.push({
        id: printing.cardId,
        slug: printing.cardId,
        name: displayName,
        // The source list being corrected may spell the card either way.
        altNames: cardSearchAltNames(printing.card, [printing.printedName]),
        card: {
          cardId: printing.cardId,
          cardName: displayName,
          cardType: printing.card.type,
          cardTypes: printing.card.types,
          superTypes: printing.card.superTypes,
          domains: printing.card.domains,
          shortCode: printing.shortCode,
          preferredPrintingId: null,
        },
      });
    }
    return results;
  }, [allPrintings]);

  const codesByCardId = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.id,
          [{ shortCode: row.card.shortCode, publicCode: row.card.shortCode }],
        ]),
      ),
    [rows],
  );

  return { rows, codesByCardId };
}
