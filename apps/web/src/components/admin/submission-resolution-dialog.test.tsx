import type { AdminCardSubmission } from "@openrift/shared/contracts/admin/card-submissions";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  submission: null as AdminCardSubmission | null,
  setResolution: vi.fn(),
}));

vi.mock("@/hooks/use-admin-card-submissions", () => ({
  useSubmissionForCandidate: () => ({ data: { submission: captured.submission } }),
  useSetSubmissionResolution: () => ({ mutateAsync: captured.setResolution, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { SubmissionResolutionDialog } from "./submission-resolution-dialog";

// Characterisation tests for the card pipeline's resolution dialog (ADR-036).
// It had none of its own, and the meta archive's resolve control now shares its
// reason-and-note fields, so these pin the behaviour that must not drift when
// the shared half changes.

describe("SubmissionResolutionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.submission = null;
    captured.setResolution.mockResolvedValue(undefined);
  });

  it("preselects the junk reason when rejecting, so one keystroke confirms", async () => {
    render(
      <SubmissionResolutionDialog candidateCardId="cand-1" mode="reject" onOpenChange={vi.fn()} />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Reject submission");
    expect(dialog).toHaveTextContent(
      "They will read: This did not look like a real Riftbound card.",
    );
  });

  it("preselects nothing when replying", async () => {
    render(
      <SubmissionResolutionDialog candidateCardId="cand-1" mode="reply" onOpenChange={vi.fn()} />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Reply to contributor");
    expect(dialog).not.toHaveTextContent("They will read:");
  });

  it("offers no way to clear the reason — this surface requires one", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionResolutionDialog candidateCardId="cand-1" mode="reject" onOpenChange={vi.fn()} />,
    );
    await user.click(await screen.findByLabelText("Reason"));
    // Base UI defers the popup into a frame after the click, so await it.
    expect(await screen.findByRole("option", { name: "Not a real card" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "No canned reason" })).not.toBeInTheDocument();
  });

  it("sends the reason and the note, and runs the caller's confirm step", async () => {
    const user = userEvent.setup();
    const onConfirmed = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <SubmissionResolutionDialog
        candidateCardId="cand-1"
        mode="reject"
        onOpenChange={onOpenChange}
        onConfirmed={onConfirmed}
      />,
    );
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(captured.setResolution).toHaveBeenCalledWith({
      candidateCardId: "cand-1",
      reason: "not_a_card",
      note: null,
    });
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("sends a whitespace-only note as null", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionResolutionDialog candidateCardId="cand-1" mode="reply" onOpenChange={vi.fn()} />,
    );
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText("Your own words (optional)"), "   ");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(captured.setResolution).toHaveBeenCalledWith(
      expect.objectContaining({ note: null, reason: null }),
    );
  });

  it("mirrors what is already stored until the admin edits something", async () => {
    captured.submission = {
      id: "sub-1",
      status: "rejected",
      reason: "bad_image",
      resolutionNote: "Too small to read.",
    } as AdminCardSubmission;
    render(
      <SubmissionResolutionDialog candidateCardId="cand-1" mode="reply" onOpenChange={vi.fn()} />,
    );
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("Your own words (optional)")).toHaveValue("Too small to read.");
  });

  it("blocks a rejection that would say nothing", async () => {
    const user = userEvent.setup();
    render(
      <SubmissionResolutionDialog candidateCardId="cand-1" mode="reject" onOpenChange={vi.fn()} />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeEnabled();

    // PRE-EXISTING QUIRK, pinned rather than endorsed: `touched` is one flag for
    // both fields, so typing a note switches the reason from its preselected
    // default to the (still empty) reason state, and the reject is blocked until
    // one is picked by hand. Unchanged by the shared-fields extraction — see the
    // note in the report.
    await user.type(screen.getByLabelText("Your own words (optional)"), "Blurry photo.");
    expect(within(dialog).getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(captured.setResolution).not.toHaveBeenCalled();
  });

  it("stays closed until a candidate is passed", () => {
    render(
      <SubmissionResolutionDialog candidateCardId={null} mode="reply" onOpenChange={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
