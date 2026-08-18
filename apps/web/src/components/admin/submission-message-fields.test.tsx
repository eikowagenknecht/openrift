import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SubmissionMessageFields } from "@/components/admin/submission-message-fields";

type Reason = "duplicate" | "unverified";

const reasonOrder: Reason[] = ["duplicate", "unverified"];
const reasonLabels: Record<Reason, string> = {
  duplicate: "Already submitted",
  unverified: "Could not verify",
};
const reasonSentences: Record<Reason, string> = {
  duplicate: "Someone had already sent this in.",
  unverified: "We could not confirm this against a source.",
};

function renderFields(
  overrides: Partial<React.ComponentProps<typeof SubmissionMessageFields<Reason>>> = {},
) {
  const onReasonChange = vi.fn();
  const onNoteChange = vi.fn();
  render(
    <SubmissionMessageFields
      idPrefix="test"
      reasonOrder={reasonOrder}
      reasonLabels={reasonLabels}
      reasonSentences={reasonSentences}
      reason={null}
      note=""
      onReasonChange={onReasonChange}
      onNoteChange={onNoteChange}
      {...overrides}
    />,
  );
  return { onReasonChange, onNoteChange };
}

describe("SubmissionMessageFields", () => {
  it("shows the contributor's sentence for the picked reason", () => {
    renderFields({ reason: "duplicate" });
    expect(
      screen.getByText("They will read: Someone had already sent this in."),
    ).toBeInTheDocument();
  });

  it("says nothing when no reason is picked", () => {
    renderFields();
    expect(screen.queryByText(/They will read:/u)).not.toBeInTheDocument();
  });

  it("hides the clear option unless the surface allows an empty reason", async () => {
    const user = userEvent.setup();
    renderFields();
    await user.click(screen.getByLabelText("Reason"));
    expect(await screen.findByRole("option", { name: "Already submitted" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "No canned reason" })).not.toBeInTheDocument();
  });

  it("offers the clear option when the surface allows one", async () => {
    const user = userEvent.setup();
    renderFields({ allowNoReason: true });
    await user.click(screen.getByLabelText("Reason"));
    expect(await screen.findByRole("option", { name: "No canned reason" })).toBeInTheDocument();
  });

  it("reports a picked reason to the caller", async () => {
    const user = userEvent.setup();
    const { onReasonChange } = renderFields();
    await user.click(screen.getByLabelText("Reason"));
    await user.click(await screen.findByRole("option", { name: "Could not verify" }));
    expect(onReasonChange).toHaveBeenCalledWith("unverified");
  });

  it("reports clearing the reason as null, not as its sentinel", async () => {
    const user = userEvent.setup();
    const { onReasonChange } = renderFields({ allowNoReason: true, reason: "duplicate" });
    await user.click(screen.getByLabelText("Reason"));
    await user.click(await screen.findByRole("option", { name: "No canned reason" }));
    expect(onReasonChange).toHaveBeenCalledWith(null);
  });

  it("reports what was typed in the note", async () => {
    const user = userEvent.setup();
    const { onNoteChange } = renderFields();
    await user.type(screen.getByLabelText("Your own words (optional)"), "x");
    expect(onNoteChange).toHaveBeenCalledWith("x");
  });

  it("namespaces its field ids so two can share a page", () => {
    renderFields({ idPrefix: "meta-resolution" });
    expect(screen.getByLabelText("Your own words (optional)")).toHaveAttribute(
      "id",
      "meta-resolution-note",
    );
  });
});
