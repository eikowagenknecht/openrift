import type { AdminCardResponse, CandidateCardResponse } from "@openrift/shared";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FieldDef } from "@/components/admin/candidate-spreadsheet";

const captured = vi.hoisted(() => ({
  spreadsheet: null as {
    fields?: { key: string }[];
    candidateRows?: unknown[];
    onCheck?: unknown;
    onUncheck?: unknown;
    columnActions?: React.ReactNode;
  } | null,
  banManager: null as { showForm?: boolean } | null,
  errataManager: null as { showForm?: boolean } | null,
  acceptCardField: vi.fn(),
}));

vi.mock("@/components/admin/candidate-spreadsheet", () => ({
  CandidateSpreadsheet: (props: { fields?: { key: string }[] }) => {
    captured.spreadsheet = props;
    return null;
  },
}));

vi.mock("@/components/admin/card-ban-manager", () => ({
  CardBanManager: (props: { showForm?: boolean }) => {
    captured.banManager = props;
    return null;
  },
}));

vi.mock("@/components/admin/card-errata-manager", () => ({
  CardErrataManager: (props: { showForm?: boolean }) => {
    captured.errataManager = props;
    return null;
  },
}));

const stubMutation = { mutate: vi.fn(), isPending: false };
vi.mock("@/hooks/use-admin-card-mutations", () => ({
  useAcceptCardField: () => ({ mutate: captured.acceptCardField, isPending: false }),
  useCheckCandidateCard: () => stubMutation,
  useUncheckCandidateCard: () => stubMutation,
}));

vi.mock("@/hooks/use-ignored-candidates", () => ({
  useIgnoreCandidateCard: () => stubMutation,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { CardFieldsSection } from "./card-fields-section";

const card = { id: "card-uuid", name: "Yasuo", errata: null } as unknown as AdminCardResponse;

function stubSource(overrides: Partial<CandidateCardResponse> = {}): CandidateCardResponse {
  return {
    id: "cc1",
    provider: "piltover",
    externalId: "x1",
    checkedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as CandidateCardResponse;
}

const FIELDS: FieldDef[] = [
  { key: "name", label: "Name" },
  { key: "rulesText", label: "Rules" },
  { key: "effectText", label: "Effect" },
  { key: "energy", label: "Energy" },
] as FieldDef[];

function renderSection(
  props: Partial<React.ComponentProps<typeof CardFieldsSection>> = {},
): ReturnType<typeof render> {
  const noop = () => {};
  return render(
    <CardFieldsSection
      card={card}
      sources={[]}
      candidateCardFields={FIELDS}
      providerSettings={[]}
      expanded
      onToggleExpanded={noop}
      onCheckAllSources={noop}
      isCheckingAllSources={false}
      showBanForm={false}
      onShowBanFormChange={noop}
      showErrataForm={false}
      onShowErrataFormChange={noop}
      invalidates={[]}
      isAdmin
      {...props}
    />,
  );
}

beforeEach(() => {
  captured.spreadsheet = null;
  captured.banManager = null;
  captured.errataManager = null;
  captured.acceptCardField.mockReset();
});

describe("CardFieldsSection", () => {
  // Rules and effect text are edited in the card-text dialog, not the compare
  // grid, so they must never reach the spreadsheet.
  it("hides the long-text fields from the compare grid", () => {
    renderSection();

    expect(captured.spreadsheet?.fields?.map((f) => f.key)).toEqual(["name", "energy"]);
  });

  it("renders nothing below the heading while folded", () => {
    const { getByText } = renderSection({ expanded: false });

    expect(getByText("Card Fields")).toBeTruthy();
    expect(captured.spreadsheet).toBeNull();
    expect(captured.banManager).toBeNull();
  });

  it("counts only the unchecked sources on the check-all button", () => {
    const onCheckAllSources = vi.fn();
    const { getByText } = renderSection({
      sources: [
        stubSource({ id: "cc1", checkedAt: null }),
        stubSource({ id: "cc2", checkedAt: null }),
        stubSource({ id: "cc3" }),
      ],
      onCheckAllSources,
    });

    getByText("Check 2 unchecked").click();
    expect(onCheckAllSources).toHaveBeenCalledTimes(1);
  });

  it("hides the check-all button once every source is checked", () => {
    const { queryByText } = renderSection({ sources: [stubSource()] });

    expect(queryByText(/unchecked/u)).toBeNull();
  });

  // Bans, errata and triage are full-admin; a card-review grant holder still
  // sees the grid but gets no check/uncheck handlers and no managers.
  it("withholds the triage affordances from non-admins", () => {
    const { queryByText } = renderSection({
      isAdmin: false,
      sources: [stubSource({ checkedAt: null })],
    });

    expect(queryByText(/unchecked/u)).toBeNull();
    expect(captured.spreadsheet?.onCheck).toBeUndefined();
    expect(captured.spreadsheet?.onUncheck).toBeUndefined();
    expect(captured.banManager).toBeNull();
    expect(captured.errataManager).toBeNull();
  });

  it("forwards the ban and errata form flags to their managers", () => {
    renderSection({ showBanForm: true, showErrataForm: true });

    expect(captured.banManager?.showForm).toBe(true);
    expect(captured.errataManager?.showForm).toBe(true);
  });

  it("toggles the fold from the heading", () => {
    const onToggleExpanded = vi.fn();
    const { getByText } = renderSection({ onToggleExpanded });

    getByText("Card Fields").click();
    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
  });
});
