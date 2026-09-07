import type { AdminMetaEvent } from "@openrift/shared/types/api/meta";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const captured = { events: [] as AdminMetaEvent[], isPending: false };

vi.mock("@/hooks/use-admin-meta", () => ({
  useMetaEventSearch: () => ({ data: { events: captured.events }, isPending: captured.isPending }),
}));

const { MetaEventSearchPicker } = await import("@/components/admin/meta-event-search-picker");

function event(overrides: Partial<AdminMetaEvent> = {}): AdminMetaEvent {
  return {
    id: "e1",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-30",
    format: "constructed",
    playerCount: 64,
    organizer: "LGS Berlin",
    notes: null,
    tier: "local",
    country: "DE",
    location: null,
    playerRowCount: 64,
    deckCount: 8,
    sources: [],
    ...overrides,
  };
}

describe("MetaEventSearchPicker", () => {
  it("offers whatever the search returns, ranked or not", async () => {
    captured.events = [event(), event({ id: "e2", name: "Piltover Open" })];

    render(<MetaEventSearchPicker onPick={vi.fn()} />);
    await userEvent.type(screen.getByRole("combobox"), "sum");

    expect(await screen.findByRole("option", { name: /Summoner Skirmish/u })).toBeVisible();
    expect(screen.getByRole("option", { name: /Piltover Open/u })).toBeVisible();
  });

  it("picks the event that is selected", async () => {
    captured.events = [event()];
    const onPick = vi.fn();

    render(<MetaEventSearchPicker onPick={onPick} />);
    await userEvent.type(screen.getByRole("combobox"), "sum");
    await userEvent.click(await screen.findByRole("option", { name: /Summoner Skirmish/u }));

    expect(onPick).toHaveBeenCalledWith("e1", "Summoner Skirmish");
  });

  it("shows nothing matched only once the search actually missed", async () => {
    captured.events = [];

    render(<MetaEventSearchPicker onPick={vi.fn()} />);
    await userEvent.type(screen.getByRole("combobox"), "zzz");

    expect(await screen.findByText("No matching events")).toBeVisible();
  });
});
