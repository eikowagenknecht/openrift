import type { PresenceDimension } from "@openrift/shared";

export type PresenceParamValue = "any" | "none" | null;

export function presenceToFlagState(value: PresenceParamValue): boolean | null {
  return value === "any" ? true : value === "none" ? false : null;
}

export function presenceFlagCount(
  counts: { any: number; none: number } | undefined,
  state: boolean | null,
): number | undefined {
  if (!counts) {
    return undefined;
  }
  return state === false ? counts.none : counts.any;
}

export const PRESENCE_LABELS: Record<PresenceDimension, string> = {
  markers: "Has any marker",
  superTypes: "Has any supertype",
  customTags: "Has any custom tag",
  distributionChannels: "Has any distribution channel",
  keywords: "Has any keyword",
  tags: "Has any tag",
};
