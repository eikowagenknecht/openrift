import { Hono } from "hono";

import {
  buildCardSourceDetail,
  buildCardSourceList,
  buildExport,
  buildUnmatchedDetail,
} from "../../services/card-source-queries.js";
import type { Variables } from "../../types.js";

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

  .get("/", async (c) => {
    const { cardSources } = c.get("repos");
    return c.json(await buildCardSourceList(cardSources));
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
