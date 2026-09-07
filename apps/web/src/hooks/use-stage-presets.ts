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

function stagePresetsQueryOptions(userId: string) {
  return queryOptions({
    queryKey: queryKeys.stagePresets.all(userId),
    queryFn: () => fetchStagePresetsFn(),
    select: (data: StagePresetListResponse) => data.items,
  });
}

/** Not a suspense query: surfaces offering presets are already up when the list arrives. */
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

/** No `onError` here: a duplicate name or the twenty-preset cap 409s and the global mutation toast reports it. */
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

export function useDeleteStagePreset() {
  const userId = useUserId() ?? "";
  return useMutationWithInvalidation<unknown, string>({
    mutationFn: (id) => deleteStagePresetFn({ data: id }),
    invalidates: [queryKeys.stagePresets.all(userId)],
  });
}
