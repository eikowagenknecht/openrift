import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

const cardId = "card-chaos-rune";
const printingX = stubPrinting({ id: "p-x", cardId, card: { name: "Chaos Rune" } });

let ownedByPrinting: Record<string, number> = {};

vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCountFor: (printingId: string, enabled: boolean) => ({
    data: enabled ? { count: ownedByPrinting[printingId] ?? 0 } : undefined,
  }),
  useOwnedCountsForPrintings: (printingIds: readonly string[], enabled: boolean) => {
    if (!enabled) {
      return { data: undefined };
    }
    const totals = Object.fromEntries(printingIds.map((id) => [id, ownedByPrinting[id] ?? 0]));
    let total = 0;
    for (const id of printingIds) {
      total += ownedByPrinting[id] ?? 0;
    }
    return { data: { totals, total, allTotals: totals, allTotal: total } };
  },
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
const { CatalogTableActions } = await import("./catalog-table-actions");

describe("CatalogTableActions", () => {
  beforeEach(() => {
    ownedByPrinting = {};
  });

  it("offers the add control on a card with no copies", () => {
    render(<CatalogTableActions printing={printingX} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add one" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove one" })).toBeDisabled();
  });

  it("enables the remove control once a copy is owned", () => {
    ownedByPrinting = { "p-x": 2 };
    render(<CatalogTableActions printing={printingX} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove one" })).toBeEnabled();
  });

  it("adds the card-wide total when copies are spread over several variants", () => {
    ownedByPrinting = { "p-x": 2, "p-y": 1 };
    render(<CatalogTableActions printing={printingX} siblingIds={["p-x", "p-y"]} />);

    expect(screen.getByText("(3)")).toBeInTheDocument();
  });

  it("omits the card-wide total when only one variant is owned", () => {
    ownedByPrinting = { "p-x": 2 };
    render(<CatalogTableActions printing={printingX} siblingIds={["p-x", "p-y"]} />);

    expect(screen.queryByText("(2)")).not.toBeInTheDocument();
  });
});
