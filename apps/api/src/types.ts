import type { Kysely } from "kysely";

import type { createAuth } from "./auth.js";
import type { createConfig } from "./config.js";
import type { Database } from "./db/index.js";

export type Auth = ReturnType<typeof createAuth>;
export type Config = ReturnType<typeof createConfig>;

export interface Variables {
  db: Kysely<Database>;
  auth: Auth;
  config: Config;
  user: Auth["$Infer"]["Session"]["user"] | null;
  session: Auth["$Infer"]["Session"]["session"] | null;
}
