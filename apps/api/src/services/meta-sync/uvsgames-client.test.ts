import { describe, expect, it } from "vitest";

import type { Fetch } from "../../io.js";
import { requestUrl } from "../../test/request-url.js";
import { createUvsClient } from "./uvsgames-client.js";

const USER_AGENT = "Mozilla/5.0 (test) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

/** Sleeps resolve immediately and are recorded, so pacing is asserted, not waited on. */
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

  const client = createUvsClient({
    fetch: fetchFn,
    userAgent: USER_AGENT,
    baseUrl: "https://source.invalid",
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0,
    // Comfortably past the pacing window, so the first request never waits.
    now: () => 1_000_000,
  });

  return { client, urls, inits, sleeps };
}

describe("createUvsClient", () => {
  it("sends its configured User-Agent on every request", async () => {
    const { client, inits } = harness([() => json({ ok: true })]);

    await client.get("/api/v2/events/1/");

    const headers = inits[0]?.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe(USER_AGENT);
    expect(headers.accept).toBe("application/json");
  });

  it("builds the URL from the base plus the query, dropping undefined values", async () => {
    const { client, urls } = harness([() => json({ results: [] })]);

    await client.get("/api/v2/events/", { game_slug: "riftbound", name: undefined, page: 3 });

    expect(urls[0]).toBe("https://source.invalid/api/v2/events/?game_slug=riftbound&page=3");
  });

  it("reads the DRF envelope, defaulting the fields a response omits", async () => {
    const { client, urls } = harness([
      () =>
        json({
          results: [{ id: 1 }, { id: 2 }],
          count: 2,
          total: 500,
          page_size: 250,
          current_page_number: 2,
          next_page_number: 3,
        }),
    ]);

    const page = await client.page<{ id: number }>("/api/v2/events/", { game_slug: "x" }, 2);

    expect(page).toEqual({ results: [{ id: 1 }, { id: 2 }], count: 2, nextPage: 3 });
    expect(urls[0]).toContain("page=2&page_size=250");
  });

  it("reports no next page when the envelope ends", async () => {
    const { client } = harness([() => json({ results: [], next_page_number: null })]);

    const page = await client.page("/api/v2/events/", {}, 9);

    expect(page.nextPage).toBeNull();
  });

  it("spaces consecutive requests instead of firing them back to back", async () => {
    const { client, sleeps } = harness([() => json({})]);

    await client.get("/api/v2/events/1/");
    await client.get("/api/v2/events/2/");

    expect(sleeps).toEqual([600]);
  });

  it("retries a 5xx with backoff and returns the eventual success", async () => {
    const attempts: number[] = [];
    const { client, sleeps } = harness([
      () => {
        attempts.push(500);
        return json({}, 500);
      },
      () => {
        attempts.push(503);
        return json({}, 503);
      },
      () => {
        attempts.push(200);
        return json({ ok: true });
      },
    ]);

    await expect(client.get("/api/v2/events/1/")).resolves.toEqual({ ok: true });
    expect(attempts).toEqual([500, 503, 200]);
    expect(sleeps).toContain(1000);
    expect(sleeps).toContain(2000);
    expect(client.requests).toBe(3);
  });

  it("gives up after three attempts and surfaces the last failure", async () => {
    const { client } = harness([() => json({ detail: "boom" }, 502)]);

    await expect(client.get("/api/v2/events/1/")).rejects.toThrow("HTTP 502");
    expect(client.requests).toBe(3);
  });

  it("does not retry a 404: the event is gone, not busy", async () => {
    const { client } = harness([() => json({ detail: "not found" }, 404)]);

    await expect(client.get("/api/v2/events/1/")).rejects.toThrow("HTTP 404");
    expect(client.requests).toBe(1);
  });

  it("carries the status on the thrown error, so callers need not parse the message", async () => {
    const { client } = harness([() => json({ detail: "gone" }, 404)]);

    await expect(client.get("/api/v2/events/1/")).rejects.toMatchObject({ status: 404 });
  });

  it("retries a network failure", async () => {
    let calls = 0;
    const fetchFn: Fetch = () => {
      calls++;
      return calls === 1
        ? Promise.reject(new Error("ECONNRESET"))
        : Promise.resolve(json({ n: 1 }));
    };
    const client = createUvsClient({
      fetch: fetchFn,
      baseUrl: "https://source.invalid",
      userAgent: USER_AGENT,
      sleep: () => Promise.resolve(),
      random: () => 0,
      now: () => 1_000_000,
    });

    await expect(client.get("/api/v2/events/1/")).resolves.toEqual({ n: 1 });
    expect(calls).toBe(2);
  });

  it("keeps requests single-flight when callers do not await each other", async () => {
    const order: string[] = [];
    const fetchFn: Fetch = (input) => {
      order.push(`start ${requestUrl(input).slice(-3)}`);
      return Promise.resolve(json({}));
    };
    const client = createUvsClient({
      fetch: fetchFn,
      userAgent: USER_AGENT,
      baseUrl: "https://source.invalid",
      sleep: () => Promise.resolve(),
      random: () => 0,
      now: () => 1_000_000,
    });

    await Promise.all([client.get("/a/1/"), client.get("/a/2/"), client.get("/a/3/")]);

    expect(order).toEqual(["start /1/", "start /2/", "start /3/"]);
    expect(client.requests).toBe(3);
  });

  it("counts every attempt, so a run's request budget is reported honestly", async () => {
    const { client } = harness([() => json({})]);

    await client.get("/a/");
    await client.page("/b/", {}, 1);

    expect(client.requests).toBe(2);
  });
});
