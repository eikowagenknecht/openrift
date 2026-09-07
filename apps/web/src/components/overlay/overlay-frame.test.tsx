import type { OverlayBoard, OverlayPayload } from "@openrift/shared";
import { DEFAULT_OVERLAY_PAYLOAD } from "@openrift/shared/contracts/overlay";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OverlayBoardScene } from "@/lib/overlay-board-scene";
import { stubCard, stubPrinting } from "@/test/factories";

// Keyword styling, enum labels and domain colors read the init query, which
// this file's mocks don't provide and don't need to test plate layout.
vi.mock("@/components/cards/card-text", () => ({
  CardText: ({ text }: { text: string }) => <span>{text}</span>,
}));
vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: { finishes: {}, cardSizes: {}, domains: {}, rarities: {} } }),
}));
vi.mock("@/hooks/use-domain-colors", () => ({
  useDomainColors: () => ({}),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { boardTileWidth, OverlayFrame, resolvePlatePosition } from "./overlay-frame";

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
    // The shared stat chips split the label from the value, so the label is
    // what identifies the chip.
    expect(getByText("Energy")).toBeInTheDocument();
    expect(getByText("Power")).toBeInTheDocument();
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
    expect(queryByText("Energy")).not.toBeInTheDocument();
  });

  it("switches flavor independently of the rules text", () => {
    const { getByText, queryByText } = render(
      <OverlayFrame
        payload={payload({
          plateFields: {
            ...DEFAULT_OVERLAY_PAYLOAD.plateFields,
            rulesText: false,
            flavorText: true,
          },
        })}
        printing={PRINTING}
      />,
    );

    expect(getByText("For Demacia.")).toBeInTheDocument();
    expect(queryByText("Deal 2 damage.")).not.toBeInTheDocument();
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
    const { container, queryByText } = render(
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
    // Not just empty — the black plate itself has to go, or the scene carries a
    // box with nothing in it.
    expect(container.querySelector(String.raw`.bg-black\/85`)).toBeNull();
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

describe("boardTileWidth", () => {
  it("spans the tile range across the scene's size slider", () => {
    expect(boardTileWidth(20)).toBe(44);
    expect(boardTileWidth(100)).toBe(110);
    expect(boardTileWidth(60)).toBe(77);
  });

  it("holds a size outside the slider's range at the ends", () => {
    expect(boardTileWidth(0)).toBe(44);
    expect(boardTileWidth(500)).toBe(110);
  });
});

/** The board push a scene carries, as the payload stores it. */
const BOARD: OverlayBoard = {
  title: "Origins, ranked",
  tiers: [
    { label: "S", cards: [{ cardId: "card-a", printingId: null }] },
    { label: "A", cards: [{ cardId: "card-b", printingId: null }] },
  ],
  revealCount: 1,
  direction: "best-first",
};

function row(label: string, ...cardIds: string[]) {
  return {
    label,
    cards: cardIds.map((cardId) => ({
      cardId,
      card: stubCard({ name: cardId }),
      printing: stubPrinting({
        id: `p-${cardId}`,
        cardId,
        images: [{ face: "front", imageId: `img-${cardId}` }],
      }),
      pinnedPrintingId: null,
    })),
  };
}

// Walks up from a tile's art: the thumb's own span, then the sized tile, then
// the span the spotlight ring and dimming live on.
function tileFor(art: HTMLElement): { tile: HTMLElement; spotlight: HTMLElement } {
  const tile = art.closest("span")?.parentElement as HTMLElement;
  return { tile, spotlight: tile.parentElement as HTMLElement };
}

const SCENE: OverlayBoardScene = {
  rows: [row("S", "card-a"), row("A")],
  focusCardId: "card-a",
  total: 2,
};

describe("OverlayFrame board", () => {
  it("draws the board in place of the card cluster", () => {
    const { getByText, queryByAltText } = render(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null })}
        printing={PRINTING}
        board={SCENE}
      />,
    );

    expect(getByText("Origins, ranked")).toBeInTheDocument();
    // Both tier labels, so an unreached row still holds its place on the ladder.
    expect(getByText("S")).toBeInTheDocument();
    expect(getByText("A")).toBeInTheDocument();
    // The card is not painted alongside it — the corner holds one thing.
    expect(queryByAltText("Garen")).toBeNull();
  });

  it("dims the board around the card just placed", () => {
    const { getByAltText } = render(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null })}
        printing={undefined}
        board={SCENE}
      />,
    );

    expect(tileFor(getByAltText("card-a")).spotlight.className).toContain("ring-border-accent");
  });

  it("leaves a finished board undimmed", () => {
    const { getByAltText } = render(
      <OverlayFrame
        payload={payload({ board: { ...BOARD, revealCount: 2 }, printingId: null })}
        printing={undefined}
        board={{ ...SCENE, rows: [row("S", "card-a"), row("A", "card-b")], focusCardId: null }}
      />,
    );

    expect(tileFor(getByAltText("card-b")).spotlight.className).not.toContain("opacity-30");
  });

  it("sizes the board's tiles off the scene's size slider", () => {
    const { getByAltText } = render(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null, scale: 100 })}
        printing={undefined}
        board={SCENE}
      />,
    );

    expect(tileFor(getByAltText("card-a")).tile.style.width).toBe("110px");
  });

  it("keeps the board on screen for its slide-out after it is taken down", () => {
    const { rerender, getByText } = render(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null })}
        printing={undefined}
        board={SCENE}
      />,
    );

    rerender(
      <OverlayFrame payload={payload({ board: null, printingId: null })} printing={undefined} />,
    );

    // Still mounted, moved off the edge — an exit has to animate a board rather
    // than an empty box, same as the card path.
    const boardCluster = getByText("Origins, ranked").closest("div")?.parentElement;
    expect(boardCluster?.className).toContain("opacity-0");
  });
});

describe("OverlayFrame curtain", () => {
  function boardCluster(getByText: (text: string) => HTMLElement): HTMLElement {
    return getByText("Origins, ranked").closest("div")?.parentElement as HTMLElement;
  }

  it("takes a board off screen while hidden", () => {
    const { getByText } = render(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null, hidden: true })}
        printing={undefined}
        board={SCENE}
      />,
    );

    expect(boardCluster(getByText).className).toContain("opacity-0");
  });

  it("puts the same board back when the curtain lifts, without a second push", () => {
    const { rerender, getByText } = render(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null, hidden: true })}
        printing={undefined}
        board={SCENE}
      />,
    );

    rerender(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null, hidden: false })}
        printing={undefined}
        board={SCENE}
      />,
    );

    expect(boardCluster(getByText).className).toContain("opacity-100");
  });

  it("keeps the board mounted while hidden, so the return animates", () => {
    const { getByText } = render(
      <OverlayFrame
        payload={payload({ board: BOARD, printingId: null, hidden: true })}
        printing={undefined}
        board={SCENE}
      />,
    );

    expect(getByText("Origins, ranked")).toBeTruthy();
  });
});
