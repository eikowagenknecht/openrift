import { Hono } from "hono";

import {
  buildCandidateCardDetail,
  buildCandidateCardList,
  buildExport,
  buildUnmatchedDetail,
} from "../../../services/candidate-queries.js";
import type { Variables } from "../../../types.js";

export const queriesRoute = new Hono<{ Variables: Variables }>()
  .get("/all-cards", async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.listAllCards());
  })

  .get("/provider-names", async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.distinctProviderNames());
  })

  .get("/provider-stats", async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await candidateCards.providerStats());
  })

  .get("/", async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await buildCandidateCardList(candidateCards));
  })

  .get("/export", async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await buildExport(candidateCards));
  })

  .get("/:cardId", async (c) => {
    const { candidateCards } = c.get("repos");
    return c.json(await buildCandidateCardDetail(candidateCards, c.req.param("cardId")));
  })

  .get("/new/:name", async (c) => {
    const { candidateCards } = c.get("repos");
    const name = decodeURIComponent(c.req.param("name"));
    return c.json(await buildUnmatchedDetail(candidateCards, name));
  });
