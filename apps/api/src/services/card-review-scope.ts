import { ERROR_CODES } from "@openrift/shared";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias
import { AppError } from "../errors.js";
import type { AdminAccess } from "../middleware/require-admin.js";
import type { candidateCardsRepo } from "../repositories/candidate-cards.js";
import type { providerSettingsRepo } from "../repositories/provider-settings.js";

/**
 * Provider scoping for the card-review admin grant (ADR-040 lineage).
 *
 * The section path matcher only gates which endpoints a grant holder can
 * reach; most candidate requests identify rows by id/name, so the provider
 * restriction ("only candidates from helper-reviewable providers") is
 * enforced here, in the handlers. Full admins are unscoped.
 */

/**
 * Resolves the caller's provider scope.
 *
 * @returns `null` for full admins (unscoped); otherwise the set of
 * helper-reviewable providers. Fails closed: a missing access (middleware
 * didn't run) or an empty allowlist scopes to nothing.
 */
export function reviewableProviderScope(
  access: AdminAccess | null,
  providerSettings: ReturnType<typeof providerSettingsRepo>,
): Promise<Set<string> | null> {
  if (access?.isAdmin) {
    return Promise.resolve(null);
  }
  return providerSettings.helperReviewableProviders();
}

/**
 * Asserts every provider is inside a non-null scope.
 *
 * @returns Nothing; throws `AppError(403)` when a provider is out of scope.
 */
export function assertProvidersInScope(
  providers: Iterable<string>,
  scope: Set<string> | null,
): void {
  if (scope === null) {
    return;
  }
  for (const provider of providers) {
    if (!scope.has(provider)) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
    }
  }
}

/**
 * Asserts at least one provider is inside a non-null scope. Used where a
 * mutation targets a card/name rather than specific candidates: the target
 * must have candidate data from an allowed provider, otherwise the endpoint
 * would degrade into unscoped editing by id.
 *
 * @returns Nothing; throws `AppError(403)` when no provider is in scope.
 */
export function assertSomeProviderInScope(
  providers: readonly string[],
  scope: Set<string> | null,
): void {
  if (scope === null) {
    return;
  }
  if (!providers.some((provider) => scope.has(provider))) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Forbidden");
  }
}

/**
 * Resolves the given candidate printings' providers and asserts they are all
 * inside a non-null scope. Unknown ids fall through untouched — the handler's
 * own not-found handling applies.
 *
 * @returns Nothing; throws `AppError(403)` when a provider is out of scope.
 */
export async function assertCandidatePrintingsInScope(
  candidateCards: ReturnType<typeof candidateCardsRepo>,
  ids: string[],
  scope: Set<string> | null,
): Promise<void> {
  if (scope === null || ids.length === 0) {
    return;
  }
  const rows = await candidateCards.providersForCandidatePrintings(ids);
  assertProvidersInScope(
    rows.map((r) => r.provider),
    scope,
  );
}
