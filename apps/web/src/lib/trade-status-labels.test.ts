import type { CardTradeLivePhase, CardTradeRole } from "@openrift/shared";
import { ClockIcon, HandshakeIcon, PackageCheckIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  SHARED_RESERVED_STATUS,
  liveTradeStatus,
  liveTradeStatusLabel,
  tradeStatusTitle,
} from "./trade-status-labels";

const PHASES: CardTradeLivePhase[] = ["asked", "offered", "reserved", "traded"];
const ROLES: CardTradeRole[] = ["giver", "receiver"];

describe("liveTradeStatus", () => {
  it.each([
    ["giver", "asked", "Asked for"],
    ["giver", "offered", "Offered"],
    ["giver", "reserved", "Reserved"],
    ["giver", "traded", "Traded"],
    ["receiver", "asked", "Requested"],
    ["receiver", "offered", "Offered to you"],
    ["receiver", "reserved", "Coming to you"],
    ["receiver", "traded", "Ready to add"],
  ] as [CardTradeRole, CardTradeLivePhase, string][])(
    "labels %s/%s as %s",
    (role, phase, label) => {
      expect(liveTradeStatus({ role, phase }).label).toBe(label);
      expect(liveTradeStatusLabel({ role, phase })).toBe(label);
    },
  );

  it.each(ROLES)("marks only the asked phase as soft on the %s side", (role) => {
    const tones = PHASES.map((phase) => liveTradeStatus({ role, phase }).tone);
    expect(tones).toEqual(["soft", "committed", "committed", "committed"]);
  });

  // Offered already consumes the giver's supply, so it must never read as the
  // weaker sibling of Reserved. Same icon, same weight.
  it.each(ROLES)("gives offered and reserved the same icon and tone on the %s side", (role) => {
    const offered = liveTradeStatus({ role, phase: "offered" });
    const reserved = liveTradeStatus({ role, phase: "reserved" });
    expect(offered.icon).toBe(reserved.icon);
    expect(offered.tone).toBe(reserved.tone);
  });

  it.each([
    ["asked", ClockIcon],
    ["offered", HandshakeIcon],
    ["reserved", HandshakeIcon],
    ["traded", PackageCheckIcon],
  ] as [CardTradeLivePhase, unknown][])("picks the %s icon from the phase alone", (phase, icon) => {
    expect(liveTradeStatus({ role: "giver", phase }).icon).toBe(icon);
    expect(liveTradeStatus({ role: "receiver", phase }).icon).toBe(icon);
  });

  // "Requested" means the viewer asked for the card, the meaning it already
  // carries on the shared-list request strip. It may never appear on a card the
  // viewer is giving away.
  it("keeps every label unique across the two sides", () => {
    const labels = ROLES.flatMap((role) =>
      PHASES.map((phase) => liveTradeStatusLabel({ role, phase })),
    );
    expect(new Set(labels).size).toBe(labels.length);
    const giverLabels = PHASES.map((phase) => liveTradeStatusLabel({ role: "giver", phase }));
    expect(giverLabels).not.toContain("Requested");
  });
});

describe("SHARED_RESERVED_STATUS", () => {
  it("is the giver-side reservation, the one status a share link may show", () => {
    expect(SHARED_RESERVED_STATUS).toEqual({ role: "giver", phase: "reserved" });
    expect(liveTradeStatusLabel(SHARED_RESERVED_STATUS)).toBe("Reserved");
  });
});

describe("tradeStatusTitle", () => {
  it("names the status alone when there is no count", () => {
    expect(tradeStatusTitle({ label: "Reserved" })).toBe("Reserved");
  });

  it("pluralizes the copies", () => {
    expect(tradeStatusTitle({ label: "Offered", count: 2 })).toBe("Offered · 2 copies");
    expect(tradeStatusTitle({ label: "Offered", count: 1 })).toBe("Offered · 1 copy");
  });

  it("spells out a diverging cross-printing total", () => {
    expect(tradeStatusTitle({ label: "Coming to you", count: 1, totalCount: 3 })).toBe(
      "Coming to you · 1 of this printing (3 across all printings)",
    );
  });

  it("ignores a total that matches the count", () => {
    expect(tradeStatusTitle({ label: "Traded", count: 2, totalCount: 2 })).toBe(
      "Traded · 2 copies",
    );
  });

  it("keeps a zero count readable", () => {
    expect(tradeStatusTitle({ label: "Asked for", count: 0 })).toBe("Asked for · 0 copies");
  });
});
