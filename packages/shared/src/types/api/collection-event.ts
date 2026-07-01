import type {
  collectionEventListResponseSchema,
  collectionEventResponseSchema,
} from "@openrift/shared/contracts/collection-events";
import type { z } from "zod";

export type CollectionEventResponse = z.infer<typeof collectionEventResponseSchema>;

export type CollectionEventListResponse = z.infer<typeof collectionEventListResponseSchema>;
