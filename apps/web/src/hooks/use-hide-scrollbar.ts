import { useEffect } from "react";

/** Hides the browser scrollbar while the calling component is mounted. */
export function useHideScrollbar() {
  useEffect(() => {
    document.documentElement.classList.add("hide-scrollbar");
    return () => document.documentElement.classList.remove("hide-scrollbar");
  }, []);
}
