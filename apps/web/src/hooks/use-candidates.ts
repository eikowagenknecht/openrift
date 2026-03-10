import type { CandidateCard, CandidateStatus, CandidateUploadResult } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

export function useCandidates(tab: "new" | "updates", status: CandidateStatus = "pending") {
  return useQuery<CandidateCard[]>({
    queryKey: queryKeys.admin.candidates.byFilter(tab, status),
    queryFn: async () => {
      const res = await fetch(`/api/admin/candidates?tab=${tab}&status=${status}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch candidates");
      }
      return res.json();
    },
  });
}

export function useUploadCandidates() {
  return useMutationWithInvalidation<
    CandidateUploadResult,
    { source: string; candidates: unknown[] }
  >({
    mutationFn: async (payload) => {
      const res = await fetch("/api/admin/candidates/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Upload failed (${res.status})`);
      }
      return res.json();
    },
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useAcceptCandidate() {
  return useMutationWithInvalidation<{ ok: boolean }, { id: string; acceptedFields?: string[] }>({
    mutationFn: async ({ id, acceptedFields }) => {
      const res = await fetch(`/api/admin/candidates/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptedFields }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Accept failed (${res.status})`);
      }
      return res.json();
    },
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useRejectCandidate() {
  return useMutationWithInvalidation<{ ok: boolean }, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/admin/candidates/${id}/reject`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Reject failed (${res.status})`);
      }
      return res.json();
    },
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useBatchAcceptCandidates() {
  return useMutationWithInvalidation<
    { results: { id: string; ok: boolean; error?: string }[] },
    string[]
  >({
    mutationFn: async (ids) => {
      const res = await fetch("/api/admin/candidates/batch-accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Batch accept failed (${res.status})`);
      }
      return res.json();
    },
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useEditCandidate() {
  return useMutationWithInvalidation<
    { ok: boolean },
    { id: string; fields: Record<string, unknown> }
  >({
    mutationFn: async ({ id, fields }) => {
      const res = await fetch(`/api/admin/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Edit failed (${res.status})`);
      }
      return res.json();
    },
    invalidates: [queryKeys.admin.candidates.all],
  });
}

export function useCreateAlias() {
  return useMutationWithInvalidation<{ ok: boolean }, { candidateId: string; cardId: string }>({
    mutationFn: async ({ candidateId, cardId }) => {
      const res = await fetch(`/api/admin/candidates/${candidateId}/alias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cardId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Alias creation failed (${res.status})`);
      }
      return res.json();
    },
    invalidates: [queryKeys.admin.candidates.all],
  });
}
