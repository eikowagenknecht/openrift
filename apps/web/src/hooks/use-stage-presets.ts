import type {
  CreateStagePreset,
  StagePreset,
  StagePresetListResponse,
  UpdateStagePreset,
} from "@openrift/shared";
import { stagePresetsContract } from "@openrift/shared/contracts/stage-presets";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import { useUserId } from "@/lib/auth-session";
import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const fetchStagePresetsFn = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(({ context }): Promise<StagePresetListResponse> =>
    apiOrpcClient(stagePresetsContract, context.cookie).list(),
  );

/**
 * The signed-in creator's saved stage dressing.
 * @returns Query options for the preset list.
 */
export function stagePresetsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.stagePresets.all(userId),
    queryFn: () => fetchStagePresetsFn(),
    select: (data: StagePresetListResponse) => data.items,
  });
}

/**
 * Reads the creator's presets, and stays disabled while signed out.
 *
 * Not a suspense query: the surfaces that offer presets (the stage's settings
 * popover, the Stage's OBS output) are already up when the list arrives, and a
 * signed-out visitor has no list to wait for at all.
 *
 * @returns The preset-list query. `data` is undefined while signed out.
 */
export function useStagePresets() {
  const userId = useUserId();
  return useQuery({
    ...stagePresetsQueryOptions(userId ?? ""),
    enabled: userId !== null,
  });
}

const createStagePresetFn = createServerFn({ method: "POST" })
  .validator((input: CreateStagePreset) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<StagePreset> =>
    apiOrpcClient(stagePresetsContract, context.cookie).create(data),
  );

/**
 * Saves the current dressing as a new preset. A duplicate name (and the
 * twenty-preset cap) comes back as a 409 the global mutation toast reports —
 * no `onError` here, which would replace that default.
 *
 * @returns The create mutation.
 */
export function useCreateStagePreset() {
  const userId = useUserId() ?? "";
  return useMutationWithInvalidation<StagePreset, CreateStagePreset>({
    mutationFn: (body) => createStagePresetFn({ data: body }),
    invalidates: [queryKeys.stagePresets.all(userId)],
  });
}

type UpdateStagePresetBody = UpdateStagePreset & { id: string };

const updateStagePresetFn = createServerFn({ method: "POST" })
  .validator((input: UpdateStagePresetBody) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<StagePreset> =>
    apiOrpcClient(stagePresetsContract, context.cookie).update(data),
  );

/** @returns The mutation that renames a preset or rewrites its config. */
export function useUpdateStagePreset() {
  const userId = useUserId() ?? "";
  return useMutationWithInvalidation<StagePreset, UpdateStagePresetBody>({
    mutationFn: (body) => updateStagePresetFn({ data: body }),
    invalidates: [queryKeys.stagePresets.all(userId)],
  });
}

const deleteStagePresetFn = createServerFn({ method: "POST" })
  .validator((input: string) => input)
  .middleware([withCookies])
  .handler(async ({ context, data: id }) => {
    await apiOrpcClient(stagePresetsContract, context.cookie).remove({ id });
  });

/** @returns The mutation that deletes a preset. */
export function useDeleteStagePreset() {
  const userId = useUserId() ?? "";
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (id) => deleteStagePresetFn({ data: id }),
    invalidates: [queryKeys.stagePresets.all(userId)],
  });
}
