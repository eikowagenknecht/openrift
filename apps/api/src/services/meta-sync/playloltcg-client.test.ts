import { describe, expect, it } from "vitest";

import type { Fetch } from "../../io.js";
import { createPlayloltcgClient, PlayloltcgBlockedError } from "./playloltcg-client.js";

const USER_AGENT = "Mozilla/5.0 (test) AppleWebKit/537.36 Chrome/134.0.0.0 Safari/537.36";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
function html(status = 403): Response {
  return new Response("<html>WAF拦截页面</html>", { status });
}

function harness(responses: (() => Response)[]) {
  const inits: (RequestInit | undefined)[] = [];
  const sleeps: number[] = [];
  let call = 0;
  const fetchFn: Fetch = (_input, init) => {
    inits.push(init);
    const next = responses[Math.min(call, responses.length - 1)];
    call++;
    return Promise.resolve(next());
  };
  const client = createPlayloltcgClient({
    fetch: fetchFn,
    userAgent: USER_AGENT,
    baseUrl: "https://source.invalid",
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    random: () => 0,
    now: () => 1_000_000,
  });
  return { client, inits, sleeps };
}

describe("createPlayloltcgClient", () => {
  it("posts JSON under the neutral UA with no Referer", async () => {
    const { client, inits } = harness([() => json({ code: 0, result: [] })]);

    await client.postList("/xcx/shop/searchShop", { pageNum: 1, pageSize: 2 });

    const init = inits[0];
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["user-agent"]).toBe(USER_AGENT);
    expect(headers.referer).toBeUndefined();
    expect(JSON.parse(String(init?.body))).toEqual({ pageNum: 1, pageSize: 2 });
  });

  it("reports no total for a bare-array result rather than counting the page", async () => {
    const { client } = harness([() => json({ code: 0, result: [{ id: 1 }, { id: 2 }] })]);
    const list = await client.postList<{ id: number }>("/xcx/shop/searchShop", {});
    expect(list.items).toHaveLength(2);
    // Standing the page's own length in for a missing total reads as "that was
    // all of it", which is how a full page used to end a walk mid-listing.
    expect(list.total).toBeNull();
  });

  it("normalizes a {list,total} result", async () => {
    const { client } = harness([
      () => json({ code: 0, result: { list: [{ id: 1 }], total: 158_546 } }),
    ]);
    const list = await client.postList<{ id: number }>("/xcx/card/searchCardCraftWeb", {});
    expect(list.items).toHaveLength(1);
    expect(list.total).toBe(158_546);
  });

  it("throws on a non-zero source code", async () => {
    const { client } = harness([() => json({ code: 500, message: "boom", result: null })]);
    await expect(client.post("/xcx/x", {})).rejects.toThrow(/code 500/u);
  });

  it("retries a WAF block once, then latches and throws blocked", async () => {
    const { client } = harness([html, html, () => json({ code: 0, result: [] })]);

    await expect(client.postList("/xcx/shop/searchShop", {})).rejects.toBeInstanceOf(
      PlayloltcgBlockedError,
    );
    expect(client.blocked).toBe(true);
    // Two WAF hits (one patient retry), never reaching the third response.
    expect(client.requests).toBe(2);
  });

  it("fails every later call fast once blocked, making no request", async () => {
    const { client } = harness([html, html]);
    await expect(client.post("/xcx/a", {})).rejects.toBeInstanceOf(PlayloltcgBlockedError);
    const before = client.requests;

    await expect(client.post("/xcx/b", {})).rejects.toBeInstanceOf(PlayloltcgBlockedError);
    expect(client.requests).toBe(before);
  });

  it("retries a transient 5xx and then succeeds", async () => {
    let n = 0;
    const { client } = harness([
      () => (n++ === 0 ? json({}, 503) : json({ code: 0, result: { ok: true } })),
    ]);
    const result = await client.post<{ ok: boolean }>("/xcx/x", {});
    expect(result).toEqual({ ok: true });
    expect(client.requests).toBe(2);
  });
});
