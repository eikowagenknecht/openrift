import { RotateCcwIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CatalogLanguage } from "@/hooks/use-cards";
import { useDisplayStore } from "@/stores/display-store";

export function LanguagesSection({
  availableLanguages,
}: {
  availableLanguages: CatalogLanguage[];
}) {
  const languages = useDisplayStore((s) => s.languages);
  const setLanguages = useDisplayStore((s) => s.setLanguages);
  const overrides = useDisplayStore((s) => s.overrides);
  const resetPreference = useDisplayStore((s) => s.resetPreference);

  if (availableLanguages.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Languages</CardTitle>
            <CardDescription>
              Choose which printing languages to show. Cards in other languages are hidden.
            </CardDescription>
          </div>
          {overrides.languages !== null && (
            <ResetButton onClick={() => resetPreference("languages")} label="Reset languages" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {availableLanguages.map((lang) => {
            const enabled = languages.includes(lang.code);
            return (
              <div
                key={lang.code}
                className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <Switch
                    id={`pref-lang-${lang.code}`}
                    checked={enabled}
                    onCheckedChange={() => {
                      if (enabled) {
                        setLanguages(languages.filter((code) => code !== lang.code));
                      } else {
                        setLanguages([...languages, lang.code]);
                      }
                    }}
                  />
                  <Label htmlFor={`pref-lang-${lang.code}`} className="font-normal">
                    {lang.name}
                  </Label>
                  <span className="text-muted-foreground text-xs">{lang.code}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ResetButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={label}
          />
        }
      >
        <RotateCcwIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Reset to default</TooltipContent>
    </Tooltip>
  );
}
