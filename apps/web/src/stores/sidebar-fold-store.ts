import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarGroupKey = "collections" | "wish" | "trade" | "organize";

interface SidebarFoldState {
  /** True means the group is open; false means folded. Default open. */
  byKey: Record<SidebarGroupKey, boolean>;
  setOpen: (key: SidebarGroupKey, open: boolean) => void;
  toggle: (key: SidebarGroupKey) => void;
  reset: () => void;
}

const DEFAULTS: Record<SidebarGroupKey, boolean> = {
  collections: true,
  wish: true,
  trade: true,
  organize: true,
};

/**
 * Per-user open/closed state for the collapsible groups in the collections
 * sidebar. Persisted to localStorage so a user's fold preferences survive a
 * reload.
 */
export const useSidebarFoldStore = create<SidebarFoldState>()(
  persist(
    (set) => ({
      byKey: DEFAULTS,
      setOpen: (key, open) => set((state) => ({ byKey: { ...state.byKey, [key]: open } })),
      toggle: (key) => set((state) => ({ byKey: { ...state.byKey, [key]: !state.byKey[key] } })),
      reset: () => set({ byKey: DEFAULTS }),
    }),
    {
      name: "openrift-sidebar-fold",
      partialize: (state) => ({ byKey: state.byKey }),
      merge: (persisted, current) => {
        const raw = persisted as { byKey?: Partial<Record<SidebarGroupKey, unknown>> } | undefined;
        const persistedByKey = raw?.byKey ?? {};
        const isBool = (value: unknown): value is boolean => typeof value === "boolean";
        return {
          ...current,
          byKey: {
            collections: isBool(persistedByKey.collections)
              ? persistedByKey.collections
              : current.byKey.collections,
            wish: isBool(persistedByKey.wish) ? persistedByKey.wish : current.byKey.wish,
            trade: isBool(persistedByKey.trade) ? persistedByKey.trade : current.byKey.trade,
            organize: isBool(persistedByKey.organize)
              ? persistedByKey.organize
              : current.byKey.organize,
          },
        };
      },
    },
  ),
);
