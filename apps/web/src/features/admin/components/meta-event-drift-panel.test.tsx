import type { MetaEventDrift } from "@openrift/shared/types/api/meta";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const captured = {
  drift: undefined as MetaEventDrift | undefined,
  isPending: false,
  isError: false,
  priorities: [] as { id: string; priority: number }[],
  writes: [] as unknown[],
  releases: [] as { id: string; field: string }[],
};

vi.mock("@/features/admin/hooks/use-admin-meta-overlays", () => ({
  useMetaEventDrift: () => ({
    data: captured.drift,
    isPending: captured.isPending,
    isError: captured.isError,
  }),
  useSetMetaSourcePriority: () => ({
    mutateAsync: (input: { id: string; priority: number }) => {
      captured.priorities.push(input);
      return Promise.resolve();
    },
    isPending: false,
  }),
  useWriteMetaEventOverlayFields: () => ({
    mutateAsync: (input: unknown) => {
      captured.writes.push(input);
      return Promise.resolve({ metaEventId: "e1", created: false });
    },
    isPending: false,
  }),
  useReleaseMetaEventOverlayField: () => ({
    mutateAsync: (input: { id: string; field: string }) => {
      captured.releases.push(input);
      return Promise.resolve({ metaEventId: "e1", created: false });
    },
    isPending: false,
  }),
}));

const { MetaEventDriftPanel, isContested, isOverlayField } =
  await import("@/features/admin/components/meta-event-drift-panel");

function source(overrides: Partial<MetaEventDrift["sources"][number]> = {}) {
  return {
    id: "src-1",
    provider: "uvsgames",
    externalId: "evt-1",
    label: "uvsgames",
    priority: 5,
    hasMirror: true,
    ...overrides,
  };
}

function field(
  overrides: Partial<MetaEventDrift["fields"][number]> = {},
): MetaEventDrift["fields"][number] {
  return {
    field: "organizer",
    live: "LGS Berlin",
    bySource: [{ value: "LGS Berlin", raw: null }],
    claimedByOverlay: false,
    wonBy: "uvsgames",
    ...overrides,
  };
}

function drift(overrides: Partial<MetaEventDrift> = {}): MetaEventDrift {
  return {
    metaEventId: "e1",
    sources: [source()],
    fields: [field()],
    ...overrides,
  };
}

beforeEach(() => {
  captured.drift = drift();
  captured.isPending = false;
  captured.isError = false;
  captured.priorities = [];
  captured.writes = [];
  captured.releases = [];
});

describe("isOverlayField", () => {
  it("accepts a field an overlay can claim", () => {
    expect(isOverlayField("organizer")).toBe(true);
  });

  it("rejects a live column outside the overlay's vocabulary", () => {
    expect(isOverlayField("slug")).toBe(false);
  });
});

describe("isContested", () => {
  it("flags a source value the archive does not show", () => {
    expect(
      isContested(field({ live: "LGS Berlin", bySource: [{ value: "LGS Zaun", raw: null }] })),
    ).toBe(true);
  });

  it("ignores a source that published nothing for the field", () => {
    expect(isContested(field({ live: "LGS Berlin", bySource: [{ value: null, raw: null }] }))).toBe(
      false,
    );
  });

  it("never flags a field an overlay already owns, since nothing there resolves", () => {
    expect(
      isContested(
        field({
          claimedByOverlay: true,
          live: "LGS Berlin",
          bySource: [{ value: "LGS Zaun", raw: null }],
        }),
      ),
    ).toBe(false);
  });
});

describe("MetaEventDriftPanel", () => {
  it("tells an error apart from an event nothing is linked to", () => {
    captured.isError = true;
    captured.drift = undefined;

    render(<MetaEventDriftPanel metaEventId="e1" enabled />);

    expect(screen.getByText(/could not be loaded/u)).toBeInTheDocument();
  });

  it("says an unlinked event was entered by hand", () => {
    captured.drift = drift({ sources: [] });

    render(<MetaEventDriftPanel metaEventId="e1" enabled />);

    expect(screen.getByText(/entered by hand/u)).toBeInTheDocument();
  });

  it("hides agreeing fields behind a toggle", async () => {
    render(<MetaEventDriftPanel metaEventId="e1" enabled />);

    expect(screen.getByText("Every field agrees with the archive.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Show 1 field that agree/u }));
    expect(screen.getByText("organizer")).toBeInTheDocument();
  });

  it("offers to hand a claimed field back to the sources", async () => {
    captured.drift = drift({
      fields: [field({ claimedByOverlay: true, wonBy: null })],
    });

    render(<MetaEventDriftPanel metaEventId="e1" enabled />);
    await userEvent.click(screen.getByRole("button", { name: /Show 1 field that agree/u }));
    await userEvent.click(
      screen.getByRole("button", { name: "Hand organizer back to the sources" }),
    );

    expect(captured.releases).toEqual([{ id: "e1", field: "organizer" }]);
  });

  it("leaves an unclaimed field with nothing to release", async () => {
    render(<MetaEventDriftPanel metaEventId="e1" enabled />);
    await userEvent.click(screen.getByRole("button", { name: /Show 1 field that agree/u }));

    expect(
      screen.queryByRole("button", { name: "Hand organizer back to the sources" }),
    ).not.toBeInTheDocument();
  });

  it("writes a claim as a single-entry edits array", async () => {
    render(<MetaEventDriftPanel metaEventId="e1" enabled />);
    await userEvent.click(screen.getByRole("button", { name: /Show 1 field that agree/u }));
    await userEvent.click(screen.getByRole("button", { name: "Claim organizer for the archive" }));
    await userEvent.clear(screen.getByLabelText("New value for organizer"));
    await userEvent.type(screen.getByLabelText("New value for organizer"), "LGS Zaun");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(captured.writes).toEqual([
      { id: "e1", edits: [{ field: "organizer", value: "LGS Zaun" }] },
    ]);
  });

  it("gives no claim button to a field outside the overlay's vocabulary", async () => {
    captured.drift = drift({
      fields: [
        field({
          field: "slug",
          live: "summoner-skirmish",
          bySource: [{ value: "summoner-skirmish", raw: null }],
        }),
      ],
    });

    render(<MetaEventDriftPanel metaEventId="e1" enabled />);
    await userEvent.click(screen.getByRole("button", { name: /Show 1 field that agree/u }));

    expect(
      screen.queryByRole("button", { name: "Claim slug for the archive" }),
    ).not.toBeInTheDocument();
  });

  it("raises a source's priority, since the highest number wins a contested field", async () => {
    render(<MetaEventDriftPanel metaEventId="e1" enabled />);
    await userEvent.click(screen.getByRole("button", { name: "Raise uvsgames's priority" }));

    expect(captured.priorities).toEqual([{ id: "src-1", priority: 6 }]);
  });

  it("clamps priority at both ends of the contract's range", async () => {
    captured.drift = drift({ sources: [source({ priority: 999 })] });

    render(<MetaEventDriftPanel metaEventId="e1" enabled />);

    expect(screen.getByRole("button", { name: "Raise uvsgames's priority" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Lower uvsgames's priority" }));
    expect(captured.priorities).toEqual([{ id: "src-1", priority: 998 }]);
  });
});
