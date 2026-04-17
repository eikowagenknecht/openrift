import { TIME_RANGE_DAYS } from "@openrift/shared";
import type { TimeRange } from "@openrift/shared";
import { z } from "zod";

export const printingIdParamSchema = z.object({ printingId: z.string().uuid() });

export const rangeQuerySchema = z.object({
  range: z.enum(Object.keys(TIME_RANGE_DAYS) as [TimeRange, ...TimeRange[]]).default("30d"),
});

export const MARKETPLACE_INFO_MAX_PRINTINGS = 200;

export const marketplaceInfoQuerySchema = z.object({
  printings: z.string().transform((value, ctx) => {
    const ids = value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "printings must not be empty" });
      return z.NEVER;
    }
    if (ids.length > MARKETPLACE_INFO_MAX_PRINTINGS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `printings must be at most ${MARKETPLACE_INFO_MAX_PRINTINGS} ids`,
      });
      return z.NEVER;
    }
    const uuid = z.string().uuid();
    for (const id of ids) {
      const parsed = uuid.safeParse(id);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `invalid uuid: ${id}` });
        return z.NEVER;
      }
    }
    return [...new Set(ids)];
  }),
});
