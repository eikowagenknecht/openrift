// Static migration barrel — explicit imports so Kysely's MigrationProvider
// doesn't need filesystem scanning. When adding a new migration, also add it here.

import type { Migration } from "kysely/migration";

import * as m001 from "./001-core-schema.js";
import * as m059 from "./059-backfill-keywords-from-printings.js";
import * as m060 from "./060-fix-updated-at-trigger.js";
import * as m061 from "./061-rules.js";
import * as m062 from "./062-reference-tables.js";
import * as m063 from "./063-marketplace-language.js";
import * as m064 from "./064-card-errata-table.js";
import * as m065 from "./065-deck-zone-sort-order.js";
import * as m066 from "./066-drop-acquisition-sources.js";
import * as m067 from "./067-provider-favorite.js";
import * as m068 from "./068-domain-color.js";
import * as m069 from "./069-card-images.js";
import * as m070 from "./070-drop-collector-number.js";
import * as m071 from "./071-name-based-card-slugs.js";
import * as m072 from "./072-rename-image-files.js";
import * as m073 from "./073-keyword-translations.js";
import * as m074 from "./074-printing-events.js";
import * as m075 from "./075-simplify-printing-events.js";
import * as m076 from "./076-rename-standard-to-constructed.js";
import * as m077 from "./077-cardtrader-null-market.js";
import * as m078 from "./078-split-marketplace-products-variants.js";
import * as m079 from "./079-image-rotation.js";
import * as m080 from "./080-normalize-cardtrader-zh-cn.js";
import * as m081 from "./081-variant-nullable-language.js";
import * as m082 from "./082-set-type.js";
import * as m083 from "./083-rename-card-images-to-media.js";
import * as m084 from "./084-rarity-color.js";
import * as m085 from "./085-materialized-views.js";
import * as m086 from "./086-promo-type-description.js";
import * as m087 from "./087-promo-type-sort-order.js";
import * as m088 from "./088-printings-variant-include-language.js";
import * as m089 from "./089-marketplace-staging-norm-name.js";
import * as m090 from "./090-cardmarket-headline-market.js";
import * as m091 from "./091-promos-rework.js";
import * as m092 from "./092-deferrable-printing-constraints.js";
import * as m093 from "./093-deck-cards-preferred-printing.js";
import * as m094 from "./094-distribution-channel-hierarchy.js";
import * as m095 from "./095-metal-finishes-well-known.js";
import * as m096 from "./096-printings-ordered-view.js";
import * as m097 from "./097-set-released.js";
import * as m098 from "./098-ultimate-art-variant.js";
import * as m099 from "./099-marketplace-zero-low-cents.js";
import * as m100 from "./100-cardtrader-zero-first-headline.js";
import * as m101 from "./101-job-runs.js";
import * as m102 from "./102-marketplace-product-variants-constraint.js";
import * as m103 from "./103-delete-mismatched-variants.js";
import * as m104 from "./104-normalize-marketplace-products-per-sku.js";
import * as m105 from "./105-drop-variant-sku-columns.js";
import * as m106 from "./106-staging-nullable-language.js";
import * as m107 from "./107-backfill-sibling-variants.js";
import * as m108 from "./108-simplify-latest-prices-mv.js";
import * as m109 from "./109-marketplace-group-kind.js";
import * as m110 from "./110-marketplace-product-prices.js";
import * as m111 from "./111-latest-prices-mv-on-product-prices.js";
import * as m112 from "./112-product-norm-name.js";
import * as m113 from "./113-product-card-overrides.js";
import * as m114 from "./114-drop-snapshots-and-staging.js";
import * as m115 from "./115-token-super-type-well-known.js";
import * as m116 from "./116-rename-keyword-styles-to-keywords.js";
import * as m117 from "./117-deck-pinning-archiving.js";
import * as m118 from "./118-rarity-well-known.js";
import * as m119 from "./119-printing-printed-year.js";
import * as m120 from "./120-rules-kind.js";
import * as m121 from "./121-rules-version-comments.js";
import * as m122 from "./122-lowercase-taxonomy-slugs.js";
import * as m123 from "./123-drop-rules-search-index.js";
import * as m124 from "./124-pg-stat-statements.js";
import * as m125 from "./125-marketplace-group-set-id.js";
import * as m126 from "./126-image-files-needs-trim.js";
import * as m127 from "./127-drop-printing-images-provider.js";
import * as m128 from "./128-custom-tags.js";
import * as m129 from "./129-custom-region-format.js";
import * as m130 from "./130-custom-tag-categories.js";
import * as m131 from "./131-collection-is-public.js";
import * as m132 from "./132-unified-lists.js";
import * as m133 from "./133-list-kind.js";
import * as m134 from "./134-friend-groups.js";
import * as m135 from "./135-rename-list-intent.js";
import * as m136 from "./136-shared-collections.js";
import * as m137 from "./137-trade-preferences.js";
import * as m138 from "./138-user-share-token.js";
import * as m139 from "./139-backfill-missing-added-events.js";
import * as m140 from "./140-collection-events-preserve-on-delete.js";
import * as m141 from "./141-friend-group-collection-shares.js";
import * as m142 from "./142-list-sort-order.js";
import * as m143 from "./143-copy-ownership-from-collection.js";
import * as m144 from "./144-card-trades.js";
import * as m145 from "./145-pod-tournaments.js";
import * as m146 from "./146-touch-list-on-entry-change.js";
import * as m147 from "./147-pod-byes.js";
import * as m148 from "./148-gear-well-known.js";
import * as m149 from "./149-deck-check.js";
import * as m150 from "./150-default-group-list-shares.js";
import * as m151 from "./151-rename-deck-check-handle-to-riot-id.js";
import * as m152 from "./152-deck-check-player.js";
import * as m153 from "./153-deck-check-sharing-consent.js";
import * as m154 from "./154-user-riot-id.js";
import * as m155 from "./155-deck-check-entry-states.js";
import * as m156 from "./156-deck-check-publish-consent.js";
import * as m157 from "./157-deck-check-claim-token.js";
import * as m158 from "./158-deck-plans.js";
import * as m159 from "./159-deck-plan-battlefield-note.js";
import * as m160 from "./160-deck-matchup-opponent.js";
import * as m161 from "./161-trade-request-email-coalesce.js";
import * as m162 from "./162-contact-methods.js";
import * as m163 from "./163-pod-game-points.js";
import * as m164 from "./164-job-run-noop.js";
import * as m165 from "./165-trade-status-email.js";
import * as m166 from "./166-organizations.js";
import * as m167 from "./167-tournaments-umbrella.js";
import * as m168 from "./168-unified-participants.js";
import * as m169 from "./169-deck-check-as-module.js";
import * as m170 from "./170-deck-check-drop-legacy.js";
import * as m171 from "./171-tournament-cancelled-status.js";
import * as m172 from "./172-tournament-starts-at-required.js";
import * as m173 from "./173-tournament-ends-at.js";
import * as m174 from "./174-deck-check-entry-participant-cascade.js";
import * as m175 from "./175-org-judge-role.js";
import * as m176 from "./176-tournament-participants-drop-email.js";
import * as m177 from "./177-tournament-staff-invite-tokens.js";
import * as m178 from "./178-tournament-collapse-format.js";
import * as m179 from "./179-tournament-drop-deck-check-toggle.js";
import * as m180 from "./180-card-size.js";
import * as m181 from "./181-tournament-follow-token.js";
import * as m182 from "./182-list-rules.js";
import * as m183 from "./183-basic-super-type-well-known.js";
import * as m184 from "./184-candidate-submitter.js";
import * as m185 from "./185-candidate-printing-size-channels.js";
import * as m186 from "./186-tournament-host-detach.js";
import * as m187 from "./187-release-hardening-indexes.js";
import * as m188 from "./188-organization-owner-rebalance.js";
import * as m189 from "./189-friend-group-previous-slug.js";
import * as m190 from "./190-list-rule-combine.js";
import * as m191 from "./191-keyword-cost-flag.js";
import * as m192 from "./192-multi-type-cards.js";
import * as m193 from "./193-card-type-junction-triggers.js";
import * as m194 from "./194-copy-metadata.js";
import * as m195 from "./195-card-loans.js";
import * as m196 from "./196-admin-grants.js";
import * as m197 from "./197-drop-printing-event-changes.js";
import * as m198 from "./198-products.js";
import * as m199 from "./199-helper-reviewable-providers.js";
import * as m200 from "./200-api-keys.js";
import * as m201 from "./201-admin-events.js";
import * as m202 from "./202-card-tag-classification.js";
import * as m203 from "./203-language-color.js";
import * as m204 from "./204-language-zh-to-sc.js";
import * as m205 from "./205-language-well-known.js";
import * as m206 from "./206-max-copies-override.js";
import * as m207 from "./207-swiss-regions.js";
import * as m208 from "./208-fixed-tables.js";
import * as m209 from "./209-pod-seats.js";
import * as m210 from "./210-2v2-ban-format.js";
import * as m211 from "./211-product-set.js";
import * as m212 from "./212-2v2-team-tournaments.js";
import * as m213 from "./213-scan-index.js";
import * as m214 from "./214-unicode-norm-name.js";
import * as m215 from "./215-materialize-canonical-rank.js";
import * as m216 from "./216-price-history-autovacuum.js";
import * as m217 from "./217-friend-group-discord-links.js";
import * as m218 from "./218-organize-list-rules.js";
import * as m219 from "./219-daily-printing-prices-mv.js";
import * as m220 from "./220-collection-events-immutable-refs.js";
import * as m221 from "./221-latest-prices-last-seen.js";
import * as m222 from "./222-discord-trade-channels.js";
import * as m223 from "./223-sidebar-hidden.js";
import * as m224 from "./224-deck-odds-config.js";
import * as m225 from "./225-deck-cover.js";
import * as m226 from "./226-deck-video.js";
import * as m227 from "./227-deck-home-collection.js";
import * as m228 from "./228-card-tokens.js";
import * as m229 from "./229-deck-links.js";
import * as m230 from "./230-trade-per-side-settle.js";
import * as m231 from "./231-deck-folders.js";
import * as m232 from "./232-candidate-printing-printed-year.js";
import * as m233 from "./233-set-language-releases.js";
import * as m234 from "./234-card-submissions.js";
import * as m235 from "./235-meta-archive.js";
import * as m236 from "./236-meta-candidates.js";
import * as m237 from "./237-tier-lists.js";
import * as m238 from "./238-overlay-channels.js";
import * as m239 from "./239-drop-deck-is-wanted.js";
import * as m240 from "./240-deck-variants.js";
import * as m241 from "./241-drop-tier-list-set.js";
import * as m242 from "./242-stage-presets.js";
import * as m243 from "./243-trade-email-settings.js";
import * as m244 from "./244-jsonb-unwrap-double-encoded.js";
import * as m245 from "./245-integrity-keys-and-fks.js";
import * as m246 from "./246-state-timestamp-checks.js";
import * as m247 from "./247-marketplace-vocabulary.js";
import * as m248 from "./248-trade-loan-name-snapshots.js";
import * as m249 from "./249-organization-owner-integrity.js";
import * as m250 from "./250-column-types-defaults-and-norm-name.js";
import * as m251 from "./251-query-indexes.js";
import * as m252 from "./252-trade-group-snapshots.js";
import * as m253 from "./253-schema-integrity-hardening.js";
import * as m254 from "./254-org-owner-from-roles.js";
import * as m255 from "./255-meta-multi-source.js";
import * as m256 from "./256-meta-deck-sources.js";
import * as m257 from "./257-printing-fallback-art.js";
import * as m258 from "./258-printing-citations.js";
import * as m259 from "./259-drop-group-email-invites.js";
import * as m260 from "./260-account-issuer.js";
import * as m261 from "./261-meta-standings-pyramid.js";
import * as m262 from "./262-meta-official-templates.js";
import * as m263 from "./263-uvsgames-source-tables.js";
import * as m264 from "./264-uvsgames-stores-players-checks.js";
import * as m265 from "./265-playloltcg-source-tables.js";
import * as m266 from "./266-meta-event-tier-location.js";
import * as m267 from "./267-template-tier-mapping.js";
import * as m268 from "./268-meta-event-matches.js";
import * as m269 from "./269-meta-phases-and-tiebreakers.js";
import * as m270 from "./270-playloltcg-event-key-integer.js";
import * as m271 from "./271-meta-submission-kinds.js";
import * as m272 from "./272-meta-two-tier.js";
import * as m273 from "./273-meta-two-tier-repairs.js";
import * as m274 from "./274-player-overlay-printings.js";
import * as m275 from "./275-meta-hand-entered-overlays.js";
import * as m276 from "./276-meta-champion-from-list.js";
import * as m277 from "./277-catalogue-paging-indexes.js";
import * as m278 from "./278-job-schedules.js";
import * as m279 from "./279-uvsgames-id-probes.js";
import * as noop from "./_noop.js";

