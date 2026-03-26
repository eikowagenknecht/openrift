import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";

import { buildOpenApiSpecWithSchemas } from "../../openapi.js";
import type { Variables } from "../../types.js";

const spec = buildOpenApiSpecWithSchemas();

export const docsRoute = new Hono<{ Variables: Variables }>()
  .get("/openapi.json", (c) => c.json(spec))
  .get(
    "/docs",
    apiReference({
      url: "/api/openapi.json",
      theme: "kepler",
      pageTitle: "OpenRift API Reference",
    }),
  );
