import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>();

  React.useEffect(() => {
    const mql = globalThis.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`); // custom: globalThis per lint
    const onChange = () => {
      setIsMobile(globalThis.innerWidth < MOBILE_BREAKPOINT); // custom: globalThis per lint
    };
    mql.addEventListener("change", onChange);
    setIsMobile(globalThis.innerWidth < MOBILE_BREAKPOINT); // custom: globalThis per lint
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return Boolean(isMobile);
}
