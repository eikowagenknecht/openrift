import type { CandidatePrintingResponse, EnumOrders } from "@openrift/shared";
import { fixTypography } from "@openrift/shared";
import { isAcceptCardField } from "@openrift/shared/contracts/admin/card-mutations";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { EnumLabels } from "@/hooks/use-enums";

import type { FieldDef } from "./candidate-spreadsheet";
import {
  CandidateSpreadsheet,
  buildCandidateCardFields,
  buildNewCardFields,
} from "./candidate-spreadsheet";

const markerField: FieldDef = {
  key: "markerSlugs",
  label: "Markers",
  array: true,
  labeledOptions: [
    { value: "champion", label: "champion" },
    { value: "unit", label: "unit" },
    { value: "spell", label: "spell" },
  ],
};

describe("CandidateSpreadsheet multi-select", () => {
  it("batches toggles and only calls onActiveChange when the dropdown closes", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    // Open the multi-select editor by clicking the active cell (shows the current value).
    await user.click(screen.getByText("champion"));

    // Toggle two items: deselect Champion, select Unit and Spell.
    await user.click(screen.getByRole("option", { name: "champion" }));
    await user.click(screen.getByRole("option", { name: "unit" }));
    await user.click(screen.getByRole("option", { name: "spell" }));

    // No mutation fired during the intermediate toggles.
    expect(onActiveChange).not.toHaveBeenCalled();

    // Close the dropdown (Escape triggers onOpenChange(false)).
    await user.keyboard("{Escape}");

    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(onActiveChange).toHaveBeenCalledWith("markerSlugs", ["unit", "spell"]);
  });

  it("does not call onActiveChange when closed with no net changes", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByText("champion"));
    // Toggle Unit on then off — ends where it started.
    await user.click(screen.getByRole("option", { name: "unit" }));
    await user.click(screen.getByRole("option", { name: "unit" }));
    await user.keyboard("{Escape}");

    expect(onActiveChange).not.toHaveBeenCalled();
  });

  it("passes null when all items are deselected", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByText("champion"));
    await user.click(screen.getByRole("option", { name: "champion" }));
    await user.keyboard("{Escape}");

    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(onActiveChange).toHaveBeenCalledWith("markerSlugs", null);
  });

  it("filters the options by the search field", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByText("champion"));

    // The search field takes focus on open, so the filter is typeable right away.
    const search = screen.getByPlaceholderText("Search markers…");
    expect(document.activeElement).toBe(search);
    await user.keyboard("spe");

    // Only the matching option stays in the list.
    expect(screen.queryByRole("option", { name: "champion" })).toBeNull();
    await user.click(screen.getByRole("option", { name: "spell" }));
    await user.keyboard("{Escape}");

    expect(onActiveChange).toHaveBeenCalledWith("markerSlugs", ["champion", "spell"]);
  });
});

describe("CandidateSpreadsheet candidate click", () => {
  // Regression: clicking a candidate cell must copy the normalized (typography-
  // fixed) value shown in the cell, not the raw candidate. Otherwise a draft-only
  // Active column (new-printing groups, new cards) keeps the unfixed value while
  // the cell displays the fixed one — e.g. a scraped "[Empower] :rb_energy_2:"
  // stays ejected in the draft even though the cell shows "[Empower :rb_energy_2:]".
  it("copies the normalized value, not the raw candidate", async () => {
    const user = userEvent.setup();
    const onCellClick = vi.fn();
    // Not flagged richText: the active cell would render CardText (needs a
    // QueryClient). printedRulesText is still a diff field, so the candidate
    // renders via DiffText — enough to exercise the click path.
    const rulesField: FieldDef = {
      key: "printedRulesText",
      label: "Printed Rules",
      multiline: true,
    };
    // Provider scraped the ejected form; the normalizer merges the glyph back in.
    const raw = "[Empower] :rb_energy_2:";
    const fixed = "[Empower :rb_energy_2:]";

    render(
      <CandidateSpreadsheet
        fields={[rulesField]}
        activeRow={{ printedRulesText: "placeholder" }}
        candidateRows={[
          {
            id: "cand-1",
            provider: "gallery",
            checkedAt: null,
            printedRulesText: raw,
          } as unknown as CandidatePrintingResponse,
        ]}
        normalizeCandidate={(key, value) =>
          key === "printedRulesText" && typeof value === "string"
            ? fixTypography(value, { costKeywords: ["Empower"] })
            : value
        }
        onCellClick={onCellClick}
      />,
    );

    // Cells in the single field row: [field label, active, candidate].
    const cells = screen.getAllByRole("cell");
    await user.click(cells.at(-1) as HTMLElement);

    expect(onCellClick).toHaveBeenCalledWith("printedRulesText", fixed, "cand-1");
  });
});