export const migrations: Record<string, Migration> = {
  "001-core-schema": m001,
  // 002–058 were squashed into 001-core-schema. These no-op entries satisfy
  // Kysely's check that previously executed migrations still exist.
  "002-auth": noop,
  "003-admin": noop,
  "004-pricing": noop,
  "005-drop-staging-set-id": noop,
  "006-add-missing-timestamps": noop,
  "007-add-group-id-fks": noop,
  "008-ignored-products": noop,
  "009-collection-tracking": noop,
  "010-ignored-products-finish": noop,
  "011-staging-card-overrides": noop,
  "012-candidate-cards": noop,
  "013-printing-images": noop,
  "014-feature-flags": noop,
  "015-drop-candidate-checks": noop,
  "016-set-sort-order": noop,
  "017-drop-group-set-ids": noop,
  "018-card-sources": noop,
  "019-schema-tweaks": noop,
  "020-cascade-fks": noop,
  "021-nullable-art-variant": noop,
  "022-unify-marketplace-tables": noop,
  "023-uuidv7": noop,
  "024-surrogate-keys": noop,
  "025-printing-source-entity-id": noop,
  "026-printing-schema-updates": noop,
  "027-card-name-matching": noop,
  "028-nullable-text-fields": noop,
  "029-constraint-checks": noop,
  "030-array-element-checks": noop,
  "031-ignored-sources": noop,
  "032-ignored-printing-finish": noop,
  "033-printing-link-overrides": noop,
  "034-promo-types": noop,
  "035-source-settings": noop,
  "036-printing-source-group-key": noop,
  "037-auto-updated-at": noop,
  "038-rename-source-concepts": noop,
  "039-card-comment": noop,
  "040-buff-card-type": noop,
  "041-drop-candidate-printing-unique-index": noop,
  "042-drop-rarity-from-slug": noop,
  "043-fix-candidate-cards-unique-index": noop,
  "044-drop-group-key": noop,
  "045-keyword-styles": noop,
  "046-rename-buff-to-other": noop,
  "047-user-preferences": noop,
  "048-site-settings": noop,
  "049-marketplace-order": noop,
  "050-preferences-jsonb": noop,
  "051-fix-corrupted-preferences": noop,
  "052-flatten-activities": noop,
  "053-drop-printing-slug": noop,
  "054-card-bans": noop,
  "055-languages": noop,
  "056-deck-zones": noop,
  "057-user-feature-flags": noop,
  "058-drop-promo-type-sort-order": noop,
  "059-backfill-keywords-from-printings": m059,
  "060-fix-updated-at-trigger": m060,
  "061-rules": m061,
  "062-reference-tables": m062,
  "063-marketplace-language": m063,
  "064-card-errata-table": m064,
  "065-deck-zone-sort-order": m065,
  "066-drop-acquisition-sources": m066,
  "067-provider-favorite": m067,
  "068-domain-color": m068,
  "069-card-images": m069,
  "070-drop-collector-number": m070,
  "071-name-based-card-slugs": m071,
  "072-rename-image-files": m072,
  "073-keyword-translations": m073,
  "074-printing-events": m074,
  "075-simplify-printing-events": m075,
  "076-rename-standard-to-constructed": m076,
  "077-cardtrader-null-market": m077,
  "078-split-marketplace-products-variants": m078,
  "079-image-rotation": m079,
  "080-normalize-cardtrader-zh-cn": m080,
  "081-variant-nullable-language": m081,
  "082-set-type": m082,
  "083-rename-card-images-to-media": m083,
  "084-rarity-color": m084,
  "085-materialized-views": m085,
  "086-promo-type-description": m086,
  "087-promo-type-sort-order": m087,
  "088-printings-variant-include-language": m088,
  "089-marketplace-staging-norm-name": m089,
  "090-cardmarket-headline-market": m090,
  "091-promos-rework": m091,
  "092-deferrable-printing-constraints": m092,
  "093-deck-cards-preferred-printing": m093,
  "094-distribution-channel-hierarchy": m094,
  "095-metal-finishes-well-known": m095,
  "096-printings-ordered-view": m096,
  "097-set-released": m097,
  "098-ultimate-art-variant": m098,
  "099-marketplace-zero-low-cents": m099,
  "100-cardtrader-zero-first-headline": m100,
  "101-job-runs": m101,
  "102-marketplace-product-variants-constraint": m102,
  "103-delete-mismatched-variants": m103,
  "104-normalize-marketplace-products-per-sku": m104,
  "105-drop-variant-sku-columns": m105,
  "106-staging-nullable-language": m106,
  "107-backfill-sibling-variants": m107,
  "108-simplify-latest-prices-mv": m108,
  "109-marketplace-group-kind": m109,
  "110-marketplace-product-prices": m110,
  "111-latest-prices-mv-on-product-prices": m111,
  "112-product-norm-name": m112,
  "113-product-card-overrides": m113,
  "114-drop-snapshots-and-staging": m114,
  "115-token-super-type-well-known": m115,
  "116-rename-keyword-styles-to-keywords": m116,
  "117-deck-pinning-archiving": m117,
  "118-rarity-well-known": m118,
  "119-printing-printed-year": m119,
  "120-rules-kind": m120,
  "121-rules-version-comments": m121,
  "122-lowercase-taxonomy-slugs": m122,
  "123-drop-rules-search-index": m123,
  "124-pg-stat-statements": m124,
  "125-marketplace-group-set-id": m125,
  "126-image-files-needs-trim": m126,
  "127-drop-printing-images-provider": m127,
  "128-custom-tags": m128,
  "129-custom-region-format": m129,
  "130-custom-tag-categories": m130,
  "131-collection-is-public": m131,
  "132-unified-lists": m132,
  "133-list-kind": m133,
  "134-friend-groups": m134,
  "135-rename-list-intent": m135,
  "136-shared-collections": m136,
  "137-trade-preferences": m137,
  "138-user-share-token": m138,
  "139-backfill-missing-added-events": m139,
  "140-collection-events-preserve-on-delete": m140,
  "141-friend-group-collection-shares": m141,
  "142-list-sort-order": m142,
  "143-copy-ownership-from-collection": m143,
  "144-card-trades": m144,
  "145-pod-tournaments": m145,
  "146-touch-list-on-entry-change": m146,
  "147-pod-byes": m147,
  "148-gear-well-known": m148,
  "149-deck-check": m149,
  "150-default-group-list-shares": m150,
  "151-rename-deck-check-handle-to-riot-id": m151,
  "152-deck-check-player": m152,
  "153-deck-check-sharing-consent": m153,
  "154-user-riot-id": m154,
  "155-deck-check-entry-states": m155,
  "156-deck-check-publish-consent": m156,
  "157-deck-check-claim-token": m157,
  "158-deck-plans": m158,
  "159-deck-plan-battlefield-note": m159,
  "160-deck-matchup-opponent": m160,
  "161-trade-request-email-coalesce": m161,
  "162-contact-methods": m162,
  "163-pod-game-points": m163,
  "164-job-run-noop": m164,
  "165-trade-status-email": m165,
  "166-organizations": m166,
  "167-tournaments-umbrella": m167,
  "168-unified-participants": m168,
  "169-deck-check-as-module": m169,
  "170-deck-check-drop-legacy": m170,
  "171-tournament-cancelled-status": m171,
  "172-tournament-starts-at-required": m172,
  "173-tournament-ends-at": m173,
  "174-deck-check-entry-participant-cascade": m174,
  "175-org-judge-role": m175,
  "176-tournament-participants-drop-email": m176,
  "177-tournament-staff-invite-tokens": m177,
  "178-tournament-collapse-format": m178,
  "179-tournament-drop-deck-check-toggle": m179,
  "180-card-size": m180,
  "181-tournament-follow-token": m181,
  "182-list-rules": m182,
  "183-basic-super-type-well-known": m183,
  "184-candidate-submitter": m184,
  "185-candidate-printing-size-channels": m185,
  "186-tournament-host-detach": m186,
  "187-release-hardening-indexes": m187,
  "188-organization-owner-rebalance": m188,
  "189-friend-group-previous-slug": m189,
  "190-list-rule-combine": m190,
  "191-keyword-cost-flag": m191,
  "192-multi-type-cards": m192,
  "193-card-type-junction-triggers": m193,
  "194-copy-metadata": m194,
  "195-card-loans": m195,
  "196-admin-grants": m196,
  "197-drop-printing-event-changes": m197,
  "198-products": m198,
  "199-helper-reviewable-providers": m199,
  "200-api-keys": m200,
  "201-admin-events": m201,
  "202-card-tag-classification": m202,
  "203-language-color": m203,
  "204-language-zh-to-sc": m204,
  "205-language-well-known": m205,
  "206-max-copies-override": m206,
  "207-swiss-regions": m207,
  "208-fixed-tables": m208,
  "209-pod-seats": m209,
  "210-2v2-ban-format": m210,
  "211-product-set": m211,
  "212-2v2-team-tournaments": m212,
  "213-scan-index": m213,
  "214-unicode-norm-name": m214,
  "215-materialize-canonical-rank": m215,
  "216-price-history-autovacuum": m216,
  "217-friend-group-discord-links": m217,
  "218-organize-list-rules": m218,
  "219-daily-printing-prices-mv": m219,
  "220-collection-events-immutable-refs": m220,
  "221-latest-prices-last-seen": m221,
  "222-discord-trade-channels": m222,
  "223-sidebar-hidden": m223,
  "224-deck-odds-config": m224,
  "225-deck-cover": m225,
  "226-deck-video": m226,
  "227-deck-home-collection": m227,
  "228-card-tokens": m228,
  "229-deck-links": m229,
  "230-trade-per-side-settle": m230,
  "231-deck-folders": m231,
  "232-candidate-printing-printed-year": m232,
  "233-set-language-releases": m233,
  "234-card-submissions": m234,
  "235-meta-archive": m235,
  "236-meta-candidates": m236,
  "237-tier-lists": m237,
  "238-overlay-channels": m238,
  "239-drop-deck-is-wanted": m239,
  "240-deck-variants": m240,
  "241-drop-tier-list-set": m241,
  "242-stage-presets": m242,
  "243-trade-email-settings": m243,
  "244-jsonb-unwrap-double-encoded": m244,
  "245-integrity-keys-and-fks": m245,
  "246-state-timestamp-checks": m246,
  "247-marketplace-vocabulary": m247,
  "248-trade-loan-name-snapshots": m248,
  "249-organization-owner-integrity": m249,
  "250-column-types-defaults-and-norm-name": m250,
  "251-query-indexes": m251,
  "252-trade-group-snapshots": m252,
  "253-schema-integrity-hardening": m253,
  "254-org-owner-from-roles": m254,
  "255-meta-multi-source": m255,
  "256-meta-deck-sources": m256,
  "257-printing-fallback-art": m257,
  "258-printing-citations": m258,
  "259-drop-group-email-invites": m259,
  "260-account-issuer": m260,
  "261-meta-standings-pyramid": m261,
  "262-meta-official-templates": m262,
  "263-uvsgames-source-tables": m263,
  "264-uvsgames-stores-players-checks": m264,
  "265-playloltcg-source-tables": m265,
  "266-meta-event-tier-location": m266,
  "267-template-tier-mapping": m267,
  "268-meta-event-matches": m268,
  "269-meta-phases-and-tiebreakers": m269,
  "270-playloltcg-event-key-integer": m270,
  "271-meta-submission-kinds": m271,
  "272-meta-two-tier": m272,
  "273-meta-two-tier-repairs": m273,
  "274-player-overlay-printings": m274,
  "275-meta-hand-entered-overlays": m275,
  "276-meta-champion-from-list": m276,
  "277-catalogue-paging-indexes": m277,
  "278-job-schedules": m278,
  "279-uvsgames-id-probes": m279,
};
