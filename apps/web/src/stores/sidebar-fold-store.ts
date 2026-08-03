import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Fold keys for the collections sidebar. Fixed keys cover the built-in
 * sections; `shared:<groupId>` keys are emitted dynamically — one per friend
 * group the viewer belongs to that has at least one shared collection.
 */
export type SidebarGroupKey = "collections" | "wish" | "trade" | "organize" | `shared:${string}`;

/**
 * Namespace for the per-group "Show more" state inside the same `byKey` map.
 * Fold keys default open, reveal keys default closed, so they can't share a
 * key without the default flipping for one of them.
 */
const MORE_PREFIX = "more:";

/** @returns The `byKey` entry that holds a group's "Show more" reveal state. */
export function moreKey(key: SidebarGroupKey): string {
  return `${MORE_PREFIX}${key}`;
}

interface SidebarFoldState {
  /** True means the group is open; false means folded. Default open. */
  byKey: Record<string, boolean>;
  setOpen: (key: SidebarGroupKey, open: boolean) => void;
  toggle: (key: SidebarGroupKey) => void;
  isOpen: (key: SidebarGroupKey) => boolean;
  /** Reveals (or re-folds) the group's rows that sit behind "Show more". */
  setMoreShown: (key: SidebarGroupKey, shown: boolean) => void;
  toggleMoreShown: (key: SidebarGroupKey) => void;
  isMoreShown: (key: SidebarGroupKey) => boolean;
  reset: () => void;
}

const FIXED_DEFAULTS: Record<string, boolean> = {
  collections: true,
  wish: true,
  trade: true,
  organize: true,
};

/**
 * Per-user open/closed state for the collapsible groups in the collections
 * sidebar. Persisted to localStorage so a user's fold preferences survive a
 * reload. Dynamic `shared:<groupId>` keys default to open when first seen.
 */
export const useSidebarFoldStore = create<SidebarFoldState>()(
  persist(
    (set, get) => ({
      byKey: FIXED_DEFAULTS,
      setOpen: (key, open) => set((state) => ({ byKey: { ...state.byKey, [key]: open } })),
      toggle: (key) =>
        set((state) => ({
          byKey: { ...state.byKey, [key]: !(state.byKey[key] ?? true) },
        })),
      isOpen: (key) => get().byKey[key] ?? true,
      setMoreShown: (key, shown) =>
        set((state) => ({ byKey: { ...state.byKey, [moreKey(key)]: shown } })),
      toggleMoreShown: (key) =>
        set((state) => ({
          byKey: { ...state.byKey, [moreKey(key)]: !(state.byKey[moreKey(key)] ?? false) },
        })),
      isMoreShown: (key) => get().byKey[moreKey(key)] ?? false,
      reset: () => set({ byKey: FIXED_DEFAULTS }),
    }),
    {
      name: "openrift-sidebar-fold",
      partialize: (state) => ({ byKey: state.byKey }),
      merge: (persisted, current) => {
        const raw = persisted as { byKey?: Record<string, unknown> } | undefined;
        const persistedByKey = raw?.byKey ?? {};
        const merged: Record<string, boolean> = { ...current.byKey };
        for (const [key, value] of Object.entries(persistedByKey)) {
          if (typeof value === "boolean") {
            merged[key] = value;
          }
        }
        return { ...current, byKey: merged };
      },
    },
  ),
);
