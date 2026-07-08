import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PrintingGroup } from "@/components/admin/candidate-spreadsheet";
import type * as CardDetailShared from "@/components/admin/card-detail-shared";

// Capture the props the group card hands to CandidateSpreadsheet so we can assert
// the cost-keyword list is forwarded to the "Fix" reformat path.
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
  // Regression: the "Fix" button reformats via fixTypography, which only keeps a
  // cost keyword's glyphs inside its bracket (e.g. [Empower :rb_energy_1:]) when
  // the keyword is in the forwarded costKeywords list. When the group card
  // dropped the prop, every Fix click ejected the glyphs to [Empower] :rb_...:.
  it("forwards costKeywords to the candidate spreadsheet's Fix reformat", () => {
    render(
      <NewPrintingGroupCard
        group={group}
        existingPrintings={[]}
        providerLabels={{}}
        providerNames={{}}
        providerSettings={[]}
        setTotals={{}}
        isExpanded
        onToggle={noop}
        onAccept={noop}
        onLink={noop}
        onCopy={noop}
        onDelete={noop}
        onIgnore={noop}
        isAccepting={false}
        printingFields={[]}
        costKeywords={["Empower"]}
        invalidates={[]}
      />,
    );

    expect(spreadsheetProps.costKeywords).toEqual(["Empower"]);
  });
});
