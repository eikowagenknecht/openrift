import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { OddsGroupDef } from "@/lib/deck-odds-groups";

interface DeckOddsGroupsState {
  selectionByDeck: Record<string, string[]>;
  setSelection: (deckId: string, keys: string[]) => void;
  clearSelection: (deckId: string) => void;
  customByDeck: Record<string, OddsGroupDef[]>;
  addCustomGroup: (deckId: string, group: OddsGroupDef) => void;
  removeCustomGroup: (deckId: string, key: string) => void;
}

/**
 * Keeps a persisted custom group only when it has the required strings and
 * plausible optional fields; anything else is dropped on rehydrate.
 */
function sanitizeCustomGroup(raw: unknown): OddsGroupDef | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const group = raw as Record<string, unknown>;
  if (typeof group.key !== "string" || typeof group.label !== "string") {
    return null;
  }
  const stringList = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
      ? (value as string[])
      : undefined;
  const number = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const types = stringList(group.types);
  const keywords = stringList(group.keywords);
  const tags = stringList(group.tags);
  const energyMin = number(group.energyMin);
  const energyMax = number(group.energyMax);
  const mightMin = number(group.mightMin);
  const powerMin = number(group.powerMin);
  return {
    key: group.key,
    label: group.label,
    ...(types && { types }),
    ...(keywords && { keywords }),
    ...(tags && { tags }),
    ...(energyMin !== undefined && { energyMin }),
    ...(energyMax !== undefined && { energyMax }),
    ...(mightMin !== undefined && { mightMin }),
    ...(powerMin !== undefined && { powerMin }),
  };
}

/**
 * Device-local, per-deck selection of which group rows the draw-odds table
 * shows. A stale selection with an unresolved preset key is ignored.
 */
export const useDeckOddsGroupsStore = create<DeckOddsGroupsState>()(
  persist(
    (set) => ({
      selectionByDeck: {},
      setSelection: (deckId, keys) =>
        set((state) => ({ selectionByDeck: { ...state.selectionByDeck, [deckId]: keys } })),
      clearSelection: (deckId) =>
        set((state) => ({
          selectionByDeck: Object.fromEntries(
            Object.entries(state.selectionByDeck).filter(([key]) => key !== deckId),
          ),
        })),
      customByDeck: {},
      addCustomGroup: (deckId, group) =>
        set((state) => ({
          customByDeck: {
            ...state.customByDeck,
            [deckId]: [...(state.customByDeck[deckId] ?? []), group],
          },
        })),
      removeCustomGroup: (deckId, key) =>
        set((state) => ({
          customByDeck: {
            ...state.customByDeck,
            [deckId]: (state.customByDeck[deckId] ?? []).filter((group) => group.key !== key),
          },
        })),
    }),
    {
      name: "deck-odds-groups",
      // Validates on rehydrate: malformed entries are dropped, so a corrupt
      // blob degrades to defaults.
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== "object") {
          return current;
        }
        const state = persisted as { selectionByDeck?: unknown; customByDeck?: unknown };
        const selectionByDeck: Record<string, string[]> = {};
        if (state.selectionByDeck && typeof state.selectionByDeck === "object") {
          for (const [deckId, keys] of Object.entries(
            state.selectionByDeck as Record<string, unknown>,
          )) {
            if (Array.isArray(keys) && keys.every((key) => typeof key === "string")) {
              selectionByDeck[deckId] = keys;
            }
          }
        }
        const customByDeck: Record<string, OddsGroupDef[]> = {};
        if (state.customByDeck && typeof state.customByDeck === "object") {
          for (const [deckId, groups] of Object.entries(
            state.customByDeck as Record<string, unknown>,
          )) {
            if (Array.isArray(groups)) {
              const sanitized = groups
                .map((group) => sanitizeCustomGroup(group))
                .filter((group) => group !== null);
              if (sanitized.length > 0) {
                customByDeck[deckId] = sanitized;
              }
            }
          }
        }
        return { ...current, selectionByDeck, customByDeck };
      },
    },
  ),
);
