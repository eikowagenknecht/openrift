import { Hono } from "hono";

import type { Variables } from "../../types.js";
import { imagesRoute } from "./images.js";
import { mutationsRoute } from "./mutations.js";
import { queriesRoute } from "./queries.js";

export const cardSourcesRoute = new Hono<{ Variables: Variables }>()
  .route("/card-sources", queriesRoute)
  .route("/card-sources", mutationsRoute)
  .route("/card-sources", imagesRoute);
