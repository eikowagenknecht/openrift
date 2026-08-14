import type { OverlayPayload } from "@openrift/shared";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubPrinting } from "@/test/factories";

// Keyword styling is a suspending read against the init query, and none of it
// changes what this file is about — which lines the plate carries, and where.
vi.mock("@/components/cards/card-text", () => ({
  CardText: ({ text }: { text: string }) => <span>{text}</span>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { OverlayFrame, resolvePlatePosition } from "./overlay-frame";

// With art, so the card renders as an image — the no-art fallback prints the
// card's name, which would answer to the plate's own name assertions.
const PRINTING = stubPrinting({
  publicCode: "ogn-042",
  printedRulesText: "Deal 2 damage.",
  flavorText: "For Demacia.",
  images: [{ face: "front", imageId: "img-1" }],
  card: { name: "Garen", energy: 3, power: 4, might: 5 },
});

function payload(overrides: Partial<OverlayPayload> = {}): OverlayPayload {
  return { ...DEFAULT_OVERLAY_PAYLOAD, printingId: PRINTING.id, ...overrides };
}

/** @returns The element holding the card and the plate. */
function cluster(container: HTMLElement): HTMLElement {
  return container.firstElementChild?.firstElementChild as HTMLElement;
}

describe("resolvePlatePosition", () => {
  it("puts the plate inward of a card parked on the left", () => {
    expect(resolvePlatePosition("auto", "bottom-left")).toBe("right");
    expect(resolvePlatePosition("auto", "top-left")).toBe("right");
  });

  it("puts the plate inward of a card parked on the right", () => {
    expect(resolvePlatePosition("auto", "bottom-right")).toBe("left");
    expect(resolvePlatePosition("auto", "top-right")).toBe("left");
  });

  it("leaves an explicit side alone, whatever the corner", () => {
    expect(resolvePlatePosition("below", "top-right")).toBe("below");
    expect(resolvePlatePosition("left", "bottom-left")).toBe("left");
  });
});

describe("OverlayFrame placement", () => {
  it("justifies a left corner to the left edge", () => {
    // Regression: the left corners carried `flex-row-reverse` on the container
    // that holds the single cluster. It reordered nothing (one child) and
    // flipped the main axis, so `justify-start` resolved to the right edge and
    // both left corners rendered on the right.
    const { container } = render(
      <OverlayFrame payload={payload({ corner: "bottom-left" })} printing={PRINTING} />,
    );

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toContain("justify-start");
    expect(frame.className).not.toContain("flex-row-reverse");
  });

  it("justifies a right corner to the right edge", () => {
    const { container } = render(
      <OverlayFrame payload={payload({ corner: "top-right" })} printing={PRINTING} />,
    );

    expect((container.firstElementChild as HTMLElement).className).toContain("justify-end");
  });

  it("stacks the cluster when the plate goes above or below", () => {
    const { container } = render(
      <OverlayFrame payload={payload({ platePosition: "below" })} printing={PRINTING} />,
    );

    expect(cluster(container).className).toContain("flex-col");
  });

  it("keeps the cluster in a row for a side plate", () => {
    const { container } = render(
      <OverlayFrame payload={payload({ platePosition: "left" })} printing={PRINTING} />,
    );

    expect(cluster(container).className).toContain("flex-row");
  });

  it("sizes the card by scale, so a stacked plate does not eat into it", () => {
    const { container } = render(
      <OverlayFrame payload={payload({ platePosition: "above", scale: 45 })} printing={PRINTING} />,
    );

    const art = cluster(container).querySelector<HTMLElement>(".aspect-card");
    expect(art?.style.height).toBe("45%");
  });
});

describe("OverlayFrame plate contents", () => {
  it("carries the name, code and stats by default", () => {
    const { getByText } = render(<OverlayFrame payload={payload()} printing={PRINTING} />);

    expect(getByText("Garen")).toBeInTheDocument();
    expect(getByText(/OGN-042/iu)).toBeInTheDocument();
    expect(getByText("3 Energy")).toBeInTheDocument();
  });

  it("drops a line that is switched off", () => {
    const { queryByText } = render(
      <OverlayFrame
        payload={payload({
          plateFields: { ...DEFAULT_OVERLAY_PAYLOAD.plateFields, name: false, stats: false },
        })}
        printing={PRINTING}
      />,
    );

    expect(queryByText("Garen")).not.toBeInTheDocument();
    expect(queryByText("3 Energy")).not.toBeInTheDocument();
  });

  it("shows rules and flavor text when switched on", () => {
    const { getByText } = render(
      <OverlayFrame
        payload={payload({
          plateFields: {
            ...DEFAULT_OVERLAY_PAYLOAD.plateFields,
            rulesText: true,
            flavorText: true,
          },
        })}
        printing={PRINTING}
      />,
    );

    expect(getByText("Deal 2 damage.")).toBeInTheDocument();
    expect(getByText("For Demacia.")).toBeInTheDocument();
  });

  it("prefers errata over the printed rules — a stream should show the rules as played", () => {
    const errataPrinting = stubPrinting({
      printedRulesText: "Deal 2 damage.",
      card: {
        name: "Garen",
        errata: {
          correctedRulesText: "Deal 3 damage.",
          correctedEffectText: null,
          source: "Riot",
          sourceUrl: null,
          effectiveDate: "2026-01-01",
        },
      },
    });

    const { getByText, queryByText } = render(
      <OverlayFrame
        payload={payload({
          printingId: errataPrinting.id,
          plateFields: { ...DEFAULT_OVERLAY_PAYLOAD.plateFields, rulesText: true },
        })}
        printing={errataPrinting}
      />,
    );

    expect(getByText("Deal 3 damage.")).toBeInTheDocument();
    expect(queryByText("Deal 2 damage.")).not.toBeInTheDocument();
  });

  it("renders no plate at all when every line is off", () => {
    const { queryByText } = render(
      <OverlayFrame
        payload={payload({
          plateFields: {
            name: false,
            code: false,
            stats: false,
            rulesText: false,
            flavorText: false,
          },
        })}
        printing={PRINTING}
      />,
    );

    expect(queryByText("Garen")).not.toBeInTheDocument();
  });
});

describe("OverlayFrame QR code", () => {
  it("shows the code beside a bare card, with the plate off", () => {
    const { getByLabelText, queryByText } = render(
      <OverlayFrame
        payload={payload({ showPlate: false, qrUrl: "https://openrift.app/decks/share/abc" })}
        printing={PRINTING}
      />,
    );

    expect(getByLabelText("QR code for the linked page")).toBeInTheDocument();
    expect(queryByText("Garen")).not.toBeInTheDocument();
  });

  it("hides the code when no link is set", () => {
    const { queryByLabelText } = render(
      <OverlayFrame payload={payload({ qrUrl: null })} printing={PRINTING} />,
    );

    expect(queryByLabelText("QR code for the linked page")).not.toBeInTheDocument();
  });
});
