import type { DeckResponse, PublicDeckDetailResponse } from "@openrift/shared/types/api/deck";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import { DEFAULT_IMPORT_DECK_NAME, dedupeMatchedEntries } from "@/lib/deck-import-cards";
import type { DeckMatchStatus, DeckMatchedEntry, ResolvedCard } from "@/lib/deck-import-matcher";
import { matchDeckEntries } from "@/lib/deck-import-matcher";
import type { DeckImportMode } from "@/lib/deck-import-modes";
import { DETECTED_FORMAT_LABELS } from "@/lib/deck-import-modes";
import type { DeckImportEntry } from "@/lib/deck-import-parsers";
import {
  entriesFromSharedDeck,
  extractDeckFromUrl,
  parseDeckImportAuto,
  parseDeckImportData,
  sniffDeckImportFormat,
} from "@/lib/deck-import-parsers";
import { sortDeckImportEntries } from "@/lib/deck-import-preview";
import { resolveReplaceTarget } from "@/lib/deck-import-replace";
import { classifyBucket } from "@/lib/import-summary";
import { useLocalDecksStore } from "@/stores/local-decks-store";

type DeckImportStep = "input" | "preview";

const routeApi = getRouteApi("/_app/decks/import");

export function useDeckImportFlow() {
  const userId = useUserId();
  const {
    replaceDeckId,
    code: prefillCode,
    name: prefillName,
    source: prefillSource,
  } = routeApi.useSearch();
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

  const [step, setStep] = useState<DeckImportStep>("input");
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

    const sorted = sortDeckImportEntries(matchDeckEntries(entries, allPrintings), zoneOrder);
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

  return {
    step,
    rawText,
    handleRawTextChange: setRawText,
    importMode,
    handleImportModeChange: setImportMode,
    handleParse,
    handleFileUpload,
    fileRef,
    isResolvingLink,
    parseWarnings,
    matchedEntries,
    allPrintings,
    sourceNote,
    skippedIndices,
    expandedValues,
    handleExpandedValuesChange: setExpandedValues,
    deckName,
    handleDeckNameChange: setDeckName,
    deckFormat,
    handleDeckFormatChange: setDeckFormat,
    deckFormats,
    deckFormatLabels,
    zoneOrder,
    zoneLabels,
    readyCount,
    toVerifyCount,
    needsAttentionCount,
    importableCount: importableEntries.length,
    skippedCount,
    totalCards,
    importCards,
    summaryFormat,
    summaryFormatConfig,
    isLoggedIn: Boolean(userId),
    isImporting,
    isReplaceMode,
    replaceDeckName,
    sourceLink,
    handleDropSourceLink: () => setSourceLinkDropped(true),
    confirmReplaceOpen,
    handleConfirmReplaceOpenChange: setConfirmReplaceOpen,
    handleResolve,
    handleZoneChange,
    handleSkip,
    handleUnskip,
    handleImport,
    executeReplace,
    handleBack: () => setStep("input"),
  };
}
