import type { Printing } from "@openrift/shared/types/catalog";
import type { ReactNode } from "react";
import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { groupPrintingsByLanguage } from "@/features/cards/lib/printing-languages";
import { useLanguageLabels } from "@/hooks/use-enums";

/**
 * Shared by the card detail's variant list and the scanner's disambiguation
 * dialog. Layout is left to the caller: the `< 2` languages case renders the
 * header and list bare, with no wrapper of its own.
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
  languageOrder?: string[];
  activeLanguage?: string;
  onLanguageChange?: (code: string) => void;
  defaultLanguage?: string;
  header?: ReactNode;
  className?: string;
  contentClassName?: string;
  children: (printings: Printing[]) => ReactNode;
}) {
  const languageLabels = useLanguageLabels();
  // Tracks the open tab for an uncontrolled caller; keying the shell resets it.
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
      <div className="flex items-center gap-3">
        {header}
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
      {/* Only the open panel is rendered: mounting one per language would leave
          the closed ones in the accessibility tree. */}
      <TabsContent value={openLanguage} className={contentClassName}>
        {children(openPrintings)}
      </TabsContent>
    </Tabs>
  );
}
