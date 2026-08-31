import type { AdminMetaSubmission } from "@openrift/shared/contracts/admin/meta-submissions";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  resolve: vi.fn(),
  reopen: vi.fn(),
}));

vi.mock("@/hooks/use-admin-meta-submissions", () => ({
  useResolveMetaSubmission: () => ({ mutateAsync: captured.resolve, isPending: false }),
  useReopenMetaSubmission: () => ({ mutateAsync: captured.reopen, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaSubmissionResolve } from "./meta-submission-resolve";

function submission(overrides: Partial<AdminMetaSubmission> = {}): AdminMetaSubmission {
  return {
    id: "sub-1",
    eventName: "Summoner Skirmish 2026",
    playerName: "Ana",
    kind: "new_list",
    note: "Top 8 list from the stream.",
    status: "pending",
    reason: null,
    resolutionNote: null,
    acceptedDeckId: null,
    createdAt: "2026-08-16T10:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

function renderResolve(overrides: Partial<AdminMetaSubmission> = {}) {
  render(<MetaSubmissionResolve submission={submission(overrides)} playerOverlayId="overlay-1" />);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Resolve submission" }));
  return screen.findByRole("dialog");
}

describe("MetaSubmissionResolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.resolve.mockResolvedValue({ status: "ok" });
    captured.reopen.mockResolvedValue({ status: "ok" });
  });

  it("never offers accepted as an outcome — the accept path owns that", async () => {
    const user = userEvent.setup();
    renderResolve();
    const dialog = await openDialog(user);
    const outcomes = within(dialog).getAllByRole("radio");
    expect(outcomes).toHaveLength(3);
    expect(dialog).not.toHaveTextContent(/added to the archive/iu);
  });

  it("puts already_correct on the same footing as rejected, not behind a menu", async () => {
    const user = userEvent.setup();
    renderResolve();
    const dialog = await openDialog(user);
    // Both are plain radios in the same group, visible without opening anything.
    expect(within(dialog).getByRole("radio", { name: /Already in the archive/u })).toBeVisible();
    expect(within(dialog).getByRole("radio", { name: /Reject/u })).toBeVisible();
  });

  it("defaults to already_correct, the expected outcome for a second sender", async () => {
    const user = userEvent.setup();
    renderResolve();
    const dialog = await openDialog(user);
    expect(within(dialog).getByRole("radio", { name: /Already in the archive/u })).toBeChecked();
  });

  it("posts already_correct with its canned reason in one click", async () => {
    const user = userEvent.setup();
    renderResolve();
    await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Send outcome" }));
    expect(captured.resolve).toHaveBeenCalledWith({
      submissionId: "sub-1",
      playerOverlayId: "overlay-1",
      status: "already_correct",
      reason: "already_correct",
      note: null,
    });
  });

  it("posts not_applied with no canned reason", async () => {
    const user = userEvent.setup();
    renderResolve();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /Reviewed, nothing taken/u }));
    await user.click(screen.getByRole("button", { name: "Send outcome" }));
    expect(captured.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ status: "not_applied", reason: null }),
    );
  });

  it("posts rejected with its default reason", async () => {
    const user = userEvent.setup();
    renderResolve();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /Reject/u }));
    await user.click(screen.getByRole("button", { name: "Send outcome" }));
    expect(captured.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", reason: "not_an_event" }),
    );
  });

  it("sends the reviewer's note through to the endpoint", async () => {
    const user = userEvent.setup();
    renderResolve();
    await openDialog(user);
    await user.type(
      screen.getByLabelText("Your own words (optional)"),
      "We already had this from playriftbound.",
    );
    await user.click(screen.getByRole("button", { name: "Send outcome" }));
    expect(captured.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ note: "We already had this from playriftbound." }),
    );
  });

  it("sends a whitespace-only note as null rather than an empty explanation", async () => {
    const user = userEvent.setup();
    renderResolve();
    await openDialog(user);
    await user.type(screen.getByLabelText("Your own words (optional)"), "   ");
    await user.click(screen.getByRole("button", { name: "Send outcome" }));
    expect(captured.resolve).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
  });

  it("shows the contributor the sentence behind the reason they will read", async () => {
    const user = userEvent.setup();
    renderResolve();
    const dialog = await openDialog(user);
    expect(dialog).toHaveTextContent("They will read: The archive already had this.");
  });

  it("will not let a rejection go out with nothing said", async () => {
    const user = userEvent.setup();
    renderResolve();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: /Reject/u }));
    // Clear the canned reason: a rejection with neither reason nor note would
    // reach the contributor as a bare "Not used".
    await user.click(within(dialog).getByLabelText("Reason"));
    await user.click(await screen.findByRole("option", { name: "No canned reason" }));
    expect(screen.getByRole("button", { name: "Send outcome" })).toBeDisabled();

    await user.type(screen.getByLabelText("Your own words (optional)"), "Could not verify this.");
    expect(screen.getByRole("button", { name: "Send outcome" })).toBeEnabled();
  });

  it("explains an already-accepted submission instead of failing generically", async () => {
    const user = userEvent.setup();
    captured.resolve.mockResolvedValue({ status: "alreadyAccepted" });
    renderResolve();
    const dialog = await openDialog(user);
    await user.click(screen.getByRole("button", { name: "Send outcome" }));
    expect(dialog).toHaveTextContent(/already accepted, so its outcome is settled/u);
    // The dialog stays open: the admin has to see why nothing happened.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a resolved submission's outcome with a reopen rather than looking final", async () => {
    const user = userEvent.setup();
    renderResolve({
      status: "rejected",
      reason: "not_an_event",
      resolutionNote: null,
      resolvedAt: "2026-08-17T09:30:00.000Z",
    });
    expect(screen.queryByRole("button", { name: "Resolve submission" })).not.toBeInTheDocument();
    expect(screen.getByText(/We could not find a tournament behind this/u)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(captured.reopen).toHaveBeenCalledWith({
      submissionId: "sub-1",
      playerOverlayId: "overlay-1",
    });
  });

  it("prefers the reviewer's own words over the canned sentence", () => {
    renderResolve({
      status: "not_applied",
      reason: "incomplete_list",
      resolutionNote: "Only the legend came through, sorry.",
      resolvedAt: "2026-08-17T09:30:00.000Z",
    });
    expect(screen.getByText(/Only the legend came through/u)).toBeInTheDocument();
    expect(screen.queryByText(/Too much of the deck was missing/u)).not.toBeInTheDocument();
  });

  it("offers no reopen for an accepted submission, and says why", () => {
    renderResolve({
      status: "accepted",
      acceptedDeckId: "live-1",
      resolvedAt: "2026-08-17T09:30:00.000Z",
    });
    expect(screen.queryByRole("button", { name: "Reopen" })).not.toBeInTheDocument();
    expect(screen.getByText(/Settled by the accept/u)).toBeInTheDocument();
  });
});
