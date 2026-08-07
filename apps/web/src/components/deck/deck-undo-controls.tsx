import type { Collection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { Redo2Icon, Undo2Icon } from "lucide-react";
import { useEffect } from "react";

import { PageTopBarIconButton } from "@/components/layout/page-top-bar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { allCards } from "@/hooks/use-deck-builder";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import {
  applyDeckSnapshot,
  useDeckDraftCollection,
  useDeckDraftScope,
} from "@/lib/deck-builder-collection";
import { useDeckUndoStore } from "@/stores/deck-undo-store";

type DeckCollection = Collection<DeckBuilderCard, string | number>;

/** Typing inside these should keep the browser's own undo, not ours. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable], [role="dialog"]';

/**
 * Steps the deck one snapshot back or forward. Restoring goes through the
 * normal draft-replace path, so the debounced autosave writes it back like any
 * other edit.
 */
function restoreSnapshot(
  direction: "undo" | "redo",
  queryClient: QueryClient,
  scope: string,
  deckId: string,
  collection: DeckCollection,
): void {
  const store = useDeckUndoStore.getState();
  const current = allCards(collection);
  const snapshot = direction === "undo" ? store.undo(deckId, current) : store.redo(deckId, current);
  if (!snapshot) {
    return;
  }
  applyDeckSnapshot(queryClient, scope, deckId, snapshot);
}

/**
 * Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo, for as long as
 * the calling component is mounted. Mount it once per deck editor.
 */
export function useDeckUndoShortcuts(deckId: string): void {
  const queryClient = useQueryClient();
  const scope = useDeckDraftScope(deckId);
  const collection = useDeckDraftCollection(deckId);

  useEffect(() => {
    if (!collection || !scope) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(TEXT_ENTRY)) {
        return;
      }
      const key = event.key.toLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = (key === "z" && event.shiftKey) || key === "y";
      if (!isUndo && !isRedo) {
        return;
      }
      event.preventDefault();
      restoreSnapshot(isUndo ? "undo" : "redo", queryClient, scope, deckId, collection);
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [collection, scope, deckId, queryClient]);
}

/**
 * Undo/redo state and actions for a deck, so any surface (top bar, mobile
 * dock) drives the same history through the same apply path.
 * @returns Whether each direction is available, and the actions to run them.
 */
export function useDeckUndo(deckId: string): {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
} {
  const queryClient = useQueryClient();
  const scope = useDeckDraftScope(deckId);
  const collection = useDeckDraftCollection(deckId);
  const canUndo = useDeckUndoStore((state) => state.deckId === deckId && state.past.length > 0);
  const canRedo = useDeckUndoStore((state) => state.deckId === deckId && state.future.length > 0);

  const restore = (direction: "undo" | "redo") => {
    if (!collection || !scope) {
      return;
    }
    restoreSnapshot(direction, queryClient, scope, deckId, collection);
  };

  return {
    canUndo,
    canRedo,
    undo: () => restore("undo"),
    redo: () => restore("redo"),
  };
}

/**
 * Undo/redo buttons for the deck editor's top bar. Card edits only — the
 * deck's name, format, plan and odds settings are not part of this history.
 * @returns The two icon buttons.
 */
export function DeckUndoControls({ deckId }: { deckId: string }) {
  const { canUndo, canRedo, undo, redo } = useDeckUndo(deckId);

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={<PageTopBarIconButton aria-label="Undo" disabled={!canUndo} onClick={undo} />}
        >
          <Undo2Icon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            // On phones the bar has no room for a second always-on button, so
            // redo only appears there while a redo actually exists.
            <PageTopBarIconButton
              aria-label="Redo"
              disabled={!canRedo}
              onClick={redo}
              className={canRedo ? "inline-flex" : "hidden sm:inline-flex"}
            />
          }
        >
          <Redo2Icon className="size-4" />
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
      </Tooltip>
    </>
  );
}
