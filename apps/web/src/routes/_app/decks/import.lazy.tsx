import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import type {
  DeckFormat,
  DeckResponse,
  DeckZone,
  Printing,
  PublicDeckDetailResponse,
} from "@openrift/shared";
import { WellKnown, legendDisplayName } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  FileUpIcon,
  Loader2Icon,
  SearchIcon,
  UploadIcon,
  XCircleIcon,
} from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Heading } from "@/components/heading";
import { ImportCatalogSearch } from "@/components/import/import-catalog-search";
import {
  ImportStatusBadges,
  ImportToVerifyNote,
  ImportTroubleNote,
} from "@/components/import/import-preview-chrome";
import { ImportRowRawFields, ImportRowShell } from "@/components/import/import-row-shell";
import {
  SectionHeader,
  SectionHeaderActions,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "@/components/section-header";
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
import { Button } from "@/components/ui/button";
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
import { useCards } from "@/hooks/use-cards";
import {
  deckDetailQueryOptions,
  publicDeckQueryOptions,
  useCreateDeck,
  useSaveDeckCards,
} from "@/hooks/use-decks";
import { useDeckFormatList, useZoneOrder } from "@/hooks/use-enums";
import { useUserId } from "@/lib/auth-session";
import { dedupeMatchedEntries } from "@/lib/deck-import-cards";
import type { DeckMatchStatus, DeckMatchedEntry, ResolvedCard } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import type { DeckImportEntry, DeckImportFormat } from "@/lib/deck-import-parsers";
import {
  entriesFromSharedDeck,
  extractDeckFromUrl,
  parseDeckImportData,
  sniffDeckImportFormat,
} from "@/lib/deck-import-parsers";
import { resolveReplaceTarget } from "@/lib/deck-import-replace";
import type { ImportBucket } from "@/lib/import-summary";
import { classifyBucket } from "@/lib/import-summary";
import { matchesAllTokens, searchTokens } from "@/lib/search-match";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { cn } from "@/lib/utils";
import { useLocalDecksStore } from "@/stores/local-decks-store";

export const Route = createLazyFileRoute("/_app/decks/import")({
  component: DeckImportPage,
});

// Problems first, matching the collection import flow: when zone and name tie,
// surface the entries that still need attention before the resolved ones.
const STATUS_SORT_ORDER: Record<DeckMatchStatus, number> = {
  unresolved: 0,
  "needs-review": 1,
  exact: 2,
};

/** @returns Display name for sorting purposes. */
function entryDisplayName(entry: DeckMatchedEntry): string {
  return (
    entry.resolvedCard?.cardName ??
    entry.entry.cardName ??
    entry.entry.shortCode ??
    ""
  ).toLowerCase();
}

type ImportStep = "input" | "preview";

/** The input modes: automatic detection (default) plus one manual override per format. */
type DeckImportMode = "auto" | DeckImportFormat;

/** Labels for the format dropdown. */
const IMPORT_MODE_LABELS: Record<DeckImportMode, string> = {
  auto: "Detect automatically",
  text: "Text",
  piltover: "Deck Code",
  tts: "TTS",
};

/** Dropdown order: auto first, then the manual formats. */
const IMPORT_MODE_ORDER: DeckImportMode[] = ["auto", "text", "piltover", "tts"];

/** Human labels for the preview's "detected as ..." note. */
const DETECTED_FORMAT_LABELS: Record<DeckImportFormat, string> = {
  piltover: "deck code",
  text: "text list",
  tts: "TTS string",
};

const IMPORT_PLACEHOLDERS: Record<DeckImportMode, string> = {
  auto: "Paste a deck list, deck code, TTS string, or share link...",
  piltover: "Paste a Piltover Archive deck code...",
  text: "Legend:\n1 Card Name\n\nMainDeck:\n3 Card Name\n...",
  tts: "OGN-001-1 OGN-002-1 OGN-003-1 ...",
};

const IMPORT_DESCRIPTIONS: Record<DeckImportMode, React.ReactNode> = {
  auto: (
    <>
      Paste anything below (a text list, a Piltover Archive deck code, a Tabletop Simulator string,
      or a link to a shared OpenRift deck) and the format is detected automatically. Pick a specific
      format above if the detection gets it wrong.
    </>
  ),
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
      A plain text list with optional zone headers like &quot;Legend:&quot; or
      &quot;MainDeck:&quot;. One card per line as &quot;quantity name&quot;. Without zone headers,
      cards are sorted into zones automatically based on their type. Used by many deck builders,
      including{" "}
      <a
        href="https://piltoverarchive.com"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Piltover Archive
      </a>{" "}
      and{" "}
      <a
        href="https://tcg-arena.fr/decks"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        TCG Arena
      </a>
      .
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
  // Auth-optional (ADR-035): logged out, an import creates a browser-local deck.
  const userId = useUserId();
  const { replaceDeckId, code: prefillCode } = Route.useSearch();
  const { allPrintings } = useCards();
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const { formats: deckFormats, labels: deckFormatLabels } = useDeckFormatList();
  const createDeck = useCreateDeck();
  const saveDeckCards = useSaveDeckCards();
  const navigate = useNavigate();

  const localDecks = useLocalDecksStore((state) => state.decks);
  // Local decks replace in this browser's store, session or not; server decks
  // need a session. With no valid target, the flow creates a new deck instead.
  const replaceTarget = resolveReplaceTarget(
    replaceDeckId,
    Boolean(userId),
    (id) => localDecks[id] !== undefined,
  );
  const replaceDeckQuery = useQuery({
    ...deckDetailQueryOptions(userId ?? "", replaceDeckId ?? ""),
    enabled: replaceTarget.mode === "server",
  });
  const replaceDeckName =
    replaceTarget.mode === "local"
      ? localDecks[replaceTarget.deckId]?.name
      : replaceDeckQuery.data?.deck.name;
  const isReplaceMode = replaceTarget.mode !== "none";

  const queryClient = useQueryClient();

  const [step, setStep] = useState<ImportStep>("input");
  const [rawText, setRawText] = useState("");
  const [importMode, setImportMode] = useState<DeckImportMode>("auto");
  const [deckName, setDeckName] = useState("Imported Deck");
  const [deckFormat, setDeckFormat] = useState<DeckFormat>(deckFormats[0]?.slug ?? "");
  const [matchedEntries, setMatchedEntries] = useState<DeckMatchedEntry[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [isResolvingLink, setIsResolvingLink] = useState(false);
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [expandedValues, setExpandedValues] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

    // Auto-expand non-exact entries so the user sees what needs attention
    const nonExact: string[] = [];
    for (let index = 0; index < sorted.length; index++) {
      if (sorted[index].status !== "exact") {
        nonExact.push(String(index));
      }
    }
    setExpandedValues(nonExact);

    setStep("preview");
  };

  const resolveShareLink = async (token: string) => {
    setIsResolvingLink(true);
    // No try/finally: the React Compiler can't yet compile finalizer clauses
    // and would bail on the whole component. The catch never rethrows, so the
    // flag reset after the block is reached on both paths.
    let data: PublicDeckDetailResponse | null = null;
    try {
      data = await queryClient.fetchQuery(publicDeckQueryOptions(token));
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

    // Prefill deck name and format from the shared deck (create mode only;
    // replace mode keeps the target deck's own name and format).
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

    // URLs are never valid content for any of the text formats, so a pasted
    // link is handled the same way on every tab: resolve an OpenRift share
    // link via the API, or pull an embedded deck code straight from the URL.
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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) =>
    handleImportFileUpload(event, fileRef, setRawText, handleParse);

  // Deep links (e.g. the Discord bot's "Open in OpenRift" button) land with
  // ?code=<deck code>. Parse it as a deck code right away so the preview is
  // ready without a manual Parse click; an invalid code stays on the input
  // step with the code prefilled and the warning shown. The catalog behind
  // finishParse is suspense-loaded, so it is ready on first render.
  const autoParsedRef = useRef(false);
  useEffect(() => {
    if (!prefillCode || autoParsedRef.current) {
      return;
    }
    autoParsedRef.current = true;
    setRawText(prefillCode);
    setSourceNote("deck code from the link");
    const { entries, warnings } = parseDeckImportData(prefillCode, "piltover");
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
  const visibleBuckets = matchedEntries
    .filter((_entry, index) => !skippedIndices.has(index))
    .map((entry) => classifyBucket(entry.status, entry.resolvedCard !== null));
  const readyCount = visibleBuckets.filter((bucket) => bucket === "ready").length;
  const toVerifyCount = visibleBuckets.filter((bucket) => bucket === "to-verify").length;
  const needsAttentionCount = visibleBuckets.filter((bucket) => bucket === "need-attention").length;
  const skippedCount = skippedIndices.size;
  const totalCards = importableEntries.reduce((sum, entry) => sum + entry.entry.quantity, 0);

  const buildCards = () => dedupeMatchedEntries(importableEntries);

  const executeReplace = () => {
    if (replaceTarget.mode === "none") {
      return;
    }
    const targetName = replaceDeckName ?? "deck";
    setIsImporting(true);
    if (replaceTarget.mode === "local") {
      useLocalDecksStore.getState().setCards(replaceTarget.deckId, buildCards());
      toast.success(`Replaced cards in "${targetName}" with ${totalCards} cards.`);
      void navigate({ to: "/decks/$deckId", params: { deckId: replaceTarget.deckId } });
      return;
    }
    saveDeckCards.mutate(
      { deckId: replaceTarget.deckId, cards: buildCards() },
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
    const trimmedName = deckName.trim();
    if (!trimmedName) {
      toast.error("Please enter a deck name.");
      return;
    }

    setIsImporting(true);
    const cards = buildCards();

    // Logged out: build a browser-local deck instead of a server deck.
    if (!userId) {
      const localId = useLocalDecksStore.getState().createDeck(deckFormat, trimmedName);
      useLocalDecksStore.getState().setCards(localId, cards);
      toast.success(`Imported deck "${trimmedName}" with ${totalCards} cards.`);
      void navigate({ to: "/decks/$deckId", params: { deckId: localId } });
      return;
    }

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
        onParse={handleParse}
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
        isImporting={isImporting}
        replaceDeckName={isReplaceMode ? (replaceDeckName ?? "") : undefined}
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

// ---------------------------------------------------------------------------
// Step 1: Input
// ---------------------------------------------------------------------------

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
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div>
        <Heading level={2}>{isReplaceMode ? "Replace deck contents" : "Import Deck"}</Heading>
        <p className="text-muted-foreground text-sm">
          {isReplaceMode ? (
            <>
              Paste a text list, deck code, TTS string, or share link to replace the cards in
              {replaceDeckName ? (
                <>
                  {" "}
                  <strong className="text-foreground">&ldquo;{replaceDeckName}&rdquo;</strong>
                </>
              ) : (
                " this deck"
              )}
              . The deck&apos;s name and format are kept.
            </>
          ) : (
            <>
              Paste a text list, deck code, TTS string, or share link to import a deck, or upload a
              file. Want another format supported?{" "}
              <a
                href={SOCIAL_LINKS.githubIssues}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline"
              >
                Open a GitHub issue
              </a>
              .
            </>
          )}
        </p>
      </div>

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
            <SelectTrigger id="import-mode" className="mb-0 w-[200px]">
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
            "font-mono text-xs",
            importMode === "piltover" ? "min-h-[120px]" : "min-h-[320px]",
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
  );
}

// ---------------------------------------------------------------------------
// Step 2: Preview
// ---------------------------------------------------------------------------

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
  isImporting,
  replaceDeckName,
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
  isImporting: boolean;
  replaceDeckName?: string;
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
  const canImport = importableCount > 0 && (isReplaceMode || deckName.trim().length > 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <SectionHeader>
        <SectionHeaderGroup>
          <SectionHeaderTitle>
            {isReplaceMode ? "Replace Preview" : "Import Preview"}
          </SectionHeaderTitle>
          <SectionHeaderDescription>
            {matchedEntries.length} card{matchedEntries.length === 1 ? "" : "s"} parsed
            {sourceNote ? ` (${sourceNote})` : null}
            {isReplaceMode && replaceDeckName ? (
              <>
                {" "}
                — replacing contents of{" "}
                <strong className="text-foreground">&ldquo;{replaceDeckName}&rdquo;</strong>
              </>
            ) : null}
          </SectionHeaderDescription>
        </SectionHeaderGroup>
        <SectionHeaderActions>
          <Button variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
        </SectionHeaderActions>
      </SectionHeader>

      {/* Entry list */}
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

      {/* Parse warnings */}
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

      {/* Summary + deck options + import button */}
      <div className="bg-muted/50 space-y-4 rounded-md border p-4">
        <ImportStatusBadges
          readyCount={readyCount}
          toVerifyCount={toVerifyCount}
          needsAttentionCount={needsAttentionCount}
          skippedCount={skippedCount}
        />

        <ImportToVerifyNote count={toVerifyCount} target="card" />

        <ImportTroubleNote needsAttentionCount={needsAttentionCount} />

        <div className="flex flex-wrap items-end gap-3">
          {!isReplaceMode && (
            <>
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
                  onValueChange={(value) => {
                    if (value !== null) {
                      onDeckFormatChange(value);
                    }
                  }}
                >
                  <SelectTrigger id="preview-deck-format" className="mb-0 w-[140px]">
                    <SelectValue>{(value: string) => deckFormatLabels[value] ?? value}</SelectValue>
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

          <Button
            variant={isReplaceMode ? "destructive" : "default"}
            onClick={onImport}
            disabled={!canImport || isImporting}
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

const BUCKET_CONFIG: Record<ImportBucket, { icon: React.ElementType; className: string }> = {
  ready: { icon: CheckCircle2Icon, className: "text-emerald-600 dark:text-emerald-400" },
  "to-verify": { icon: AlertTriangleIcon, className: "text-amber-600 dark:text-amber-400" },
  "need-attention": { icon: XCircleIcon, className: "text-red-600 dark:text-red-400" },
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
  const { icon: StatusIcon, className: statusColor } =
    BUCKET_CONFIG[classifyBucket(entry.status, entry.resolvedCard !== null)];
  const rawFieldEntries = Object.entries(entry.entry.rawFields);
  const displayName =
    entry.resolvedCard?.cardName ?? entry.entry.cardName ?? entry.entry.shortCode ?? "Unknown";

  return (
    <AccordionItem
      value={String(index)}
      className={cn("not-last:border-b-0", isSkipped && "opacity-40")}
    >
      <ImportRowShell
        chevron={
          <AccordionPrimitive.Header className="flex">
            <AccordionPrimitive.Trigger
              className="group text-muted-foreground hover:text-foreground shrink-0 outline-none"
              disabled={rawFieldEntries.length === 0}
              aria-label="Toggle raw fields"
            >
              <ChevronRightIcon className="size-4 transition-transform group-data-[panel-open]:rotate-90" />
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
        }
        statusIcon={<StatusIcon className={cn("size-4 shrink-0", statusColor)} />}
        quantity={entry.entry.quantity}
        code={entry.entry.shortCode}
        name={displayName}
        nameSuffix={zoneLabels[entry.zone]}
        actions={
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
          </>
        }
      />
      {rawFieldEntries.length > 0 && (
        <AccordionContent className="bg-muted/30 border-border border-t px-4 py-2">
          <ImportRowRawFields entries={rawFieldEntries} />
        </AccordionContent>
      )}
    </AccordionItem>
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
  const assignableZones = zoneOrder.filter((zoneSlug) => zoneSlug !== WellKnown.deckZone.OVERFLOW);

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

const MAX_SEARCH_RESULTS = 20;

function CardSearch({
  allPrintings,
  onSelect,
}: {
  allPrintings: Printing[];
  onSelect: (card: ResolvedCard) => void;
}) {
  return (
    <ImportCatalogSearch<ResolvedCard>
      ariaLabel="Search cards"
      placeholder="Search cards..."
      getResults={(query) => deduplicateToCards(allPrintings, query).slice(0, MAX_SEARCH_RESULTS)}
      getKey={(card) => card.cardId}
      renderItem={(card) => (
        <>
          <span className="truncate font-medium">{card.cardName}</span>
          <span className="text-muted-foreground shrink-0">{card.shortCode}</span>
        </>
      )}
      onSelect={onSelect}
    />
  );
}

/**
 * Filters printings by query and deduplicates to unique cards.
 * @returns ResolvedCard array with one entry per unique card.
 */
function deduplicateToCards(allPrintings: Printing[], query: string): ResolvedCard[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const results: ResolvedCard[] = [];

  for (const printing of allPrintings) {
    if (seen.has(printing.cardId)) {
      continue;
    }
    // Match the colloquial Legend name too ("Azir, Emperor of the Sands"), and
    // surface it as the display name so the dropdown reads like the rest of the app.
    const displayName = legendDisplayName(printing.card);
    if (matchesAllTokens(tokens, displayName, printing.shortCode)) {
      seen.add(printing.cardId);
      results.push({
        cardId: printing.cardId,
        cardName: displayName,
        cardType: printing.card.type,
        cardTypes: printing.card.types,
        superTypes: printing.card.superTypes,
        domains: printing.card.domains,
        shortCode: printing.shortCode,
        preferredPrintingId: null,
      });
    }
  }

  return results;
}
