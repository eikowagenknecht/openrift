import { z } from "zod";

// Feature-flag and site-setting keys use a stricter, separate regex; don't unify.
export const slugRegex = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

export const jobStartedResponseSchema = z.object({
  runId: z.uuid(),
  status: z.enum(["running", "already_running"]),
});
