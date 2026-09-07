import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
  CardTradeRole,
} from "@openrift/shared/types/api/card-trade";
import { ALL_SEARCH_FIELDS } from "@openrift/shared/types/search";
import type { SearchField } from "@openrift/shared/types/search";
import { Link } from "@tanstack/react-router";
import {
  CopyIcon,
  EllipsisVerticalIcon,
  LayersIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { AdminFilterSelect, AdminFilterSwitch } from "@/components/admin/admin-filters";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { CardStrip, StripActionButton, StripIconButton } from "@/components/cards/card-strip";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { SearchInput } from "@/components/filters/search-input";
import { SearchPrefixChip, SearchScopeChip } from "@/components/filters/search-scope-menu";
import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarIconButton,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { TopBarBreadcrumbTrail } from "@/components/layout/top-bar-breadcrumb";
import { OnLoanChip } from "@/components/loans/on-loan-chip";
import { SharedTradeStatusChip, TradeStatusChip } from "@/components/trades/trade-status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CountPill } from "@/components/ui/count-pill";
import { UserAvatar } from "@/components/user-avatar";

import { Demo, DemoGrid, DemoSection, Swatch } from "./demo-primitives";

const REGION_OPTIONS = [
  { value: "piltover", label: "Piltover" },
  { value: "zaun", label: "Zaun" },
  { value: "ionia", label: "Ionia" },
  { value: "noxus", label: "Noxus" },
  { value: "demacia", label: "Demacia" },
];

const LIVE_TRADE_PHASES: CardTradeLivePhase[] = ["asked", "offered", "reserved"];

function demoTradeAnnotation(
  role: CardTradeRole,
  phase: CardTradeLivePhase,
): CardTradeLiveAnnotation {
  return { printingId: "printing-1", role, phase, tradeCount: 1, quantity: 2 };
}

function TradeChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-2xs font-mono">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/** Mirrors the search-scope store's toggle, which refuses to leave the scope empty. */
function toggleDemoScope(scope: SearchField[], field: SearchField): SearchField[] {
  if (!scope.includes(field)) {
    return [...scope, field];
  }
  const next = scope.filter((entry) => entry !== field);
  return next.length > 0 ? next : scope;
}

export function CompositesSection() {
  const [plainSearch, setPlainSearch] = useState("");
  const [scopedSearch, setScopedSearch] = useState("teemo");
  const [prefixedSearch, setPrefixedSearch] = useState("n:teemo");
  const [demoScope, setDemoScope] = useState<SearchField[]>(["name", "keywords"]);
  const [demoScopeOpen, setDemoScopeOpen] = useState(false);
  const demoSearchRef = useRef<HTMLInputElement>(null);
  const [regions, setRegions] = useState<string[]>(["piltover"]);
  const [excludedRegions, setExcludedRegions] = useState<string[]>(["zaun"]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ownedCount, setOwnedCount] = useState(2);
  const [demoTriage, setDemoTriage] = useState("any");
  const [demoStatus, setDemoStatus] = useState("any");
  const [demoDecklists, setDemoDecklists] = useState(true);
  const [demoMissing, setDemoMissing] = useState(false);
  return (
    <DemoSection
      id="composites"
      title="Composites"
      note="Reusable mid-level pieces built from the primitives above. CompactFilterBar and ActiveFilters are URL-wired, so review those live on /cards; their atoms (ghost Button, Popover, ToggleGroup, Badge + ChipRemoveButton) are all demoed on this page."
    >
      <DemoGrid>
        <Demo
          name="PageTopBar"
          hint="The single per-page title row: back, title, status badge, actions ladder. Intro copy goes below as PageDescription."
          className="sm:col-span-2 xl:col-span-3"
        >
          <div className="bg-background w-full space-y-2">
            <PageTopBar>
              <PageTopBarBack to="/admin" aria-label="Back to admin" />
              <PageTopBarTitle>Summoner Skirmish</PageTopBarTitle>
              <Badge variant="muted" className="ml-2">
                Running
              </Badge>
              <PageTopBarActions>
                <PageTopBarButton>
                  <CopyIcon /> Copy code
                </PageTopBarButton>
                <PageTopBarPrimaryButton>
                  <PlusIcon /> Add entry
                </PageTopBarPrimaryButton>
                <PageTopBarIconButton aria-label="More actions">
                  <EllipsisVerticalIcon />
                </PageTopBarIconButton>
              </PageTopBarActions>
            </PageTopBar>
            <PageDescription>
              The one-paragraph intro goes below the bar as PageDescription, never inside it.
            </PageDescription>
          </div>
        </Demo>
        <Demo
          name="TopBarBreadcrumbTrail"
          hint="Drill-down pages below a tabbed area; collapses to a back arrow on phones."
        >
          <PageTopBar className="w-full">
            <TopBarBreadcrumbTrail
              segments={[{ label: "Admin", link: <Link to="/admin" /> }, { label: "Design" }]}
            />
          </PageTopBar>
        </Demo>
        <Demo
          name="AdminFilterSelect / AdminFilterSwitch"
          hint="The admin filter row above a server-paged table. The first option is the filter's off state; each page owns the sentinel it uses for that, since the meta catalogue spells it into the URL."
          className="sm:col-span-2 xl:col-span-3"
        >
          <div className="flex w-full flex-wrap items-center gap-2">
            <AdminFilterSelect
              value={demoTriage}
              onChange={setDemoTriage}
              label="Triage state"
              className="w-44"
              options={[
                { value: "any", label: "Any state" },
                { value: "new", label: "New (128)" },
                { value: "accepted", label: "Accepted (12)" },
                { value: "dismissed", label: "Dismissed (4)" },
              ]}
            />
            <AdminFilterSelect
              value={demoStatus}
              onChange={setDemoStatus}
              label="Event status"
              className="w-40"
              options={[
                { value: "any", label: "Any status" },
                { value: "upcoming", label: "Upcoming" },
                { value: "complete", label: "Complete" },
              ]}
            />
            <AdminFilterSwitch
              id="design-filter-decklists"
              checked={demoDecklists}
              onChange={setDemoDecklists}
            >
              Decklists published
            </AdminFilterSwitch>
            <AdminFilterSwitch
              id="design-filter-missing"
              checked={demoMissing}
              onChange={setDemoMissing}
            >
              Gone from the listing
            </AdminFilterSwitch>
          </div>
        </Demo>
        <Demo
          name="SearchInput"
          hint="Every search surface: magnifier, scope chip (click it for the field menu), result count, clear. On a real surface the chip only mounts while the scope is narrowed or the empty field is focused, and a typed n:/k: prefix swaps it for the muted, read-only prefix chip."
          className="xl:col-span-2"
        >
          <SearchInput
            value={plainSearch}
            onValueChange={setPlainSearch}
            placeholder="Search decks…"
            className="w-56"
          />
          <SearchInput
            value={scopedSearch}
            onValueChange={setScopedSearch}
            inputRef={demoSearchRef}
            placeholder="Search cards…"
            leading={
              <SearchScopeChip
                scope={demoScope}
                toggleField={(field) => setDemoScope((current) => toggleDemoScope(current, field))}
                selectAll={() => setDemoScope([...ALL_SEARCH_FIELDS])}
                selectOnly={(field) => setDemoScope([field])}
                open={demoScopeOpen}
                onOpenChange={setDemoScopeOpen}
                inputRef={demoSearchRef}
              />
            }
            trailing="12 / 40 cards"
            className="w-80"
          />
          <SearchInput
            value={prefixedSearch}
            onValueChange={setPrefixedSearch}
            placeholder="Search cards…"
            leading={<SearchPrefixChip fields={["name"]} />}
            trailing="3 / 40 cards"
            className="w-80"
          />
        </Demo>
        <Demo
          name="MultiSelectCombobox"
          hint="Filter dropdown. Button trigger for the compact bar; chip trigger cycles include/exclude."
        >
          <MultiSelectCombobox
            label="Region"
            options={REGION_OPTIONS}
            selected={regions}
            onChange={setRegions}
            searchPlaceholder="Search regions…"
            triggerStyle="button"
          />
          <MultiSelectCombobox
            label="Region"
            options={REGION_OPTIONS}
            selected={regions}
            excluded={excludedRegions}
            onCycle={(value) => {
              if (regions.includes(value)) {
                setRegions((prev) => prev.filter((v) => v !== value));
                setExcludedRegions((prev) => [...prev, value]);
              } else if (excludedRegions.includes(value)) {
                setExcludedRegions((prev) => prev.filter((v) => v !== value));
              } else {
                setRegions((prev) => [...prev, value]);
              }
            }}
            searchPlaceholder="Search regions…"
            triggerStyle="chip"
          />
        </Demo>
        <Demo
          name="CardStrip"
          hint="Layout shell for the 24px above-card row: left / center / right zones with StripIconButton and StripActionButton. The flex-1 side zones keep the center pills dead-centered."
        >
          <div className="w-56">
            <CardStrip
              left={
                <StripIconButton
                  className="text-muted-foreground"
                  aria-label="Remove from deck"
                  onClick={() => toast.success("Removed")}
                >
                  <MinusIcon />
                </StripIconButton>
              }
              center={
                <>
                  <CountPill variant="ghost" title="3 owned">
                    <PackageIcon className="size-3" />
                    <span>3</span>
                  </CountPill>
                  <CountPill variant="primary" title="2 in deck">
                    <LayersIcon className="size-3" />
                    <span>2</span>
                  </CountPill>
                </>
              }
              right={
                <StripIconButton
                  className="text-muted-foreground"
                  aria-label="Add to deck"
                  onClick={() => toast.success("Added")}
                >
                  <PlusIcon />
                </StripIconButton>
              }
            />
          </div>
          <div className="w-56">
            <CardStrip
              center={
                <CountPill variant="ghost" className="opacity-50">
                  <PackageIcon className="size-3" />
                  <span>0</span>
                </CountPill>
              }
              right={
                <StripActionButton onClick={() => toast.success("Chosen")}>
                  Choose
                </StripActionButton>
              }
            />
          </div>
          <div className="w-56">
            <CardStrip
              right={
                <StripActionButton variant="destructive" onClick={() => toast.success("Removed")}>
                  Remove
                </StripActionButton>
              }
            />
          </div>
        </Demo>
        <Demo
          name="CardCountStrip"
          hint="Count preset over CardStrip; CountPill's real habitat. Read-only shows N (M)."
        >
          <div className="w-40">
            <CardCountStrip
              count={ownedCount}
              icon={PackageIcon}
              decrement={{
                onClick: () => setOwnedCount((c) => Math.max(0, c - 1)),
                disabled: ownedCount === 0,
                ariaLabel: "Remove one copy",
              }}
              increment={{
                onClick: () => setOwnedCount((c) => c + 1),
                ariaLabel: "Add one copy",
              }}
            />
          </div>
          <div className="w-40">
            <CardCountStrip count={1} totalCount={4} icon={PackageIcon} />
          </div>
        </Demo>
        <Demo
          name="TradeStatusChip"
          hint="Marks a printing the viewer has a live trade on. Ghost like OnLoanChip so the two share one strip; weight carries how binding the state is, never colour."
          spec="One word per phase on both sides; the arrow says which way the card is going. Offered and Reserved are equally binding, so only a bid is muted."
          className="sm:col-span-2 xl:col-span-3"
        >
          <div className="w-full space-y-3">
            <TradeChipRow label='detail="label" · giver (their own copy is at stake, arrow points out)'>
              {LIVE_TRADE_PHASES.map((phase) => (
                <TradeStatusChip
                  key={phase}
                  detail="label"
                  annotation={demoTradeAnnotation("giver", phase)}
                />
              ))}
            </TradeChipRow>
            <TradeChipRow label='detail="label" · receiver (a card on its way in, arrow points in)'>
              {LIVE_TRADE_PHASES.map((phase) => (
                <TradeStatusChip
                  key={phase}
                  detail="label"
                  annotation={demoTradeAnnotation("receiver", phase)}
                />
              ))}
            </TradeChipRow>
            <TradeChipRow label='detail="count" (strip default, wording in the tooltip) · detail="icon" (copies view) · detail="word" (per-copy rows, no printing-wide number) · next to OnLoanChip'>
              <TradeStatusChip annotation={demoTradeAnnotation("giver", "reserved")} />
              <TradeStatusChip annotation={demoTradeAnnotation("giver", "asked")} totalCount={5} />
              <TradeStatusChip
                detail="icon"
                annotation={demoTradeAnnotation("receiver", "reserved")}
              />
              <TradeStatusChip detail="word" annotation={demoTradeAnnotation("giver", "offered")} />
              <div className="w-40">
                <CardStrip
                  center={
                    <>
                      <OnLoanChip count={1} />
                      <TradeStatusChip annotation={demoTradeAnnotation("giver", "offered")} />
                    </>
                  }
                />
              </div>
            </TradeChipRow>
            <TradeChipRow label="SharedTradeStatusChip (share links: reserved means not claimable, and no prop can carry a name)">
              <SharedTradeStatusChip />
              <SharedTradeStatusChip count={2} />
              <SharedTradeStatusChip detail="icon" />
            </TradeChipRow>
          </div>
        </Demo>
        <Demo name="ConfirmActionDialog" hint="Shared confirm step for destructive actions.">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2Icon /> Delete deck
          </Button>
          <ConfirmActionDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Delete Jinx Aggro?"
            description="The deck and its plans are removed. Cards in your collection stay untouched."
            confirmLabel="Delete"
            onConfirm={() => {
              setConfirmOpen(false);
              toast("Deleted (demo only)");
            }}
          />
        </Demo>
        <Demo name="UserAvatar" hint="Avatar with initials fallback, in its three sizes.">
          <Swatch label="sm">
            <UserAvatar name="Vi Piltover" size="sm" />
          </Swatch>
          <Swatch label="default">
            <UserAvatar name="Vi Piltover" />
          </Swatch>
          <Swatch label="lg">
            <UserAvatar name="Vi Piltover" size="lg" />
          </Swatch>
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}
