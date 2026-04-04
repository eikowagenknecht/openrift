import { TIME_RANGE_DAYS } from "@openrift/shared";
import type { TimeRange } from "@openrift/shared";
import { z } from "zod";

export const printingIdParamSchema = z.object({ printingId: z.string().uuid() });

export const rangeQuerySchema = z.object({
  range: z.enum(Object.keys(TIME_RANGE_DAYS) as [TimeRange, ...TimeRange[]]).default("30d"),
});
