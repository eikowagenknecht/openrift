import type { AdminMetaEvent, MetaCandidateSource } from "@openrift/shared";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { FieldDef } from "@/components/admin/candidate-spreadsheet";

const captured = vi.hoisted(() => ({
  props: null as {
    fields?: FieldDef<string>[];
    activeRow?: Record<string, unknown> | null;
    candidateRows?: { id: string; provider?: string }[];
    onCellClick?: (field: string, value: unknown, candidateId: string) => void;
    onActiveChange?: (field: string, value: unknown) => void;
  } | null,
  acceptField: vi.fn(),
  updateEvent: vi.fn(),
}));

// The grid itself is the card pipeline's, already covered by its own tests;
// what matters here is the props this surface hands it and what the callbacks
// dispatch.
vi.mock("@/components/admin/candidate-spreadsheet", () => ({
  CandidateSpreadsheet: (props: Record<string, unknown>) => {
    captured.props = props;
    return null;
  },
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [
      { slug: "standard", label: "Standard" },
      { slug: "limited", label: "Limited" },
    ],
    labels: { standard: "Standard", limited: "Limited" },
  }),
}));

vi.mock("@/hooks/use-admin-meta", () => ({
  useUpdateMetaEvent: () => ({ mutate: captured.updateEvent, isPending: false }),
}));

vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useAcceptMetaEventField: () => ({ mutate: captured.acceptField, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaCandidateEventGrid, metaEventFieldPatch } from "./meta-candidate-event-grid";

const event: AdminMetaEvent = {
  id: "event-1",
  slug: "summoner-skirmish-2026",
  name: "Summoner Skirmish 2026",
  eventDate: "2026-08-15",
  format: "standard",
  playerCount: 64,
  organizer: "LGS Berlin",
  notes: null,
  tier: "store",
  country: null,
  location: null,
  playerRowCount: 64,
  deckCount: 8,
  sources: [],
};

function source(id: string, provider: string, name: string): MetaCandidateSource {
  return {
    id,
    provider,
    externalId: `${provider}-1`,
    name,
    eventDate: "2026-08-15",
    format: "standard",
    playerCount: 64,
    organizer: null,
    sourceUrl: `https://example.test/${provider}`,
    notes: null,
    tier: null,
    country: null,
    location: null,
    checkedAt: null,
    players: [],
  };
}

function renderGrid(sources: MetaCandidateSource[]) {
  render(
    <MetaCandidateEventGrid
      event={event}
      sources={sources}
      onAcceptSource={vi.fn()}
      onUnlinkSource={vi.fn()}
    />,
  );
}

describe("MetaCandidateEventGrid", () => {
  it("gives the grid one column per linked source", () => {
    renderGrid([
      source("s1", "uvsgames", "Summoner Skirmish"),
      source("s2", "playriftbound", "Summoner Skirmish 2026 Finals"),
    ]);
    expect(captured.props?.candidateRows?.map((row) => row.provider)).toEqual([
      "uvsgames",
      "playriftbound",
    ]);
  });

  it("compares against the live event's own row", () => {
    renderGrid([source("s1", "uvsgames", "Summoner Skirmish")]);
    expect(captured.props?.activeRow?.name).toBe("Summoner Skirmish 2026");
    expect(captured.props?.activeRow?.playerCount).toBe(64);
  });

  it("offers every field the accept endpoint writes, plus the read-only pair", () => {
    renderGrid([source("s1", "uvsgames", "Summoner Skirmish")]);
    const keys = captured.props?.fields?.map((field) => field.key);
    expect(keys).toEqual([
      "externalId",
      "name",
      "eventDate",
      "format",
      "tier",
      "playerCount",
      "organizer",
      "country",
      "location",
      "notes",
      "sourceUrl",
    ]);
    const readOnly = captured.props?.fields?.filter((field) => field.readOnly).map((f) => f.key);
    expect(readOnly).toEqual(["externalId", "sourceUrl"]);
  });

  it("accepts one field from the source whose cell was clicked", () => {
    renderGrid([source("s1", "uvsgames", "A"), source("s2", "playriftbound", "B")]);
    captured.props?.onCellClick?.("name", "B", "s2");
    expect(captured.acceptField).toHaveBeenCalledWith({ id: "s2", field: "name" });
  });

  it("ignores a click on a column the accept endpoint does not take", () => {
    captured.acceptField.mockClear();
    renderGrid([source("s1", "uvsgames", "A")]);
    captured.props?.onCellClick?.("sourceUrl", "https://example.test/uvsgames", "s1");
    expect(captured.acceptField).not.toHaveBeenCalled();
  });

  it("writes an edited Active cell straight to the live event", () => {
    renderGrid([source("s1", "uvsgames", "A")]);
    captured.props?.onActiveChange?.("organizer", "Riot Games");
    expect(captured.updateEvent).toHaveBeenCalledWith({ id: "event-1", organizer: "Riot Games" });
  });

  it("drops an edit that would clear a column the live row cannot hold empty", () => {
    captured.updateEvent.mockClear();
    renderGrid([source("s1", "uvsgames", "A")]);
    captured.props?.onActiveChange?.("name", null);
    expect(captured.updateEvent).not.toHaveBeenCalled();
  });
});

describe("metaEventFieldPatch", () => {
  it("clears the nullable columns", () => {
    expect(metaEventFieldPatch("organizer", null)).toEqual({ organizer: null });
    expect(metaEventFieldPatch("notes", null)).toEqual({ notes: null });
    expect(metaEventFieldPatch("playerCount", null)).toEqual({ playerCount: null });
  });

  it("refuses a player count that is not a positive whole number", () => {
    expect(metaEventFieldPatch("playerCount", 0)).toBeNull();
    expect(metaEventFieldPatch("playerCount", 2.5)).toBeNull();
    expect(metaEventFieldPatch("playerCount", "many")).toBeNull();
    expect(metaEventFieldPatch("playerCount", 64)).toEqual({ playerCount: 64 });
  });

  it("refuses to blank a NOT NULL column", () => {
    expect(metaEventFieldPatch("name", "   ")).toBeNull();
    expect(metaEventFieldPatch("eventDate", null)).toBeNull();
    expect(metaEventFieldPatch("format", "")).toBeNull();
    expect(metaEventFieldPatch("tier", null)).toBeNull();
  });

  it("takes only a known tier", () => {
    expect(metaEventFieldPatch("tier", "competitive")).toEqual({ tier: "competitive" });
    expect(metaEventFieldPatch("tier", "legendary")).toBeNull();
  });

  it("normalizes the country and clears it when blanked", () => {
    expect(metaEventFieldPatch("country", "de")).toEqual({ country: "DE" });
    expect(metaEventFieldPatch("country", "Germany")).toBeNull();
    expect(metaEventFieldPatch("country", null)).toEqual({ country: null });
  });

  it("passes the address through and clears it when blanked", () => {
    expect(metaEventFieldPatch("location", "Kartenstraße 1")).toEqual({
      location: "Kartenstraße 1",
    });
    expect(metaEventFieldPatch("location", null)).toEqual({ location: null });
  });

  it("passes the scalar columns through", () => {
    expect(metaEventFieldPatch("name", "Summoner Skirmish")).toEqual({
      name: "Summoner Skirmish",
    });
    expect(metaEventFieldPatch("eventDate", "2026-08-15")).toEqual({ eventDate: "2026-08-15" });
    expect(metaEventFieldPatch("format", "limited")).toEqual({ format: "limited" });
  });
});
