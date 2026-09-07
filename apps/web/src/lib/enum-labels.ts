import type { CardStatLabels, VariantLabelEnumLabels } from "@openrift/shared";

export interface EnumLabels extends VariantLabelEnumLabels, CardStatLabels {
  rarities: Record<string, string>;
  conditions: Record<string, string>;
  graders: Record<string, string>;
}
