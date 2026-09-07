import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { withParams } from "@openrift/shared/schemas";
import { z } from "zod";

import { authedRoute } from "./_base.js";
import {
  deckCheckKeyMintedResponseSchema,
  deckCheckKeyResponseSchema,
  deckCheckKeysResponseSchema,
  mintDeckCheckKeySchema,
  updateDeckCheckKeySchema,
} from "./deck-check.js";

extendZodWithOpenApi(z);

const TAG = "Deck Check";

const ME_BASE = "/api/v1/me/deck-check-keys";
const ORG_BASE = "/api/v1/organizations/{orgId}/deck-check-keys";

const keyParamSchema = z.object({ keyId: z.uuid() });
const orgParamSchema = z.object({ orgId: z.uuid() });
const orgKeyParamSchema = z.object({ orgId: z.uuid(), keyId: z.uuid() });

// Minting returns the plaintext token exactly once.
export const deckCheckKeysContract = {
  listMine: authedRoute
    .route({ method: "GET", path: ME_BASE, tags: [TAG] })
    .output(deckCheckKeysResponseSchema),
  mintMine: authedRoute
    .route({ method: "POST", path: ME_BASE, tags: [TAG], successStatus: 201 })
    .input(mintDeckCheckKeySchema)
    .output(deckCheckKeyMintedResponseSchema),
  renameMine: authedRoute
    .route({ method: "PATCH", path: `${ME_BASE}/{keyId}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Key not found" } })
    .input(withParams(keyParamSchema, updateDeckCheckKeySchema))
    .output(deckCheckKeyResponseSchema),
  revokeMine: authedRoute
    .route({ method: "DELETE", path: `${ME_BASE}/{keyId}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Key not found" } })
    .input(keyParamSchema),
  // Permanently deletes an already-revoked key row (clears it from the list).
  removeMine: authedRoute
    .route({
      method: "DELETE",
      path: `${ME_BASE}/{keyId}/permanent`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Key not found" } })
    .input(keyParamSchema),

  listForOrg: authedRoute
    .route({ method: "GET", path: ORG_BASE, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Organization not found" } })
    .input(orgParamSchema)
    .output(deckCheckKeysResponseSchema),
  mintForOrg: authedRoute
    .route({ method: "POST", path: ORG_BASE, tags: [TAG], successStatus: 201 })
    .errors({ NOT_FOUND: { message: "Organization not found" } })
    .input(withParams(orgParamSchema, mintDeckCheckKeySchema))
    .output(deckCheckKeyMintedResponseSchema),
  renameForOrg: authedRoute
    .route({ method: "PATCH", path: `${ORG_BASE}/{keyId}`, tags: [TAG] })
    .errors({ NOT_FOUND: { message: "Organization or key not found" } })
    .input(withParams(orgKeyParamSchema, updateDeckCheckKeySchema))
    .output(deckCheckKeyResponseSchema),
  revokeForOrg: authedRoute
    .route({ method: "DELETE", path: `${ORG_BASE}/{keyId}`, tags: [TAG], successStatus: 204 })
    .errors({ NOT_FOUND: { message: "Organization or key not found" } })
    .input(orgKeyParamSchema),
  removeForOrg: authedRoute
    .route({
      method: "DELETE",
      path: `${ORG_BASE}/{keyId}/permanent`,
      tags: [TAG],
      successStatus: 204,
    })
    .errors({ NOT_FOUND: { message: "Organization or key not found" } })
    .input(orgKeyParamSchema),
};

export type DeckCheckKeysContract = typeof deckCheckKeysContract;
