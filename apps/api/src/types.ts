import type { Kysely } from "kysely";

import type { createAuth } from "./auth.js";
import type { createConfig } from "./config.js";
import type { Database } from "./db/index.js";
import type { Repos, Services } from "./deps.js";
import type { Io } from "./io.js";

export type Auth = ReturnType<typeof createAuth>;
export type Config = ReturnType<typeof createConfig>;

export interface Variables {
  db: Kysely<Database>;
  io: Io;
  auth: Auth;
  config: Config;
  user: Auth["$Infer"]["Session"]["user"] | null;
  session: Auth["$Infer"]["Session"]["session"] | null;
  repos: Repos;
  services: Services;
}
