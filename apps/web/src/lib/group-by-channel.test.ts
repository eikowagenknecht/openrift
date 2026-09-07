import type { DistributionChannel, PrintingDistributionChannel } from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { stubCardViewerItem, resetIdCounter } from "@/test/factories";

import { groupItemsByChannel, NO_CHANNEL_ID, NO_CHANNEL_LABEL } from "./group-by-channel";

function makeChannel(overrides: Partial<DistributionChannel> = {}): DistributionChannel {
  return {
    id: overrides.id ?? `ch-${Math.random()}`,
    slug: overrides.slug ?? "channel",
    label: overrides.label ?? "Channel",
    description: overrides.description ?? null,
    kind: overrides.kind ?? "event",
    parentId: overrides.parentId ?? null,
    childrenLabel: overrides.childrenLabel ?? null,
  };
}

function makePrintingChannel(
  channel: DistributionChannel,
  ancestorLabels: string[] = [],
): PrintingDistributionChannel {
  return { channel, distributionNote: null, ancestorLabels };
}

beforeEach(() => {
  resetIdCounter();
});

describe("groupItemsByChannel", () => {
  it("returns an empty list when there are no items", () => {
    expect(groupItemsByChannel([], "asc")).toEqual([]);
  });

  it("groups printings into one section per distinct channel", () => {
    const worlds = makeChannel({ id: "worlds", slug: "worlds", label: "Worlds 2025" });
    const release = makeChannel({ id: "release", slug: "release", label: "Release Event" });
    const a = stubCardViewerItem({ distributionChannels: [makePrintingChannel(worlds)] });
    const b = stubCardViewerItem({ distributionChannels: [makePrintingChannel(release)] });

    const sections = groupItemsByChannel([a, b], "asc");

    expect(sections).toHaveLength(2);
    const ids = sections.map((section) => section.group.id);
    expect(ids).toEqual(["release", "worlds"]);
  });

  it("fans out a multi-channel printing into every section it belongs to", () => {
    const worlds = makeChannel({ id: "worlds", slug: "worlds", label: "Worlds 2025" });
    const release = makeChannel({ id: "release", slug: "release", label: "Release Event" });
    const item = stubCardViewerItem({
      distributionChannels: [makePrintingChannel(worlds), makePrintingChannel(release)],
    });

    const sections = groupItemsByChannel([item], "asc");

    expect(sections).toHaveLength(2);
    for (const section of sections) {
      expect(section.items).toEqual([item]);
    }
  });

  it("collects channelless printings into a trailing '(No distribution channel)' section", () => {
    const worlds = makeChannel({ id: "worlds", slug: "worlds", label: "Worlds 2025" });
    const promo = stubCardViewerItem({ distributionChannels: [makePrintingChannel(worlds)] });
    const regular = stubCardViewerItem({ distributionChannels: [] });

    const sections = groupItemsByChannel([promo, regular], "asc");

    expect(sections).toHaveLength(2);
    const last = sections.at(-1)!;
    expect(last.group.id).toBe(NO_CHANNEL_ID);
    expect(last.group.name).toBe(NO_CHANNEL_LABEL);
    expect(last.items).toEqual([regular]);
  });

  it("keeps the '(No distribution channel)' section last in desc direction too", () => {
    const alpha = makeChannel({ id: "alpha", slug: "alpha", label: "Alpha" });
    const beta = makeChannel({ id: "beta", slug: "beta", label: "Beta" });
    const a = stubCardViewerItem({ distributionChannels: [makePrintingChannel(alpha)] });
    const b = stubCardViewerItem({ distributionChannels: [makePrintingChannel(beta)] });
    const none = stubCardViewerItem({ distributionChannels: [] });

    const sections = groupItemsByChannel([a, b, none], "desc");

    expect(sections.map((section) => section.group.id)).toEqual(["beta", "alpha", NO_CHANNEL_ID]);
  });

  it("renders section labels as ancestor → leaf breadcrumbs", () => {
    const welcome = makeChannel({ id: "welcome", slug: "welcome", label: "Welcome Set" });
    const item = stubCardViewerItem({
      distributionChannels: [makePrintingChannel(welcome, ["Riftbound", "Worlds 2025"])],
    });

    const [section] = groupItemsByChannel([item], "asc");

    expect(section!.group.name).toBe("Riftbound → Worlds 2025 → Welcome Set");
    expect(section!.group.slug).toBe("");
    expect(section!.group.id).toBe("welcome");
  });

  it("omits the '(No distribution channel)' section when every item has channels", () => {
    const worlds = makeChannel({ id: "worlds", slug: "worlds", label: "Worlds 2025" });
    const item = stubCardViewerItem({ distributionChannels: [makePrintingChannel(worlds)] });

    const sections = groupItemsByChannel([item], "asc");

    expect(sections).toHaveLength(1);
    expect(sections[0]!.group.id).toBe("worlds");
  });
});
