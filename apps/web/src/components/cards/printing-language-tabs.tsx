import type { Printing } from "@openrift/shared";
import type { ReactNode } from "react";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLanguageLabels } from "@/hooks/use-enums";
import { groupPrintingsByLanguage } from "@/lib/printing-languages";

/**
 * A printing list split into language tabs. Both printing pickers (the card
 * detail's variant list and the scanner's disambiguation dialog) grew their own
 * copy of this; the shell is the single presentation both now use, so a
 * printing list reads the same wherever it appears.
 *
 * Layout is deliberately left to the caller: the `< 2` languages case renders
 * the header and the list bare, so whatever wrapper the caller puts around the
 * shell controls spacing in both modes.
 *
 * @returns The tab strip and the open language's list, or a plain list when
 *   there is only one language.
 */
export function PrintingLanguageTabs({
  printings,
  languageOrder,
  activeLanguage,
  onLanguageChange,
  defaultLanguage,
  header,
  className,
  contentClassName,
  children,
}: {
  printings: Printing[];
  /**
   * Language codes in display order (the taxonomy's). Omit to keep the
   * printings' own order, which is what a caller handing over a pre-sorted
   * candidate list wants.
   */
  languageOrder?: string[];
  /** Controlled open tab. Falls back to the first group when it has no rows. */
  activeLanguage?: string;
  onLanguageChange?: (code: string) => void;
  /** Uncontrolled initial tab. Ignored when `activeLanguage` is set. */
  defaultLanguage?: string;
  /** Shares the tab strip's row, and leads the plain list in the one-language case. */
  header?: ReactNode;
  /** Applied to the tabs root. */
  className?: string;
  /** Applied to the open panel. */
  contentClassName?: string;
  children: (printings: Printing[]) => ReactNode;
}) {
  const languageLabels = useLanguageLabels();
  // Only one panel is mounted, so the shell has to know which language that is
  // even when the caller doesn't track it. An uncontrolled caller re-derives
  // its starting tab by keying the shell, which resets this along with it.
  const [picked, setPicked] = useState<string | null>(null);

  const groups = groupPrintingsByLanguage(printings, languageOrder);
  const languages = groups.map((group) => group.language);

  if (languages.length < 2) {
    return (
      <>
        {header}
        {children(printings)}
      </>
    );
  }

  const requested = activeLanguage ?? picked ?? defaultLanguage;
  // The requested language can be absent from the groups (a surface that hands
  // the picker a filtered set, or a stated scan language the card wasn't
  // printed in), so fall back to the first tab rather than opening none.
  const openLanguage =
    requested !== undefined && languages.includes(requested) ? requested : languages[0];
  const openPrintings = groups.find((group) => group.language === openLanguage)?.printings ?? [];

  return (
    <Tabs
      value={openLanguage}
      onValueChange={(next) => {
        setPicked(String(next));
        onLanguageChange?.(String(next));
      }}
      className={className}
    >
      {/* The heading shares the language strip's row instead of taking one of
          its own, which the bare language codes leave room for. */}
      <div className="flex items-center gap-3">
        {header}
        {/* Many languages overflow the 400px pane, so the strip scrolls on its
            own rather than widening the detail. */}
        <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1">
          <TabsList variant="line">
            {groups.map(({ language, printings: items }) => (
              <TabsTrigger
                key={language}
                value={language}
                title={languageLabels[language] ?? language}
                className="font-mono"
              >
                {language}
                <span className="text-muted-foreground">{items.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      {/* Only the open panel is rendered. Mounting one per language leaves
          the closed ones in the accessibility tree, where a screen reader
          reads every language's printings as if all were on screen.

          The group is also the sibling set: labels disambiguate against
          what's visible, which drops the language chip that would otherwise
          repeat on every row of a single-language tab. */}
      <TabsContent value={openLanguage} className={contentClassName}>
        {children(openPrintings)}
      </TabsContent>
    </Tabs>
  );
}
