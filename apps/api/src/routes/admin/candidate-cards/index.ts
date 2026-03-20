import { Hono } from "hono";

import type { Variables } from "../../../types.js";
import { imagesRoute } from "./images.js";
import { mutationsRoute } from "./mutations.js";
import { queriesRoute } from "./queries.js";

export const candidatesRoute = new Hono<{ Variables: Variables }>()
  .route("/candidates", queriesRoute)
  .route("/candidates", mutationsRoute)
  .route("/candidates", imagesRoute);
