import type { createAuth } from "./auth.js";
import type { createConfig } from "./config.js";
import type { Repos, Services, Transact } from "./deps.js";
import type { Io } from "./io.js";

export type Auth = ReturnType<typeof createAuth>;
export type Config = ReturnType<typeof createConfig>;

export interface Variables {
  io: Io;
  auth: Auth;
  config: Config;
  user: Auth["$Infer"]["Session"]["user"] | null;
  session: Auth["$Infer"]["Session"]["session"] | null;
  repos: Repos;
  services: Services;
  transact: Transact;
}