describe("CandidateSpreadsheet reverse array order", () => {
  const tagsField: FieldDef = { key: "tags", label: "Tags", array: true };

  it("reverses the active array value when the reverse button is clicked", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();

    render(
      <CandidateSpreadsheet
        fields={[tagsField]}
        activeRow={{ tags: ["alpha", "beta"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reverse Tags order" }));

    expect(onActiveChange).toHaveBeenCalledTimes(1);
    expect(onActiveChange).toHaveBeenCalledWith("tags", ["beta", "alpha"]);
  });

  it("does not offer a reverse button for a single-value array", () => {
    render(
      <CandidateSpreadsheet
        fields={[tagsField]}
        activeRow={{ tags: ["alpha"] }}
        candidateRows={[]}
        onActiveChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Reverse Tags order" })).toBeNull();
  });

  it("does not offer a reverse button when editing is disabled", () => {
    render(
      <CandidateSpreadsheet
        fields={[tagsField]}
        activeRow={{ tags: ["alpha", "beta"] }}
        candidateRows={[]}
      />,
    );

    expect(screen.queryByRole("button", { name: "Reverse Tags order" })).toBeNull();
  });
});

describe("CandidateSpreadsheet free-text array (tags) editing", () => {
  const tagsField: FieldDef = { key: "tags", label: "Tags", array: true };

  it("swaps the active cell to the chip input on click", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CandidateSpreadsheet
        fields={[tagsField]}
        activeRow={{ tags: ["poro"] }}
        candidateRows={[]}
        onActiveChange={vi.fn()}
      />,
    );

    // Display mode shows the joined value, not a chip input.
    expect(container.querySelector('[data-slot="combobox-chip-input"]')).toBeNull();

    await user.click(screen.getByText("poro"));

    // Edit mode renders the shared ChipInput.
    expect(container.querySelector('[data-slot="combobox-chip-input"]')).not.toBeNull();
  });

  it("commits an added tag through onActiveChange", async () => {
    const user = userEvent.setup();
    const onActiveChange = vi.fn();
    const { container } = render(
      <CandidateSpreadsheet
        fields={[tagsField]}
        activeRow={{ tags: ["poro"] }}
        candidateRows={[]}
        onActiveChange={onActiveChange}
      />,
    );

    await user.click(screen.getByText("poro"));
    const input = container.querySelector('[data-slot="combobox-chip-input"]') as HTMLInputElement;
    await user.type(input, "yordle{Enter}");

    expect(onActiveChange).toHaveBeenLastCalledWith("tags", ["poro", "yordle"]);
  });

  it("does not use the chip input for option-backed array fields", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CandidateSpreadsheet
        fields={[markerField]}
        activeRow={{ markerSlugs: ["champion"] }}
        candidateRows={[]}
        onActiveChange={vi.fn()}
      />,
    );

    await user.click(screen.getByText("champion"));

    // markerSlugs has labeledOptions, so it opens the multi-select dropdown,
    // never the free-text chip input.
    expect(container.querySelector('[data-slot="combobox-chip-input"]')).toBeNull();
  });
});

describe("CandidateSpreadsheet rarity icon", () => {
  const rarityField: FieldDef = {
    key: "rarity",
    label: "Rarity",
    labeledOptions: [{ value: "epic", label: "Epic" }],
    iconCategory: "rarities",
  };

  it("renders the rarity badge icon before the label in the active cell", () => {
    render(
      <CandidateSpreadsheet
        fields={[rarityField]}
        activeRow={{ rarity: "epic" }}
        candidateRows={[]}
      />,
    );

    // Cells in the single field row: [field label, active].
    const activeCell = screen.getAllByRole("cell").at(1) as HTMLElement;
    const icon = activeCell.querySelector("img");
    expect(icon?.getAttribute("src")).toBe("/images/rarities/epic-28x28.webp");
    expect(within(activeCell).getByText("Epic")).toBeDefined();
  });
});

