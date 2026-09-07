import { create } from "zustand";
import { persist } from "zustand/middleware";

/** `shared:<groupId>` keys are emitted dynamically, one per shared friend group. */
export type SidebarGroupKey = "collections" | "wish" | "trade" | "organize" | `shared:${string}`;

const MORE_PREFIX = "more:";

export function moreKey(key: SidebarGroupKey): string {
  return `${MORE_PREFIX}${key}`;
}

interface SidebarFoldState {
  byKey: Record<string, boolean>;
  setOpen: (key: SidebarGroupKey, open: boolean) => void;
  toggle: (key: SidebarGroupKey) => void;
  isOpen: (key: SidebarGroupKey) => boolean;
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
