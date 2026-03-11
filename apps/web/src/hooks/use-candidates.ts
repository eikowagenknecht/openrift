import type { CandidateCard, CandidateStatus, CandidateUploadResult } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useCandidates(tab: "new" | "updates", status: CandidateStatus = "pending") {
  return useQuery<CandidateCard[]>({
    queryKey: queryKeys.admin.candidates.byFilter(tab, status),
    queryFn: () => api.get(`/api/admin/candidates?tab=${tab}&status=${status}`),
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation<
    CandidateUploadResult,
    { source: string; candidates: unknown[] }
  >({
    mutationFn: (payload) => api.post("/api/admin/candidates/upload", payload),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useAcceptCandidate() {
  return useMutationWithInvalidation<{ ok: boolean }, { id: string; acceptedFields?: string[] }>({
    mutationFn: ({ id, acceptedFields }) =>
      api.post(`/api/admin/candidates/${id}/accept`, { acceptedFields }),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useRejectCandidate() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: (id) => api.post(`/api/admin/candidates/${id}/reject`),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useBatchAcceptCandidates() {
  return useMutationWithInvalidation<
    { results: { id: string; ok: boolean; error?: string }[] },
    string[]
  >({
    mutationFn: (ids) => api.post("/api/admin/candidates/batch-accept", { ids }),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useEditCandidate() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { id: string; fields: Record<string, unknown> }
  >({
    mutationFn: ({ id, fields }) => api.patch(`/api/admin/candidates/${id}`, fields),
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCreateAlias() {
  return useMutationWithInvalidation<{ ok: boolean }, { candidateId: string; cardId: string }>({
    mutationFn: ({ candidateId, cardId }) =>
      api.post(`/api/admin/candidates/${candidateId}/alias`, { cardId }),
    invalidates: [queryKeys.admin.candidates.all],
  });
}
