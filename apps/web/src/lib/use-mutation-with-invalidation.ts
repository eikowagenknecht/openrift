import { type UseMutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * A thin wrapper around `useMutation` that automatically invalidates the given
 * query keys on success. Covers the most common mutation pattern in this codebase.
 */
export function useMutationWithInvalidation<TData = unknown, TVariables = void>(
  options: Omit<UseMutationOptions<TData, Error, TVariables>, "onSuccess"> & {
    invalidates: readonly (readonly unknown[])[];
  },
) {
  const queryClient = useQueryClient();
  const { invalidates, ...rest } = options;

  return useMutation<TData, Error, TVariables>({
    ...rest,
    onSuccess: () => {
      for (const key of invalidates) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    },
  });
}
