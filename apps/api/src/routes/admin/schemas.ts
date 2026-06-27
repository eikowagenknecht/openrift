import { z } from "zod";

// ── User Feature Flags ─────────────────────────────────────────────────────

export const userKeyParamSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
});
