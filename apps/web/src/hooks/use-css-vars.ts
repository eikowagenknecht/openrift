import { useEffect, useState } from "react";

import { observeThemeChanges } from "@/hooks/use-element-spec";

/** The subset of CSSStyleDeclaration the reader needs (injectable for tests). */
interface PropertyReader {
  getPropertyValue: (name: string) => string;
}

/**
 * Resolves each custom property name against the given style declaration.
 *
 * @returns A record mapping each requested property to its trimmed value.
 */
export function readCssVars(
  names: readonly string[],
  style: PropertyReader,
): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name).trim()]));
}

/**
 * Resolves CSS custom properties from the root element and re-reads them on
 * theme/palette flips. Pass a module-level constant array so the effect does
 * not re-subscribe every render. Values are empty until the client reads.
 *
 * @returns A record mapping each requested property to its computed value.
 */
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
