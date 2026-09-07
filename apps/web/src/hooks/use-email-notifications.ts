import type {
  EmailNotificationChannel,
  TradeRequestEmailCadence,
  UserPreferencesResponse,
} from "@openrift/shared";
import { preferencesContract } from "@openrift/shared/contracts/preferences";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useHydrated } from "@/hooks/use-hydrated";
import { useUserId } from "@/lib/auth-session";
import type { EmailNotificationGates } from "@/lib/email-notification-prefs";
import {
  buildEmailNotificationPatch,
  buildTradeRequestCadencePatch,
  resolveEmailNotificationGates,
} from "@/lib/email-notification-prefs";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchPreferencesFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<UserPreferencesResponse> =>
    apiOrpcClient(preferencesContract, context.cookie).get(),
  );

const patchEmailNotificationsFn = createServerFn({ method: "POST" })
  .validator(
    (input: { emailNotifications: UserPreferencesResponse["emailNotifications"] }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(preferencesContract, context.cookie).update({
      emailNotifications: data.emailNotifications,
    });
  });

export interface UseEmailNotificationsResult {
  gates: EmailNotificationGates;
  isLoading: boolean;
  isSaving: boolean;
  setChannel: (channel: EmailNotificationChannel, value: boolean) => void;
  setCadence: (cadence: TradeRequestEmailCadence) => void;
}

/**
 * Shares the `/preferences` query cache with the display-preferences sync.
 * Each toggle PATCHes the whole `emailNotifications` object to preserve the sibling channel.
 */
export function useEmailNotifications(): UseEmailNotificationsResult {
  const userId = useUserId();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.preferences.all(userId ?? "");

  // `hydrated` keeps this observer from starting the query during SSR;
  // usePreferencesSync owns the actual fetch.
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
    // Must gate on `hydrated`, not just `isPending`: `userId` flips between SSR and
    // the first client render, which would otherwise trigger a React #418 mismatch.
    isLoading: hydrated && Boolean(userId) && isPending,
    isSaving: mutation.isPending,
    setChannel: (channel, value) => {
      // Ignore the click until the saved value is known, or the PATCH would
      // build from `undefined` and drop the sibling channel.
      if (data === undefined) {
        return;
      }
      mutation.mutate(buildEmailNotificationPatch(data.emailNotifications, channel, value));
    },
    setCadence: (cadence) => {
      // Same guard as setChannel: wait for the saved object before merging so we
      // don't drop the sibling toggles.
      if (data === undefined) {
        return;
      }
      mutation.mutate(buildTradeRequestCadencePatch(data.emailNotifications, cadence));
    },
  };
}
