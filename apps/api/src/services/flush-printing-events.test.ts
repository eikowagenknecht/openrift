/* oxlint-disable
   no-empty-function,
   import/first
   -- test file: mocks require empty fns and vi.mock before imports */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./discord-webhook.js", () => ({
  flushPrintingEvents: vi.fn(async () => ({ sentIds: [], failedIds: [] })),
}));

import { flushPrintingEvents } from "./discord-webhook.js";
import { flushPendingPrintingEvents } from "./flush-printing-events.js";

const mockFlush = vi.mocked(flushPrintingEvents);

function mockLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } as any;
}

const APP_BASE_URL = "https://openrift.app";

describe("flushPendingPrintingEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns early when no pending events", async () => {
    const repos = {
      printingEvents: {
        listPending: vi.fn(async () => []),
        markSent: vi.fn(async () => {}),
        markRetry: vi.fn(async () => {}),
      },
      siteSettings: {
        listByScope: vi.fn(async () => []),
      },
    };

    const result = await flushPendingPrintingEvents(repos as any, APP_BASE_URL, mockLog());

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(repos.siteSettings.listByScope).not.toHaveBeenCalled();
  });

  it("reads webhook URLs from api-scoped site settings and passes appBaseUrl", async () => {
    const events = [
      {
        id: "evt-1",
        eventType: "new" as const,
        printingId: "p-1",
        cardName: "Card",
        status: "pending" as const,
      },
    ];

    mockFlush.mockResolvedValue({ sentIds: ["evt-1"], failedIds: [] });

    const repos = {
      printingEvents: {
        listPending: vi.fn(async () => events),
        markSent: vi.fn(async () => {}),
        markRetry: vi.fn(async () => {}),
      },
      siteSettings: {
        listByScope: vi.fn(async () => [
          { key: "discord-webhook-new-printings", value: "https://discord.com/api/webhooks/new" },
          {
            key: "discord-webhook-printing-changes",
            value: "https://discord.com/api/webhooks/changes",
          },
        ]),
      },
    };

    const result = await flushPendingPrintingEvents(repos as any, APP_BASE_URL, mockLog());

    expect(repos.siteSettings.listByScope).toHaveBeenCalledWith("api");
    expect(mockFlush).toHaveBeenCalledWith(
      events,
      {
        newPrintings: "https://discord.com/api/webhooks/new",
        printingChanges: "https://discord.com/api/webhooks/changes",
      },
      APP_BASE_URL,
      expect.anything(),
    );
    expect(repos.printingEvents.markSent).toHaveBeenCalledWith(["evt-1"]);
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("marks failed events for retry", async () => {
    const events = [
      {
        id: "evt-1",
        eventType: "new" as const,
        printingId: "p-1",
        cardName: "Card",
        status: "pending" as const,
      },
    ];

    mockFlush.mockResolvedValue({ sentIds: [], failedIds: ["evt-1"] });

    const repos = {
      printingEvents: {
        listPending: vi.fn(async () => events),
        markSent: vi.fn(async () => {}),
        markRetry: vi.fn(async () => {}),
      },
      siteSettings: {
        listByScope: vi.fn(async () => []),
      },
    };

    const result = await flushPendingPrintingEvents(repos as any, APP_BASE_URL, mockLog());

    expect(repos.printingEvents.markRetry).toHaveBeenCalledWith(["evt-1"]);
    expect(result).toEqual({ sent: 0, failed: 1 });
  });
});
