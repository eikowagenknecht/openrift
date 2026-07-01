import type {
  ruleChangesResponseSchema,
  ruleResponseSchema,
  ruleVersionResponseSchema,
  ruleVersionsListResponseSchema,
  rulesListResponseSchema,
} from "@openrift/shared/contracts/rules";
import type { z } from "zod";

export type RuleKind = "core" | "tournament";

export type RuleResponse = z.infer<typeof ruleResponseSchema>;

export type RuleVersionResponse = z.infer<typeof ruleVersionResponseSchema>;

export type RuleChangesResponse = z.infer<typeof ruleChangesResponseSchema>;

export type RulesListResponse = z.infer<typeof rulesListResponseSchema>;

export type RuleVersionsListResponse = z.infer<typeof ruleVersionsListResponseSchema>;
