import type { DeckZone } from "@openrift/shared/types/enums";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { stubDeckBuilderCard } from "@/test/factories";

vi.mock("@/hooks/use-deck-zone-drop", () => ({
  useDeckZoneDrop: () => ({ dropRef: vi.fn(), isOver: false, dropDisabled: false }),
}));
vi.mock("@/components/deck/deck-zone-thumbs", () => ({
  ZoneThumb: ({ card }: { card: { cardName: string } }) => <div>{card.cardName}</div>,
}));
vi.mock("@/components/deck/deck-grouped-thumbs", () => ({
  GroupedThumbs: () => <div>grouped</div>,
}));
vi.mock("@/components/deck/deck-stack-pile", () => ({ StackPile: () => <div>pile</div> }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { ZoneTile } from "./deck-overview-zone-tile";

function renderZone({
  zone = "battlefield" as DeckZone,
  cards = [],
  expected,
  unknownCount,
}: {
  zone?: DeckZone;
  cards?: ReturnType<typeof stubDeckBuilderCard>[];
  expected?: number;
  unknownCount?: number;
}) {
  render(
    <ZoneTile
      deckId="deck-1"
      bandByCardKey={new Map()}
      priceTextByCardKey={new Map()}
      addRoomByCardKey={new Map()}
      resolveHoverPrintingId={() => null}
      showAllCopies={false}
      statsFocus={null}
      groupCards={(zoneCards) => [{ key: "none", label: "", cards: zoneCards }]}
      sortCards={(zoneCards) => zoneCards}
      groupBy="none"
      stacked={false}
      zone={zone}
      label="Battlefields"
      cards={cards}
      allCards={cards}
      expected={expected}
      emptyHint="Choose 3 unique Battlefield cards"
      unknownCount={unknownCount}
      collapsedZones={new Set()}
      onToggleCollapsed={vi.fn()}
      zoneViolations={[]}
      format="constructed"
      getThumbnail={() => undefined}
      readOnly
    />,
  );
}

describe("ZoneTile unknown slots", () => {
  it("says what an archived list never published, one blank per missing card", () => {
    renderZone({ expected: 3, unknownCount: 3 });
    expect(screen.getAllByText("Unknown")).toHaveLength(3);
  });

  it("counts them in one tile once there are too many to draw", () => {
    renderZone({ zone: "runes", expected: 12, unknownCount: 12 });
    expect(screen.getByText("12 unknown")).toBeDefined();
    expect(screen.queryByText("Unknown")).toBeNull();
  });

  it("appends the blanks after the cards a partly-known zone does hold", () => {
    renderZone({
      cards: [stubDeckBuilderCard({ zone: "battlefield", cardName: "Ionian Cliffside" })],
      expected: 3,
      unknownCount: 2,
    });
    expect(screen.getByText("Ionian Cliffside")).toBeDefined();
    expect(screen.getAllByText("Unknown")).toHaveLength(2);
  });

  it("counts what the record got in the header rather than what is still to add", () => {
    renderZone({
      cards: [stubDeckBuilderCard({ zone: "battlefield", cardName: "Ionian Cliffside" })],
      expected: 3,
      unknownCount: 2,
    });
    expect(screen.getByText("1 of 3 known")).toBeDefined();
    expect(screen.queryByText(/more/u)).toBeNull();
  });

  it("leaves a genuinely empty zone reading as empty", () => {
    renderZone({ expected: 3 });
    expect(screen.getByText("No Battlefields")).toBeDefined();
    expect(screen.queryByText("Unknown")).toBeNull();
  });
});
