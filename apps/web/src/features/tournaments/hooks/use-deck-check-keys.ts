import { deckCheckKeysContract } from "@openrift/shared/contracts/deck-check-keys";
import type {
  DeckCheckKeyMintedResponse,
  DeckCheckKeysResponse,
} from "@openrift/shared/types/api/deck-check";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { deckCheckKeys } from "@/features/tournaments/lib/tournaments-query-keys";
import { useRequiredUserId } from "@/lib/auth-session";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchMyKeys = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<DeckCheckKeysResponse> =>
    apiOrpcClient(deckCheckKeysContract, context.cookie).listMine(),
  );

const mintMyKeyFn = createServerFn({ method: "POST" })
  .validator((input: { label: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckKeyMintedResponse> =>
    apiOrpcClient(deckCheckKeysContract, context.cookie).mintMine(data),
  );

const renameMyKeyFn = createServerFn({ method: "POST" })
  .validator((input: { keyId: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckKeysContract, context.cookie).renameMine(data);
  });

const revokeMyKeyFn = createServerFn({ method: "POST" })
  .validator((input: { keyId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckKeysContract, context.cookie).revokeMine(data);
  });

const removeMyKeyFn = createServerFn({ method: "POST" })
  .validator((input: { keyId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckKeysContract, context.cookie).removeMine(data);
  });

export function useMyDeckCheckKeys(enabled: boolean) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: deckCheckKeys.mine(userId),
    queryFn: () => fetchMyKeys(),
    enabled,
  });
}

export function useMintMyDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { label: string }) => mintMyKeyFn({ data: vars }),
    invalidates: () => [deckCheckKeys.mine(userId)],
  });
}

export function useRenameMyDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { keyId: string; label: string }) => renameMyKeyFn({ data: vars }),
    invalidates: () => [deckCheckKeys.mine(userId)],
  });
}

export function useRevokeMyDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { keyId: string }) => revokeMyKeyFn({ data: vars }),
    invalidates: () => [deckCheckKeys.mine(userId)],
  });
}

export function useRemoveMyDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { keyId: string }) => removeMyKeyFn({ data: vars }),
    invalidates: () => [deckCheckKeys.mine(userId)],
  });
}

const fetchOrgKeys = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(({ context, data: orgId }): Promise<DeckCheckKeysResponse> =>
    apiOrpcClient(deckCheckKeysContract, context.cookie).listForOrg({ orgId }),
  );

const mintOrgKeyFn = createServerFn({ method: "POST" })
  .validator((input: { orgId: string; label: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<DeckCheckKeyMintedResponse> =>
    apiOrpcClient(deckCheckKeysContract, context.cookie).mintForOrg(data),
  );

const renameOrgKeyFn = createServerFn({ method: "POST" })
  .validator((input: { orgId: string; keyId: string; label: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckKeysContract, context.cookie).renameForOrg(data);
  });

const revokeOrgKeyFn = createServerFn({ method: "POST" })
  .validator((input: { orgId: string; keyId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckKeysContract, context.cookie).revokeForOrg(data);
  });

const removeOrgKeyFn = createServerFn({ method: "POST" })
  .validator((input: { orgId: string; keyId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(deckCheckKeysContract, context.cookie).removeForOrg(data);
  });

export function useOrgDeckCheckKeys(orgId: string, enabled: boolean) {
  const userId = useRequiredUserId();
  return useQuery({
    queryKey: deckCheckKeys.org(userId, orgId),
    queryFn: () => fetchOrgKeys({ data: orgId }),
    enabled,
  });
}

export function useMintOrgDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { orgId: string; label: string }) => mintOrgKeyFn({ data: vars }),
    invalidates: (vars) => [deckCheckKeys.org(userId, vars.orgId)],
  });
}

export function useRenameOrgDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { orgId: string; keyId: string; label: string }) =>
      renameOrgKeyFn({ data: vars }),
    invalidates: (vars) => [deckCheckKeys.org(userId, vars.orgId)],
  });
}

export function useRevokeOrgDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { orgId: string; keyId: string }) => revokeOrgKeyFn({ data: vars }),
    invalidates: (vars) => [deckCheckKeys.org(userId, vars.orgId)],
  });
}

export function useRemoveOrgDeckCheckKey() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation({
    mutationFn: (vars: { orgId: string; keyId: string }) => removeOrgKeyFn({ data: vars }),
    invalidates: (vars) => [deckCheckKeys.org(userId, vars.orgId)],
  });
}
