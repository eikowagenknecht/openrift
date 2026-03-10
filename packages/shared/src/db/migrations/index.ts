// Static migration barrel — required for `bun build --compile` (no filesystem at runtime).
// When adding a new migration, also add it here.

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
};
