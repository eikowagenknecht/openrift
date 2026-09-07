import type { CardTradeLivePhase, CardTradeRole } from "@openrift/shared";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "lucide-react";
import { describe, expect, it } from "vitest";

import { SHARED_RESERVED_STATUS, liveTradeStatus, tradeStatusTitle } from "./trade-status-labels";

const PHASES: CardTradeLivePhase[] = ["asked", "offered", "reserved"];
const ROLES: CardTradeRole[] = ["giver", "receiver"];

describe("liveTradeStatus", () => {
  it.each([
    ["asked", "Requested"],
    ["offered", "Offered"],
    ["reserved", "Reserved"],
  ] as [CardTradeLivePhase, string][])("labels the %s phase as %s", (phase, label) => {
    for (const role of ROLES) {
      expect(liveTradeStatus({ role, phase }).label).toBe(label);
    }
  });

  it.each(ROLES)("marks only the asked phase as soft on the %s side", (role) => {
    const tones = PHASES.map((phase) => liveTradeStatus({ role, phase }).tone);
    expect(tones).toEqual(["soft", "committed", "committed"]);
  });

  it.each(ROLES)("takes the direction and its arrow from the %s role alone", (role) => {
    const expected =
      role === "giver"
        ? { direction: "outgoing", icon: ArrowUpRightIcon }
        : { direction: "incoming", icon: ArrowDownLeftIcon };
    for (const phase of PHASES) {
      const status = liveTradeStatus({ role, phase });
      expect(status.direction).toBe(expected.direction);
      expect(status.icon).toBe(expected.icon);
    }
  });

  it.each(ROLES)("gives offered and reserved the same icon and tone on the %s side", (role) => {
    const offered = liveTradeStatus({ role, phase: "offered" });
    const reserved = liveTradeStatus({ role, phase: "reserved" });
    expect(offered.icon).toBe(reserved.icon);
    expect(offered.tone).toBe(reserved.tone);
  });

  it("uses one word per phase across the two sides", () => {
    for (const phase of PHASES) {
      expect(liveTradeStatus({ role: "giver", phase }).label).toBe(
        liveTradeStatus({ role: "receiver", phase }).label,
      );
    }
    const labels = PHASES.map((phase) => liveTradeStatus({ role: "giver", phase }).label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("points the two sides in opposite directions", () => {
    expect(liveTradeStatus({ role: "giver", phase: "reserved" }).direction).toBe("outgoing");
    expect(liveTradeStatus({ role: "receiver", phase: "reserved" }).direction).toBe("incoming");
  });
});

describe("SHARED_RESERVED_STATUS", () => {
  it("is the giver-side reservation, the one status a share link may show", () => {
    expect(SHARED_RESERVED_STATUS).toEqual({ role: "giver", phase: "reserved" });
    expect(liveTradeStatus(SHARED_RESERVED_STATUS).label).toBe("Reserved");
  });
});

describe("tradeStatusTitle", () => {
  it("names the status alone when there is no count", () => {
    expect(tradeStatusTitle({ label: "Reserved" })).toBe("Reserved");
  });

  it("spells out the direction when one is given", () => {
    expect(tradeStatusTitle({ label: "Reserved", direction: "incoming" })).toBe(
      "Reserved (incoming)",
    );
    expect(tradeStatusTitle({ label: "Reserved", direction: "outgoing", count: 2 })).toBe(
      "Reserved (outgoing) · 2 copies",
    );
  });

  it("pluralizes the copies", () => {
    expect(tradeStatusTitle({ label: "Offered", count: 2 })).toBe("Offered · 2 copies");
    expect(tradeStatusTitle({ label: "Offered", count: 1 })).toBe("Offered · 1 copy");
  });

  it("spells out a diverging cross-printing total", () => {
    expect(
      tradeStatusTitle({ label: "Reserved", direction: "incoming", count: 1, totalCount: 3 }),
    ).toBe("Reserved (incoming) · 1 of this printing (3 across all printings)");
  });

  it("ignores a total that matches the count", () => {
    expect(tradeStatusTitle({ label: "Traded", count: 2, totalCount: 2 })).toBe(
      "Traded · 2 copies",
    );
  });

  it("keeps a zero count readable", () => {
    expect(tradeStatusTitle({ label: "Requested", count: 0 })).toBe("Requested · 0 copies");
  });
});
