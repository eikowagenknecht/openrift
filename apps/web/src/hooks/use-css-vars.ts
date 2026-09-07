import { useEffect, useState } from "react";

import { observeThemeChanges } from "@/hooks/use-element-spec";

interface PropertyReader {
  getPropertyValue: (name: string) => string;
}

export function readCssVars(
  names: readonly string[],
  style: PropertyReader,
): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
}

/** Pass a module-level constant array for `names` so the effect does not re-subscribe every render. */
export function useCssVars(names: readonly string[]): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const read = () => {
      setValues(readCssVars(names, globalThis.getComputedStyle(document.documentElement)));
    };
    read();
    return observeThemeChanges(read);
  }, [names]);

  return values;
}
