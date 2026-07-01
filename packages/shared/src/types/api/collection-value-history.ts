import type { collectionValueHistoryResponseSchema } from "@openrift/shared/contracts/collection-value-history";
import type { z } from "zod";

export type CollectionValueHistoryPoint = z.infer<
  typeof collectionValueHistoryResponseSchema
>["series"][number];

export type CollectionValueHistoryResponse = z.infer<typeof collectionValueHistoryResponseSchema>;
