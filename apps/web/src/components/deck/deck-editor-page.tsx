import type { DeckZone } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { parseAsArrayOf, parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";

import { DeckCardBrowser } from "@/components/deck/deck-card-browser";
import { DeckDndContext } from "@/components/deck/deck-dnd-context";
import { DeckExportDialog } from "@/components/deck/deck-export-dialog";
import { DeckValidationBanner } from "@/components/deck/deck-validation-banner";
import { DeckZonePanel } from "@/components/deck/deck-zone-panel";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDeckDetail, useSaveDeckCards, useUpdateDeck } from "@/hooks/use-decks";
import { cn, CONTAINER_WIDTH } from "@/lib/utils";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { toDeckBuilderCard, useDeckBuilderStore } from "@/stores/deck-builder-store";

interface DeckEditorPageProps {
  deckId: string;
}

function DeckEditorHeader({ deckId, isDirty }: { deckId: string; isDirty: boolean }) {
  const { data } = useDeckDetail(deckId);
  const updateDeck = useUpdateDeck();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(data.deck.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== data.deck.name) {
      updateDeck.mutate({ deckId, name: trimmed });
    } else {
      setDraft(data.deck.name);
    }
    setIsEditing(false);
  };

  const startEditing = () => {
    setDraft(data.deck.name);
    setIsEditing(true);
  };

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div>
      <div className={cn(CONTAINER_WIDTH, "flex items-center gap-3 px-3 py-2")}>
        <Link to="/decks" className="hover:bg-muted rounded-md p-1">
          <ArrowLeft className="size-5" />
        </Link>

        {isEditing ? (
          <Input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitRename();
              } else if (event.key === "Escape") {
                setDraft(data.deck.name);
                setIsEditing(false);
              }
            }}
            className="min-w-0 flex-1 text-lg font-semibold"
            maxLength={200}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- intentional: inline editor should grab focus immediately
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className="hover:bg-muted group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left"
          >
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{data.deck.name}</h1>
            <Pencil className="text-muted-foreground size-3.5 shrink-0 opacity-0 group-hover:opacity-100" />
          </button>
        )}

        <DeckExportDialog deckId={deckId} isDirty={isDirty} />

        <Badge variant="outline" className="capitalize">
          {data.deck.format}
        </Badge>
      </div>
    </div>
  );
}

// Parsers for the filter keys we need to set atomically
const zoneFilterParsers = {
  types: parseAsArrayOf(parseAsString, ",").withDefault([]),
  superTypes: parseAsArrayOf(parseAsString, ",").withDefault([]),
  domains: parseAsArrayOf(parseAsString, ",").withDefault([]),
  search: parseAsString.withDefault(""),
};

function buildZoneFilterUpdate(
  zone: DeckZone,
  deckCards: DeckBuilderCard[],
): Record<string, string[] | string | null> {
  const cleared: Record<string, string[] | string | null> = {
    types: null,
    superTypes: null,
    domains: null,
    search: null,
  };

  const legend = deckCards.find((card) => card.zone === "legend");

  switch (zone) {
    case "legend": {
      return { ...cleared, types: ["Legend"] };
    }
    case "champion": {
      const legendTag = legend?.tags[0];
      return {
        ...cleared,
        types: ["Unit"],
        superTypes: ["Champion"],
        search: legendTag ? `t:${legendTag}` : null,
      };
    }
    case "runes": {
      const legendDomains = legend ? legend.domains : [];
      return {
        ...cleared,
        types: ["Rune"],
        domains: legendDomains.length > 0 ? legendDomains : null,
      };
    }
    case "battlefield": {
      return { ...cleared, types: ["Battlefield"] };
    }
    case "main":
    case "sideboard": {
      // Don't filter by domains in URL — the browser does strict domain filtering
      // (all card domains must be within legend's domains, not just any match)
      return {
        ...cleared,
        types: ["Unit", "Spell", "Gear", "Other"],
      };
    }
    default: {
      return cleared;
    }
  }
}

const AUTO_SAVE_DELAY = 1000;

