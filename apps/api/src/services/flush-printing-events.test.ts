/* oxlint-disable
   no-empty-function,
   import/first
   -- test file: mocks require empty fns and vi.mock before imports */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./discord-webhook.js", () => ({
  flushPrintingEvents: vi.fn(async () => ({ sentIds: [], failedIds: [], failures: [] })),
}));

import { flushPrintingEvents } from "./discord-webhook.js";
import { flushPendingPrintingEvents } from "./flush-printing-events.js";

const mockFlush = vi.mocked(flushPrintingEvents);

function mockLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() } as any;
}

const APP_BASE_URL = "https://openrift.app";

const WEBHOOKS = {
  newPrintings: "https://discord.com/api/webhooks/new",
  printingChanges: "https://discord.com/api/webhooks/changes",
};

describe("flushPendingPrintingEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function makeRepos(events: unknown[], setNamesById = new Map<string, string>()) {
    return {
      printingEvents: {
        listPending: vi.fn(async () => events),
        markSent: vi.fn(async () => {}),
        markRetry: vi.fn(async () => {}),
      },
      sets: {
        getNamesByIds: vi.fn(async () => setNamesById),
      },
    };
  }

  it("returns early when no pending events", async () => {
    const repos = makeRepos([]);

    const result = await flushPendingPrintingEvents(
      repos as any,
      WEBHOOKS,
      APP_BASE_URL,
      mockLog(),
    );

    expect(result).toEqual({ sent: 0, failed: 0 });
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it("passes the supplied webhook URLs and appBaseUrl through to the sender", async () => {
    const events = [
      {
        id: "evt-1",
        eventType: "new" as const,
        printingId: "p-1",
        cardName: "Card",
        status: "pending" as const,
      },
    ];

    mockFlush.mockResolvedValue({ sentIds: ["evt-1"], failedIds: [], failures: [] });

    const repos = makeRepos(events);

    const result = await flushPendingPrintingEvents(
      repos as any,
      WEBHOOKS,
      APP_BASE_URL,
      mockLog(),
    );

    expect(mockFlush).toHaveBeenCalledWith(
      events,
      WEBHOOKS,
      APP_BASE_URL,
      expect.anything(),
      expect.objectContaining({ setNamesById: expect.any(Map) }),
    );
    expect(repos.printingEvents.markSent).toHaveBeenCalledWith(["evt-1"]);
    expect(result).toEqual({ sent: 1, failed: 0 });
  });

  it("resolves setId UUIDs referenced by changed events into a name lookup", async () => {
    const fromSetId = "019cfc3b-0369-78be-bd85-75cb9e46ad0c";
    const toSetId = "019cfd6f-067b-768c-a586-b8f9547ad455";
    const events = [
      {
        id: "evt-1",
        eventType: "changed" as const,
        printingId: "p-1",
        cardName: "Order Rune",
        changes: [{ field: "setId", from: fromSetId, to: toSetId }],
        status: "pending" as const,
      },
      {
        // Non-setId change must not contribute to the id list.
        id: "evt-2",
        eventType: "changed" as const,
        printingId: "p-2",
        cardName: "Other Card",
        changes: [{ field: "artist", from: "A", to: "B" }],
        status: "pending" as const,
      },
    ];

    mockFlush.mockResolvedValue({ sentIds: ["evt-1", "evt-2"], failedIds: [], failures: [] });

    const repos = makeRepos(
      events,
      new Map([
        [fromSetId, "Origins"],
        [toSetId, "Unleashed"],
      ]),
    );

    await flushPendingPrintingEvents(repos as any, WEBHOOKS, APP_BASE_URL, mockLog());

    expect(repos.sets.getNamesByIds).toHaveBeenCalledTimes(1);
    const [requestedIds] = repos.sets.getNamesByIds.mock.calls[0] as [string[]];
    expect(requestedIds.toSorted()).toEqual([fromSetId, toSetId].toSorted());

    const lookups = mockFlush.mock.calls[0][4];
    expect(lookups?.setNamesById?.get(fromSetId)).toBe("Origins");
    expect(lookups?.setNamesById?.get(toSetId)).toBe("Unleashed");
  });

  it("marks failed events for retry on partial failure and includes failure detail", async () => {
    const events = [
      {
        id: "evt-1",
        eventType: "new" as const,
        printingId: "p-1",
        cardName: "Card A",
        status: "pending" as const,
      },
      {
        id: "evt-2",
        eventType: "changed" as const,
        printingId: "p-2",
        cardName: "Card B",
        status: "pending" as const,
      },
    ];

    mockFlush.mockResolvedValue({
      sentIds: ["evt-1"],
      failedIds: ["evt-2"],
      failures: [{ channel: "printingChanges", status: 400, detail: "Bad embed" }],
    });

    const repos = makeRepos(events);

    const result = await flushPendingPrintingEvents(
      repos as any,
      WEBHOOKS,
      APP_BASE_URL,
      mockLog(),
    );

    expect(repos.printingEvents.markSent).toHaveBeenCalledWith(["evt-1"]);
    expect(repos.printingEvents.markRetry).toHaveBeenCalledWith(["evt-2"]);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([
      { channel: "printingChanges", status: 400, detail: "Bad embed" },
    ]);
  });

  it("throws when every event failed so job_runs records a real error", async () => {
    const events = [
      {
        id: "evt-1",
        eventType: "changed" as const,
        printingId: "p-1",
        cardName: "Card",
        status: "pending" as const,
      },
    ];

    mockFlush.mockResolvedValue({
      sentIds: [],
      failedIds: ["evt-1"],
      failures: [{ channel: "printingChanges", status: 401, detail: "Unauthorized" }],
    });

    const repos = makeRepos(events);

    await expect(
      flushPendingPrintingEvents(repos as any, WEBHOOKS, APP_BASE_URL, mockLog()),
    ).rejects.toThrow(/HTTP 401.*Unauthorized/u);

    // Retry counter still gets bumped before we throw.
    expect(repos.printingEvents.markRetry).toHaveBeenCalledWith(["evt-1"]);
  });
});
