import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions } from "@tanstack/react-query";

type InvalidateKeys = readonly (readonly unknown[])[];

/**
 * A thin wrapper around `useMutation` that automatically invalidates the given
 * query keys on success. Covers the most common mutation pattern in this codebase.
 *
 * `invalidates` can be either a static list of keys, or a function that derives
 * keys from the mutation variables and response — use the function form to scope
 * invalidation to the specific entity the mutation touched.
 * @returns The mutation result from `useMutation`.
 */
export function useMutationWithInvalidation<TData = unknown, TVariables = void>(
  options: Omit<UseMutationOptions<TData, Error, TVariables>, "onSuccess"> & {
    invalidates: InvalidateKeys | ((variables: TVariables, data: TData) => InvalidateKeys);
  },
) {
  const queryClient = useQueryClient();
  const { invalidates, ...rest } = options;

  return useMutation<TData, Error, TVariables>({
    ...rest,
    onSuccess: (data, variables) => {
      const keys = typeof invalidates === "function" ? invalidates(variables, data) : invalidates;
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: [...key] });
      }
    },
  });
}
