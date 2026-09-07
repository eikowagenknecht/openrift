import { PREFERENCE_DEFAULTS } from "@openrift/shared/types/api/preferences";
import type { Marketplace } from "@openrift/shared/types/pricing";

import type { Repos } from "../deps.js";

const [DEFAULT_MARKETPLACE = "cardtrader"] = PREFERENCE_DEFAULTS.marketplaceOrder;

export function resolveFavoriteMarketplace(marketplaceOrder?: Marketplace[]): Marketplace {
  return marketplaceOrder?.[0] ?? DEFAULT_MARKETPLACE;
}

/** Pass `null` for shared collections that have no personal owner; the default is returned. */
export async function getFavoriteMarketplace(
  repos: Repos,
  userId: string | null,
): Promise<Marketplace> {
  if (!userId) {
    return DEFAULT_MARKETPLACE;
  }
  const prefs = await repos.userPreferences.getByUserId(userId);
  return resolveFavoriteMarketplace(prefs?.data?.marketplaceOrder);
}
