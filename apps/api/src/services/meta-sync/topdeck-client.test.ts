import { describe, expect, it } from "vitest";

import type { Fetch } from "../../io.js";
import { requestUrl } from "../../test/request-url.js";
import {
  createTopdeckClient,
  TopdeckRefusedError,
  TopdeckThrottledError,
} from "./topdeck-client.js";

const USER_AGENT = "Mozilla/5.0 (test) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36";
const SEARCH = { game: "Riftbound", format: "Constructed" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function harness(responses: (() => Response)[]) {
  const urls: string[] = [];
  const inits: (RequestInit | undefined)[] = [];
  const sleeps: number[] = [];
  let call = 0;
  const fetchFn: Fetch = (input, init) => {
    urls.push(requestUrl(input));
    inits.push(init);
    const next = responses[Math.min(call, responses.length - 1)]!;
    call++;
    return Promise.resolve(next());
  };
  const client = createTopdeckClient({
    fetch: fetchFn,
    userAgent: USER_AGENT,
    baseUrl: "https://source.invalid/api/",
    apiKey: "test-key",
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0,
    now: () => 1_000_000,
  });
  return { client, urls, inits, sleeps };
}

describe("createTopdeckClient", () => {
  it("posts the search to v2/tournaments with the key in the Authorization header", async () => {
    const { client, urls, inits } = harness([() => json([])]);

    await client.searchTournaments({ ...SEARCH, start: 10, end: 20 });

    expect(urls[0]).toBe("https://source.invalid/api/v2/tournaments");
    const init = inits[0];
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("test-key");
    expect(headers["user-agent"]).toBe(USER_AGENT);
    const body = init?.body;
    expect(JSON.parse(typeof body === "string" ? body : "null")).toEqual({
      game: "Riftbound",
      format: "Constructed",
      start: 10,
      end: 20,
    });
  });

  it("waits the cool-down the source names, then succeeds", async () => {
    let call = 0;
    const { client, sleeps } = harness([
      () => {
        call++;
        return call === 1
          ? json({ error: "Rate limit exceeded", retryAfterSeconds: 33 }, 429)
          : json([{ TID: "a" }]);
      },
    ]);

    const rows = await client.searchTournaments(SEARCH);

    expect(rows).toEqual([{ TID: "a" }]);
    expect(sleeps).toContain(33_000);
  });

  it("caps an absurd cool-down rather than hanging the run", async () => {
    let call = 0;
    const { client, sleeps } = harness([
      () => {
        call++;
        return call === 1 ? json({ retryAfterSeconds: 99_999 }, 429) : json([]);
      },
    ]);

    await client.searchTournaments(SEARCH);

    expect(sleeps).toContain(120_000);
  });

  it("gives up on a second throttle instead of waiting again", async () => {
    const { client } = harness([() => json({ retryAfterSeconds: 5 }, 429)]);

    await expect(client.searchTournaments(SEARCH)).rejects.toBeInstanceOf(TopdeckThrottledError);
  });

  it("does not retry a 4xx the source will answer the same way", async () => {
    const { client } = harness([() => json({ error: "Both fields are required." }, 400)]);

    await expect(client.searchTournaments(SEARCH)).rejects.toBeInstanceOf(TopdeckRefusedError);
    expect(client.requests).toBe(1);
  });

  it("retries a 5xx on a backoff ladder", async () => {
    let call = 0;
    const { client, sleeps } = harness([
      () => {
        call++;
        return call < 3 ? json({ error: "boom" }, 503) : json([]);
      },
    ]);

    await client.searchTournaments(SEARCH);

    expect(client.requests).toBe(3);
    expect(sleeps).toContain(1000);
    expect(sleeps).toContain(2000);
  });

  it("refuses a body that is not the tournament list the search promises", async () => {
    const { client } = harness([() => json({ tournaments: [] })]);

    await expect(client.searchTournaments(SEARCH)).rejects.toBeInstanceOf(TopdeckRefusedError);
  });

  it("counts every request it made, for the run summary", async () => {
    const { client } = harness([() => json([])]);

    await client.searchTournaments(SEARCH);
    await client.searchTournaments({ ...SEARCH, format: "Sealed" });

    expect(client.requests).toBe(2);
  });
});
