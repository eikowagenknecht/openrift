import { createApiApp } from "../../../openapi.js";
import { cardBansRoute } from "./bans.js";
import { imagesRoute } from "./images.js";
import { mutationsRoute } from "./mutations.js";
import { queriesRoute } from "./queries.js";

export const adminCardsRoute = createApiApp()
  .route("/cards", queriesRoute)
  .route("/cards", mutationsRoute)
  .route("/cards", imagesRoute)
  .route("/cards", cardBansRoute);
