import type { featureFlagsResponseSchema } from "@openrift/shared/contracts/feature-flags";
import type { z } from "zod";

export type FeatureFlagsResponse = z.infer<typeof featureFlagsResponseSchema>;
