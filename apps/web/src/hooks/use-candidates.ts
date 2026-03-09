import type { CandidateCard, CandidateStatus, CandidateUploadResult } from "@openrift/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useCandidates(tab: "new" | "updates", status: CandidateStatus = "pending") {
  return useQuery<CandidateCard[]>({
    queryKey: ["admin", "candidates", tab, status],
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
  const queryClient = useQueryClient();
  return useMutation<CandidateUploadResult, Error, { source: string; candidates: unknown[] }>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
    },
  });
}

export function useAcceptCandidate() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: string; acceptedFields?: string[] }>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
    },
  });
}

export function useRejectCandidate() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
    },
  });
}

export function useBatchAcceptCandidates() {
  const queryClient = useQueryClient();
  return useMutation<{ results: { id: string; ok: boolean; error?: string }[] }, Error, string[]>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
    },
  });
}

export function useEditCandidate() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: string; fields: Record<string, unknown> }>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
    },
  });
}

export function useCreateAlias() {
  const queryClient = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { candidateId: string; cardId: string }>({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "candidates"] });
    },
  });
}
