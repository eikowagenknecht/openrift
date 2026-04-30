// Static migration barrel — explicit imports so Kysely's MigrationProvider
// doesn't need filesystem scanning. When adding a new migration, also add it here.

import type { Migration } from "kysely";

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
};
