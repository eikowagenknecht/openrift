import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/components/cards/card-detail-overlay", () => ({
  CardDetailOverlay: ({
    openPrintingId,
    printingIds,
    onOpenPrintingIdChange,
  }: {
    openPrintingId: string | null;
    printingIds: string[];
    onOpenPrintingIdChange: (printingId: string | null) => void;
  }) =>
    openPrintingId === null ? null : (
      <div>
        <span>overlay for {openPrintingId}</span>
        <span>sequence {printingIds.length === 0 ? "none" : printingIds.join(",")}</span>
        <button type="button" onClick={() => onOpenPrintingIdChange(printingIds[1] ?? null)}>
          next
        </button>
      </div>
    ),
}));

const { CardDetailNameButton, CardDetailOverlayProvider } = await import("./card-detail-opener");

describe("CardDetailNameButton", () => {
  it("opens the detail for its printing", async () => {
    const user = userEvent.setup();
    render(
      <CardDetailOverlayProvider>
        <CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Yasuo" }));

    expect(screen.getByText(/overlay for printing-1/u)).toBeInTheDocument();
  });

  it("stays closed until the name is clicked", () => {
    render(
      <CardDetailOverlayProvider>
        <CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    expect(screen.queryByText(/overlay for/u)).not.toBeInTheDocument();
  });

  it("hands the row's sequence to the overlay", async () => {
    const user = userEvent.setup();
    render(
      <CardDetailOverlayProvider>
        <CardDetailNameButton printingId="printing-1" sequence={["printing-1", "printing-2"]}>
          Yasuo
        </CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Yasuo" }));

    expect(screen.getByText("sequence printing-1,printing-2")).toBeInTheDocument();
  });

  it("gives the overlay no sequence for a row that names none", async () => {
    const user = userEvent.setup();
    render(
      <CardDetailOverlayProvider>
        <CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Yasuo" }));

    expect(screen.getByText("sequence none")).toBeInTheDocument();
  });

  it("keeps the sequence while stepping to another card", async () => {
    const user = userEvent.setup();
    render(
      <CardDetailOverlayProvider>
        <CardDetailNameButton printingId="printing-1" sequence={["printing-1", "printing-2"]}>
          Yasuo
        </CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Yasuo" }));
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(screen.getByText(/overlay for printing-2/u)).toBeInTheDocument();
    expect(screen.getByText("sequence printing-1,printing-2")).toBeInTheDocument();
  });

  it("closes when the overlay reports no printing", async () => {
    const user = userEvent.setup();
    render(
      <CardDetailOverlayProvider>
        <CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Yasuo" }));
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(screen.queryByText(/overlay for/u)).not.toBeInTheDocument();
  });

  it("renders plain text when the row's printing is unknown", () => {
    render(
      <CardDetailOverlayProvider>
        <CardDetailNameButton>Yasuo</CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    expect(screen.getByText("Yasuo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders plain text outside a provider", () => {
    render(<CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>);

    expect(screen.getByText("Yasuo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("CardDetailOverlayProvider", () => {
  it("says nothing while no detail has been opened", () => {
    const onOpenChange = vi.fn();
    render(
      <CardDetailOverlayProvider onOpenChange={onOpenChange}>
        <CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("reports opening once, and not again for a step to the next printing", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CardDetailOverlayProvider onOpenChange={onOpenChange}>
        <CardDetailNameButton printingId="printing-1" sequence={["printing-1", "printing-2"]}>
          Yasuo
        </CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Yasuo" }));
    expect(onOpenChange.mock.calls).toEqual([[true]]);

    await user.click(screen.getByRole("button", { name: "next" }));
    expect(onOpenChange.mock.calls).toEqual([[true]]);
  });

  it("reports the close when the overlay dismisses", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <CardDetailOverlayProvider onOpenChange={onOpenChange}>
        <CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>
      </CardDetailOverlayProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Yasuo" }));
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });
});
