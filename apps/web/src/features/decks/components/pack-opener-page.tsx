import { buildPool } from "@openrift/shared/pack-opener/pools";
import { mathRandom } from "@openrift/shared/pack-opener/rng";
import { openPacks } from "@openrift/shared/pack-opener/sample";
import type { PackPool, PackResult } from "@openrift/shared/pack-opener/types";
import { isPoolOpenable } from "@openrift/shared/pack-opener/types";
import type { SetListEntry } from "@openrift/shared/types/api/catalog";
import type { Printing } from "@openrift/shared/types/catalog";
import type { Marketplace } from "@openrift/shared/types/pricing";
import { ALL_MARKETPLACES } from "@openrift/shared/types/pricing";
import { WellKnown } from "@openrift/shared/well-known";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PackagePlusIcon, SparklesIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { usePrices } from "@/features/cards/hooks/use-prices";
import {
  publicSetDetailQueryOptions,
  publicSetListQueryOptions,
} from "@/features/cards/hooks/use-public-sets";
import { PackBulkGrid } from "@/features/decks/components/pack-bulk-grid";
import { isBoosterEligible, toPackPrinting } from "@/features/decks/components/pack-opener-utils";
import { PackReveal } from "@/features/decks/components/pack-reveal";
import { PackStats } from "@/features/decks/components/pack-stats";
import { useSession } from "@/lib/auth-session";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

function poolFromPrintings(printings: readonly Printing[], language: string): PackPool {
  const eligible = printings.filter((p) => isBoosterEligible(p) && p.language === language);
  return buildPool(eligible.map((p) => toPackPrinting(p)));
}

