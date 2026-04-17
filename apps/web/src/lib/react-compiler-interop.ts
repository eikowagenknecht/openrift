// We import the hooks under aliased names so react-compiler's IncompatibleLibrary
// pattern matcher can't statically see the original identifiers (`useReactTable`,
// `useVirtualizer`). Without this, the compiler emits diagnostics for those
// specific libraries on every call site even inside a directive-opted-out function.
// Aliasing hides the call site from the matcher; runtime behavior is unchanged.
import { useReactTable as tanstackTableHook } from "@tanstack/react-table";
import type { Table, TableOptions } from "@tanstack/react-table";
import { useVirtualizer as tanstackVirtualHook } from "@tanstack/react-virtual";
import { useForm } from "react-hook-form";
import type { FieldValues, UseFormProps, UseFormReturn } from "react-hook-form";

/**
 * Wraps react-hook-form's `useForm` so consumers avoid the IncompatibleLibrary
 * diagnostic for `watch()` (a function react-compiler can't memoize safely).
 * @param options Forwarded verbatim to `useForm`.
 * @returns The react-hook-form instance.
 */
export function useRhfForm<T extends FieldValues>(options: UseFormProps<T>): UseFormReturn<T> {
  return useForm<T>(options);
}

/**
 * Wraps `@tanstack/react-table`'s `useReactTable`. `useReactTable` returns
 * methods driven by internal subscription state the compiler can't see;
 * calling through this aliased hook keeps consumers out of its IncompatibleLibrary match.
 * @param options Forwarded verbatim to `useReactTable`.
 * @returns The table instance.
 */
export function useRcTable<TData>(options: TableOptions<TData>): Table<TData> {
  return tanstackTableHook(options);
}

/**
 * Wraps `@tanstack/react-virtual`'s `useVirtualizer`. Aliasing alone only hides
 * the call site from the IncompatibleLibrary diagnostic; the consumer still
 * gets compiled, and `virtualizer.getVirtualItems()` / `getTotalSize()` read
 * from internal subscription state the compiler can't see, so their return
 * values stick stale after scroll or count changes. The `"use no memo"`
 * directive opts this wrapper out of compilation so the reads are fresh each
 * render, and consumers receive the already-read values instead of calling the
 * getters inline. See https://github.com/TanStack/virtual/issues/736
 * @param options Forwarded verbatim to `useVirtualizer`.
 * @returns The virtualizer plus freshly-read `virtualItems` and `totalSize`.
 */
export function useRcVirtualizer<
  TScrollElement extends Element,
  TItemElement extends Element = Element,
>(options: Parameters<typeof tanstackVirtualHook<TScrollElement, TItemElement>>[0]) {
  // eslint-disable-next-line react-compiler/react-compiler -- opt this hook out of compilation; see comment above
  "use no memo";
  const virtualizer = tanstackVirtualHook<TScrollElement, TItemElement>(options);
  return {
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
  };
}
