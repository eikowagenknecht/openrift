import type { ListEntryDetailResponse, Printing } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_TRADE_PREFERENCE, stubPrinting } from "@/test/factories";

const viPrinting = stubPrinting({ id: "p-vi", cardId: "card-vi", card: { name: "Vi" } });
const jinxPrinting = stubPrinting({ id: "p-jinx", cardId: "card-jinx", card: { name: "Jinx" } });

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    printingsById: { [viPrinting.id]: viPrinting, [jinxPrinting.id]: jinxPrinting },
    // The export sorts by card ID, which orders by set before card number.
    sets: [{ id: viPrinting.setId, setType: "main" }],
  }),
}));

// The filter pass itself is covered by use-filtered-list-entries.test.ts; the
// dialog only has to scope the export to whatever it reports.
let filtered: { hasActiveFilters: boolean; filteredEntries: ListEntryDetailResponse[] } = {
  hasActiveFilters: false,
  filteredEntries: [],
};

vi.mock("@/hooks/use-filtered-list-entries", () => ({
  useFilteredListEntries: () => filtered,
}));

const { ListExportDialog } = await import("./list-export-dialog");

const baseEntry = {
  listId: "list-1",
  ruleQuantity: 0,
  source: "manual",
  quantity: 1,
  tradeOverride: EMPTY_TRADE_PREFERENCE,
} as const;

function cardEntry(id: string, cardId: string, cardName: string): ListEntryDetailResponse {
  return { ...baseEntry, id, kind: "card", cardId, cardName };
}

function printingEntry(id: string, printing: Printing): ListEntryDetailResponse {
  return {
    ...baseEntry,
    id,
    kind: "printing",
    printingId: printing.id,
    cardName: printing.card.name,
    setId: printing.setId,
    rarity: printing.rarity,
    finish: printing.finish,
    shortCode: printing.shortCode,
    language: printing.language,
    imageId: null,
  };
}

const viEntry = cardEntry("e-1", "card-vi", "Vi");
const jinxEntry = cardEntry("e-2", "card-jinx", "Jinx");

function setup(entries: ListEntryDetailResponse[], kind: "card" | "printing" = "card") {
  render(
    <ListExportDialog
      listName="Piltover picks"
      kind={kind}
      entries={entries}
      open
      onOpenChange={vi.fn()}
    />,
  );
}

const exportText = () => (screen.getAllByRole("textbox")[0] as HTMLTextAreaElement).value;

describe("ListExportDialog", () => {
  beforeEach(() => {
    filtered = { hasActiveFilters: false, filteredEntries: [] };
  });

  it("exports the whole list and offers no filter toggle when no filters are active", () => {
    setup([viEntry, jinxEntry]);

    expect(screen.queryByRole("checkbox", { name: /current filters/u })).not.toBeInTheDocument();
    expect(exportText()).toBe("1 Vi\n1 Jinx");
  });

  it("defaults to the filtered subset when filters are active", () => {
    filtered = { hasActiveFilters: true, filteredEntries: [jinxEntry] };
    setup([viEntry, jinxEntry]);

    expect(
      screen.getByRole("checkbox", { name: "Only cards matching the current filters (1 of 2)" }),
    ).toBeChecked();
    expect(exportText()).toBe("1 Jinx");
  });

  it("falls back to the whole list when the filter scope is unchecked", async () => {
    const user = userEvent.setup();
    filtered = { hasActiveFilters: true, filteredEntries: [jinxEntry] };
    setup([viEntry, jinxEntry]);

    await user.click(
      screen.getByRole("checkbox", { name: "Only cards matching the current filters (1 of 2)" }),
    );

    expect(exportText()).toBe("1 Vi\n1 Jinx");
  });

  it("scopes the Cardmarket wants block to the filtered subset too", () => {
    filtered = { hasActiveFilters: true, filteredEntries: [jinxEntry] };
    setup([viEntry, jinxEntry]);

    const wants = screen.getAllByRole("textbox")[1] as HTMLTextAreaElement;
    expect(wants.value).toBe("1x Jinx");
  });

  it("counts the CSV download against the filtered subset", () => {
    const entries = [printingEntry("e-1", viPrinting), printingEntry("e-2", jinxPrinting)];
    filtered = { hasActiveFilters: true, filteredEntries: [entries[1]] };
    setup(entries, "printing");

    expect(screen.getByRole("button", { name: "Export 1 card" })).toBeInTheDocument();
  });
});
