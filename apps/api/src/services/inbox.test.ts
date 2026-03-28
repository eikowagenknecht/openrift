import { describe, expect, it, vi } from "vitest";

import type { Repos } from "../deps.js";
import { ensureInbox } from "./inbox.js";

describe("ensureInbox", () => {
  it("delegates to collections.ensureInbox and returns the id", async () => {
    const repos = {
      collections: {
        ensureInbox: () => Promise.resolve("inbox-123"),
      },
    } as unknown as Repos;

    const id = await ensureInbox(repos, "user-1");
    expect(id).toBe("inbox-123");
  });

  it("passes the userId to the underlying repo", async () => {
    const ensureInboxFn = vi.fn(async () => "inbox-456");
    const repos = {
      collections: {
        ensureInbox: ensureInboxFn,
      },
    } as unknown as Repos;

    await ensureInbox(repos, "user-42");
    expect(ensureInboxFn).toHaveBeenCalledWith("user-42");
  });

  it("returns different IDs for different users", async () => {
    let callCount = 0;
    const repos = {
      collections: {
        ensureInbox: async () => {
          callCount++;
          return `inbox-${callCount}`;
        },
      },
    } as unknown as Repos;

    const id1 = await ensureInbox(repos, "user-1");
    const id2 = await ensureInbox(repos, "user-2");
    expect(id1).toBe("inbox-1");
    expect(id2).toBe("inbox-2");
  });
});