describe("CandidateSpreadsheet submitter attribution", () => {
  const nameField: FieldDef = { key: "name", label: "Name" };

  const cardRow = { id: "cc1", provider: "usersubmission", name: "Yasuo", checkedAt: null };

  it("names the submitter under a user-submission column header", () => {
    render(
      <CandidateSpreadsheet
        fields={[nameField]}
        activeRow={null}
        candidateRows={[cardRow as never]}
        submitters={{ cc1: { userId: "u1", name: "tempest_fox", note: null } }}
      />,
    );

    expect(screen.getByText("by tempest_fox")).toBeDefined();
  });

  it("renders no attribution for a column with no submitter", () => {
    render(
      <CandidateSpreadsheet
        fields={[nameField]}
        activeRow={null}
        candidateRows={[{ ...cardRow, provider: "gallery" } as never]}
        submitters={{}}
      />,
    );

    expect(screen.queryByText(/^by /u)).toBeNull();
    expect(screen.queryByRole("button", { name: "Show submission note" })).toBeNull();
  });

  it("keeps the note behind the message icon until it is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CandidateSpreadsheet
        fields={[nameField]}
        activeRow={null}
        candidateRows={[cardRow as never]}
        submitters={{ cc1: { userId: "u1", name: "tempest_fox", note: "Energy is 3, not 4." } }}
      />,
    );

    expect(screen.queryByText("Energy is 3, not 4.")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show submission note" }));

    expect(screen.getByText("Energy is 3, not 4.")).toBeDefined();
  });

  it("offers no note popover when the submitter left none", () => {
    render(
      <CandidateSpreadsheet
        fields={[nameField]}
        activeRow={null}
        candidateRows={[cardRow as never]}
        submitters={{ cc1: { userId: "u1", name: "tempest_fox", note: null } }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Show submission note" })).toBeNull();
  });

  // A candidate printing carries no attribution of its own — an image
  // suggestion's submitter lives on the parent candidate card.
  it("resolves a printing row's submitter through its parent card id", () => {
    const printingRow = {
      id: "cp1",
      candidateCardId: "cc1",
      shortCode: "OGN-001",
      checkedAt: null,
    };

    render(
      <CandidateSpreadsheet
        fields={[nameField]}
        activeRow={null}
        candidateRows={[printingRow as never]}
        providerLabels={{ cc1: "usersubmission" }}
        submitters={{ cc1: { userId: "u1", name: "ionia_main", note: null } }}
      />,
    );

    expect(screen.getByText("by ionia_main")).toBeDefined();
  });
});

describe("buildCandidateCardFields", () => {
  // Regression: without `type: "number"`, hand-typed Energy/Power/Might values
  // commit as strings and the accept endpoint rejects them with a generic
  // "Input validation failed".
  it("marks the numeric card fields as number so typed values are coerced", () => {
    const orders = { superTypes: [], cardTypes: [], domains: [] } as unknown as EnumOrders;
    const labels = { superTypes: {}, cardTypes: {}, domains: {} } as unknown as EnumLabels;
    const byKey = new Map(buildCandidateCardFields(orders, labels).map((f) => [f.key, f]));
    for (const key of ["energy", "power", "might", "mightBonus"] as const) {
      expect(byKey.get(key)?.type).toBe("number");
    }
  });

  // Regression: `rulesText` / `effectText` are not columns on `cards` (card text
  // lives on the printing and on the errata row), so the accept-field endpoint
  // rejects both. They used to sit in this list, and "Accept all fields" sent
  // them and got a 400 for each.
  it("omits the two text keys the accept-field endpoint cannot write", () => {
    const orders = { superTypes: [], cardTypes: [], domains: [] } as unknown as EnumOrders;
    const labels = { superTypes: {}, cardTypes: {}, domains: {} } as unknown as EnumLabels;
    const keys = buildCandidateCardFields(orders, labels).map((f) => f.key);

    expect(keys).not.toContain("rulesText");
    expect(keys).not.toContain("effectText");
    for (const key of keys) {
      expect(key === "externalId" || key === "extraData" || isAcceptCardField(key)).toBe(true);
    }
  });
});

describe("buildNewCardFields", () => {
  // The new-card page still shows the provider's text so the admin can read it
  // while composing; it just never accepts either key onto a card.
  it("adds the provider text columns back, right after domains", () => {
    const orders = { superTypes: [], cardTypes: [], domains: [] } as unknown as EnumOrders;
    const labels = { superTypes: {}, cardTypes: {}, domains: {} } as unknown as EnumLabels;
    const keys = buildNewCardFields(orders, labels).map((f) => f.key);

    expect(keys.indexOf("rulesText")).toBe(keys.indexOf("domains") + 1);
    expect(keys.indexOf("effectText")).toBe(keys.indexOf("domains") + 2);
  });
});

// The grid is generic over its row type: it reads id, checkedAt, an optional
// provider and an optional parent card id, and indexes everything else by field
// key. A candidate entity outside the card pipeline — a meta-archive event
// (ADR-014) — passes its own row shape with no cast at all.
describe("CandidateSpreadsheet foreign row shapes", () => {
  interface MetaLikeRow {
    id: string;
    checkedAt: string | null;
    name: string;
    eventDate: string;
  }

  const metaFields: FieldDef[] = [
    { key: "name", label: "Name" },
    { key: "eventDate", label: "Date" },
  ];

  const metaRow: MetaLikeRow = {
    id: "abcdef1234567890",
    checkedAt: null,
    name: "Summoner Skirmish Berlin",
    eventDate: "2026-08-01",
  };

  it("reads a row that carries neither a provider nor a parent card id", () => {
    render(<CandidateSpreadsheet fields={metaFields} activeRow={null} candidateRows={[metaRow]} />);

    // No provider to head the column with, and no parent to inherit one from,
    // so the header falls back to a stand-in derived from the row id.
    expect(screen.getByText("provider-abcdef12")).toBeDefined();
    expect(screen.getByText("Summoner Skirmish Berlin")).toBeDefined();
    expect(screen.getByText("2026-08-01")).toBeDefined();
  });

  it("heads the column with the row's own provider when it has one", () => {
    render(
      <CandidateSpreadsheet
        fields={metaFields}
        activeRow={null}
        candidateRows={[{ ...metaRow, provider: "uvsgames" }]}
      />,
    );

    expect(screen.getByText("uvsgames")).toBeDefined();
    expect(screen.queryByText(/^provider-/u)).toBeNull();
  });

  it("resolves a parentless row's submitter by its own id", () => {
    render(
      <CandidateSpreadsheet
        fields={metaFields}
        activeRow={null}
        candidateRows={[metaRow]}
        submitters={{ [metaRow.id]: { userId: "u1", name: "shurima_main", note: null } }}
      />,
    );

    expect(screen.getByText("by shurima_main")).toBeDefined();
  });

  it("hands the row back to columnClassName with its own type", () => {
    const columnClassName = vi.fn((row: MetaLikeRow) => `col-${row.eventDate}`);

    render(
      <CandidateSpreadsheet
        fields={metaFields}
        activeRow={null}
        candidateRows={[metaRow]}
        columnClassName={columnClassName}
      />,
    );

    expect(columnClassName).toHaveBeenCalledWith(metaRow);
    expect(screen.getByRole("columnheader", { name: /provider-abcdef12/u }).className).toContain(
      "col-2026-08-01",
    );
  });

  it("still marks a reviewed row as checked", () => {
    render(
      <CandidateSpreadsheet
        fields={metaFields}
        activeRow={null}
        candidateRows={[{ ...metaRow, checkedAt: "2026-08-02T10:00:00.000Z" }]}
        onUncheck={vi.fn()}
      />,
    );

    expect(screen.getByRole("columnheader", { name: /provider-abcdef12/u }).className).toContain(
      "opacity-50",
    );
  });
});
