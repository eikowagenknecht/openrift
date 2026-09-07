import type { createAuth } from "./auth.js";
import type { createConfig } from "./config.js";
import type { Repos, Services, Transact } from "./deps.js";
import type { Io } from "./io.js";
import type { AdminAccess } from "./middleware/require-admin.js";
import type { JobScheduler } from "./services/job-scheduler.js";

export type Auth = ReturnType<typeof createAuth>;
export type Config = ReturnType<typeof createConfig>;

export interface Variables {
  io: Io;
  auth: Auth;
  config: Config;
  user: Auth["$Infer"]["Session"]["user"] | null | undefined;
  session: Auth["$Infer"]["Session"]["session"] | null | undefined;
  adminAccess: AdminAccess | undefined;
  repos: Repos;
  services: Services;
  transact: Transact;
  scheduler: JobScheduler | undefined;
}
