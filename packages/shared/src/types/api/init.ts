import type { initResponseSchema } from "@openrift/shared/contracts/init";
import type { z } from "zod";

export type InitResponse = z.infer<typeof initResponseSchema>;
