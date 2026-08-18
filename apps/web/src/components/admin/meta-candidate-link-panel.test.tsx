import type { MetaEventMatchSuggestion } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  suggestions: [] as MetaEventMatchSuggestion[],
  isPending: false,
  link: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useLinkMetaCandidateEvent: () => ({ mutateAsync: captured.link, isPending: false }),
  useUnlinkMetaCandidateEvent: () => ({ mutateAsync: captured.unlink, isPending: false }),
  useMetaEventMatchSuggestions: () => ({
    data: { suggestions: captured.suggestions, windowDays: 3 },
    isPending: captured.isPending,
  }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaCandidateLinkPanel } from "./meta-candidate-link-panel";

const suggestion: MetaEventMatchSuggestion = {
  metaEventId: "event-1",
  slug: "summoner-skirmish-2026",
  name: "Summoner Skirmish 2026",
  eventDate: "2026-08-15",
  format: "standard",
  deckCount: 8,
  score: 12,
  reasons: ["Same format", "1 day apart", "Name similarity 0.82"],
};

function renderPanel(metaEventId: string | null = null) {
  render(
    <MetaCandidateLinkPanel
      candidateId="cand-1"
      provider="playriftbound"
      metaEventId={metaEventId}
      metaEventName={metaEventId === null ? null : "Summoner Skirmish 2026"}
    />,
  );
}

describe("MetaCandidateLinkPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.suggestions = [];
    captured.isPending = false;
  });

  it("shows each suggestion with the reasons the API ranked it by", () => {
    captured.suggestions = [suggestion];
    renderPanel();
    expect(screen.getByText("Summoner Skirmish 2026")).toBeInTheDocument();
    for (const reason of suggestion.reasons) {
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
  });

  it("never links on render, however well a suggestion scored", () => {
    captured.suggestions = [suggestion];
    renderPanel();
    expect(captured.link).not.toHaveBeenCalled();
  });

  it("asks before linking, and links only once the confirm is clicked", async () => {
    const user = userEvent.setup();
    captured.suggestions = [suggestion];
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(captured.link).not.toHaveBeenCalled();

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent('Link this source to "Summoner Skirmish 2026"?');
    await user.click(within(dialog).getByRole("button", { name: "Link" }));
    expect(captured.link).toHaveBeenCalledWith({ id: "cand-1", metaEventId: "event-1" });
  });

  it("says why an empty list is empty rather than showing nothing", () => {
    renderPanel();
    expect(
      screen.getByText(/No archived event with this format falls within 3 days/u),
    ).toBeInTheDocument();
  });

  it("offers an unlink once the candidate is linked, and no suggestions", () => {
    captured.suggestions = [suggestion];
    renderPanel("event-1");
    expect(screen.getByRole("button", { name: "Unlink" })).toBeInTheDocument();
    expect(screen.queryByText("Same format")).not.toBeInTheDocument();
  });
});
