import { describe, expect, it } from "vitest";

import { CARD_FURY_UNIT } from "../../test/fixtures/constants.js";
import { createUnauthenticatedTestContext, req } from "../../test/integration-context.js";

const ctx = createUnauthenticatedTestContext();

/**
 * The route is anonymous on purpose — a chat bot has no session — so this runs
 * against the unauthenticated context to prove no auth middleware stands in
 * front of it.
 */
describe.skipIf(!ctx)("Chat card lookup route (integration)", () => {
  const { app } = ctx!;

  async function lookup(query: string): Promise<Response> {
    return await app.fetch(req("GET", `/chat/card?q=${encodeURIComponent(query)}`));
  }

  /** @returns The response body of a lookup. */
  async function lookupText(query: string): Promise<string> {
    const res = await lookup(query);
    return await res.text();
  }

  it("resolves a real card by name, anonymously, as one line of plain text", async () => {
    const res = await lookup(CARD_FURY_UNIT.name);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body.startsWith(CARD_FURY_UNIT.name)).toBe(true);
    expect(body).not.toContain("\n");
    expect(body.length).toBeLessThanOrEqual(400);
  });

  it("names the card's type and domain from the live enum labels", async () => {
    const body = await lookupText(CARD_FURY_UNIT.name);
    expect(body).toContain("Unit");
    expect(body).toContain("Fury");
    expect(body).not.toContain("undefined");
  });

  it("resolves the same card by its printing code, dashes optional", async () => {
    const withDashes = await lookupText("OGS-001");
    const withoutDashes = await lookupText("ogs001");

    expect(withDashes.startsWith(CARD_FURY_UNIT.name)).toBe(true);
    expect(withoutDashes).toBe(withDashes);
  });

  it("answers an unknown card with friendly text and a 200, not a 404", async () => {
    const res = await lookup("definitely not a riftbound card");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("No Riftbound card found");
  });

  it("answers a missing query with usage text", async () => {
    const res = await app.fetch(req("GET", "/chat/card"));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Look up a Riftbound card by name or code");
  });
});
