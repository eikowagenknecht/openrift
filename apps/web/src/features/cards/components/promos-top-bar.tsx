import { getRouteApi, useNavigate } from "@tanstack/react-router";

import { PageTopBar, PageTopBarActions, PageTopBarTitle } from "@/components/layout/page-top-bar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const routeApi = getRouteApi("/_app/promos_/$language");

export function PromosTopBar({
  activeLanguage,
  presentLanguages,
  languageLabelMap,
}: {
  activeLanguage: string;
  presentLanguages: string[];
  languageLabelMap: Map<string, string>;
}) {
  const navigate = useNavigate();
  const currentSearch = routeApi.useSearch();
  const languageItems = presentLanguages.map((code) => ({
    value: code,
    label: languageLabelMap.get(code) ?? code,
  }));

  function handleLanguageChange(next: string | null) {
    if (!next || next === activeLanguage) {
      return;
    }
    void navigate({
      to: "/promos/$language",
      params: { language: next },
      search: currentSearch,
      hash: "",
    });
  }

  return (
    <PageTopBar>
      <PageTopBarTitle>Promos</PageTopBarTitle>
      <PageTopBarActions>
        {presentLanguages.length > 1 ? (
          <Select items={languageItems} value={activeLanguage} onValueChange={handleLanguageChange}>
            <SelectTrigger aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground text-sm">
            {languageLabelMap.get(activeLanguage) ?? activeLanguage}
          </span>
        )}
      </PageTopBarActions>
    </PageTopBar>
  );
}
