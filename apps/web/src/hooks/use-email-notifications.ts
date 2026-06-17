import type { EmailNotificationChannel, UserPreferencesResponse } from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";
import type { EmailNotificationGates } from "@/lib/email-notification-prefs";
import {
  buildEmailNotificationPatch,
  resolveEmailNotificationGates,
} from "@/lib/email-notification-prefs";
import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchPreferencesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UserPreferencesResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.v1.preferences.$get(),
        "Couldn't load preferences",
      ),
  );

const patchEmailNotificationsFn = createServerFn({ method: "POST" })
  .validator(
    (input: { emailNotifications: UserPreferencesResponse["emailNotifications"] }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.preferences.$patch({
        json: { emailNotifications: data.emailNotifications },
      }),
      "Couldn't save email notification settings",
    );
  });

export interface UseEmailNotificationsResult {
  gates: EmailNotificationGates;
  isLoading: boolean;
  isSaving: boolean;
  setChannel: (channel: EmailNotificationChannel, value: boolean) => void;
}

/**
 * Reads and writes the two ADR-030 email-notification channels via the shared
 * `/preferences` endpoint (the same query the display-preferences sync uses, so
 * the cache is shared). Each toggle PATCHes the whole `emailNotifications`
 * object, preserving the sibling channel, and optimistically updates the cache.
 * @returns The resolved gate state plus a per-channel setter.
 */
export function useEmailNotifications(): UseEmailNotificationsResult {
  const userId = useUserId();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.preferences.all(userId ?? "");

  // Reads the same client-only preferences query as usePreferencesSync (which
  // owns the fetch); on this page it's usually already cached. `hydrated` keeps
  // this observer from starting the query during the SSR render (see
  // usePreferencesSync for why that matters).
  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => fetchPreferencesFn(),
    enabled: Boolean(userId) && hydrated,
  });

  const mutation = useMutation({
    mutationFn: (next: UserPreferencesResponse["emailNotifications"]) =>
      patchEmailNotificationsFn({ data: { emailNotifications: next } }),
    onSuccess: (_result, next) => {
      if (!userId) {
        return;
      }
      queryClient.setQueryData<UserPreferencesResponse>(queryKey, (previous) => ({
        ...previous,
        emailNotifications: next,
      }));
    },
  });

  const gates = resolveEmailNotificationGates(data?.emailNotifications);

  return {
    gates,
    isLoading: Boolean(userId) && isPending,
    isSaving: mutation.isPending,
    setChannel: (channel, value) => {
      // Until the saved preferences have loaded, a toggle would build its PATCH
      // from `undefined` and the server's whole-object merge would drop the
      // sibling channel. Ignore the click until we know the current value.
      if (data === undefined) {
        return;
      }
      mutation.mutate(buildEmailNotificationPatch(data.emailNotifications, channel, value));
    },
  };
}
