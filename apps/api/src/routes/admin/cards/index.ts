import { OpenAPIHono } from "@hono/zod-openapi";

import type { Variables } from "../../../types.js";
import { cardBansRoute } from "./bans.js";
import { imagesRoute } from "./images.js";
import { mutationsRoute } from "./mutations.js";
import { queriesRoute } from "./queries.js";

export const adminCardsRoute = new OpenAPIHono<{ Variables: Variables }>()
  .route("/cards", queriesRoute)
  .route("/cards", mutationsRoute)
  .route("/cards", imagesRoute)
  .route("/cards", cardBansRoute);
