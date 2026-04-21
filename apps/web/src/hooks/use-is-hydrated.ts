import { useEffect, useState } from "react";

/**
 * Returns `false` during SSR and the first client render (to match), then
 * flips to `true` after mount. Gate sibling components that call SSR-unsafe
 * hooks (e.g. `useLiveSuspenseQuery` without a `getServerSnapshot`) on the
 * truthy value so they never run on the server or during hydration.
 *
 * @returns `true` once the component has mounted on the client.
 */
export function useIsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