/** Sorted language codes with at least 20 booster-eligible printings, so a single stray printing doesn't surface as its own language. */
function languagesWithEnoughPrintings(printings: readonly Printing[]): string[] {
  const counts = new Map<string, number>();
  for (const p of printings) {
    if (!isBoosterEligible(p)) {
      continue;
    }
    counts.set(p.language, (counts.get(p.language) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 20)
    .map(([code]) => code)
    .toSorted();
}

export function PackOpenerPage() {
  const { data: setList } = useSuspenseQuery(publicSetListQueryOptions);
  const mainSets = setList.sets.filter((set) => set.setType === WellKnown.setType.MAIN);

  const [setSlug, setSetSlug] = useState<string>(() => mainSets[0]?.slug ?? "");
  const [language, setLanguage] = useState<string>(WellKnown.language.EN);
  const [countChoice, setCountChoice] = useState<string>("1");
  const [customCount, setCustomCount] = useState<number>(5);
  const [packs, setPacks] = useState<PackResult[]>([]);
  const [shimmer, setShimmer] = useState(true);
  const [autoReveal, setAutoReveal] = useState(false);

  const count =
    countChoice === "custom"
      ? Math.min(500, Math.max(1, Math.floor(customCount || 1)))
      : Number(countChoice);

  if (mainSets.length === 0) {
    return (
      <>
        <PackOpenerTopBar />
        <div className={cn(PAGE_PADDING_NO_TOP, "pt-3")}>
          <EmptyState
            className="py-12"
            icon={PackagePlusIcon}
            title="No sets are available to open yet"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PackOpenerTopBar>
        <ToggleField label="Foil shimmer" checked={shimmer} onChange={setShimmer} />
        <ToggleField label="Auto-reveal" checked={autoReveal} onChange={setAutoReveal} />
      </PackOpenerTopBar>
      <div className={cn(PAGE_PADDING_NO_TOP, "pt-3")}>
        <PageDescription className="mb-6">
          Pull rates match the real booster. No cards are added to your collection.
        </PageDescription>

        <Card className="mb-6 grid gap-4 p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
          <SetPickerField
            sets={mainSets}
            value={setSlug}
            onChange={(slug) => {
              setSetSlug(slug);
              setPacks([]);
            }}
          />
          <LanguageField
            setSlug={setSlug}
            value={language}
            onChange={(value) => {
              setLanguage(value);
              setPacks([]);
            }}
          />
          <CountField
            choice={countChoice}
            custom={customCount}
            onChoiceChange={setCountChoice}
            onCustomChange={setCustomCount}
          />
          <OpenAction setSlug={setSlug} language={language} count={count} onOpened={setPacks} />
        </Card>

        {packs.length === 1 && packs[0] && (
          <SinglePackResult
            pack={packs[0]}
            setSlug={setSlug}
            shimmer={shimmer}
            autoReveal={autoReveal}
          />
        )}
        {packs.length > 1 && (
          <BulkPackResult
            packs={packs}
            setSlug={setSlug}
            shimmer={shimmer}
            autoReveal={autoReveal}
          />
        )}
      </div>
    </>
  );
}

function PackOpenerTopBar({ children }: { children?: ReactNode }) {
  return (
    <PageTopBarSticky width="full">
      <PageTopBar>
        <PackagePlusIcon className="mr-2 size-5 shrink-0" />
        <PageTopBarTitle>
          Pack opener<span className="max-sm:hidden"> simulator</span>
        </PageTopBarTitle>
        {children ? <PageTopBarActions>{children}</PageTopBarActions> : null}
      </PageTopBar>
    </PageTopBarSticky>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Toggle
      variant="outline"
      pressed={checked}
      onPressedChange={onChange}
      className="aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground"
    >
      {label}
    </Toggle>
  );
}

function SetPickerField({
  sets,
  value,
  onChange,
}: {
  sets: SetListEntry[];
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>Set</Label>
      <Select value={value} onValueChange={(val) => val && onChange(val as string)}>
        <SelectTrigger className="w-full">
          <SelectValue>
            {(current: string) => sets.find((s) => s.slug === current)?.name ?? current}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {sets.map((s) => (
            <SelectItem key={s.slug} value={s.slug}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LanguageField({
  setSlug,
  value,
  onChange,
}: {
  setSlug: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));
  const languages = languagesWithEnoughPrintings(data.printings);
  const effectiveValue = languages.includes(value)
    ? value
    : (languages[0] ?? WellKnown.language.EN);
  return (
    <div className="space-y-1">
      <Label>Language</Label>
      <Select value={effectiveValue} onValueChange={(val) => val && onChange(val as string)}>
        <SelectTrigger className="w-full">
          <SelectValue>{(current: string) => current}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {languages.map((code) => (
            <SelectItem key={code} value={code}>
              {code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const COUNT_OPTIONS = [
  { value: "1", label: "1 pack" },
  { value: "24", label: "24 (booster display)" },
  { value: "custom", label: "Custom\u2026" },
] as const;

function CountField({
  choice,
  custom,
  onChoiceChange,
  onCustomChange,
}: {
  choice: string;
  custom: number;
  onChoiceChange: (value: string) => void;
  onCustomChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>Packs</Label>
      <div className="flex gap-2">
        <Select value={choice} onValueChange={(val) => val && onChoiceChange(val as string)}>
          <SelectTrigger className="flex-1">
            <SelectValue>
              {(current: string) =>
                COUNT_OPTIONS.find((o) => o.value === current)?.label ?? current
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COUNT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {choice === "custom" && (
          <Input
            type="number"
            min={1}
            max={500}
            value={custom}
            onChange={(e) => onCustomChange(Number(e.target.value))}
            // Hides the native up/down spinner (Firefox via -moz-appearance, others via the webkit selectors).
            className="w-20 [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Custom pack count"
          />
        )}
      </div>
    </div>
  );
}

function OpenAction({
  setSlug,
  language,
  count,
  onOpened,
}: {
  setSlug: string;
  language: string;
  count: number;
  onOpened: (packs: PackResult[]) => void;
}) {
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));
  const pool = poolFromPrintings(data.printings, language);
  const openable = isPoolOpenable(pool);

  return (
    <div className="space-y-1">
      <Label aria-hidden="true" className="invisible select-none">
        &nbsp;
      </Label>
      <Button
        size="default"
        className="w-full md:w-auto"
        disabled={!openable}
        onClick={() => onOpened(openPacks(pool, mathRandom, count))}
      >
        <SparklesIcon className="size-4" />
        {openable ? `Open ${count} pack${count === 1 ? "" : "s"}` : "No pool"}
      </Button>
    </div>
  );
}

function SinglePackResult({
  pack,
  setSlug,
  shimmer,
  autoReveal,
}: {
  pack: PackResult;
  setSlug: string;
  shimmer: boolean;
  autoReveal: boolean;
}) {
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));
  const imagesByPrintingId = new Map(data.printings.map((p) => [p.id, p.images] as const));
  const [statsVisible, setStatsVisible] = useState(autoReveal);
  // Reset during render, not an effect, so the gate is armed before this render paints.
  const [gateArmedFor, setGateArmedFor] = useState({ pack, autoReveal });
  if (gateArmedFor.pack !== pack || gateArmedFor.autoReveal !== autoReveal) {
    setGateArmedFor({ pack, autoReveal });
    setStatsVisible(autoReveal);
  }
  return (
    <section className="space-y-6">
      <PackReveal
        pack={pack}
        imagesByPrintingId={imagesByPrintingId}
        onAllRevealed={() => setStatsVisible(true)}
        autoReveal={autoReveal}
        shimmer={shimmer}
      />
      {statsVisible && <ValueStats packs={[pack]} />}
    </section>
  );
}

function BulkPackResult({
  packs,
  setSlug,
  shimmer,
  autoReveal,
}: {
  packs: PackResult[];
  setSlug: string;
  shimmer: boolean;
  autoReveal: boolean;
}) {
  const { data } = useSuspenseQuery(publicSetDetailQueryOptions(setSlug));
  const imagesByPrintingId = new Map(data.printings.map((p) => [p.id, p.images] as const));
  const [revealedCount, setRevealedCount] = useState(autoReveal ? packs.length : 0);
  // Reset during render, not an effect, so the gate is armed before this render paints.
  const [countArmedFor, setCountArmedFor] = useState({ packs, autoReveal });
  if (countArmedFor.packs !== packs || countArmedFor.autoReveal !== autoReveal) {
    setCountArmedFor({ packs, autoReveal });
    setRevealedCount(autoReveal ? packs.length : 0);
  }
  const statsVisible = revealedCount >= packs.length;

  if (autoReveal) {
    return (
      <section className="space-y-6">
        <ValueStats packs={packs} />
        <PackBulkGrid packs={packs} imagesByPrintingId={imagesByPrintingId} shimmer={shimmer} />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      {packs.map((pack, i) => (
        <div key={i}>
          <div className="mb-2 flex items-baseline justify-between border-b pb-1">
            <h3 className="font-semibold">Pack {i + 1}</h3>
            <span className="text-muted-foreground text-xs">
              {pack.pulls.length} {pack.pulls.length === 1 ? "card" : "cards"}
            </span>
          </div>
          <PackReveal
            pack={pack}
            imagesByPrintingId={imagesByPrintingId}
            shimmer={shimmer}
            onAllRevealed={() => setRevealedCount((n) => n + 1)}
          />
        </div>
      ))}
      {statsVisible && <ValueStats packs={packs} />}
    </section>
  );
}

function ValueStats({ packs }: { packs: PackResult[] }) {
  const prices = usePrices();
  const { data: session } = useSession();
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const isLoggedIn = Boolean(session?.user);
  const [preferredMarketplace] = marketplaceOrder;
  const [defaultMarketplace] = ALL_MARKETPLACES;
  const marketplace: Marketplace | null = isLoggedIn
    ? (preferredMarketplace ?? defaultMarketplace ?? null)
    : null;
  return <PackStats packs={packs} prices={prices} marketplace={marketplace} />;
}
