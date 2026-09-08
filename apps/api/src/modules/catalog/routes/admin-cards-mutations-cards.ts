import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import { cardFieldRules } from "@openrift/shared/db-field-rules";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type { CardType, Domain, SuperType } from "@openrift/shared/types/enums";
import { normalizeNameForIdentity } from "@openrift/shared/utils";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { assertFound } from "../../../lib/assertions.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { acceptFavoriteNewCard } from "../../candidates/services/accept-gallery.js";
import {
  assertSomeProviderInScope,
  reviewableProviderScope,
} from "../../candidates/services/card-review-scope.js";
import { recordAdminEvent } from "../../system/services/record-admin-event.js";
import { cardUpdateFor } from "../lib/card-field-updates.js";
import { deleteCard } from "../services/card-admin.js";

const os = implement(adminCardMutationsContract).$context<ApiContext>().use(requireAuthedUser);

export const adminCardMutationsCardsRouter = {
  renameCard: os.renameCard.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut } = context.repos;
    const { cardId, newId } = input;

    if (!newId?.trim()) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "newId is required");
    }

    const card = await mut.getCardById(cardId);
    assertFound(card, "Card not found");

    if (newId === card.slug) {
      return;
    }

    // UUID PK is immutable -- only the slug changes
    await mut.renameCardSlugById(card.id, newId.trim());

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.rename",
      entityType: "card",
      entityId: card.id,
      entityLabel: card.name,
      cardSlug: newId.trim(),
      oldValues: { slug: card.slug },
      newValues: { slug: newId.trim() },
    });
  }),

  deleteCard: os.deleteCard.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations, catalogDeleteGuards } = context.repos;
    const before = await catalogMutations.getCardById(input.cardId);
    await deleteCard(
      context.transact,
      context.io,
      { catalogMutations, catalogDeleteGuards },
      input.cardId,
    );
    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.delete",
      entityType: "card",
      entityId: input.cardId,
      entityLabel: before?.name ?? null,
      oldValues: before ? { id: before.id, name: before.name, slug: before.slug } : null,
    });
  }),

  acceptField: os.acceptField.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut, candidateCards, providerSettings } = context.repos;
    const { cardId, field, value } = input;

    // Grant holders may only edit cards that still have candidate data from
    // an allowed provider — without this, accept-field would be unscoped
    // card editing by id.
    const scope = await reviewableProviderScope(context.adminAccess, providerSettings);
    if (scope !== null) {
      assertSomeProviderInScope(await candidateCards.candidateProvidersForCard(cardId), scope);
    }

    const arrayFields = new Set(["types", "superTypes", "domains", "tags"]);
    const normalized = value === null && arrayFields.has(field) ? [] : value;

    const validator = cardFieldRules[field as keyof typeof cardFieldRules];
    if (validator) {
      const parsed = validator.safeParse(normalized);
      if (!parsed.success) {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid value for ${field}: ${parsed.error.issues[0]?.message ?? "invalid value"}`,
        );
      }
    }

    const finalValue = normalized;

    // Snapshot before the write for the audit event. domains/superTypes live
    // only in junction tables — no cheap before-read, so their old is null;
    // types uses the denormalized cards.type scalar.
    const cardBefore = await mut.getFullCardById(cardId);
    const auditEvent = () =>
      recordAdminEvent(context.repos, context.userId, {
        action: "card.accept-field",
        entityType: "card",
        entityId: cardId,
        entityLabel: cardBefore?.name ?? null,
        cardSlug: cardBefore?.slug ?? null,
        oldValues:
          field === "domains" || field === "superTypes"
            ? null
            : {
                [field]:
                  field === "types"
                    ? cardBefore?.type
                    : (cardBefore as Record<string, unknown> | undefined)?.[field],
              },
        newValues: { [field]: finalValue },
      });

    // Domains and superTypes are stored in junction tables, not on the cards row
    if (field === "domains") {
      await mut.replaceCardDomainsById(cardId, finalValue as string[]);
      await context.repos.catalog.refreshCatalogViews();
      await auditEvent();
      return;
    }
    if (field === "superTypes") {
      await mut.replaceCardSuperTypesById(cardId, finalValue as string[]);
      await context.repos.catalog.refreshCatalogViews();
      await auditEvent();
      return;
    }
    // Card types live in the card_card_types junction; the repo keeps the
    // denormalized cards.type scalar in sync.
    if (field === "types") {
      try {
        await mut.replaceCardTypesById(cardId, finalValue as string[]);
      } catch (error: unknown) {
        // FK violation on card_types(slug) — unknown type slug, mirror the
        // scalar-column 400 below.
        if (error instanceof Error && "code" in error && error.code === "23503") {
          throw new AppError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            `Invalid value for ${field}: ${String(finalValue)}`,
          );
        }
        throw error;
      }
      await context.repos.catalog.refreshCatalogViews();
      await auditEvent();
      return;
    }

    const updates = cardUpdateFor(field, finalValue);

    try {
      await mut.updateCardById(cardId, updates);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid value for ${field}: ${String(finalValue)}`,
        );
      }
      throw error;
    }

    // A name change updates cards.norm_name (via the cards_set_norm_name
    // trigger) but not card_name_aliases — reconcile the self-alias so the
    // rename leaves no stale old-name row and the new name is matchable.
    if (field === "name" && typeof finalValue === "string" && cardBefore) {
      await mut.syncSelfAliasOnRename(
        cardId,
        normalizeNameForIdentity(cardBefore.name),
        normalizeNameForIdentity(finalValue),
      );
    }

    await auditEvent();
  }),

  acceptNewCard: os.acceptNewCard.handler(async ({ input, context }): Promise<void> => {
    const { name, cardFields } = input;

    // Grant holders may only accept names that have candidate data from an
    // allowed provider — otherwise this endpoint is arbitrary card creation
    // (the manual createCard is excluded from the card-review section).
    const scope = await reviewableProviderScope(
      context.adminAccess,
      context.repos.providerSettings,
    );
    if (scope !== null) {
      assertSomeProviderInScope(
        await context.repos.candidateCards.candidateProvidersForNormName(name),
        scope,
      );
    }

    await context.transact(async (trxRepos) => {
      // FK constraints validate values at DB level — safe to cast from z.string()
      await trxRepos.catalogMutations.acceptNewCardFromSources(
        cardFields as typeof cardFields & {
          types: CardType[];
          domains: Domain[];
          superTypes?: SuperType[];
        },
        name,
      );
    });

    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.accept-new",
      entityType: "card",
      entityId: cardFields.id,
      entityLabel: cardFields.name,
      cardSlug: cardFields.id,
      newValues: cardFields,
    });
  }),

  acceptFavoriteNewCard: os.acceptFavoriteNewCard.handler(async ({ input, context }) => {
    const {
      candidateCards,
      catalogMutations,
      printingImages,
      markers,
      distributionChannels,
      providerSettings,
      printingEvents,
    } = context.repos;
    const favoriteProviders = await providerSettings.favoriteProviders();

    const result = await acceptFavoriteNewCard(
      context.transact,
      context.io,
      {
        candidateCards,
        catalogMutations,
        printingImages,
        markers,
        distributionChannels,
        printingEvents,
      },
      input.name,
      favoriteProviders,
    );

    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.accept-favorites",
      entityType: "card",
      entityId: result.cardSlug,
      entityLabel: input.name,
      cardSlug: result.cardSlug,
      newValues: {
        cardSlug: result.cardSlug,
        printingsCreated: result.printingsCreated,
        skipped: result.skipped,
      },
    });

    return result;
  }),

  linkUnmatched: os.linkUnmatched.handler(async ({ input, context }): Promise<void> => {
    const { catalogMutations: mut } = context.repos;
    const { name, cardId } = input;

    if (!cardId) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, "cardId required");
    }

    const card = await mut.getCardById(cardId);
    assertFound(card, "Target card not found");

    await context.transact(async (trxRepos) => {
      await trxRepos.catalogMutations.createNameAliases(name, card.id);
    });

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.link-unmatched",
      entityType: "card",
      entityId: card.id,
      entityLabel: card.name,
      cardSlug: card.slug,
      newValues: { name, cardId },
    });
  }),

  createCard: os.createCard.handler(async ({ input, context }) => {
    const cardFields = input;

    await context.transact(async (trxRepos) => {
      await trxRepos.catalogMutations.acceptNewCardFromSources(
        cardFields as typeof cardFields & {
          types: CardType[];
          domains: Domain[];
          superTypes?: SuperType[];
        },
        normalizeNameForIdentity(cardFields.name),
      );
    });

    await context.repos.catalog.refreshCatalogViews();

    await recordAdminEvent(context.repos, context.userId, {
      action: "card.create",
      entityType: "card",
      entityId: cardFields.id,
      entityLabel: cardFields.name,
      cardSlug: cardFields.id,
      newValues: cardFields,
    });

    return { cardSlug: cardFields.id };
  }),
};
