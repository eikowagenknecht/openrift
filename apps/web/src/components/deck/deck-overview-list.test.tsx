import type { Domain } from "@openrift/shared";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubCardOwnership, stubDeckBuilderCard } from "@/test/factories";

import { DeckListRow } from "./deck-overview-list";

const DOMAIN_COLORS = { fury: "#ff0000" };

function renderRow({
  locked = 0,
  price,
  reserved,
}: {
  locked?: number;
  price?: number;
  reserved: { lock: boolean; price: boolean };
}) {
  const card = stubDeckBuilderCard({
    cardId: "c-1",
    cardName: "Jinx",
    quantity: 2,
    power: 2,
    domains: ["fury" as Domain],
  });
  const { container } = render(
    <DeckListRow
      card={card}
      entry={stubCardOwnership({ cardId: "c-1", needed: 2, owned: 1, shortfall: 1, locked })}
      rarityLabels={{}}
      domainLabels={{ fury: "Fury" }}
      domainColors={DOMAIN_COLORS}
      showOwnership
      reserved={reserved}
      fmtPrice={(cents) => `$${cents / 100}`}
      resolveRowPrinting={() => ({ printing: undefined, price, hoverPrintingId: null })}
    />,
  );
  const row = container.firstElementChild;
  if (!row) {
    throw new Error("row did not render");
  }
  return row;
}

const BOTH = { lock: true, price: true };
const NEITHER = { lock: false, price: false };

describe("DeckListRow", () => {
  // Regression: the row is right-packed around a flex-1 name, so a cell
  // rendered only on the rows that have one shoves their ownership fraction
  // (and everything else after the name) left of every other row's.
  it("gives locked and unlocked rows the same cells once the list reserves the lock", () => {
    expect(renderRow({ locked: 0, price: 420, reserved: BOTH }).children.length).toBe(
      renderRow({ locked: 2, price: 420, reserved: BOTH }).children.length,
    );
  });

  it("gives priced and unpriced rows the same cells once the list reserves the price", () => {
    expect(renderRow({ price: undefined, reserved: BOTH }).children.length).toBe(
      renderRow({ price: 420, reserved: BOTH }).children.length,
    );
  });

  // The reservation is per deck: a deck with nothing locked and no prices on
  // file spends no width on empty cells, which is what keeps the phone layout
  // affordable.
  it("reserves neither cell when the list needs neither", () => {
    expect(renderRow({ price: 420, reserved: NEITHER }).children.length).toBe(
      renderRow({ price: 420, reserved: BOTH }).children.length - 2,
    );
  });

  // Regression: power was the one card stat gated behind `sm:`, so a phone
  // showed a card's energy cost but not the domain pips it also costs.
  it("shows the power pips on phones", () => {
    const pips = renderRow({ reserved: NEITHER }).querySelector('[aria-label="Power 2 (Fury)"]');
    expect(pips?.querySelectorAll("img").length).toBe(2);
    expect(pips?.className).not.toContain("hidden");
  });
});
