import { create } from "zustand";

interface ImportHandoff {
  rawText: string;
  collectionId?: string;
}

interface ImportHandoffState {
  handoff: ImportHandoff | null;
  setHandoff: (handoff: ImportHandoff) => void;
  takeHandoff: () => ImportHandoff | null;
}

export const useImportHandoffStore = create<ImportHandoffState>()((set, get) => ({
  handoff: null,
  setHandoff: (handoff) => set({ handoff }),
  takeHandoff: () => {
    const handoff = get().handoff;
    set({ handoff: null });
    return handoff;
  },
}));
