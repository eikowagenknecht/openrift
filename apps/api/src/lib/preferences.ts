import type { Marketplace } from "@openrift/shared";
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types";

import type { Repos } from "../deps.js";

/** Pass `null` for shared collections that have no personal owner; the default is returned. */
export async function getFavoriteMarketplace(
  repos: Repos,
  userId: string | null,
): Promise<Marketplace> {
  if (!userId) {
    return PREFERENCE_DEFAULTS.marketplaceOrder[0];
  }
  const prefs = await repos.userPreferences.getByUserId(userId);
  return prefs?.data?.marketplaceOrder?.[0] ?? PREFERENCE_DEFAULTS.marketplaceOrder[0];
}
