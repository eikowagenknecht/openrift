import { create } from "zustand";

/** What a quick-add does with the card you pick. */
export type QuickAddVerb = "add" | "move";

/**
 * The route's own "find a card and put it somewhere" palette, as plain data.
 *
 * The body stays mounted at the route, which is what keeps its data plumbing
 * (owned counts, the deck's live contents, the collection list) local. Only the
 * labels and the open flag live here, so the shortcut and the global palette
 * can reach a quick-add without knowing which one it is.
 */
interface RegisteredQuickAdd {
  /** Distinguishes one registration from the next; the route's own id. */
  key: string;
  /** The add row and its scope chip, e.g. "Add to My Binder". */
  label: string;
  /**
   * The move row's label, for a surface that can also relocate copies you
   * already own. Null where moving makes no sense: the catalog files new cards
   * into the Inbox and nothing else, and a deck holds no copies to move.
   */
  moveLabel: string | null;
  /**
   * Whether Ctrl+K opens this quick-add rather than the global palette.
   *
   * True on a surface built around one destination (a collection, a deck),
   * where adding is what you came to do. False on the catalog, where the page
   * is already a card search and the chord is better spent on the palette; the
   * quick-add is then one row down rather than the whole answer.
   *
   * Only ever opens the add verb. Move has no chord and does not need one: it
   * is a row in the palette, which is the whole reason it stopped being a tab.
   */
  claimsShortcut: boolean;
}

interface CommandPaletteState {
  /** The global palette (card search, navigation, help). */
  open: boolean;
  /** The route's quick-add, when it has one. Never open at the same time. */
  quickAddOpen: boolean;
  /** Which verb the open quick-add is committed to. */
  quickAddVerb: QuickAddVerb;
  quickAdd: RegisteredQuickAdd | null;
  /**
   * The global palette's search box, and the row it has highlighted.
   *
   * Here rather than in the body because the body unmounts whenever the palette
   * closes, and opening a card detail closes it. Retyping the query to get back
   * to the list you were reading is the whole reason this is not local state.
   */
  query: string;
  highlighted: string;

  openPalette: () => void;
  closePalette: () => void;
  /**
   * Steps the palette aside for something opened out of it (a card detail),
   * keeping the query so {@link openPalette} lands back on the same list.
   */
  hidePalette: () => void;
  setQuery: (query: string) => void;
  setHighlighted: (value: string) => void;
  /** Opens the quick-add committed to one verb, chosen in the palette. */
  openQuickAdd: (verb: QuickAddVerb) => void;
  /** The quick-add dialog's own `onOpenChange`. */
  setQuickAddOpen: (open: boolean) => void;
  /**
   * Ctrl/Cmd+K. A route whose quick-add claims the chord gets it; everywhere
   * else it is the global palette.
   */
  toggleShortcut: () => void;
  /** The scope chip's dismiss, and Backspace on an empty quick-add query. */
  exitQuickAddScope: () => void;
  registerQuickAdd: (quickAdd: RegisteredQuickAdd) => void;
  unregisterQuickAdd: (key: string) => void;
}

/** Leaving the palette's train of thought, so the next open starts blank. */
const BLANK = { query: "", highlighted: "" };

export const useCommandPaletteStore = create<CommandPaletteState>()((set) => ({
  open: false,
  quickAddOpen: false,
  quickAddVerb: "add",
  quickAdd: null,
  query: "",
  highlighted: "",

  openPalette: () => set({ open: true, quickAddOpen: false }),
  // Dismissing is being done with it, so the next open starts blank.
  closePalette: () => set({ open: false, ...BLANK }),
  hidePalette: () => set({ open: false }),
  setQuery: (query) => set({ query }),
  setHighlighted: (highlighted) => set({ highlighted }),

  openQuickAdd: (verb) => set({ quickAddOpen: true, quickAddVerb: verb, open: false, ...BLANK }),
  setQuickAddOpen: (open) => set({ quickAddOpen: open }),

  toggleShortcut: () =>
    set((state) => {
      if (state.open) {
        return { open: false, ...BLANK };
      }
      if (state.quickAdd?.claimsShortcut) {
        return {
          quickAddOpen: !state.quickAddOpen,
          quickAddVerb: "add" as const,
          open: false,
          ...BLANK,
        };
      }
      if (state.quickAddOpen) {
        return { quickAddOpen: false };
      }
      return { open: true, quickAddOpen: false };
    }),

  exitQuickAddScope: () => set({ quickAddOpen: false, open: true }),

  registerQuickAdd: (quickAdd) => set({ quickAdd }),

  // Keyed so a route unmounting after its successor registered does not wipe
  // the newcomer's entry. Closes the body too: the registration leaving means
  // the surface that renders it is going away.
  unregisterQuickAdd: (key) =>
    set((state) => (state.quickAdd?.key === key ? { quickAdd: null, quickAddOpen: false } : state)),
}));
