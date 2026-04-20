import type { Marketplace, PackPool, PackResult, Printing, SetListEntry } from "@openrift/shared";
import {
  ALL_MARKETPLACES,
  buildPool,
  isPoolOpenable,
  mathRandom,
  openPacks,
} from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PackagePlusIcon, SparklesIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PackBulkGrid } from "@/components/pack-opener/pack-bulk-grid";
import { isBoosterEligible, toPackPrinting } from "@/components/pack-opener/pack-opener-utils";
import { PackReveal } from "@/components/pack-opener/pack-reveal";
import { PackStats } from "@/components/pack-opener/pack-stats";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePrices } from "@/hooks/use-prices";
import { publicSetDetailQueryOptions, publicSetListQueryOptions } from "@/hooks/use-public-sets";
import { useSession } from "@/lib/auth-session";
import { PAGE_PADDING } from "@/lib/utils";
import { useDisplayStore } from "@/stores/display-store";

function poolFromPrintings(printings: readonly Printing[], language: string): PackPool {
  const eligible = printings.filter((p) => isBoosterEligible(p) && p.language === language);
  return buildPool(eligible.map((p) => toPackPrinting(p)));
}

/**
 * Collect distinct languages that have a workable pool in this set. The
 * threshold is a small sanity filter — a single stray FR printing shouldn't
 * surface as "French boosters".
 * @returns Sorted language codes with at least 20 booster-eligible printings.
 */
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
  const mainSets = useMemo(
    () => setList.sets.filter((set) => set.setType === "main"),
    [setList.sets],
  );

  const [setSlug, setSetSlug] = useState<string>(() => mainSets[0]?.slug ?? "");
  const [language, setLanguage] = useState<string>("EN");
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
      <div className={PAGE_PADDING}>
        <p className="text-muted-foreground">No sets are available to open yet.</p>
      </div>
    );
  }

  return (
    <div className={PAGE_PADDING}>
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <PackagePlusIcon className="size-6" />
          <h1 className="text-2xl font-bold">Pack opener</h1>
          <span className="bg-primary/10 text-primary rounded-sm px-1.5 py-0.5 text-[10px] leading-none font-semibold uppercase">
            Simulator
          </span>
        </div>
        <p className="text-muted-foreground mt-2 text-sm">
          Open virtual Riftbound booster packs. Pull rates match the real booster as published by
          Riot (7 Common, 3 Uncommon, 2 Rare-or-better, 1 Foil, 1 Rune). No cards are added to your
          collection, this is just for fun.
        </p>
      </header>

      <div className="bg-card mb-6 grid gap-4 rounded-xl border p-4 md:grid-cols-[1fr_1fr_1fr_auto]">
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
      </div>

      <div className="text-muted-foreground mb-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <ToggleField label="Foil shimmer" checked={shimmer} onChange={setShimmer} />
        <ToggleField label="Auto-reveal" checked={autoReveal} onChange={setAutoReveal} />
      </div>

      {packs.length === 1 && packs[0] && (
        <SinglePackResult
          pack={packs[0]}
          setSlug={setSlug}
          shimmer={shimmer}
          autoReveal={autoReveal}
        />
      )}
      {packs.length > 1 && (
        <BulkPackResult packs={packs} setSlug={setSlug} shimmer={shimmer} autoReveal={autoReveal} />
      )}
    </div>
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
    <label className="inline-flex cursor-pointer items-center gap-2">
      <Switch checked={checked} onCheckedChange={onChange} size="sm" />
      <span>{label}</span>
    </label>
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
  const languages = useMemo(() => languagesWithEnoughPrintings(data.printings), [data.printings]);
  const effectiveValue = languages.includes(value) ? value : (languages[0] ?? "EN");
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
            // [moz-appearance:textfield] hides Firefox's up/down spinners; the
            // webkit selectors do the same for Chrome/Safari/Edge. The page's
            // custom-count input is typed directly — the spinner adds noise
            // at small sizes without meaningful value.
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
  const pool = useMemo(
    () => poolFromPrintings(data.printings, language),
    [data.printings, language],
  );
  const openable = isPoolOpenable(pool);

  return (
    <div className="space-y-1">
      {/* Invisible label keeps this cell's control row aligned with the other fields */}
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
  const imagesByPrintingId = useMemo(
    () => new Map(data.printings.map((p) => [p.id, p.images] as const)),
    [data.printings],
  );
  // In auto-reveal mode stats are shown immediately; in manual mode they
  // appear once every card has been flipped.
  const [statsVisible, setStatsVisible] = useState(autoReveal);
  // Reset the stats gate whenever a new single-pack result arrives, so the
  // user starts each pack with the reveal flow again (unless auto-reveal is
  // on, in which case there's nothing to gate).
  useEffect(() => {
    setStatsVisible(autoReveal);
  }, [pack, autoReveal]);
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
  const imagesByPrintingId = useMemo(
    () => new Map(data.printings.map((p) => [p.id, p.images] as const)),
    [data.printings],
  );
  // Track which packs have been fully revealed. Stats only show once every
  // pack is flipped (auto-reveal skips the gate entirely).
  const [revealedCount, setRevealedCount] = useState(autoReveal ? packs.length : 0);
  useEffect(() => {
    setRevealedCount(autoReveal ? packs.length : 0);
  }, [packs, autoReveal]);
  const statsVisible = revealedCount >= packs.length;

  if (autoReveal) {
    return (
      <section className="space-y-6">
        <ValueStats packs={packs} />
        <PackBulkGrid packs={packs} imagesByPrintingId={imagesByPrintingId} shimmer={shimmer} />
      </section>
    );
  }

  // Click-to-reveal across many packs: render one PackReveal per pack, each
  // tracking its own flip state. Each section commits toward the stats gate
  // exactly once.
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
  const marketplace: Marketplace | null = isLoggedIn
    ? (marketplaceOrder[0] ?? ALL_MARKETPLACES[0])
    : null;
  return <PackStats packs={packs} prices={prices} marketplace={marketplace} />;
}
