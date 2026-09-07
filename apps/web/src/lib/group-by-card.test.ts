import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubCardViewerItem } from "@/test/factories";

import { groupItemsByCard } from "./group-by-card";

beforeEach(() => {
  resetIdCounter();
});

describe("groupItemsByCard", () => {
  it("returns an empty list when there are no items", () => {
    expect(groupItemsByCard([], "asc")).toEqual([]);
  });

  it("returns one section per card, alpha-sorted by name", () => {
    const garen = stubCardViewerItem({ card: { slug: "garen", name: "Garen" } });
    const ahri = stubCardViewerItem({ card: { slug: "ahri", name: "Ahri" } });

    const sections = groupItemsByCard([garen, ahri], "asc");

    expect(sections.map((section) => section.group.id)).toEqual(["ahri", "garen"]);
    expect(sections.map((section) => section.group.slug)).toEqual(["", ""]);
    expect(sections.map((section) => section.group.name)).toEqual(["Ahri", "Garen"]);
  });

  it("reverses section order when dir is desc", () => {
    const ahri = stubCardViewerItem({ card: { slug: "ahri", name: "Ahri" } });
    const garen = stubCardViewerItem({ card: { slug: "garen", name: "Garen" } });

    const sections = groupItemsByCard([ahri, garen], "desc");

    expect(sections.map((section) => section.group.id)).toEqual(["garen", "ahri"]);
  });

  it("collects every printing of a card into its one section, in input order", () => {
    const first = stubCardViewerItem({ card: { slug: "ahri", name: "Ahri" } });
    const second = stubCardViewerItem({ card: { slug: "ahri", name: "Ahri" } });
    const other = stubCardViewerItem({ card: { slug: "garen", name: "Garen" } });

    const sections = groupItemsByCard([first, other, second], "asc");

    expect(sections).toHaveLength(2);
    expect(sections[0]?.items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(sections[1]?.items.map((item) => item.id)).toEqual([other.id]);
  });

  it("keeps two cards that share a name as separate sections", () => {
    const base = stubCardViewerItem({ card: { slug: "poro-a", name: "Poro" } });
    const alt = stubCardViewerItem({ card: { slug: "poro-b", name: "Poro" } });

    const sections = groupItemsByCard([base, alt], "asc");

    expect(sections).toHaveLength(2);
    expect(sections.map((section) => section.group.id)).toEqual(["poro-a", "poro-b"]);
  });
});
