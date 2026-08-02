import type { CopyResponse, Printing } from "@openrift/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubCopy, stubPriceLookup, stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Desktop layout: the drawer branch renders the same PaletteInner, and the
// dialog one is easier to drive without touching the media-query store.
vi.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => false }));

vi.mock("@/hooks/use-prices", () => ({ usePrices: () => stubPriceLookup({}) }));

const EMPTY_LABELS = {
  finishes: {},
  rarities: {},
  domains: {},
  cardTypes: {},
  superTypes: {},
  artVariants: {},
  cardSizes: {},
  conditions: { nm: "Near Mint" },
  graders: { psa: "PSA" },
};
vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: EMPTY_LABELS, orders: {}, domainColors: {}, rarityColors: {} }),
}));

const disposeMutateAsync = vi.fn();
const batchedAdd = vi.fn();
let copies: CopyResponse[] = [];
vi.mock("@/hooks/use-copies", () => ({
  useBatchedAddCopies: () => ({ add: batchedAdd, isPending: false }),
  useDisposeCopies: () => ({ mutateAsync: disposeMutateAsync, isPending: false }),
  useMoveCopies: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCopies: () => ({ data: copies, isReady: true }),
}));
vi.mock("@/lib/copies-collection", () => ({ useCopiesCollection: () => ({ toArray: copies }) }));

const { QuickAddPalette } = await import("./quick-add-palette");
const { useAddModeStore } = await import("@/stores/add-mode-store");

const COLLECTION_ID = "11111111-1111-1111-1111-111111111111";
const COPY_ID = "22222222-2222-2222-2222-222222222222";

function renderPalette(printing: Printing) {
  return render(
    <QuickAddPalette
      open
      onOpenChange={() => {}}
      collectionId={COLLECTION_ID}
      collectionName="Deckbox"
      printingsByCardId={new Map([[printing.cardId, [printing]]])}
      ownedCountByPrinting={{ [printing.id]: 1 }}
    />,
  );
}

/** Types a query and expands the card, which is what reveals the +/- row. */
function openPrintingRow(cardName: string) {
  fireEvent.change(screen.getByLabelText("Add card to Deckbox"), {
    target: { value: cardName },
  });
  fireEvent.click(screen.getByText(cardName));
}

// Regression: the palette used to reimplement add/undo instead of calling
// useQuickAddActions, and its copy of undo disposed the newest session copy
// unconditionally. That silently destroyed grade / condition / notes / links a
// user had recorded on the copy since adding it, which ADR-038 requires
// confirming first. The palette now routes through the shared hook, so the
// confirmation applies here too.
describe("QuickAddPalette undo honors the ADR-038 confirmation", () => {
  const resetAddMode = createStoreResetter(useAddModeStore);

  beforeEach(() => {
    resetAddMode();
    disposeMutateAsync.mockReset();
    disposeMutateAsync.mockResolvedValue(undefined);
    batchedAdd.mockReset();
    copies = [];
  });

  afterEach(() => {
    resetAddMode();
  });

  it("asks before undoing an add whose copy has since been annotated", async () => {
    const printing = stubPrinting({ card: { name: "Yasuo" } });
    // Added this session, then graded — undoing now would destroy the grade.
    copies = [
      stubCopy({
        id: COPY_ID,
        printingId: printing.id,
        collectionId: COLLECTION_ID,
        grader: "psa",
        grade: 9.5,
        notesPrivate: "signed at worlds",
      }),
    ];
    useAddModeStore.getState().recordAdd(printing, COPY_ID);

    renderPalette(printing);
    openPrintingRow("Yasuo");
    fireEvent.click(screen.getByLabelText("Undo add Yasuo"));

    expect(await screen.findByText("Remove this copy?")).toBeInTheDocument();
    expect(disposeMutateAsync).not.toHaveBeenCalled();
    // The session entry survives the parked removal, so cancelling leaves the
    // undo available.
    expect(useAddModeStore.getState().addedItems.get(printing.id)?.quantity).toBe(1);
  });

  it("disposes without asking when the copy carries no recorded details", async () => {
    const printing = stubPrinting({ card: { name: "Ahri" } });
    copies = [stubCopy({ id: COPY_ID, printingId: printing.id, collectionId: COLLECTION_ID })];
    useAddModeStore.getState().recordAdd(printing, COPY_ID);

    renderPalette(printing);
    openPrintingRow("Ahri");
    fireEvent.click(screen.getByLabelText("Undo add Ahri"));

    await waitFor(() => {
      expect(disposeMutateAsync).toHaveBeenCalledWith({ copyIds: [COPY_ID] });
    });
    expect(screen.queryByText("Remove this copy?")).not.toBeInTheDocument();
  });

  it("never removes a copy this session did not add", async () => {
    const printing = stubPrinting({ card: { name: "Zed" } });
    // Owned, but not added through the palette — the minus stays inert rather
    // than falling through to the grid's owned-copy removal.
    copies = [stubCopy({ id: COPY_ID, printingId: printing.id, collectionId: COLLECTION_ID })];

    renderPalette(printing);
    openPrintingRow("Zed");
    const undo = screen.getByLabelText("Undo add Zed");

    expect(undo).toBeDisabled();
    fireEvent.click(undo);
    expect(disposeMutateAsync).not.toHaveBeenCalled();
  });
});
