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
  // Undefined when no session-loading middleware has run on this route
  // (truly-public endpoints). Use `loadSession`, `requireAuth`, or
  // `requireAdmin` to populate; reads should treat `undefined` and `null`
  // alike (`if (!user) ...`).
  user: Auth["$Infer"]["Session"]["user"] | null | undefined;
  session: Auth["$Infer"]["Session"]["session"] | null | undefined;
  // Set by `requireAdmin` (for full admins and grant holders alike);
  // undefined on routes that middleware didn't run on.
  adminAccess: AdminAccess | undefined;
  repos: Repos;
  services: Services;
  transact: Transact;
  scheduler: JobScheduler | undefined;
}
