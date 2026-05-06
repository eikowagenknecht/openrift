import { create } from "zustand";

interface PageTocState {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
}

export const usePageTocStore = create<PageTocState>()((set) => ({
  activeId: null,
  setActiveId: (id) => {
    set((state) => (state.activeId === id ? state : { activeId: id }));
  },
}));
