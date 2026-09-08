import type { AdminPrintingCitation } from "@openrift/shared/types/api/admin";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  citations: [] as AdminPrintingCitation[],
  isPending: false,
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-admin-printing-citations", () => ({
  useAdminPrintingCitations: () => ({
    data: { citations: captured.citations },
    isPending: captured.isPending,
  }),
  useCreatePrintingCitation: () => ({ mutateAsync: captured.create, isPending: false }),
  useDeletePrintingCitation: () => ({ mutate: captured.remove, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { PrintingCitationsEditor } from "./printing-citations-editor";

const PRINTING_ID = "b0000000-0001-4000-a000-000000000001";

const citation: AdminPrintingCitation = {
  id: "c-1",
  label: "Launch party unboxing (RiftboundDaily)",
  sourceUrl: "https://www.youtube.com/watch?v=abc123",
  canEdit: true,
};

beforeEach(() => {
  captured.citations = [];
  captured.isPending = false;
  captured.create.mockReset().mockResolvedValue(citation);
  captured.remove.mockReset();
});

describe("PrintingCitationsEditor", () => {
  it("says the card page shows no source line when nothing is cited", () => {
    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    expect(screen.getByText(/no citations yet/iu)).toBeInTheDocument();
  });

  it("lists a citation with its link", () => {
    captured.citations = [citation];

    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    expect(screen.getByText(citation.label)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: citation.sourceUrl! })).toHaveAttribute(
      "href",
      citation.sourceUrl,
    );
  });

  it("adds a citation, trimming the fields", async () => {
    const user = userEvent.setup();
    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    await user.type(screen.getByLabelText("Label"), "  Unboxing  ");
    await user.type(screen.getByLabelText("Link"), "  https://youtu.be/abc  ");
    await user.click(screen.getByRole("button", { name: /add citation/iu }));

    expect(captured.create).toHaveBeenCalledWith({
      printingId: PRINTING_ID,
      label: "Unboxing",
      sourceUrl: "https://youtu.be/abc",
    });
  });

  it("sends a null link, not an empty string, when the field is left blank", async () => {
    const user = userEvent.setup();
    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    await user.type(screen.getByLabelText("Label"), "Riot CM in the official Discord");
    await user.click(screen.getByRole("button", { name: /add citation/iu }));

    expect(captured.create).toHaveBeenCalledWith({
      printingId: PRINTING_ID,
      label: "Riot CM in the official Discord",
      sourceUrl: null,
    });
  });

  it("clears the form after a successful add", async () => {
    const user = userEvent.setup();
    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    await user.type(screen.getByLabelText("Label"), "Unboxing");
    await user.click(screen.getByRole("button", { name: /add citation/iu }));

    expect(screen.getByLabelText("Label")).toHaveValue("");
  });

  it("keeps the form filled when the add fails", async () => {
    captured.create.mockRejectedValue(new Error("conflict"));
    const user = userEvent.setup();
    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    await user.type(screen.getByLabelText("Label"), "Unboxing");
    await user.click(screen.getByRole("button", { name: /add citation/iu }));

    expect(screen.getByLabelText("Label")).toHaveValue("Unboxing");
  });

  it("cannot add a citation with no label", () => {
    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    expect(screen.getByRole("button", { name: /add citation/iu })).toBeDisabled();
  });

  it("deletes a citation", async () => {
    captured.citations = [citation];
    const user = userEvent.setup();
    render(<PrintingCitationsEditor printingId={PRINTING_ID} />);

    await user.click(screen.getByRole("button", { name: `Delete citation ${citation.label}` }));

    expect(captured.remove).toHaveBeenCalledWith({
      printingId: PRINTING_ID,
      citationId: citation.id,
    });
  });
});
