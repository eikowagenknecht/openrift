import type { Marketplace } from "@openrift/shared";
import { PREFERENCE_DEFAULTS } from "@openrift/shared/types";

import type { Repos } from "../deps.js";

/**
 * Resolves the user's favorite marketplace from their preferences.
 * Pass `null` for shared collections that have no personal owner; the default is returned.
 * @returns The first marketplace in the user's preferred order, or the default.
 */
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
