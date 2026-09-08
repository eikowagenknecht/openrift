import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  created: null as unknown,
}));

function channel(overrides: Record<string, unknown>) {
  return {
    id: "x",
    slug: "x",
    label: "X",
    description: null,
    kind: "event",
    sortOrder: 0,
    parentId: null,
    childrenLabel: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    printingCount: 0,
    ...overrides,
  };
}

const channels = [
  channel({ id: "root-1", slug: "nexus-night", label: "Nexus Night", childrenLabel: "Month" }),
  channel({
    id: "leaf-1",
    slug: "nexus-night-2026-09",
    label: "September 2026",
    parentId: "root-1",
  }),
  channel({
    id: "leaf-2",
    slug: "nexus-night-2026-10",
    label: "October 2026",
    parentId: "root-1",
  }),
  channel({ id: "root-2", slug: "prize-wall", label: "Prize Wall", kind: "product" }),
];

vi.mock("@/hooks/use-distribution-channels", () => ({
  useDistributionChannels: () => ({ data: { distributionChannels: channels } }),
  useCreateDistributionChannel: () => ({
    isPending: false,
    mutateAsync: (input: unknown) => {
      captured.created = input;
      return Promise.resolve({ slug: "nexus-night-2026-11" });
    },
  }),
}));

const { PrintingDeskChannelPicker } = await import("./printing-desk-channel-picker");

beforeEach(() => {
  captured.created = null;
});

describe("PrintingDeskChannelPicker", () => {
  it("shows nothing until something is typed", () => {
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    expect(screen.queryByText("Nexus Night › October 2026")).not.toBeInTheDocument();
  });

  it("finds a leaf by its own label", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "October");

    expect(screen.getByText("Nexus Night › October 2026")).toBeInTheDocument();
    expect(screen.queryByText("Nexus Night › September 2026")).not.toBeInTheDocument();
  });

  it("finds leaves through their parent's name", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "nexus");

    expect(screen.getByText("Nexus Night › October 2026")).toBeInTheDocument();
    expect(screen.getByText("Nexus Night › September 2026")).toBeInTheDocument();
  });

  it("offers a root with no children as a choice of its own", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "prize");

    expect(screen.getByText("Prize Wall")).toBeInTheDocument();
  });

  it("adds the picked channel", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PrintingDeskChannelPicker value={[]} onChange={onChange} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "October");
    await user.click(screen.getByText("Nexus Night › October 2026"));

    expect(onChange).toHaveBeenCalledWith(["nexus-night-2026-10"]);
  });

  it("hides an already-picked channel from the results", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={["nexus-night-2026-10"]} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "October");

    expect(screen.getAllByText("Nexus Night › October 2026")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove October 2026" })).toBeInTheDocument();
  });

  it("removes a picked channel from the chips", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PrintingDeskChannelPicker
        value={["nexus-night-2026-10", "prize-wall"]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove October 2026" }));

    expect(onChange).toHaveBeenCalledWith(["prize-wall"]);
  });

  it("offers to add the typed name under a parent", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "November 2026");

    expect(screen.getByText(/Add “November 2026” under Nexus Night/u)).toBeInTheDocument();
  });

  it("suggests a slug that follows the siblings", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "November 2026");
    await user.click(screen.getByText(/Add “November 2026” under Nexus Night/u));

    expect(screen.getByLabelText("Short name")).toHaveValue("nexus-night-2026-11");
  });

  it("creates the leaf under the chosen parent and picks it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PrintingDeskChannelPicker value={[]} onChange={onChange} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "November 2026");
    await user.click(screen.getByText(/Add “November 2026” under Nexus Night/u));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(captured.created).toEqual({
      slug: "nexus-night-2026-11",
      label: "November 2026",
      kind: "event",
      parentId: "root-1",
    });
    expect(onChange).toHaveBeenCalledWith(["nexus-night-2026-11"]);
  });

  it("lists the whole tree in the browse dialog", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Browse all" }));

    expect(screen.getByRole("dialog", { name: "Events and products" })).toBeInTheDocument();
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(screen.getByText("Prize Wall")).toBeInTheDocument();
  });

  it("picks a channel from the browse dialog and closes it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PrintingDeskChannelPicker value={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Browse all" }));
    await user.click(screen.getByText("October 2026"));

    expect(onChange).toHaveBeenCalledWith(["nexus-night-2026-10"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("collapses a series in the browse dialog", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Browse all" }));
    await user.click(screen.getByRole("button", { name: /Nexus Night/u }));

    expect(screen.queryByText("October 2026")).not.toBeInTheDocument();
  });

  it("narrows the browse dialog to a leaf and its parent", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Browse all" }));
    await user.type(screen.getByLabelText("Filter events and products"), "September");

    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(screen.getByText("Nexus Night")).toBeInTheDocument();
    expect(screen.queryByText("Prize Wall")).not.toBeInTheDocument();
  });

  it("always offers a new series or product", async () => {
    const user = userEvent.setup();
    render(<PrintingDeskChannelPicker value={[]} onChange={vi.fn()} />);

    await user.type(screen.getByLabelText("Distribution Channels"), "zaun");

    expect(screen.getByText("Add a new series or product")).toBeInTheDocument();
  });
});
