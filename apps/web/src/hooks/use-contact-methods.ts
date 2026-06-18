import type {
  ContactMethod,
  ContactMethodType,
  UserContactMethodsResponse,
} from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const listContactMethodsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserContactMethodsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["contact-methods"].$get(),
        "Couldn't load contact methods",
      ),
  );

const createContactMethodFn = createServerFn({ method: "POST" })
  .validator((input: { type: ContactMethodType; value: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UserContactMethodsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["contact-methods"].$post({ json: data }),
        "Couldn't add contact method",
      ),
  );

const updateContactMethodFn = createServerFn({ method: "POST" })
  .validator((input: { id: string; type: ContactMethodType; value: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UserContactMethodsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["contact-methods"][":id"].$patch({
          param: { id: data.id },
          json: { type: data.type, value: data.value },
        }),
        "Couldn't update contact method",
      ),
  );

const deleteContactMethodFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UserContactMethodsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1["contact-methods"][":id"].$delete({
          param: { id: data.id },
        }),
        "Couldn't remove contact method",
      ),
  );

/** @returns The signed-in user's account-level contact methods (empty until loaded). */
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
