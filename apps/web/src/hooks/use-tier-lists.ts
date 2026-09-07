import type {
  PublicTierListDetailResponse,
  TierListListResponse,
  TierListResponse,
  TierListShareResponse,
} from "@openrift/shared";
import { publicTierListsContract } from "@openrift/shared/contracts/public-tier-lists";
import { tierListsContract } from "@openrift/shared/contracts/tier-lists";
import { isDefinedError, safe } from "@orpc/client";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useRequiredUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

type CreateTierListBody = ContractInput<typeof tierListsContract, "create">;
type UpdateTierListBody = ContractInput<typeof tierListsContract, "update">;

const fetchTierLists = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<TierListListResponse> =>
    apiOrpcClient(tierListsContract, context.cookie).list(),
  );

const fetchTierList = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }): Promise<TierListResponse> => {
    // 404 here is expected (deleted list, or another user's): map to NOT_FOUND, not an error.
    const { error, data } = await safe(
      apiOrpcClient(tierListsContract, context.cookie).get({ id }),
    );
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

const fetchPublicTierList = createServerFn({ method: "GET" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ data: token }): Promise<PublicTierListDetailResponse> => {
    // No cookie forwarded: share links must resolve for a logged-out viewer.
    const { error, data } = await safe(apiOrpcClient(publicTierListsContract).share({ token }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        throw new Error("NOT_FOUND");
      }
      throw error;
    }
    return data;
  });

export function tierListsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.tierLists.all(userId),
    queryFn: () => fetchTierLists(),
    select: (data: TierListListResponse) => data.items,
  });
}

export function tierListQueryOptions(userId: string, id: string) {
  return queryOptions({
    queryKey: queryKeys.tierLists.detail(userId, id),
    queryFn: (): Promise<TierListResponse> => fetchTierList({ data: id }),
  });
}

export function publicTierListQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.tierLists.publicByToken(token),
    queryFn: (): Promise<PublicTierListDetailResponse> => fetchPublicTierList({ data: token }),
  });
}

export function useTierLists() {
  return useSuspenseQuery(tierListsQueryOptions(useRequiredUserId()));
}

export function useTierList(id: string) {
  return useSuspenseQuery(tierListQueryOptions(useRequiredUserId(), id));
}

export function usePublicTierList(token: string) {
  return useSuspenseQuery(publicTierListQueryOptions(token));
}

const createTierListFn = createServerFn({ method: "POST" })
  .validator((input: CreateTierListBody) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TierListResponse> =>
    apiOrpcClient(tierListsContract, context.cookie).create(data),
  );

export function useCreateTierList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TierListResponse, CreateTierListBody>({
    mutationFn: (body) => createTierListFn({ data: body }),
    invalidates: [queryKeys.tierLists.all(userId)],
  });
}

const updateTierListFn = createServerFn({ method: "POST" })
  .validator((input: UpdateTierListBody) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<TierListResponse> =>
    apiOrpcClient(tierListsContract, context.cookie).update(data),
  );

export function useUpdateTierList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TierListResponse, UpdateTierListBody>({
    mutationFn: (body) => updateTierListFn({ data: body }),
    // Invalidates the index too: it shows the card count and preview strip.
    invalidates: (variables) => [
      queryKeys.tierLists.detail(userId, variables.id),
      queryKeys.tierLists.all(userId),
    ],
  });
}

const deleteTierListFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }) => {
    // A 404 means the list is already gone (double-click, second tab, retried request):
    // treat it as success, not a "Not found" toast.
    const { error } = await safe(apiOrpcClient(tierListsContract, context.cookie).remove({ id }));
    if (error) {
      if (isDefinedError(error) && error.code === "NOT_FOUND") {
        return;
      }
      throw error;
    }
  });

export function useDeleteTierList() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (id) => deleteTierListFn({ data: id }),
    invalidates: [queryKeys.tierLists.all(userId)],
  });
}

const setTierListShareFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; shared: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<TierListShareResponse> => {
    const client = apiOrpcClient(tierListsContract, context.cookie);
    if (!data.shared) {
      await client.unshare({ id: data.id });
      return { shareToken: null, isPublic: false };
    }
    return client.share({ id: data.id });
  });

export function useSetTierListShare() {
  const userId = useRequiredUserId();
  return useMutationWithInvalidation<TierListShareResponse, { id: string; shared: boolean }>({
    mutationFn: (body) => setTierListShareFn({ data: body }),
    invalidates: (variables) => [
      queryKeys.tierLists.detail(userId, variables.id),
      queryKeys.tierLists.all(userId),
    ],
  });
}
