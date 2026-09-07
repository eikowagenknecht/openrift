import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PrintingGroup } from "@/components/admin/candidate-spreadsheet";
import type * as CardDetailShared from "@/components/admin/card-detail-shared";

const spreadsheetProps: { costKeywords?: readonly string[] } = {};
vi.mock("@/components/admin/candidate-spreadsheet", () => ({
  CandidateSpreadsheet: (props: { costKeywords?: readonly string[] }) => {
    spreadsheetProps.costKeywords = props.costKeywords;
    return null;
  },
}));

// The group card pulls its mutations from useCardDetailData; stub them so the
// component renders without a QueryClient. buildPrintingNormalizer stays real.
vi.mock("@/components/admin/card-detail-shared", async () => {
  const actual = await vi.importActual<typeof CardDetailShared>(
    "@/components/admin/card-detail-shared",
  );
  const stubMutation = { mutate: vi.fn(), isPending: false };
  return {
    ...actual,
    useCardDetailData: () => ({
      checkPrintingSource: stubMutation,
      uncheckPrintingSource: stubMutation,
      checkAllCandidatePrintings: stubMutation,
    }),
  };
});

// oxlint-disable-next-line import/first -- must import after vi.mock
import { NewPrintingGroupCard } from "./new-printing-group-card";

const group = {
  groupKey: "g1",
  expectedPrintingId: "AAA-001",
  candidates: [],
} as unknown as PrintingGroup & { groupKey: string };

const noop = () => {};

describe("NewPrintingGroupCard", () => {
  it("forwards costKeywords to the candidate spreadsheet's Fix reformat", () => {
    render(
      <NewPrintingGroupCard
        group={group}
        existingPrintings={[]}
        providerLabels={{}}
        providerNames={{}}
        providerSubmitters={{}}
        providerSettings={[]}
        setTotals={{}}
        setReleaseYears={{}}
        isExpanded
        onToggle={noop}
        onAccept={noop}
        onLink={noop}
        onCopy={noop}
        onDelete={noop}
        onIgnore={noop}
        isAccepting={false}
        isAdmin
        printingFields={[]}
        costKeywords={["Empower"]}
        invalidates={[]}
      />,
    );

    expect(spreadsheetProps.costKeywords).toEqual(["Empower"]);
  });

  it("offers a one-click assign to the suggested printing when no exact match exists", () => {
    const onLink = vi.fn();
    const suggestedGroup = {
      groupKey: "g1",
      expectedPrintingId: "OGN-066:promo:foil",
      suggestedPrintingId: "p-le",
      candidates: [{ id: "cp-1" }, { id: "cp-2" }],
    } as unknown as PrintingGroup & { groupKey: string };
    const existing = [
      { id: "p-le", expectedPrintingId: "OGN-066:launch-exclusive:foil" },
    ] as never[];

    const { getByText } = render(
      <NewPrintingGroupCard
        group={suggestedGroup}
        existingPrintings={existing}
        providerLabels={{}}
        providerNames={{}}
        providerSubmitters={{}}
        providerSettings={[]}
        setTotals={{}}
        setReleaseYears={{}}
        isExpanded={false}
        onToggle={noop}
        onAccept={noop}
        onLink={onLink}
        onCopy={noop}
        onDelete={noop}
        onIgnore={noop}
        isAccepting={false}
        isAdmin
        printingFields={[]}
        invalidates={[]}
      />,
    );

    getByText("Assign all to OGN-066:launch-exclusive:foil").click();
    expect(onLink).toHaveBeenCalledWith("p-le", ["cp-1", "cp-2"]);
  });

  it("keeps the exact-match assign button when the expected id matches an existing printing", () => {
    const exactGroup = {
      groupKey: "g1",
      expectedPrintingId: "OGN-066::foil",
      suggestedPrintingId: "p-exact",
      candidates: [],
    } as unknown as PrintingGroup & { groupKey: string };
    const existing = [{ id: "p-exact", expectedPrintingId: "OGN-066::foil" }] as never[];

    const { getByText, queryByText } = render(
      <NewPrintingGroupCard
        group={exactGroup}
        existingPrintings={existing}
        providerLabels={{}}
        providerNames={{}}
        providerSubmitters={{}}
        providerSettings={[]}
        setTotals={{}}
        setReleaseYears={{}}
        isExpanded={false}
        onToggle={noop}
        onAccept={noop}
        onLink={noop}
        onCopy={noop}
        onDelete={noop}
        onIgnore={noop}
        isAccepting={false}
        isAdmin
        printingFields={[]}
        invalidates={[]}
      />,
    );

    expect(getByText("Assign all to existing")).toBeTruthy();
    expect(queryByText(/Assign all to OGN-066/u)).toBeNull();
  });
});
