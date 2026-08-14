import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import type * as RouterModule from "@tanstack/react-router";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

const PRINTING = stubPrinting({
  images: [{ face: "front", imageId: "img-1" }],
  card: { name: "Garen" },
});

const { mockUseOverlayChannel, mockUpdateSettings } = vi.hoisted(() => ({
  mockUseOverlayChannel: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

const idleMutation = { mutate: vi.fn(), isPending: false };

vi.mock("@/hooks/use-overlay", () => ({
  useOverlayChannel: mockUseOverlayChannel,
  usePushOverlayCard: () => idleMutation,
  useClearOverlay: () => idleMutation,
  useRotateOverlayToken: () => idleMutation,
  useUpdateOverlaySettings: () => ({ mutate: mockUpdateSettings, isPending: false }),
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ printingsById: { [PRINTING.id]: PRINTING } }),
}));

vi.mock("@/components/present/card-queue-editor", () => ({
  CardQueueEditor: () => <div>queue</div>,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  getRouteApi: () => ({ useSearch: () => ({ cards: undefined }) }),
  useNavigate: () => vi.fn(),
}));

// The real Base UI slider needs pointer capture and layout boxes to produce a
// drag, neither of which jsdom provides.
vi.mock("@/components/ui/slider", () => ({
  Slider: ({
    onValueChange,
    onValueCommitted,
  }: {
    onValueChange?: (value: number[]) => void;
    onValueCommitted?: (value: number[]) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onValueChange?.([35])}>
        drag-move
      </button>
      <button type="button" onClick={() => onValueCommitted?.([35])}>
        drag-end
      </button>
    </div>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { OverlayDashboard } from "./overlay-dashboard";

/** @returns The card art's height, which is what the size slider drives. */
function cardHeight(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>(".aspect-card")?.style.height;
}

describe("OverlayDashboard card size", () => {
  beforeEach(() => {
    mockUpdateSettings.mockReset();
    mockUseOverlayChannel.mockReturnValue({
      data: {
        token: "AbC123XyZ789",
        version: 3,
        updatedAt: "2026-08-14T10:30:00.000Z",
        payload: { ...DEFAULT_OVERLAY_PAYLOAD, printingId: PRINTING.id, scale: 70 },
      },
    });
  });

  it("resizes the preview while the thumb is being dragged", () => {
    // Regression: the drafted size lived inside the settings panel, so the
    // preview above it kept the committed size until the thumb was released —
    // which is the one moment the creator is looking at the preview.
    const { container, getByText } = render(<OverlayDashboard />);
    expect(cardHeight(container)).toBe("70%");

    fireEvent.click(getByText("drag-move"));

    expect(cardHeight(container)).toBe("35%");
  });

  it("does not write the new size until the thumb is released", () => {
    const { getByText } = render(<OverlayDashboard />);

    fireEvent.click(getByText("drag-move"));
    expect(mockUpdateSettings).not.toHaveBeenCalled();

    fireEvent.click(getByText("drag-end"));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ scale: 35 });
  });

  it("falls back to the channel's size once the drag is over", () => {
    const { container, getByText } = render(<OverlayDashboard />);

    fireEvent.click(getByText("drag-move"));
    fireEvent.click(getByText("drag-end"));

    // The write is in flight; the preview goes back to what the channel says
    // rather than holding a draft that nothing owns any more.
    expect(cardHeight(container)).toBe("70%");
  });
});
