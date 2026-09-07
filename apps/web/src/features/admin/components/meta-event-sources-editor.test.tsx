import type { AdminMetaEventSource } from "@openrift/shared/types/api/meta";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  sources: [] as AdminMetaEventSource[],
  isPending: false,
  create: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/features/admin/hooks/use-admin-meta", () => ({
  useAdminMetaEventSources: () => ({
    data: { sources: captured.sources },
    isPending: captured.isPending,
  }),
  useCreateMetaEventSource: () => ({ mutateAsync: captured.create, isPending: false }),
  useDeleteMetaEventSource: () => ({ mutate: captured.remove, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaEventSourcesEditor } from "./meta-event-sources-editor";

const providerSource: AdminMetaEventSource = {
  id: "src-1",
  provider: "playriftbound",
  externalId: "pr-1",
  label: "playriftbound",
  sourceUrl: "https://example.test/pr-1",
};

const handSource: AdminMetaEventSource = {
  id: "src-2",
  provider: null,
  externalId: null,
  label: "Twitch VOD",
  sourceUrl: null,
};

describe("MetaEventSourcesEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.sources = [];
    captured.isPending = false;
    captured.create.mockResolvedValue(handSource);
  });

  it("lists both kinds of citation", () => {
    captured.sources = [providerSource, handSource];
    render(<MetaEventSourcesEditor eventId="event-1" />);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("playriftbound");
    expect(rows[1]).toHaveTextContent("Twitch VOD");
  });

  it("gives a hand-entered citation a delete and a provider one none", () => {
    captured.sources = [providerSource, handSource];
    render(<MetaEventSourcesEditor eventId="event-1" />);
    const deletes = screen.getAllByRole("button", { name: /^Delete citation/u });
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toHaveAccessibleName("Delete citation Twitch VOD");
  });

  it("says who owns a provider citation instead of offering to delete it", () => {
    captured.sources = [providerSource];
    render(<MetaEventSourcesEditor eventId="event-1" />);
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Unlink the source to remove")).toBeInTheDocument();
  });

  it("deletes a hand-entered citation", async () => {
    const user = userEvent.setup();
    captured.sources = [handSource];
    render(<MetaEventSourcesEditor eventId="event-1" />);
    await user.click(screen.getByRole("button", { name: "Delete citation Twitch VOD" }));
    expect(captured.remove).toHaveBeenCalledWith({ eventId: "event-1", sourceId: "src-2" });
  });

  it("adds a hand-entered citation and clears the form", async () => {
    const user = userEvent.setup();
    render(<MetaEventSourcesEditor eventId="event-1" />);
    const labelInput = screen.getByLabelText("Label");
    await user.type(labelInput, "Twitch VOD");
    await user.type(screen.getByLabelText("Link"), "https://example.test/vod");
    await user.click(screen.getByRole("button", { name: "Add citation" }));

    expect(captured.create).toHaveBeenCalledWith({
      eventId: "event-1",
      label: "Twitch VOD",
      sourceUrl: "https://example.test/vod",
    });
    expect(labelInput).toHaveValue("");
  });

  it("sends a blank link as null rather than an empty string", async () => {
    const user = userEvent.setup();
    render(<MetaEventSourcesEditor eventId="event-1" />);
    await user.type(screen.getByLabelText("Label"), "Standings photo");
    await user.click(screen.getByRole("button", { name: "Add citation" }));
    expect(captured.create).toHaveBeenCalledWith({
      eventId: "event-1",
      label: "Standings photo",
      sourceUrl: null,
    });
  });

  it("will not add a citation with no label", () => {
    render(<MetaEventSourcesEditor eventId="event-1" />);
    expect(screen.getByRole("button", { name: "Add citation" })).toBeDisabled();
  });

  it("offers no way to type a provider key", () => {
    render(<MetaEventSourcesEditor eventId="event-1" />);
    expect(screen.queryByLabelText(/provider/iu)).not.toBeInTheDocument();
  });
});
