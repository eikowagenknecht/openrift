import type { CardStatLabels } from "@openrift/shared/card-stat-line";
import type { VariantLabelEnumLabels } from "@openrift/shared/printing-label";

export interface EnumLabels extends VariantLabelEnumLabels, CardStatLabels {
  rarities: Record<string, string>;
  conditions: Record<string, string>;
  graders: Record<string, string>;
}
