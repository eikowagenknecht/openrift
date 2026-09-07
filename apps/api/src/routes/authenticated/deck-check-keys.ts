// oxlint-disable-next-line import/no-nodejs-modules -- server-side key minting, never reaches the browser
import { createHash, randomBytes } from "node:crypto";

import { deckCheckKeysContract } from "@openrift/shared/contracts/deck-check-keys";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  DeckCheckKeyMintedResponse,
  DeckCheckKeyResponse,
  DeckCheckKeysResponse,
} from "@openrift/shared/types/api/deck-check";
import { implement } from "@orpc/server";

import type { Repos } from "../../deps.js";
import { AppError } from "../../errors.js";
import { toKey } from "../../lib/deck-check-presenters.js";
import { loadOrg, requireOrgRole } from "../../lib/org-access.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { DeckCheckHost } from "../../repositories/deck-check.js";

function mintToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `orpk_${randomBytes(24).toString("base64url")}`;
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    tokenPrefix: token.slice(0, 10),
  };
}

/**
 * 404s a missing org, 403s a non-member (both org roles inherit organizer
 * authority).
 */
async function authorizeOrgHost(
  repos: Repos,
  orgId: string,
  userId: string,
): Promise<DeckCheckHost> {
  const org = await loadOrg(repos, orgId);
  await requireOrgRole(repos, org.id, userId, "manager");
  return { hostType: "organization", hostUserId: null, hostOrgId: org.id };
}

function userHost(userId: string): DeckCheckHost {
  return { hostType: "user", hostUserId: userId, hostOrgId: null };
}

const os = implement(deckCheckKeysContract).$context<ApiContext>().use(requireAuthedUser);

/** The plaintext token is returned only once, at mint time. */
export const deckCheckKeysRouter = {
  listMine: os.listMine.handler(async ({ context }): Promise<DeckCheckKeysResponse> => {
    const repos = context.repos;
    const keys = await repos.deckCheckKeys.listKeysForHost(userHost(context.userId));
    return { items: keys.map((key) => toKey(key)) };
  }),

  mintMine: os.mintMine.handler(async ({ input, context }): Promise<DeckCheckKeyMintedResponse> => {
    const repos = context.repos;
    const { token, tokenHash, tokenPrefix } = mintToken();
    const key = await repos.deckCheckKeys.createKeyForHost({
      host: userHost(context.userId),
      tokenHash,
      tokenPrefix,
      label: input.label,
      createdBy: context.userId,
    });
    return { key: toKey(key), token };
  }),

  renameMine: os.renameMine.handler(async ({ input, context }): Promise<DeckCheckKeyResponse> => {
    const repos = context.repos;
    const key = await repos.deckCheckKeys.updateKeyLabelForHost(
      userHost(context.userId),
      input.keyId,
      input.label,
    );
    if (!key) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
    return toKey(key);
  }),

  revokeMine: os.revokeMine.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const revoked = await repos.deckCheckKeys.revokeKeyForHost(
      userHost(context.userId),
      input.keyId,
    );
    if (!revoked) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
  }),

  removeMine: os.removeMine.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const removed = await repos.deckCheckKeys.deleteRevokedKeyForHost(
      userHost(context.userId),
      input.keyId,
    );
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
  }),

  listForOrg: os.listForOrg.handler(async ({ input, context }): Promise<DeckCheckKeysResponse> => {
    const repos = context.repos;
    const host = await authorizeOrgHost(repos, input.orgId, context.userId);
    const keys = await repos.deckCheckKeys.listKeysForHost(host);
    return { items: keys.map((key) => toKey(key)) };
  }),

  mintForOrg: os.mintForOrg.handler(
    async ({ input, context }): Promise<DeckCheckKeyMintedResponse> => {
      const repos = context.repos;
      const host = await authorizeOrgHost(repos, input.orgId, context.userId);
      const { token, tokenHash, tokenPrefix } = mintToken();
      const key = await repos.deckCheckKeys.createKeyForHost({
        host,
        tokenHash,
        tokenPrefix,
        label: input.label,
        createdBy: context.userId,
      });
      return { key: toKey(key), token };
    },
  ),

  renameForOrg: os.renameForOrg.handler(
    async ({ input, context }): Promise<DeckCheckKeyResponse> => {
      const repos = context.repos;
      const host = await authorizeOrgHost(repos, input.orgId, context.userId);
      const key = await repos.deckCheckKeys.updateKeyLabelForHost(host, input.keyId, input.label);
      if (!key) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
      }
      return toKey(key);
    },
  ),

  revokeForOrg: os.revokeForOrg.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const host = await authorizeOrgHost(repos, input.orgId, context.userId);
    const revoked = await repos.deckCheckKeys.revokeKeyForHost(host, input.keyId);
    if (!revoked) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
  }),

  removeForOrg: os.removeForOrg.handler(async ({ input, context }): Promise<void> => {
    const repos = context.repos;
    const host = await authorizeOrgHost(repos, input.orgId, context.userId);
    const removed = await repos.deckCheckKeys.deleteRevokedKeyForHost(host, input.keyId);
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Key not found");
    }
  }),
};
