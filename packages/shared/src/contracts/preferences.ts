import { oc } from "@orpc/contract";

import { userPreferencesResponseSchema } from "../response-schemas.js";
import { updatePreferencesSchema } from "../schemas.js";

/**
 * oRPC contract for the authenticated user-preferences endpoints.
 *
 * `GET /api/v1/preferences` — the caller's stored preferences.
 * `PATCH /api/v1/preferences` — partial update (all fields optional; `null`
 * resets a key to its default). Both require a session; the auth gate is the
 * shared Hono `requireAuth` middleware applied at mount, so a 401 is the
 * uniform app envelope. Input-validation failures are oRPC-native 400s.
 */
export const preferencesContract = {
  get: oc
    .route({ method: "GET", path: "/api/v1/preferences", tags: ["Preferences"] })
    .output(userPreferencesResponseSchema),
  update: oc
    .route({ method: "PATCH", path: "/api/v1/preferences", tags: ["Preferences"] })
    .input(updatePreferencesSchema)
    .output(userPreferencesResponseSchema),
};

export type PreferencesContract = typeof preferencesContract;
