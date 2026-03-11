import { createDb } from "@openrift/shared/db/connect";

import { config } from "./config.js";

export const { db, dialect } = createDb(config.databaseUrl);
