import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetaDeckListDiff, buildListDiffLines } from "@/components/admin/meta-deck-list-diff";
import type { RosterListDelta } from "@/lib/meta-deck-roster";

const zoneLabel = (zone: string) => (zone === "main" ? "Main" : zone);

const delta: RosterListDelta = {
  added: [{ cardId: "c1", zone: "main", quantity: 2, name: "Recall" }],
  removed: [{ cardId: "c2", zone: "sideboard", quantity: 1, name: "Jinx" }],
  changed: [{ cardId: "c3", zone: "main", from: 3, to: 2, name: "Ekko" }],
};

describe("buildListDiffLines", () => {
  it("orders additions, then removals, then quantity changes", () => {
    const lines = buildListDiffLines(delta, zoneLabel);
    expect(lines.map((line) => line.kind)).toEqual(["added", "removed", "changed"]);
  });

  it("prints a quantity change as a transition and a delta as a count", () => {
    const lines = buildListDiffLines(delta, zoneLabel);
    expect(lines[0]?.quantity).toBe("2");
    expect(lines[2]?.quantity).toBe("3 → 2");
  });

  it("resolves zone labels and falls back to the raw slug a source invented", () => {
    const lines = buildListDiffLines(delta, zoneLabel);
    expect(lines[0]?.zone).toBe("Main");
    expect(lines[1]?.zone).toBe("sideboard");
  });

  it("names a card whose row vanished under us", () => {
    const lines = buildListDiffLines(
      {
        added: [{ cardId: "c9", zone: "main", quantity: 1, name: null }],
        removed: [],
        changed: [],
      },
      zoneLabel,
    );
    expect(lines[0]?.name).toBe("Unknown card");
  });

  it("keys the same card in two zones apart", () => {
    const lines = buildListDiffLines(
      {
        added: [
          { cardId: "c1", zone: "main", quantity: 1, name: "Recall" },
          { cardId: "c1", zone: "sideboard", quantity: 1, name: "Recall" },
        ],
        removed: [],
        changed: [],
      },
      zoneLabel,
    );
    expect(new Set(lines.map((line) => line.key)).size).toBe(2);
  });
});

describe("MetaDeckListDiff", () => {
  it("renders an added card, a removed card, and a quantity change", () => {
    render(<MetaDeckListDiff delta={delta} zoneLabel={zoneLabel} />);
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Jinx")).toBeInTheDocument();
    expect(screen.getByText("3 → 2")).toBeInTheDocument();
  });

  it("says so when the list matches the archived deck", () => {
    render(
      <MetaDeckListDiff delta={{ added: [], removed: [], changed: [] }} zoneLabel={zoneLabel} />,
    );
    expect(screen.getByText("This list matches the archived deck.")).toBeInTheDocument();
  });

  it("takes a caller's wording for the empty case", () => {
    render(
      <MetaDeckListDiff
        delta={{ added: [], removed: [], changed: [] }}
        zoneLabel={zoneLabel}
        emptyLabel="This source published no list."
      />,
    );
    expect(screen.getByText("This source published no list.")).toBeInTheDocument();
  });
});
