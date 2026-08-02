import { z } from "zod";

/**
 * Kebab-case slug pattern shared by the admin enum/tag contracts (markers,
 * distribution-channels, custom-tags, card-types, deck-formats, finishes,
 * super-types, art-variants, rarities, domains): lowercase, starts with a
 * letter, single dashes between alphanumeric runs. Feature-flag and
 * site-setting *keys* use a stricter 2+-character variant and deliberately keep
 * their own regex.
 */
export const slugRegex = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/**
 * Fire-and-forget job-kickoff response shared by the admin operations that start
 * a background run (price refreshes, image jobs, the printing-event flush): the
 * new run's id plus whether it started or a run was already in flight.
 */
export const jobStartedResponseSchema = z.object({
  runId: z.uuid(),
  status: z.enum(["running", "already_running"]),
});
