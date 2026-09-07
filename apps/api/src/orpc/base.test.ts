import { ERROR_CODES } from "@openrift/shared/error-codes";
import { oc } from "@orpc/contract";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { implement } from "@orpc/server";
import { Hono } from "hono";
import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AppError } from "../errors.js";
import { readJson } from "../test/read-json.js";
import type { Variables } from "../types.js";
import { requireAuthedUser, requireUser } from "./base";
import type { ApiContext } from "./context";
import { buildApiContext } from "./context";

const contract = {
  pub: oc
    .route({ method: "GET", path: "/_t/pub" })
    .meta({ auth: "public" })
    .output(z.object({ ok: z.boolean() })),
  priv: oc.route({ method: "GET", path: "/_t/priv" }).output(z.object({ hasUser: z.boolean() })),
  authed: oc.route({ method: "GET", path: "/_t/authed" }).output(z.object({ userId: z.string() })),
};

const os = implement(contract).$context<ApiContext>().use(requireUser);
const authedOs = implement(contract).$context<ApiContext>().use(requireAuthedUser);
const router = {
  pub: os.pub.handler(() => ({ ok: true })),
  priv: os.priv.handler(({ context }) => ({ hasUser: context.user !== null })),
  authed: authedOs.authed.handler(({ context }) => ({ userId: context.userId })),
};
const handler = new OpenAPIHandler(router);

let currentUser: { id: string } | null = null;

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  if (currentUser) {
    c.set("user", currentUser as never);
  }
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
    expect(await readJson(res)).toEqual({ ok: true });
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
    expect(await readJson(res)).toEqual({ hasUser: true });
  });

  it("requireAuthedUser: 401 for anonymous", async () => {
    currentUser = null;
    const res = await app.request("/_t/authed");
    expect(res.status).toBe(401);
  });

  it("requireAuthedUser: injects userId when a user is present", async () => {
    currentUser = { id: "u1" };
    const res = await app.request("/_t/authed");
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ userId: "u1" });
  });
});

const errorContract = {
  declaredNotFound: oc
    .route({ method: "GET", path: "/_e/declared-not-found" })
    .meta({ auth: "public" })
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(z.object({ ok: z.boolean() })),
  undeclaredConflict: oc
    .route({ method: "GET", path: "/_e/undeclared-conflict" })
    .meta({ auth: "public" })
    .errors({ NOT_FOUND: { message: "Not found" } })
    .output(z.object({ ok: z.boolean() })),
  validationDefaultStatus: oc
    .route({ method: "GET", path: "/_e/validation-default" })
    .meta({ auth: "public" })
    .errors({ VALIDATION_ERROR: { message: "Invalid" } })
    .output(z.object({ ok: z.boolean() })),
  validationExplicitStatus: oc
    .route({ method: "GET", path: "/_e/validation-explicit" })
    .meta({ auth: "public" })
    .errors({ VALIDATION_ERROR: { status: 422, message: "Invalid" } })
    .output(z.object({ ok: z.boolean() })),
};

const errorOs = implement(errorContract).$context<ApiContext>().use(requireUser);
const errorRouter = {
  declaredNotFound: errorOs.declaredNotFound.handler(() => {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "no card");
  }),
  undeclaredConflict: errorOs.undeclaredConflict.handler(() => {
    throw new AppError(409, ERROR_CODES.CONFLICT, "conflict");
  }),
  validationDefaultStatus: errorOs.validationDefaultStatus.handler(() => {
    throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, "invalid");
  }),
  validationExplicitStatus: errorOs.validationExplicitStatus.handler(() => {
    throw new AppError(422, ERROR_CODES.VALIDATION_ERROR, "invalid");
  }),
};
const errorHandler = new OpenAPIHandler(errorRouter);

const errorApp = new Hono<{ Variables: Variables }>();
errorApp.use("*", async (c, next) => {
  c.set("auth", { api: { getSession: async () => null } } as never);
  await next();
});
errorApp.all("/_e/*", async (c: Context<{ Variables: Variables }>) => {
  const { matched, response } = await errorHandler.handle(c.req.raw, {
    context: buildApiContext(c),
  });
  return matched && response ? response : c.notFound();
});

async function errorBody(path: string): Promise<{
  defined: boolean;
  code: string;
  status: number;
}> {
  const res = await errorApp.request(path);
  return (await readJson(res)) as { defined: boolean; code: string; status: number };
}

describe("convertingAppErrors typed-error round-trip", () => {
  it("a declared code with matching status arrives defined", async () => {
    const body = await errorBody("/_e/declared-not-found");
    expect(body).toMatchObject({ defined: true, code: "NOT_FOUND", status: 404 });
  });

  it("a code absent from the contract's errors stays undefined", async () => {
    const body = await errorBody("/_e/undeclared-conflict");
    expect(body).toMatchObject({ defined: false, code: "CONFLICT", status: 409 });
  });

  it("a non-standard code without an explicit status stays undefined (status mismatch)", async () => {
    const body = await errorBody("/_e/validation-default");
    expect(body).toMatchObject({ defined: false, code: "VALIDATION_ERROR", status: 422 });
  });

  it("a non-standard code with a pinned matching status arrives defined", async () => {
    const body = await errorBody("/_e/validation-explicit");
    expect(body).toMatchObject({ defined: true, code: "VALIDATION_ERROR", status: 422 });
  });
});
