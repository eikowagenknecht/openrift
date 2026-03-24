import { describe, expect, it } from "vitest";

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
});
