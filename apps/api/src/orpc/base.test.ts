import { oc } from "@orpc/contract";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { implement } from "@orpc/server";
import { Hono } from "hono";
import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Variables } from "../types.js";
import { requireUser } from "./base";
import type { ApiContext } from "./context";
import { buildApiContext } from "./context";

const contract = {
  pub: oc
    .route({ method: "GET", path: "/_t/pub" })
    .meta({ auth: "public" })
    .output(z.object({ ok: z.boolean() })),
  priv: oc.route({ method: "GET", path: "/_t/priv" }).output(z.object({ hasUser: z.boolean() })),
};

const os = implement(contract).$context<ApiContext>().use(requireUser);
const router = {
  pub: os.pub.handler(() => ({ ok: true })),
  priv: os.priv.handler(({ context }) => ({ hasUser: context.user !== null })),
};
const handler = new OpenAPIHandler(router);

let currentUser: { id: string } | null = null;

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  if (currentUser) {
    c.set("user", currentUser as never);
  }
  // Anonymous: resolveSession calls auth.getSession — stub it to "no session".
  c.set("auth", { api: { getSession: async () => null } } as never);
  await next();
});
app.all("/_t/*", async (c: Context<{ Variables: Variables }>) => {
  const { matched, response } = await handler.handle(c.req.raw, { context: buildApiContext(c) });
  return matched && response ? response : c.notFound();
});

describe("apiImplement fail-closed auth middleware", () => {
  it("public procedure: 200 for anonymous", async () => {
    currentUser = null;
    const res = await app.request("/_t/pub");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("default (unclassified) procedure: 401 for anonymous (fail-closed)", async () => {
    currentUser = null;
    const res = await app.request("/_t/priv");
    expect(res.status).toBe(401);
  });

  it("default procedure: 200 when a user is present", async () => {
    currentUser = { id: "u1" };
    const res = await app.request("/_t/priv");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasUser: true });
  });
});
