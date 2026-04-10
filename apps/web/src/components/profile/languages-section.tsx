import { ArrowDownIcon, ArrowUpIcon, RotateCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDisplayStore } from "@/stores/display-store";

export function LanguagesSection({
  availableLanguages,
}: {
  availableLanguages: { code: string; name: string }[];
}) {
  const languages = useDisplayStore((s) => s.languages);
  const setLanguages = useDisplayStore((s) => s.setLanguages);
  const overrides = useDisplayStore((s) => s.overrides);
  const resetPreference = useDisplayStore((s) => s.resetPreference);

  if (availableLanguages.length === 0) {
    return null;
  }

  const enabledSet = new Set(languages);
  const availableByCode = new Map(availableLanguages.map((lang) => [lang.code, lang]));

  function toggleLanguage(code: string) {
    if (enabledSet.has(code)) {
      setLanguages(languages.filter((c) => c !== code));
    } else {
      setLanguages([...languages, code]);
    }
  }

  function moveLanguage(code: string, direction: -1 | 1) {
    const index = languages.indexOf(code);
    if (index === -1) {
      return;
    }
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= languages.length) {
      return;
    }
    const next = [...languages];
    next.splice(index, 1);
    next.splice(newIndex, 0, code);
    setLanguages(next);
  }

  // Show enabled languages first (in user order), then disabled ones
  const orderedCodes = [
    ...languages,
    ...availableLanguages.filter((lang) => !enabledSet.has(lang.code)).map((lang) => lang.code),
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Languages</CardTitle>
            <CardDescription>
              Choose and reorder printing languages. The first language is preferred when multiple
              are available.
            </CardDescription>
          </div>
          {overrides.languages !== null && (
            <ResetButton onClick={() => resetPreference("languages")} label="Reset languages" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {orderedCodes.map((code) => {
            const lang = availableByCode.get(code);
            if (!lang) {
              return null;
            }
            const enabled = enabledSet.has(code);
            const index = languages.indexOf(code);
            return (
              <div
                key={code}
                className="flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <Switch
                    id={`pref-lang-${code}`}
                    checked={enabled}
                    onCheckedChange={() => toggleLanguage(code)}
                  />
                  <Label htmlFor={`pref-lang-${code}`} className="font-normal">
                    {lang.name}
                  </Label>
                  <span className="text-muted-foreground text-xs">{code}</span>
                  {enabled && index === 0 && (
                    <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                      Preferred
                    </span>
                  )}
                </div>
                {enabled && (
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      onClick={() => moveLanguage(code, -1)}
                      aria-label={`Move ${lang.name} up`}
                    >
                      <ArrowUpIcon className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === languages.length - 1}
                      onClick={() => moveLanguage(code, 1)}
                      aria-label={`Move ${lang.name} down`}
                    >
                      <ArrowDownIcon className="size-3" />
                    </Button>
                  </div>
                )}
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
            className="text-muted-foreground hover:text-foreground relative z-10 p-1 transition-colors"
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
