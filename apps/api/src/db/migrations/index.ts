// Static migration barrel — explicit imports so Kysely's MigrationProvider
// doesn't need filesystem scanning. When adding a new migration, also add it here.

import type { Migration } from "kysely";

import * as m001 from "./001-core-schema.js";
import * as m002 from "./002-auth.js";
import * as m003 from "./003-admin.js";
import * as m004 from "./004-pricing.js";
import * as m005 from "./005-drop-staging-set-id.js";
import * as m006 from "./006-add-missing-timestamps.js";
import * as m007 from "./007-add-group-id-fks.js";
import * as m008 from "./008-ignored-products.js";
import * as m009 from "./009-collection-tracking.js";
import * as m010 from "./010-ignored-products-finish.js";
import * as m011 from "./011-staging-card-overrides.js";
import * as m012 from "./012-candidate-cards.js";
import * as m013 from "./013-printing-images.js";
import * as m014 from "./014-feature-flags.js";
import * as m015 from "./015-drop-candidate-checks.js";
import * as m016 from "./016-set-sort-order.js";
import * as m017 from "./017-drop-group-set-ids.js";
import * as m018 from "./018-card-sources.js";
import * as m019 from "./019-schema-tweaks.js";
import * as m020 from "./020-cascade-fks.js";
import * as m021 from "./021-nullable-art-variant.js";
import * as m022 from "./022-unify-marketplace-tables.js";
import * as m023 from "./023-uuidv7.js";
import * as m024 from "./024-surrogate-keys.js";
import * as m025 from "./025-printing-source-entity-id.js";
import * as m026 from "./026-printing-schema-updates.js";
import * as m027 from "./027-card-name-matching.js";
import * as m028 from "./028-nullable-text-fields.js";
import * as m029 from "./029-constraint-checks.js";
import * as m030 from "./030-array-element-checks.js";
import * as m031 from "./031-ignored-sources.js";
import * as m032 from "./032-ignored-printing-finish.js";
import * as m033 from "./033-printing-link-overrides.js";
import * as m034 from "./034-promo-types.js";
import * as m035 from "./035-source-settings.js";
import * as m036 from "./036-printing-source-group-key.js";
import * as m037 from "./037-auto-updated-at.js";
import * as m038 from "./038-rename-source-concepts.js";
import * as m039 from "./039-card-comment.js";
import * as m040 from "./040-buff-card-type.js";
import * as m041 from "./041-drop-candidate-printing-unique-index.js";
import * as m042 from "./042-drop-rarity-from-slug.js";
import * as m043 from "./043-fix-candidate-cards-unique-index.js";
import * as m044 from "./044-drop-group-key.js";
import * as m045 from "./045-keyword-styles.js";
import * as m046 from "./046-rename-buff-to-other.js";
import * as m047 from "./047-user-preferences.js";
import * as m048 from "./048-site-settings.js";
import * as m049 from "./049-marketplace-order.js";
import * as m050 from "./050-preferences-jsonb.js";
import * as m051 from "./051-fix-corrupted-preferences.js";
import * as m052 from "./052-flatten-activities.js";
import * as m053 from "./053-drop-printing-slug.js";
import * as m054 from "./054-card-bans.js";
import * as m055 from "./055-languages.js";
import * as m056 from "./056-deck-zones.js";
import * as m057 from "./057-user-feature-flags.js";
import * as m058 from "./058-drop-promo-type-sort-order.js";
import * as m059 from "./059-backfill-keywords-from-printings.js";
import * as m060 from "./060-fix-updated-at-trigger.js";

export const migrations: Record<string, Migration> = {
  "001-core-schema": m001,
  "002-auth": m002,
  "003-admin": m003,
  "004-pricing": m004,
  "005-drop-staging-set-id": m005,
  "006-add-missing-timestamps": m006,
  "007-add-group-id-fks": m007,
  "008-ignored-products": m008,
  "009-collection-tracking": m009,
  "010-ignored-products-finish": m010,
  "011-staging-card-overrides": m011,
  "012-candidate-cards": m012,
  "013-printing-images": m013,
  "014-feature-flags": m014,
  "015-drop-candidate-checks": m015,
  "016-set-sort-order": m016,
  "017-drop-group-set-ids": m017,
  "018-card-sources": m018,
  "019-schema-tweaks": m019,
  "020-cascade-fks": m020,
  "021-nullable-art-variant": m021,
  "022-unify-marketplace-tables": m022,
  "023-uuidv7": m023,
  "024-surrogate-keys": m024,
  "025-printing-source-entity-id": m025,
  "026-printing-schema-updates": m026,
  "027-card-name-matching": m027,
  "028-nullable-text-fields": m028,
  "029-constraint-checks": m029,
  "030-array-element-checks": m030,
  "031-ignored-sources": m031,
  "032-ignored-printing-finish": m032,
  "033-printing-link-overrides": m033,
  "034-promo-types": m034,
  "035-source-settings": m035,
  "036-printing-source-group-key": m036,
  "037-auto-updated-at": m037,
  "038-rename-source-concepts": m038,
  "039-card-comment": m039,
  "040-buff-card-type": m040,
  "041-drop-candidate-printing-unique-index": m041,
  "042-drop-rarity-from-slug": m042,
  "043-fix-candidate-cards-unique-index": m043,
  "044-drop-group-key": m044,
  "045-keyword-styles": m045,
  "046-rename-buff-to-other": m046,
  "047-user-preferences": m047,
  "048-site-settings": m048,
  "049-marketplace-order": m049,
  "050-preferences-jsonb": m050,
  "051-fix-corrupted-preferences": m051,
  "052-flatten-activities": m052,
  "053-drop-printing-slug": m053,
  "054-card-bans": m054,
  "055-languages": m055,
  "056-deck-zones": m056,
  "057-user-feature-flags": m057,
  "058-drop-promo-type-sort-order": m058,
  "059-backfill-keywords-from-printings": m059,
  "060-fix-updated-at-trigger": m060,
};