export function DeckEditorPage({ deckId }: DeckEditorPageProps) {
  const { data } = useDeckDetail(deckId);
  const init = useDeckBuilderStore((state) => state.init);
  const reset = useDeckBuilderStore((state) => state.reset);
  const storeId = useDeckBuilderStore((state) => state.deckId);
  const deckCards = useDeckBuilderStore((state) => state.cards);
  const isDirty = useDeckBuilderStore((state) => state.isDirty);
  const markSaved = useDeckBuilderStore((state) => state.markSaved);
  const [, setZoneFilters] = useQueryStates(zoneFilterParsers, { history: "push" });
  const setZoneFiltersRef = useRef(setZoneFilters);
  setZoneFiltersRef.current = setZoneFilters;
  const lastSuggestedZone = useRef<DeckZone | null>(null);
  const saveDeckCards = useSaveDeckCards();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Initialize store when deck data loads or changes
  useEffect(() => {
    if (data && storeId !== deckId) {
      init(deckId, data.deck.format, data.cards.map(toDeckBuilderCard));
      lastSuggestedZone.current = null;
    }
  }, [data, deckId, storeId, init]);

  // Auto-save: debounce saves so every change is persisted
  useEffect(() => {
    if (!isDirty || storeId !== deckId) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      const currentCards = useDeckBuilderStore.getState().cards;
      saveDeckCards.mutate(
        {
          deckId,
          cards: currentCards.map((card) => ({
            cardId: card.cardId,
            zone: card.zone,
            quantity: card.quantity,
          })),
        },
        { onSuccess: () => markSaved() },
      );
    }, AUTO_SAVE_DELAY);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [isDirty, deckId, storeId, saveDeckCards, markSaved]);

  // Auto-suggest filters based on what's missing in the deck.
  useEffect(() => {
    if (storeId !== deckId) {
      return;
    }

    const hasLegend = deckCards.some((card) => card.zone === "legend");
    const hasChampion = deckCards.some((card) => card.zone === "champion");
    const battlefieldCount = deckCards
      .filter((card) => card.zone === "battlefield")
      .reduce((sum, card) => sum + card.quantity, 0);
    const hasBattlefields = battlefieldCount >= 3;

    let nextSuggestion: DeckZone;
    if (!hasLegend) {
      nextSuggestion = "legend";
    } else if (!hasChampion) {
      nextSuggestion = "champion";
    } else if (hasBattlefields) {
      nextSuggestion = "main";
    } else {
      nextSuggestion = "battlefield";
    }

    if (nextSuggestion === lastSuggestedZone.current) {
      return;
    }
    lastSuggestedZone.current = nextSuggestion;

    useDeckBuilderStore.getState().setActiveZone(nextSuggestion);
    void setZoneFiltersRef.current(buildZoneFilterUpdate(nextSuggestion, deckCards));
  }, [storeId, deckId, deckCards]);

  // Clear filters on unmount
  useEffect(
    () => () => {
      void setZoneFiltersRef.current({
        types: null,
        superTypes: null,
        domains: null,
        search: null,
      });
      reset();
    },
    [reset],
  );

  // Warn on navigation with unsaved changes
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const dirty = useDeckBuilderStore.getState().isDirty;
      if (dirty) {
        event.preventDefault();
      }
    };
    globalThis.addEventListener("beforeunload", handler);
    return () => globalThis.removeEventListener("beforeunload", handler);
  }, []);

  const handleZoneClick = (zone: DeckZone) => {
    useDeckBuilderStore.getState().setActiveZone(zone);
    void setZoneFilters(buildZoneFilterUpdate(zone, deckCards));
  };

  if (storeId !== deckId) {
    return null;
  }

  return (
    <>
      <DeckEditorHeader deckId={deckId} isDirty={isDirty} />
      <DeckValidationBanner />
      <DeckDndContext>
        <div className={cn(CONTAINER_WIDTH, "flex items-start gap-4 px-3 py-3")}>
          <aside className="sticky top-(--sticky-top) max-h-[calc(100vh-var(--sticky-top))] w-72 shrink-0 overflow-y-auto">
            <div className="p-0.5">
              <DeckZonePanel onZoneClick={handleZoneClick} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <DeckCardBrowser />
          </div>
        </div>
      </DeckDndContext>
    </>
  );
}
