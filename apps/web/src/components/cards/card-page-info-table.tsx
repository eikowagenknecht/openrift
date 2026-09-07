import { enumLabel } from "@openrift/shared/enum-label";
import type { CardDetailResponse } from "@openrift/shared/types/api/catalog";
import type { Printing } from "@openrift/shared/types/catalog";
import { WellKnown } from "@openrift/shared/well-known";
import { Link } from "@tanstack/react-router";
import { PaletteIcon } from "lucide-react";
import type { ReactNode } from "react";

import { InfoRow } from "@/components/cards/card-page-info-row";
import { FinishIcon } from "@/components/cards/finish-icon";
import { LanguageChip } from "@/components/language-chip";
import { useEnumOrders, useLanguageLabels } from "@/hooks/use-enums";
import { formatPublicCode } from "@/lib/format";
import { getFilterIconPath, getTypeIconPaths } from "@/lib/icons";
import { cn } from "@/lib/utils";

type InfoTableRow = [string, ReactNode];

export function CardPageInfoTable({
  card,
  printing,
  sets,
}: {
  card: CardDetailResponse["card"];
  printing: Printing;
  sets: CardDetailResponse["sets"];
}) {
  const { labels } = useEnumOrders();
  const languageLabels = useLanguageLabels();
  const setById = new Map(sets.map((s) => [s.id, s]));

  const leftRows: InfoTableRow[] = [
    [
      "Set",
      <Link
        key="set"
        to="/sets/$setSlug"
        params={{ setSlug: printing.setSlug }}
        className="hover:text-foreground underline decoration-dotted underline-offset-2"
      >
        {printing.setSlug.toUpperCase()}
        {setById.get(printing.setId) && ` (${setById.get(printing.setId)?.name})`}
      </Link>,
    ],
    ["Code", formatPublicCode(printing)],
  ];
  if (printing.printedName && printing.printedName !== card.name) {
    leftRows.push(["Printed name", printing.printedName]);
  }
  leftRows.push([
    "Language",
    <span key="language" className="inline-flex items-center gap-1.5">
      <LanguageChip code={printing.language} />
      {languageLabels[printing.language] ?? printing.language}
    </span>,
  ]);
  const rarityIcon = getFilterIconPath("rarities", printing.rarity);
  leftRows.push(
    [
      "Rarity",
      <span key="rarity" className="inline-flex items-center gap-1.5">
        <span className="inline-flex w-4 shrink-0 justify-center">
          {rarityIcon && <img src={rarityIcon} alt="" width={28} height={28} className="size-4" />}
        </span>
        {enumLabel(labels.rarities, printing.rarity)}
      </span>,
    ],
    [
      "Finish",
      <span key="finish" className="inline-flex items-center gap-1.5">
        <FinishIcon finish={printing.finish} className="w-4 shrink-0 justify-center" />
        {enumLabel(labels.finishes, printing.finish)}
      </span>,
    ],
  );
  if (printing.artVariant !== WellKnown.artVariant.NORMAL) {
    leftRows.push([
      "Art variant",
      <span key="art" className="inline-flex items-center gap-1">
        <PaletteIcon className="size-3.5" />
        {enumLabel(labels.artVariants, printing.artVariant)}
      </span>,
    ]);
  }
  if (printing.isOvernumbered) {
    leftRows.push(["Numbering", <span key="overnumbered">Overnumbered</span>]);
  }
  if (printing.artist) {
    leftRows.push([
      "Artist",
      <span key="artist" className="inline-flex items-center gap-1.5">
        <span className="inline-flex w-4 shrink-0 justify-center">
          <img src="/images/artist.svg" alt="" className="size-3.5 brightness-0 dark:invert" />
        </span>
        {printing.artist}
      </span>,
    ]);
  }
  if (printing.printedYear !== null) {
    leftRows.push(["Year", printing.printedYear]);
  }

  const rightRows: InfoTableRow[] = [
    [
      "Type",
      <TypeValue
        key="type"
        types={card.types}
        typeLabel={card.types.map((slug) => enumLabel(labels.cardTypes, slug)).join(" ")}
        superTypes={card.superTypes}
      />,
    ],
  ];
  if (card.superTypes.length > 0) {
    rightRows.push([
      "Supertypes",
      card.superTypes.map((slug) => enumLabel(labels.superTypes, slug)).join(", "),
    ]);
  }
  if (card.domains.length > 0 && !card.domains.includes(WellKnown.domain.COLORLESS)) {
    rightRows.push([
      "Domains",
      <DomainList key="domains" domains={card.domains} labels={labels.domains} />,
    ]);
  }
  if (card.energy !== null && card.energy > 0) {
    rightRows.push(["Energy", card.energy]);
  }
  if (card.power !== null && card.power > 0) {
    rightRows.push(["Power", <PowerValue key="power" power={card.power} domains={card.domains} />]);
  }
  if (card.might !== null) {
    rightRows.push(["Might", <MightValue key="might" value={card.might} />]);
  }
  if (card.mightBonus !== null && card.mightBonus > 0) {
    rightRows.push(["Might bonus", <MightValue key="mightbonus" value={card.mightBonus} bonus />]);
  }

  const infoRowCount = Math.max(leftRows.length, rightRows.length);

  return (
    <table className="w-full table-fixed text-sm">
      <tbody>
        {Array.from({ length: infoRowCount }, (_, i) => {
          const left = leftRows[i];
          const right = rightRows[i];
          return (
            // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table row, not a control
            <tr key={i}>
              <td className="text-muted-foreground w-24 py-1 pr-2 align-top text-xs font-medium">
                <div className="flex min-h-6 flex-col justify-center">{left?.[0]}</div>
              </td>
              <td className="w-[calc(50%-6rem)] py-1 pr-6 align-top">
                <div className="flex min-h-6 flex-col justify-center">{left?.[1]}</div>
              </td>
              <td className="text-muted-foreground hidden w-24 py-1 pr-2 align-top text-xs font-medium sm:table-cell">
                <div className="flex min-h-6 flex-col justify-center">{right?.[0]}</div>
              </td>
              <td className="hidden w-[calc(50%-6rem)] py-1 align-top sm:table-cell">
                <div className="flex min-h-6 flex-col justify-center">{right?.[1]}</div>
              </td>
            </tr>
          );
        })}
        {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table row, not a control */}
        <tr className="sm:hidden">
          {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table cell, not a control */}
          <td colSpan={2} className="pt-2">
            <table className="w-full text-sm">
              <tbody>
                {rightRows.map(([label, value], i) => (
                  <InfoRow key={i} label={label}>
                    {value}
                  </InfoRow>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

function TypeValue({
  types,
  typeLabel,
  superTypes,
}: {
  types: string[];
  typeLabel: string;
  superTypes: string[];
}) {
  const iconPaths = getTypeIconPaths(types, superTypes);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex w-4 shrink-0 justify-center gap-0.5">
        {iconPaths.map((path) => (
          <img key={path} src={path} alt="" className="size-4 brightness-0 dark:invert" />
        ))}
      </span>
      {typeLabel}
    </span>
  );
}

function DomainList({ domains, labels }: { domains: string[]; labels: Record<string, string> }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {domains.map((domain) => {
        const iconPath = getFilterIconPath("domains", domain);
        return (
          <span key={domain} className="inline-flex items-center gap-1">
            {iconPath && <img src={iconPath} alt="" width={64} height={64} className="size-4" />}
            {labels[domain]}
          </span>
        );
      })}
    </span>
  );
}

function MightValue({ value, bonus = false }: { value: number; bonus?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1", bonus && "font-semibold")}>
      <img src="/images/might.svg" alt="" className="size-4 brightness-0 dark:invert" />
      {bonus ? `+${value}` : value}
    </span>
  );
}

function PowerValue({ power, domains }: { power: number; domains: string[] }) {
  const primaryDomain = domains[0] ?? WellKnown.domain.COLORLESS;
  const iconPath = getFilterIconPath("domains", primaryDomain);
  if (!iconPath) {
    return <span>{power}</span>;
  }
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: power }, (_, index) => (
        <img key={index} src={iconPath} alt="" className="size-4" />
      ))}
    </span>
  );
}
