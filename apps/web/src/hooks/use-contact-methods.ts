import type {
  ContactMethod,
  ContactMethodType,
  UserContactMethodsResponse,
} from "@openrift/shared";
import { contactMethodsContract } from "@openrift/shared/contracts/contact-methods";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const listContactMethodsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<UserContactMethodsResponse> =>
    apiOrpcClient(contactMethodsContract, context.cookie).list(),
  );

const createContactMethodFn = createServerFn({ method: "POST" })
  .validator((input: { type: ContactMethodType; value: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<UserContactMethodsResponse> =>
    apiOrpcClient(contactMethodsContract, context.cookie).create(data),
  );

const updateContactMethodFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; type: ContactMethodType; value: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<UserContactMethodsResponse> =>
    apiOrpcClient(contactMethodsContract, context.cookie).update(data),
  );

const deleteContactMethodFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<UserContactMethodsResponse> =>
    apiOrpcClient(contactMethodsContract, context.cookie).remove(data),
  );

export function useContactMethods(): { contactMethods: ContactMethod[]; isLoading: boolean } {
  const userId = useUserId();
  const hydrated = useHydrated();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.contactMethods.all(userId ?? ""),
    queryFn: () => listContactMethodsFn(),
    enabled: Boolean(userId) && hydrated,
  });
  return {
    contactMethods: data?.items ?? [],
    isLoading: Boolean(userId) && hydrated && isPending,
  };
}

export function useCreateContactMethod() {
  const userId = useUserId();
  return useMutationWithInvalidation<
    UserContactMethodsResponse,
    { type: ContactMethodType; value: string }
  >({
    mutationFn: (data) => createContactMethodFn({ data }),
    invalidates: () => [queryKeys.contactMethods.all(userId ?? "")],
  });
}

export function useUpdateContactMethod() {
  const userId = useUserId();
  return useMutationWithInvalidation<
    UserContactMethodsResponse,
    { id: string; type: ContactMethodType; value: string }
  >({
    mutationFn: (data) => updateContactMethodFn({ data }),
    invalidates: () => [queryKeys.contactMethods.all(userId ?? "")],
  });
}

export function useDeleteContactMethod() {
  const userId = useUserId();
  return useMutationWithInvalidation<UserContactMethodsResponse, { id: string }>({
    mutationFn: (data) => deleteContactMethodFn({ data }),
    invalidates: () => [queryKeys.contactMethods.all(userId ?? "")],
  });
}
