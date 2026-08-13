import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { breakdownMock, siblingsMock } = vi.hoisted(() => ({
  breakdownMock: vi.fn(),
  siblingsMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ printingsByCardId: { get: siblingsMock } }),
}));

vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCollectionsByVariants: breakdownMock,
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: { finishes: { normal: "Normal", foil: "Foil" } } }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { AvailableCopiesPopover } from "./available-copies-popover";

const SIBLINGS = [
  { id: "printing-1", shortCode: "OGN-042", finish: "normal" },
  { id: "printing-2", shortCode: "OGN-042f", finish: "foil" },
];

const BREAKDOWN = [
  {
    printingId: "printing-1",
    shortCode: "OGN-042",
    finish: "normal",
    collections: [
      { collectionId: "col-1", collectionName: "Main Binder", count: 3 },
      { collectionId: "col-2", collectionName: "Trade Box", count: 1 },
    ],
  },
  {
    printingId: "printing-2",
    shortCode: "OGN-042f",
    finish: "foil",
    collections: [{ collectionId: "col-1", collectionName: "Main Binder", count: 1 }],
  },
];

describe("AvailableCopiesPopover", () => {
  beforeEach(() => {
    siblingsMock.mockReset().mockReturnValue(SIBLINGS);
    breakdownMock.mockReset().mockReturnValue({ data: BREAKDOWN });
  });

  it("renders the available count as the trigger", () => {
    const { getByRole } = render(<AvailableCopiesPopover cardId="card-1" availableCount={2} />);
    expect(getByRole("button", { name: "2 available" })).toBeTruthy();
  });

  // The whole point of the popover: the row says 2 available, the viewer owns 5
  // across two variants, so handing one over is safe.
  it("breaks the viewer's copies down by variant and collection once opened", async () => {
    const { getByRole, findAllByText, getByText } = render(
      <AvailableCopiesPopover cardId="card-1" availableCount={2} />,
    );

    await userEvent.click(getByRole("button", { name: "2 available" }));

    // Both variants sit in Main Binder, so it heads a row under each.
    expect(await findAllByText("Main Binder")).toHaveLength(2);
    expect(getByText("OGN-042")).toBeTruthy();
    expect(getByText("OGN-042f")).toBeTruthy();
    expect(getByText("Trade Box")).toBeTruthy();
    expect(getByText("5 total")).toBeTruthy();
  });

  // The breakdown reads the entire copies collection, so it must not run for
  // every suggestion row on the page — only for the one that is open.
  it("does not query the breakdown while closed", () => {
    render(<AvailableCopiesPopover cardId="card-1" availableCount={2} />);
    expect(breakdownMock).not.toHaveBeenCalled();
  });

  it("says so when the viewer owns none of the card personally", async () => {
    breakdownMock.mockReturnValue({ data: [] });
    const { getByRole, findByText } = render(
      <AvailableCopiesPopover cardId="card-1" availableCount={1} />,
    );

    await userEvent.click(getByRole("button", { name: "1 available" }));

    expect(await findByText("None in your own collections.")).toBeTruthy();
    expect(await findByText("0 total")).toBeTruthy();
  });

  it("shows a placeholder while the copies are still loading", async () => {
    breakdownMock.mockReturnValue({ data: undefined });
    const { getByRole, findByText } = render(
      <AvailableCopiesPopover cardId="card-1" availableCount={4} />,
    );

    await userEvent.click(getByRole("button", { name: "4 available" }));

    expect(await findByText("Counting your copies…")).toBeTruthy();
  });

  // A card the catalog hasn't caught up with has no siblings to break down;
  // the popover must still open rather than throwing on a missing entry.
  it("survives a card with no catalog printings", async () => {
    siblingsMock.mockReturnValue(undefined);
    breakdownMock.mockReturnValue({ data: [] });
    const { getByRole, findByText } = render(
      <AvailableCopiesPopover cardId="unknown-card" availableCount={1} />,
    );

    await userEvent.click(getByRole("button", { name: "1 available" }));

    expect(await findByText("None in your own collections.")).toBeTruthy();
    expect(breakdownMock).toHaveBeenCalledWith([], true);
  });
});
