import { ERROR_CODES } from "@openrift/shared";

// oxlint-disable-next-line no-restricted-imports -- API has no @/ alias
import { AppError } from "../errors.js";
import type { AdminAccess } from "../middleware/require-admin.js";
import type { candidateCardsRepo } from "../repositories/candidate-cards.js";
import type { providerSettingsRepo } from "../repositories/provider-settings.js";

/**
 * Fails closed: a missing access (middleware didn't run) or an empty
 * allowlist scopes to nothing.
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

/** Unknown ids fall through untouched; the handler's own not-found handling applies. */
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
