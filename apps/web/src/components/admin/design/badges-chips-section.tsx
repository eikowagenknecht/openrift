import { HeartIcon, PackageIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LanguageChip } from "@/components/language-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { CountPill, CountPillButton } from "@/components/ui/count-pill";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { useLanguageList } from "@/hooks/use-enums";

import { DemoRow, DemoSection, Swatch, SwatchRow } from "./demo-primitives";

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
  "success",
  "warning",
  "violet",
  "info",
  "muted",
  "subtle",
  "count",
] as const;

export function BadgesChipsSection() {
  const [tags, setTags] = useState(["Aggro", "Budget", "Favorite"]);
  const languages = useLanguageList();
  return (
    <DemoSection
      id="badges-chips"
      title="Badges & chips"
      note="ChipRemoveButton is the only way to put an action inside a Badge. CountPill for the h-5 count strips."
    >
      <SwatchRow label="Badge variants">
        {BADGE_VARIANTS.map((variant) => (
          <Swatch key={variant} label={variant} colors>
            <Badge variant={variant}>{variant}</Badge>
          </Swatch>
        ))}
      </SwatchRow>
      <SwatchRow
        label="DateLeaf"
        hint="Calendar-leaf date block anchoring event rows and heroes. Pass preformatted month/day parts, plus the year on a surface that spans several."
      >
        <Swatch label="sm">
          <DateLeaf month="JUL" day="13" size="sm" />
        </Swatch>
        <Swatch label="default">
          <DateLeaf month="AUG" day="8" />
        </Swatch>
        <Swatch label="with year">
          <DateLeaf month="AUG" day="8" year="2026" size="sm" />
        </Swatch>
      </SwatchRow>
      <SwatchRow
        label="CountryFlag"
        hint="Vendored flag-icons SVG plus the ISO code. The name comes from Intl.DisplayNames pinned to en and reaches assistive tech through the image alt, so the code text beside it is aria-hidden. A code the package ships no flag for falls back to the code plate alone rather than a broken image."
      >
        <Swatch label="default">
          <CountryFlag code="de" />
        </Swatch>
        <Swatch label="sm">
          <CountryFlag code="jp" size="sm" />
        </Swatch>
        <Swatch label="no code">
          <CountryFlag code="fr" showCode={false} />
        </Swatch>
        <Swatch label="no flag" colors>
          <CountryFlag code="uk" />
        </Swatch>
      </SwatchRow>
      <DemoRow
        label="Language chips (LanguageChip)"
        hint="Colored code chip for a printing's language. Colors are admin-managed in the languages taxonomy; unset languages fall back to neutral gray. Foreground is WCAG-contrast."
      >
        {languages.map((lang) => (
          <LanguageChip key={lang.code} code={lang.code} />
        ))}
      </DemoRow>
      <DemoRow label="Removable chips (ChipRemoveButton)">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <ChipRemoveButton
              aria-label={`Remove ${tag}`}
              onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
            />
          </Badge>
        ))}
        {tags.length < 3 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setTags(["Aggro", "Budget", "Favorite"])}
          >
            Reset
          </Button>
        )}
      </DemoRow>
      <SwatchRow label="CountPill" hint="All pills share the h-5 tier.">
        <Swatch label="default" colors>
          <CountPill>
            <PackageIcon className="size-3" />
            <span>4</span>
          </CountPill>
        </Swatch>
        <Swatch label="ghost" colors>
          <CountPill variant="ghost">
            <PackageIcon className="size-3" />
            <span>4</span>
          </CountPill>
        </Swatch>
        <Swatch label="primary" colors>
          <CountPill variant="primary">Requested</CountPill>
        </Swatch>
        <Swatch label="success" colors>
          <CountPill variant="success">Reserved</CountPill>
        </Swatch>
        <Swatch label="CountPillButton">
          <CountPillButton onClick={() => toast.success("Requested")}>
            <HeartIcon className="size-3" />
            <span>Request</span>
          </CountPillButton>
        </Swatch>
        <Swatch label="disabled">
          <CountPillButton disabled>
            <HeartIcon className="size-3" />
            <span>Request</span>
          </CountPillButton>
        </Swatch>
      </SwatchRow>
    </DemoSection>
  );
}
