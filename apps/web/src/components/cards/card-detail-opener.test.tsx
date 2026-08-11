import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

// The overlay is exercised by its own test; here it only has to report which
// printing the provider handed it.
vi.mock("@/components/cards/card-detail-overlay", () => ({
  CardDetailOverlay: ({ openPrintingId }: { openPrintingId: string | null }) =>
    openPrintingId === null ? null : <div>overlay for {openPrintingId}</div>,
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
    // The row components are shared with surfaces that mount no overlay; a name
    // that looks clickable and does nothing would be worse than a label.
    render(<CardDetailNameButton printingId="printing-1">Yasuo</CardDetailNameButton>);

    expect(screen.getByText("Yasuo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
