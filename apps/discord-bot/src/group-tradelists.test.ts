import { describe, expect, it, vi } from "vitest";

import type { ApiClients } from "./api-client.js";
import { fetchTradelistHolders } from "./group-tradelists.js";

function clientsWith(
  tradelistHolders: (input: { guildId: string; cardId: string }) => Promise<unknown>,
): ApiClients {
  return { discordBot: { tradelistHolders } } as unknown as ApiClients;
}

const HOLDERS = [
  {
    userName: "Alice",
    quantity: 2,
    printings: [{ printingId: "printing-1", quantity: 2, listNames: ["Binder"] }],
  },
];

describe("fetchTradelistHolders", () => {
  it("returns the holders for a linked guild", async () => {
    const api = clientsWith(() =>
      Promise.resolve({ linked: true, groupName: "Summoner Skirmish", holders: HOLDERS }),
    );
    expect(await fetchTradelistHolders(api, "guild-1", "card-1")).toEqual({
      groupName: "Summoner Skirmish",
      holders: HOLDERS,
    });
  });

  it("returns null when the feature is off (no privileged client)", async () => {
    const api = { discordBot: null } as unknown as ApiClients;
    expect(await fetchTradelistHolders(api, "guild-1", "card-1")).toBeNull();
  });

  it("returns null outside a guild (DMs)", async () => {
    const lookup = vi.fn();
    expect(await fetchTradelistHolders(clientsWith(lookup), null, "card-1")).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("returns null for an unlinked guild and for an empty holder list", async () => {
    const unlinked = clientsWith(() =>
      Promise.resolve({ linked: false, groupName: null, holders: [] }),
    );
    expect(await fetchTradelistHolders(unlinked, "guild-1", "card-1")).toBeNull();

    const empty = clientsWith(() => Promise.resolve({ linked: true, groupName: "G", holders: [] }));
    expect(await fetchTradelistHolders(empty, "guild-1", "card-1")).toBeNull();
  });

  it("degrades a failed lookup to null instead of throwing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = clientsWith(() => Promise.reject(new Error("api down")));
    expect(await fetchTradelistHolders(api, "guild-1", "card-1")).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
