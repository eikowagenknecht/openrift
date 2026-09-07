import type { Domain } from "@openrift/shared/types/enums";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { stubCardOwnership, stubDeckBuilderCard } from "@/test/factories";

import { DeckListRow } from "./deck-overview-list";

const DOMAIN_COLORS = { fury: "#ff0000" };

function renderRow({
  locked = 0,
  borrowed = 0,
  price,
  reserved,
  borrowedLenders,
}: {
  locked?: number;
  borrowed?: number;
  price?: number;
  reserved: { lock: boolean; borrowed: boolean; price: boolean };
  borrowedLenders?: Record<string, string[]>;
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
      entry={stubCardOwnership({
        cardId: "c-1",
        needed: 2,
        owned: 1,
        shortfall: 1,
        locked,
        borrowed,
      })}
      rarityLabels={{}}
      domainLabels={{ fury: "Fury" }}
      domainColors={DOMAIN_COLORS}
      showOwnership
      reserved={reserved}
      borrowedLenders={borrowedLenders}
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

const BOTH = { lock: true, borrowed: false, price: true };
const NEITHER = { lock: false, borrowed: false, price: false };
const WITH_BORROWED = { lock: true, borrowed: true, price: true };

describe("DeckListRow", () => {
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

  it("reserves neither cell when the list needs neither", () => {
    expect(renderRow({ price: 420, reserved: NEITHER }).children.length).toBe(
      renderRow({ price: 420, reserved: BOTH }).children.length - 2,
    );
  });

  it("gives borrowed and unborrowed rows the same cells once the list reserves it", () => {
    expect(renderRow({ borrowed: 0, price: 420, reserved: WITH_BORROWED }).children.length).toBe(
      renderRow({ borrowed: 2, price: 420, reserved: WITH_BORROWED }).children.length,
    );
  });

  it("spends no width on the borrow cell when nothing in the deck is borrowed", () => {
    expect(renderRow({ price: 420, reserved: BOTH }).children.length).toBe(
      renderRow({ price: 420, reserved: WITH_BORROWED }).children.length - 1,
    );
  });

  it("names the lender even when the row has no shortfall left", () => {
    const row = renderRow({
      borrowed: 2,
      reserved: WITH_BORROWED,
      borrowedLenders: { "c-1": ["Alice"] },
    });
    expect(row.textContent).toContain("2");
    expect(row.querySelector('[data-slot="tooltip-trigger"]')).not.toBeNull();
  });

  it("shows the power pips on phones", () => {
    const pips = renderRow({ reserved: NEITHER }).querySelector('[aria-label="Power 2 (Fury)"]');
    expect(pips?.querySelectorAll("img").length).toBe(2);
    expect(pips?.className).not.toContain("hidden");
  });
});
