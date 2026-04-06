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
};
