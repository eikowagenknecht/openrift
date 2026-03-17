import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import {
  buildCardSourceDetail,
  buildCardSourceList,
  buildExport,
  buildUnmatchedDetail,
} from "../../services/card-source-queries.js";
// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias for bun runtime
import type { Variables } from "../../types.js";
import { cardSourcesQuerySchema } from "./schemas.js";

export const queriesRoute = new Hono<{ Variables: Variables }>()
  .get("/all-cards", async (c) => {
    const { cardSources } = c.get("repos");
    return c.json(await cardSources.listAllCards());
  })

  .get("/source-names", async (c) => {
    const { cardSources } = c.get("repos");
    return c.json(await cardSources.distinctSourceNames());
  })

  .get("/source-stats", async (c) => {
    const { cardSources } = c.get("repos");
    return c.json(await cardSources.sourceStats());
  })

  .get("/", zValidator("query", cardSourcesQuerySchema), async (c) => {
    const { cardSources } = c.get("repos");
    const { filter, source } = c.req.valid("query");
    return c.json(await buildCardSourceList(cardSources, filter ?? "all", source));
  })

  .get("/export", async (c) => {
    const { cardSources } = c.get("repos");
    return c.json(await buildExport(cardSources));
  })

  .get("/:cardId", async (c) => {
    const { cardSources } = c.get("repos");
    return c.json(await buildCardSourceDetail(cardSources, c.req.param("cardId")));
  })

  .get("/new/:name", async (c) => {
    const { cardSources } = c.get("repos");
    const name = decodeURIComponent(c.req.param("name"));
    return c.json(await buildUnmatchedDetail(cardSources, name));
  });
