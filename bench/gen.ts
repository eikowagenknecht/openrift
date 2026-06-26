// Code generator for the RPC type-cost benchmark.
// Emits N routes for both @hono/zod-openapi (chained .route()) and oRPC
// (server-inferred router), each with a moderately complex Zod schema, plus a
// consumer file that instantiates the client type and calls every endpoint.
//
// Usage: bun gen.ts <N>
// oxlint-disable-next-line import/no-nodejs-modules -- codegen script, runs under bun
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

const count = Number(process.argv[2] ?? "25");
const here = new URL(".", import.meta.url).pathname;

// A reasonably rich, per-route Zod schema. We vary field names by route index
// so the compiler can't trivially dedupe identical types across routes —
// mirroring how the real app has a distinct schema per endpoint.
function schema(idx: number): string {
  return `z.object({
    id_${idx}: z.string().uuid(),
    name_${idx}: z.string().min(1).max(120),
    count_${idx}: z.number().int().min(0),
    kind_${idx}: z.enum(["alpha", "beta", "gamma", "delta"]),
    tags_${idx}: z.array(z.string()),
    nested_${idx}: z.object({
      a_${idx}: z.string(),
      b_${idx}: z.number().nullable(),
      c_${idx}: z.array(z.object({ x_${idx}: z.number(), y_${idx}: z.string().optional() })),
      d_${idx}: z.union([z.literal("on"), z.literal("off"), z.number()]),
    }),
    record_${idx}: z.record(z.string(), z.object({ v_${idx}: z.number(), w_${idx}: z.boolean() })),
    items_${idx}: z.array(z.object({
      sku_${idx}: z.string(),
      price_${idx}: z.number(),
      meta_${idx}: z.object({ note_${idx}: z.string().optional(), flags_${idx}: z.array(z.boolean()) }),
    })),
  })`;
}

const inputSchema = (idx: number) =>
  `z.object({ q_${idx}: z.string().optional(), page_${idx}: z.number().int().min(0).default(0) })`;

// ---- Hono (@hono/zod-openapi, chained .route()) ----
function genHono() {
  const dir = `${here}routes-hono`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let idx = 0; idx < count; idx++) {
    writeFileSync(
      `${dir}/route_${idx}.ts`,
      `import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
export const route_${idx} = new OpenAPIHono().openapi(
  createRoute({
    method: "get",
    path: "/r${idx}",
    request: { query: ${inputSchema(idx)} },
    responses: {
      200: {
        content: { "application/json": { schema: ${schema(idx)} } },
        description: "ok",
      },
    },
  }),
  (c) => {
    const _q = c.req.valid("query");
    return c.json(stub);
  },
);
declare const stub: never;
`,
    );
  }
  const chain = Array.from({ length: count }, (_unused, idx) => `  .route("/", route_${idx})`).join(
    "\n",
  );
  const imports = Array.from(
    { length: count },
    (_unused, idx) => `import { route_${idx} } from "./routes-hono/route_${idx}.ts";`,
  ).join("\n");
  writeFileSync(
    `${here}app-hono.ts`,
    `import { OpenAPIHono } from "@hono/zod-openapi";
${imports}
const app = new OpenAPIHono()
${chain};
export type AppType = typeof app;
`,
  );
  // Consumer: instantiate hc<AppType> and call every endpoint.
  const calls = Array.from(
    { length: count },
    (_unused, idx) =>
      `  const res_${idx} = await client.r${idx}.$get({ query: { q_${idx}: "x", page_${idx}: 0 } });\n  const data_${idx} = await res_${idx}.json();\n  sink(data_${idx});`,
  ).join("\n");
  writeFileSync(
    `${here}consumer-hono.ts`,
    `import { hc } from "hono/client";
import type { AppType } from "./app-hono.ts";
declare function sink(value: unknown): void;
export async function run() {
  const client = hc<AppType>("http://localhost");
${calls}
}
`,
  );
}

// ---- oRPC (server-inferred router) ----
function genOrpc() {
  const dir = `${here}routes-orpc`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let idx = 0; idx < count; idx++) {
    writeFileSync(
      `${dir}/route_${idx}.ts`,
      `import { os } from "@orpc/server";
import { z } from "zod";
export const route_${idx} = os
  .input(${inputSchema(idx)})
  .output(${schema(idx)})
  .handler(async () => stub);
declare const stub: never;
`,
    );
  }
  const imports = Array.from(
    { length: count },
    (_unused, idx) => `import { route_${idx} } from "./routes-orpc/route_${idx}.ts";`,
  ).join("\n");
  const members = Array.from({ length: count }, (_unused, idx) => `  r${idx}: route_${idx},`).join(
    "\n",
  );
  writeFileSync(
    `${here}router-orpc.ts`,
    `${imports}
export const router = {
${members}
};
export type Router = typeof router;
`,
  );
  const calls = Array.from(
    { length: count },
    (_unused, idx) =>
      `  const data_${idx} = await client.r${idx}({ q_${idx}: "x", page_${idx}: 0 });\n  sink(data_${idx});`,
  ).join("\n");
  writeFileSync(
    `${here}consumer-orpc.ts`,
    `import type { RouterClient } from "@orpc/server";
import type { Router } from "./router-orpc.ts";
declare function sink(value: unknown): void;
declare const client: RouterClient<Router>;
export async function run() {
${calls}
}
`,
  );
}

genHono();
genOrpc();
console.log(`generated ${count} routes for hono + orpc`);
