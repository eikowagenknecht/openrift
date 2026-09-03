import type {
  CardTradeLiveAnnotation,
  CardTradeLivePhase,
  CardTradeRole,
  SearchField,
} from "@openrift/shared";
import { ALL_SEARCH_FIELDS } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  GlobeIcon,
  HeartIcon,
  InfoIcon,
  LayersIcon,
  LinkIcon,
  MinusIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { Area, AreaChart } from "recharts";
import { siDiscord, siTwitch, siYoutube } from "simple-icons";
import { toast } from "sonner";

import { AdminFilterSelect, AdminFilterSwitch } from "@/components/admin/admin-filters";
import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { CardArtThumbStack } from "@/components/cards/card-art-thumb-stack";
import { CardCountStrip } from "@/components/cards/card-count-strip";
import { CardFan, CardFanOutline } from "@/components/cards/card-fan";
import { CardMiniRow } from "@/components/cards/card-mini-row";
import { CardStrip, StripActionButton, StripIconButton } from "@/components/cards/card-strip";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { CoverBand } from "@/components/cover-band";
import { MultiSelectCombobox } from "@/components/filters/multi-select-combobox";
import { SearchInput } from "@/components/filters/search-input";
import { SearchPrefixChip, SearchScopeChip } from "@/components/filters/search-scope-menu";
import { Heading } from "@/components/heading";
import { LanguageChip } from "@/components/language-chip";
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
import { MetaIdentity } from "@/components/meta/meta-identity";
import { MetaScopeBar } from "@/components/meta/meta-scope-bar";
import { MetaTierBadge } from "@/components/meta/meta-tier-badge";
import { ShareLinkRow } from "@/components/share/share-link-row";
import { SharedTradeStatusChip, TradeStatusChip } from "@/components/trades/trade-status-chip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ActionBand } from "@/components/ui/action-band";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BrandGlyph } from "@/components/ui/brand-glyph";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardLink } from "@/components/ui/card-link";
import { CardList, CardRow } from "@/components/ui/card-list";
import { ChartContainer } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { CopyField } from "@/components/ui/copy-field";
import { CountPill, CountPillButton } from "@/components/ui/count-pill";
import { CountryFlag } from "@/components/ui/country-flag";
import { DateLeaf } from "@/components/ui/date-leaf";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ExpandToggle } from "@/components/ui/expand-toggle";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { IconChip } from "@/components/ui/icon-chip";
import { InfoHint } from "@/components/ui/info-hint";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { PickerGroup, PickerList, PickerRow } from "@/components/ui/picker-list";
import type { PodiumSeat } from "@/components/ui/podium";
import { Medal, Podium } from "@/components/ui/podium";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { Progress } from "@/components/ui/progress";
import { QrCode } from "@/components/ui/qr-code";
import { QuantityStepper, QuantityStepperField } from "@/components/ui/quantity-stepper";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { StatStrip } from "@/components/ui/stat-strip";
import { StatTile } from "@/components/ui/stat-tile";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useCssVars } from "@/hooks/use-css-vars";
import {
  formatSpecLine,
  isTransparentColor,
  parsePx,
  useElementSpec,
} from "@/hooks/use-element-spec";
import { useLanguageList } from "@/hooks/use-enums";
import { useMetaEras } from "@/hooks/use-meta-eras";
import { formatRecord } from "@/lib/meta-format";
import type { MetaScope } from "@/lib/meta-scope";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const BUTTON_VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
  "link-muted",
  "dashed",
  "glass-pill",
] as const;

const BUTTON_SIZES = ["xs", "sm", "default", "lg"] as const;
const ICON_SIZES = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

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
  "sky",
  "muted",
  "subtle",
  "count",
] as const;

/**
 * The page's sections, in the order they render. The nav below is built from
 * this same list, so a section can never be on the page without a link to it
 * (Tiles was, for a while) and the two orders can never disagree.
 *
 * `title` repeats each section's own `DemoSection` title, which is what the nav
 * link reads.
 */
const SECTIONS = [
  { id: "tokens", title: "Tokens", Component: TokensSection },
  { id: "buttons", title: "Buttons", Component: ButtonsSection },
  { id: "top-bar-buttons", title: "Top-bar buttons", Component: TopBarButtonsSection },
  { id: "toggles", title: "Toggles", Component: TogglesSection },
  { id: "badges-chips", title: "Badges & chips", Component: BadgesChipsSection },
  { id: "pressable", title: "Pressable & disclosure", Component: PressableSection },
  { id: "section-heading", title: "Section heading", Component: SectionHeadingSection },
  { id: "icon-chip", title: "Icon chip", Component: IconChipSection },
  { id: "brand-glyph", title: "Brand glyph", Component: BrandGlyphSection },
  { id: "qr-codes", title: "Copy rows & QR codes", Component: QrCodesSection },
  { id: "tiles", title: "Tiles", Component: TilesSection },
  { id: "card-thumbnails", title: "Card thumbnails", Component: CardThumbnailsSection },
  { id: "form-controls", title: "Form controls", Component: FormControlsSection },
  { id: "pickers", title: "Pickers & commands", Component: PickersSection },
  { id: "overlays", title: "Overlays", Component: OverlaysSection },
  { id: "feedback", title: "Feedback & status", Component: FeedbackSection },
  { id: "layout", title: "Layout & data", Component: LayoutSection },
  { id: "meta-archive", title: "Meta archive", Component: MetaArchiveSection },
  { id: "composites", title: "Composites", Component: CompositesSection },
] as const;

/**
 * Admin-only kitchen sink: every `components/ui/` primitive rendered in its
 * variants so drift is visible at a glance. Toggle the app theme in the header
 * to review both modes. When you add a primitive to `ui/`, add a demo here.
 *
 * @returns The design review page.
 */
export function DesignPage() {
  return (
    <div className={cn(PAGE_WIDTH.capped, "flex flex-col gap-10 pb-16")}>
      <AdminPageTopBar title="Design" />
      <div className="space-y-3">
        <PageDescription>
          Check both themes with the header toggle. Spec captions are measured live from the
          rendered DOM.
        </PageDescription>
        <nav className="flex flex-wrap gap-x-4 gap-y-1">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
            >
              {section.title}
            </a>
          ))}
        </nav>
      </div>

      {SECTIONS.map((section) => (
        <section.Component key={section.id} />
      ))}
    </div>
  );
}

function DemoSection({
  id,
  title,
  note,
  docs,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  docs?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="space-y-1">
        <Heading level={2}>{title}</Heading>
        {note && <p className="text-muted-foreground text-sm">{note}</p>}
        {docs && <p className="text-muted-foreground text-2xs font-mono">→ {docs}</p>}
      </div>
      {children}
    </section>
  );
}

function DemoRow({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{label}</p>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>
    </div>
  );
}

// A variant-sweep row of Swatches: bottom-aligned so the captions line up,
// with wider gaps to keep caption columns readable.
function SwatchRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <DemoRow label={label} hint={hint} className="items-end gap-x-5 gap-y-4">
      {children}
    </DemoRow>
  );
}

// One variant/size sample: the live component, its token name, and a spec
// caption (size, radius, text size) measured from the rendered DOM so the
// numbers can never drift from the cva source. `colors` adds bg/fg chips
// with the resolved computed color in the tooltip.
function Swatch({
  label,
  colors = false,
  children,
}: {
  label: string;
  colors?: boolean;
  children: ReactNode;
}) {
  const { ref, spec } = useElementSpec<HTMLDivElement>();
  return (
    <div className="flex flex-col gap-1.5">
      <div ref={ref} className="flex items-start">
        {children}
      </div>
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <p className="font-mono text-xs">{label}</p>
          {colors && spec && (
            <span className="flex items-center gap-1">
              {!isTransparentColor(spec.background) && (
                <ColorChip value={spec.background} label={`bg ${spec.background}`} />
              )}
              <ColorChip value={spec.color} label={`text ${spec.color}`} />
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-2xs font-mono">
          {spec ? formatSpecLine(spec) : "measuring…"}
        </p>
      </div>
    </div>
  );
}

// Tiny inline color sample; the resolved computed value lives in the tooltip.
function ColorChip({ value, label }: { value: string; label: string }) {
  return (
    <span
      title={label}
      className="border-border-opaque inline-block size-3 shrink-0 rounded-sm border"
      style={{ backgroundColor: value }}
    />
  );
}

// One component per cell: the component's name, a one-line "what it's for"
// hint, then the live demo. Sections whose demos are variant sweeps of a
// single component (Buttons, Badges) use SwatchRow instead. `spec` carries
// convention facts that can't be measured (tier names, doc rules).
function Demo({
  name,
  hint,
  spec,
  children,
  className,
}: {
  name: string;
  hint: string;
  spec?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-lg border p-3", className)}>
      <div className="space-y-0.5">
        <p className="font-mono text-sm font-medium">{name}</p>
        <p className="text-muted-foreground text-xs">{hint}</p>
        {spec && <p className="text-muted-foreground text-2xs font-mono">{spec}</p>}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap content-start items-center gap-2">
        {children}
      </div>
    </div>
  );
}

function DemoGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

const COLOR_PAIRS = [
  { token: "--background", fg: "var(--foreground)" },
  { token: "--card", fg: "var(--card-foreground)" },
  { token: "--popover", fg: "var(--popover-foreground)" },
  { token: "--primary", fg: "var(--primary-foreground)" },
  { token: "--secondary", fg: "var(--secondary-foreground)" },
  { token: "--muted", fg: "var(--muted-foreground)" },
  { token: "--accent", fg: "var(--accent-foreground)" },
  // Buttons put white text on the destructive fill; there is no
  // --destructive-foreground in this theme.
  { token: "--destructive", fg: "white" },
] as const;

const LINE_COLOR_TOKENS = [
  "--border",
  "--border-accent",
  "--border-opaque",
  "--input",
  "--ring",
] as const;

const CHART_COLOR_TOKENS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const;

const TOKEN_NAMES = [
  ...COLOR_PAIRS.map((pair) => pair.token),
  ...LINE_COLOR_TOKENS,
  ...CHART_COLOR_TOKENS,
];

// Literal class names so Tailwind's scanner generates them.
const RADIUS_CLASSES = [
  "rounded-sm",
  "rounded-md",
  "rounded-lg",
  "rounded-xl",
  "rounded-2xl",
  "rounded-3xl",
  "rounded-4xl",
  "rounded-full",
] as const;

const HEIGHT_TIERS = [
  { cls: "h-5", note: "count pills, chips" },
  { cls: "h-6", note: "xs buttons" },
  { cls: "h-7", note: "sm buttons" },
  { cls: "h-8", note: "default controls" },
  { cls: "h-9", note: "lg buttons" },
  { cls: "h-14", note: "global header" },
] as const;

const TYPE_TIERS: readonly { role: string; cls: string; note?: string }[] = [
  { role: "Hero", cls: "text-4xl font-bold", note: "landing only, md:text-5xl" },
  { role: "Page title (h1)", cls: "font-heading text-2xl font-bold" },
  { role: "Section (h2)", cls: "font-heading text-lg font-semibold" },
  { role: "Subsection / card title (h3)", cls: "text-base font-medium" },
  { role: "Body", cls: "", note: "responsive: 1.05rem phone, 15px from sm:" },
  { role: "Compact UI", cls: "text-sm" },
  { role: "Metadata", cls: "text-xs" },
  { role: "Micro", cls: "text-2xs" },
];

// One theme color: a click-to-copy tile filled with the token's color. When
// `fg` is set, the tile shows an "Aa" sample in that color (the token's
// paired foreground); line/chart tokens omit it.
function ColorTokenTile({ token, fg, value }: { token: string; fg?: string; value?: string }) {
  const { copy } = useCopyToClipboard();

  async function handleCopy() {
    if (await copy(`var(${token})`)) {
      toast.success(`Copied var(${token})`);
    } else {
      toast.error("Could not copy the token");
    }
  }

  return (
    <Pressable
      className="group flex min-w-0 flex-col gap-1 text-left"
      onClick={() => void handleCopy()}
    >
      <span
        className="border-border-opaque flex h-12 items-center justify-center rounded-md border text-sm"
        style={{ backgroundColor: `var(${token})`, color: fg }}
      >
        {fg ? "Aa" : null}
      </span>
      <span className="truncate font-mono text-xs">{token.slice(2)}</span>
      <span className="text-muted-foreground text-2xs truncate font-mono" title={value}>
        {value ?? "…"}
      </span>
    </Pressable>
  );
}

// One type-scale tier: live sample text plus role, class token, and the
// measured font size.
function TypeSpecimen({ role, cls, note }: { role: string; cls: string; note?: string }) {
  const { ref, spec } = useElementSpec<HTMLDivElement>();
  const fontSize = spec ? parsePx(spec.fontSize) : Number.NaN;
  return (
    <div className="flex flex-col gap-0.5 border-b pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <div ref={ref} className="min-w-0">
        <p className={cn("truncate", cls)}>Summoner Skirmish</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground text-xs">{note ? `${role} · ${note}` : role}</span>
        <span className="font-mono text-xs">{cls === "" ? "(no size class)" : cls}</span>
        <span className="text-muted-foreground text-2xs font-mono">
          {Number.isFinite(fontSize) ? `${Math.round(fontSize * 10) / 10}px` : ""}
        </span>
      </div>
    </div>
  );
}

function TokensSection() {
  const values = useCssVars(TOKEN_NAMES);
  return (
    <DemoSection
      id="tokens"
      title="Tokens"
      note="The theme vocabulary everything below is built from. Values are read live from the rendered page: toggle theme or palette in the header and they follow. The sidebar-* variables mirror the core set for the app chrome and are omitted here."
      docs="apps/web/src/index.css · docs/design-language.md · docs/typography.md"
    >
      <DemoRow
        label="Color pairs"
        hint="Background token with its paired foreground as the Aa sample. Click a tile to copy its var()."
      >
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {COLOR_PAIRS.map((pair) => (
            <ColorTokenTile
              key={pair.token}
              token={pair.token}
              fg={pair.fg}
              value={values[pair.token]}
            />
          ))}
        </div>
      </DemoRow>
      <DemoRow label="Lines & focus" hint="Borders, input outlines, and the focus ring.">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
          {LINE_COLOR_TOKENS.map((token) => (
            <ColorTokenTile key={token} token={token} value={values[token]} />
          ))}
        </div>
      </DemoRow>
      <DemoRow label="Charts" hint="Use in ChartContainer configs as var(--chart-N).">
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-5">
          {CHART_COLOR_TOKENS.map((token) => (
            <ColorTokenTile key={token} token={token} value={values[token]} />
          ))}
        </div>
      </DemoRow>
      <SwatchRow
        label="Radius scale"
        hint="--radius is 0.375rem (6px); sm through 4xl derive from it by ±px offsets. rounded-lg is the default control radius."
      >
        {RADIUS_CLASSES.map((cls) => (
          <Swatch key={cls} label={cls}>
            <div className={cn("bg-muted border-border-accent size-12 border", cls)} />
          </Swatch>
        ))}
      </SwatchRow>
      <SwatchRow
        label="Corner cut"
        hint="Filled buttons (default, secondary, destructive) swap border-radius for the clip-path corner-cut signature: --btn-cut 8px by default, 5px on xs/sm sizes."
      >
        <Swatch label="btn-corner-cut" colors>
          <Button>Primary</Button>
        </Swatch>
        <Swatch label="--btn-cut: 5px" colors>
          <Button size="sm">Compact</Button>
        </Swatch>
      </SwatchRow>
      <SwatchRow
        label="Height ladder"
        hint="Boxed controls sharing a row must share a tier; h-8 is the default control height (docs/design-language.md)."
      >
        {HEIGHT_TIERS.map(({ cls, note }) => (
          <Swatch key={cls} label={`${cls} · ${note}`}>
            <div className={cn("bg-muted border-border-opaque w-14 rounded-md border", cls)} />
          </Swatch>
        ))}
      </SwatchRow>
      <DemoRow
        label="Type scale"
        hint="Pick a tier from docs/typography.md, never invent a size. h1/h2 carry font-heading (Chakra Petch); everything else keeps the default face. Measured sizes update with the viewport."
      >
        <div className="w-full space-y-3">
          {TYPE_TIERS.map((tier) => (
            <TypeSpecimen key={tier.role} role={tier.role} cls={tier.cls} note={tier.note} />
          ))}
        </div>
      </DemoRow>
    </DemoSection>
  );
}

function ButtonsSection() {
  return (
    <DemoSection
      id="buttons"
      title="Buttons"
      note="One filled primary per surface; ghost for secondary icon actions. Never hand-roll heights."
      docs="docs/design-language.md"
    >
      <SwatchRow label="Variants" hint="All variants at the default size (h-8).">
        {BUTTON_VARIANTS.map((variant) => (
          <Swatch key={variant} label={variant} colors>
            <Button variant={variant}>{variant}</Button>
          </Swatch>
        ))}
      </SwatchRow>
      <SwatchRow label="Sizes" hint="Labeled sizes shown on the outline variant.">
        {BUTTON_SIZES.map((size) => (
          <Swatch key={size} label={size}>
            <Button variant="outline" size={size}>
              Button
            </Button>
          </Swatch>
        ))}
      </SwatchRow>
      <SwatchRow label="Icon sizes" hint="Square icon-only sizes, shown on the ghost variant.">
        {ICON_SIZES.map((size) => (
          <Swatch key={size} label={size}>
            <Button variant="ghost" size={size} aria-label={`Settings (${size})`}>
              <SettingsIcon />
            </Button>
          </Swatch>
        ))}
      </SwatchRow>
      <DemoRow label="With icon / disabled / group">
        <Button>
          <PlusIcon /> Add card
        </Button>
        <Button variant="destructive">
          <Trash2Icon /> Delete deck
        </Button>
        <Button disabled>Disabled</Button>
        <ButtonGroup>
          <Button variant="outline">Cards</Button>
          <ButtonGroupSeparator />
          <Button variant="outline">Printings</Button>
          <ButtonGroupSeparator />
          <Button variant="outline">Copies</Button>
        </ButtonGroup>
      </DemoRow>
    </DemoSection>
  );
}

function TopBarButtonsSection() {
  return (
    <DemoSection
      id="top-bar-buttons"
      title="Top-bar buttons"
      note="Only inside PageTopBarActions. One PageTopBarPrimaryButton per bar, everything else ghost. The wrappers lock variant and size so every bar shares the h-8 tier."
    >
      <SwatchRow label="Ladder">
        <Swatch label="PageTopBarButton" colors>
          <PageTopBarButton>
            <CopyIcon /> Copy code
          </PageTopBarButton>
        </Swatch>
        <Swatch label="PageTopBarPrimaryButton" colors>
          <PageTopBarPrimaryButton>
            <PlusIcon /> New deck
          </PageTopBarPrimaryButton>
        </Swatch>
        <Swatch label="PageTopBarIconButton">
          <PageTopBarIconButton aria-label="Notifications">
            <BellIcon />
          </PageTopBarIconButton>
        </Swatch>
        <Swatch label="PageTopBarBack">
          <PageTopBarBack to="/admin" aria-label="Back to admin" />
        </Swatch>
      </SwatchRow>
    </DemoSection>
  );
}

function TogglesSection() {
  const [view, setView] = useState("grid");
  return (
    <DemoSection
      id="toggles"
      title="Toggles"
      note="Toggle for a single pressed state, ToggleGroup for exclusive choices, Switch for settings."
    >
      <DemoRow
        label="Toggle variants"
        hint="Two variants: default (borderless) and outline. Shown unpressed and pressed."
      >
        <Toggle aria-label="Toggle, default variant">default</Toggle>
        <Toggle defaultPressed aria-label="Toggle, default variant, pressed">
          default pressed
        </Toggle>
        <Toggle variant="outline" aria-label="Toggle, outline variant">
          outline
        </Toggle>
        <Toggle variant="outline" defaultPressed aria-label="Toggle, outline variant, pressed">
          outline pressed
        </Toggle>
      </DemoRow>
      <SwatchRow label="Toggle sizes">
        <Swatch label="sm">
          <Toggle variant="outline" size="sm" aria-label="Small toggle">
            <HeartIcon /> Foils
          </Toggle>
        </Swatch>
        <Swatch label="default">
          <Toggle variant="outline" aria-label="Default-size toggle">
            <HeartIcon /> Foils
          </Toggle>
        </Swatch>
        <Swatch label="lg">
          <Toggle variant="outline" size="lg" aria-label="Large toggle">
            <HeartIcon /> Foils
          </Toggle>
        </Swatch>
      </SwatchRow>
      <DemoRow label="ToggleGroup" hint="The exclusive-choice strip (view modes).">
        <ToggleGroup
          value={[view]}
          onValueChange={(value) => {
            const next = value.at(0);
            if (typeof next === "string") {
              setView(next);
            }
          }}
        >
          <ToggleGroupItem value="grid">Grid</ToggleGroupItem>
          <ToggleGroupItem value="table">Table</ToggleGroupItem>
        </ToggleGroup>
      </DemoRow>
    </DemoSection>
  );
}

function BadgesChipsSection() {
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

function PressableSection() {
  const [expanded, setExpanded] = useState(true);
  const [iconOnlyExpanded, setIconOnlyExpanded] = useState(false);
  return (
    <DemoSection
      id="pressable"
      title="Pressable & disclosure"
      note="Pressable is the unstyled-but-accessible clickable region. ExpandToggle owns aria-expanded and the rotating chevron."
    >
      <DemoRow label="Pressable (rich clickable row)">
        <Pressable
          className="hover:bg-muted/50 flex w-full max-w-sm items-center gap-3 rounded-lg border p-2"
          onClick={() => toast("Row pressed")}
        >
          <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-md">
            <PackageIcon className="text-muted-foreground size-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">Piltover Trader</div>
            <div className="text-muted-foreground text-xs">OGN-042 · Epic</div>
          </div>
        </Pressable>
      </DemoRow>
      <DemoRow label="ExpandToggle (labeled)">
        <div className="w-full max-w-sm space-y-2">
          <ExpandToggle expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            <span className="font-medium">Sideboard plan</span>
            <span className="text-muted-foreground text-xs">3 matchups</span>
          </ExpandToggle>
          {expanded && (
            <p className="text-muted-foreground pl-6 text-sm">
              Against control, bring in the burn package.
            </p>
          )}
        </div>
      </DemoRow>
      <DemoRow label="ExpandToggle (icon-only)">
        <ExpandToggle
          expanded={iconOnlyExpanded}
          onClick={() => setIconOnlyExpanded((v) => !v)}
          aria-label={iconOnlyExpanded ? "Collapse" : "Expand"}
          className="text-muted-foreground hover:text-foreground"
        />
      </DemoRow>
    </DemoSection>
  );
}

function SectionHeadingSection() {
  return (
    <DemoSection
      id="section-heading"
      title="Section heading"
      note="The app's in-page section heading: a small uppercase muted label, optionally followed by a tabular count. size=sm is the quieter sub-group variant; variant=display is the heading-face form for hero-led pages."
    >
      <DemoRow label="Default size">
        <div className="w-full space-y-4">
          <SectionHeading>Cards in collection</SectionHeading>
          <SectionHeading count={12}>Cards with prices</SectionHeading>
        </div>
      </DemoRow>
      <DemoRow label="Display variant">
        <div className="w-full space-y-4">
          <SectionHeading variant="display">Also coming up</SectionHeading>
          <SectionHeading variant="display" count={7}>
            Past events
          </SectionHeading>
        </div>
      </DemoRow>
      <DemoRow label="Small size">
        <div className="w-full space-y-3">
          <SectionHeading size="sm">Yesterday</SectionHeading>
          <SectionHeading size="sm" count={3}>
            Today
          </SectionHeading>
        </div>
      </DemoRow>
      <DemoRow label="With icon chip">
        <div className="w-full space-y-3">
          <SectionHeading icon={BellIcon} tone="gold" count={2}>
            Action needed
          </SectionHeading>
          <SectionHeading icon={HeartIcon} tone="sky" count={5}>
            Wishlists &amp; tradelists
          </SectionHeading>
        </div>
      </DemoRow>
    </DemoSection>
  );
}

function IconChipSection() {
  return (
    <DemoSection
      id="icon-chip"
      title="Icon chip"
      note="A tinted icon chip: square default size anchors dashboard tiles, round sm marks feed and rail rows."
    >
      <SwatchRow label="Tones (square, default)">
        <Swatch label="neutral">
          <IconChip icon={PackageIcon} tone="neutral" />
        </Swatch>
        <Swatch label="primary">
          <IconChip icon={PackageIcon} tone="primary" />
        </Swatch>
        <Swatch label="gold">
          <IconChip icon={ZapIcon} tone="gold" />
        </Swatch>
        <Swatch label="sky">
          <IconChip icon={FolderIcon} tone="sky" />
        </Swatch>
        <Swatch label="green">
          <IconChip icon={UsersIcon} tone="green" />
        </Swatch>
        <Swatch label="violet">
          <IconChip icon={TrophyIcon} tone="violet" />
        </Swatch>
      </SwatchRow>
      <SwatchRow label="Round small (feed/rail rows)">
        <Swatch label="sm round">
          <IconChip icon={HeartIcon} tone="primary" size="sm" shape="round" />
        </Swatch>
      </SwatchRow>
    </DemoSection>
  );
}

function BrandGlyphSection() {
  return (
    <DemoSection
      id="brand-glyph"
      title="Brand glyph"
      note="A simple-icons brand mark that inherits text colour, falling back to a lucide icon when the brand is unknown. Used by contact chips and by promo source citations, where the mark is resolved from the link's host."
    >
      <SwatchRow label="Known brands">
        <Swatch label="YouTube">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} />
        </Swatch>
        <Swatch label="Twitch">
          <BrandGlyph icon={siTwitch} fallback={LinkIcon} />
        </Swatch>
        <Swatch label="Discord">
          <BrandGlyph icon={siDiscord} fallback={LinkIcon} />
        </Swatch>
      </SwatchRow>
      <SwatchRow label="Unknown brand (fallback)">
        <Swatch label="LinkIcon">
          <BrandGlyph fallback={LinkIcon} />
        </Swatch>
      </SwatchRow>
      <SwatchRow label="Sizes">
        <Swatch label="size-3">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} className="size-3" />
        </Swatch>
        <Swatch label="size-4 (default)">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} />
        </Swatch>
        <Swatch label="size-6">
          <BrandGlyph icon={siYoutube} fallback={LinkIcon} className="size-6" />
        </Swatch>
      </SwatchRow>
    </DemoSection>
  );
}

const DEMO_SHARE_URL = "https://openrift.app/lists/share/AbCdEf123456";

function QrCodesSection() {
  return (
    <DemoSection
      id="qr-codes"
      title="Copy rows & QR codes"
      note="Two related families. CopyField is the plain read-only-value-plus-Copy row; ShareLinkRow is the share-link form of it, which adds the QR. Every QR on screen goes through QrCode, which carries the white plate and error-correction level M, both of which the underlying library gets wrong for this app. Toggle the theme: the plate is what keeps the code scannable in dark mode."
      docs="components/ui/copy-field.tsx · components/ui/qr-code.tsx · components/share/share-link-row.tsx"
    >
      <DemoRow
        label="CopyField"
        hint="For anything copied verbatim that is not a share link. `mono` is for values read character by character before pasting."
        className="flex-col items-stretch"
      >
        <CopyField value="RIFT-2026-OGN" label="Deck code" />
        <CopyField
          value="!addcom !card $(urlfetch https://openrift.app/api/v1/chat/card?q=$(querystring))"
          label="Nightbot command"
          mono
        />
      </DemoRow>
      <DemoRow
        label="Sizes"
        hint="160 is the default; 224 suits a code meant to be scanned across a table."
      >
        <QrCode value={DEMO_SHARE_URL} />
        <QrCode value={DEMO_SHARE_URL} size={224} />
      </DemoRow>
      <DemoRow
        label="ShareLinkRow"
        hint="The canonical share-link presentation: read-only URL, inline copy confirmation, QR behind its toggle."
        className="flex-col items-stretch"
      >
        <ShareLinkRow url={DEMO_SHARE_URL} label="Share link" />
      </DemoRow>
      <DemoRow
        label="ShareLinkRow (expanded, with an action)"
        hint="Full pages pass defaultQrOpen so an organizer can leave the code on screen."
        className="flex-col items-stretch"
      >
        <ShareLinkRow
          url={DEMO_SHARE_URL}
          label="Registration link"
          defaultQrOpen
          actions={<Button variant="ghost">Rotate link</Button>}
        />
      </DemoRow>
    </DemoSection>
  );
}

// Static sample members for the avatar-stack demos. The empty gravatar hash
// keeps the fallback on initials, so the design page makes no network calls.
const STACK_MEMBERS = [
  { userId: "u1", userName: "Poro Herder", userImage: null, gravatarHash: "" },
  { userId: "u2", userName: "Hex Tinkerer", userImage: null, gravatarHash: "" },
  { userId: "u3", userName: "Void Binder", userImage: null, gravatarHash: "" },
  { userId: "u4", userName: "Glacial Mina", userImage: null, gravatarHash: "" },
  { userId: "u5", userName: "Stacked Sam", userImage: null, gravatarHash: "" },
];

const PODIUM_SEATS: PodiumSeat[] = [
  { key: "p1", rank: 1, name: "Poro Herder", score: 12, hint: "3 wins · opp 1.75" },
  { key: "p2", rank: 2, name: "Hex Tinkerer", score: 10, hint: "2 wins · opp 1.71" },
  { key: "p3", rank: 3, name: "Void Binder", score: 9, hint: "2 wins · opp 1.62" },
];

function TilesSection() {
  return (
    <DemoSection
      id="tiles"
      title="Tiles"
      note="CardLink is the whole-Card click target for list tiles; every tile hovers the same way (shadow lift, muted wash, 1px primary edge). Cards that keep secondary actions inside, and non-Card link tiles like the deck grid, apply cardLinkVariants() directly. CardList and CardRow carry the same Card edge for the two list shapes that are not a Card: one flush panel of rows, and standalone rows in a gapped list. StatTile is the dashboard stat; accent is reserved for the one tile needing attention. StatStrip is its non-linking sibling for inline context counts. ActionBand is the full-width 'needs you' band (the overview's trades hub, the members page's join requests). Podium is the standings throne. CoverBand is the warm-glow strip at the top of showcase tiles (product fans, group avatar stacks); UserAvatarStack is the overlapping who's-here row with a +N overflow."
    >
      <DemoRow label="CardLink">
        <CardLink
          render={<Link to="/admin/design" hash="tiles" />}
          className="w-full max-w-sm flex-row items-center gap-3 p-3"
        >
          <PackageIcon className="text-muted-foreground size-5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">Jinx&apos;s Arsenal</span>
            <span className="text-muted-foreground text-xs">Tradelist · 24 Cards</span>
          </div>
          <Badge variant="secondary">Shared</Badge>
        </CardLink>
      </DemoRow>
      <DemoRow label="CardLink (image-dominated)">
        <CardLink
          render={<Link to="/admin/design" hash="tiles" />}
          className="w-full max-w-sm gap-0 py-0"
        >
          <div className="bg-muted flex h-24 items-center justify-center rounded-t-lg">
            <PackageIcon className="text-muted-foreground size-8" />
          </div>
          <div className="flex flex-col p-3">
            <span className="font-medium">Piltover Starter</span>
            <span className="text-muted-foreground text-xs">Ready to play</span>
          </div>
        </CardLink>
      </DemoRow>
      <DemoRow
        label="CardList / CardRow"
        hint="The two list shapes that carry the Card edge without being a Card. CardList is one panel with its rows flush inside, separated by their own hover wash — a rail of same-shaped rows. CardRow is a standalone bordered row in a gapped list, for rows that stand apart because each is its own entity. They are alternatives, not a pair: a CardRow never goes inside a CardList."
        className="items-start gap-6"
      >
        <CardList className="w-full max-w-xs">
          {["Round 1", "Round 2", "Round 3"].map((round) => (
            <li
              key={round}
              className="hover:bg-muted/50 flex items-center gap-2.5 rounded px-2 py-2"
            >
              <span className="bg-primary/60 size-2 shrink-0 rounded-full" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{round}</span>
              <span className="text-muted-foreground shrink-0 text-xs">finalized</span>
            </li>
          ))}
        </CardList>
        <ul className="flex w-full max-w-xs flex-col gap-1.5">
          {["Vi", "Ekko"].map((name) => (
            <CardRow key={name}>
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar name={name} size="sm" />
                <span className="truncate font-medium">{name}</span>
              </span>
              <span className="font-semibold tabular-nums">+3 bye</span>
            </CardRow>
          ))}
        </ul>
      </DemoRow>
      <DemoRow label="StatTile">
        <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={HeartIcon}
            label="Wishlists"
            value={4}
            hint="2 shared with your group"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={BellIcon}
            label="Requests"
            value={3}
            accent
            hint="3 requests to review"
          />
        </div>
      </DemoRow>
      <DemoRow
        label="StatTile tones"
        hint="tone tints the icon chip only (the ring stays neutral), so tiles on one overview carry per-surface color without competing with accent. accent overrides tone."
      >
        <div className="grid w-full max-w-4xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={ZapIcon}
            label="Trades"
            value={4}
            tone="gold"
            hint="tone=gold"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={FolderIcon}
            label="Collections"
            value={1}
            tone="sky"
            hint="tone=sky"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={UsersIcon}
            label="Members"
            value={9}
            tone="green"
            hint="tone=green"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={TrophyIcon}
            label="Tournaments"
            value={2}
            tone="violet"
            hint="tone=violet"
          />
        </div>
      </DemoRow>
      <DemoRow
        label="ActionBand"
        hint="Header row (IconChip, label, headline value, sub, trailing action) with free-form rows below. accent marks the band waiting on the viewer; a band given render is the click target and hovers like StatTile, a static one carries inline actions in its rows. valueClassName takes the headline off the display numeral when it is a sentence rather than a count."
      >
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <ActionBand
            render={<Link to="/admin/design" hash="tiles" />}
            icon={ZapIcon}
            accent
            label="Trades"
            value={3}
            sub="trades need your action"
            action={
              <span className={cn(buttonVariants(), "group-hover/action-band:bg-primary/90")}>
                View trades
                <ChevronRightIcon className="size-4 transition-transform group-hover/action-band:translate-x-0.5" />
              </span>
            }
          />
          <ActionBand
            render={<Link to="/admin/design" hash="tiles" />}
            icon={ZapIcon}
            tone="green"
            label="Trades"
            value="Nothing waiting on you"
            valueClassName="font-sans truncate text-base font-medium"
            action={
              <span className={cn(buttonVariants({ variant: "ghost" }))}>
                View trades
                <ChevronRightIcon className="size-4 transition-transform group-hover/action-band:translate-x-0.5" />
              </span>
            }
          />
          <ActionBand
            icon={UserPlusIcon}
            accent
            label="Requests"
            value={1}
            sub="person waiting to join"
          >
            <div className="bg-muted/40 flex items-center gap-2.5 rounded-lg px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">Powder Undercity</span>
                <span className="text-muted-foreground"> · requested 2h ago</span>
              </span>
              <Button size="sm">
                <CheckIcon className="size-4" />
                Approve
              </Button>
              <Button size="sm" variant="ghost">
                <XIcon className="size-4" />
                Deny
              </Button>
            </div>
          </ActionBand>
        </div>
      </DemoRow>
      <DemoRow
        label="StatStrip"
        hint="The compact inline counts row — StatTile's quiet sibling, for facts that are context rather than navigation. Nothing links; reach for StatTile when the number should take you somewhere. tone=good tints a value that carries a verdict."
        className="flex-col items-stretch"
      >
        <StatStrip
          items={[
            { key: "active", value: 11, label: "active", icon: CheckIcon, iconTone: "green" },
            { key: "dropped", value: 3, label: "dropped", icon: UsersIcon },
            { key: "regions", value: 4, label: "regions", icon: GlobeIcon, iconTone: "sky" },
          ]}
        />
        <StatStrip
          items={[
            { key: "penalty", value: 12, label: "penalty" },
            { key: "rematches", value: 0, label: "rematches", tone: "good" },
            { key: "three", value: 3, label: "in 3-pods" },
            { key: "spread", value: 4, label: "largest spread" },
          ]}
        />
      </DemoRow>
      <DemoRow
        label="Podium"
        hint="The standings throne: top three, winner centered and raised on the accent glow. Ranks render as given — a tie hands two seats rank 1 and both get gold, while the raised seat is the caller's tie-break winner. Owns its degenerate states: ghost seats before the first result, fewer columns for a small field."
        className="items-start gap-6"
      >
        <div className="w-full max-w-sm">
          <Podium seats={PODIUM_SEATS} />
        </div>
        <div className="w-full max-w-sm">
          <Podium seats={PODIUM_SEATS.slice(0, 2)} />
        </div>
        <div className="w-full max-w-sm">
          <Podium seats={[]} emptyLabel="The throne fills after round 1 is finalized." />
        </div>
      </DemoRow>
      <SwatchRow
        label="Medal"
        hint="The rank chip the throne and the standings table share. The on-art variant is the overlay for a tile's splash crop: opaque plate, shadow, and fixed colors in both themes, because it sits on artwork rather than on the page."
      >
        {[1, 2, 3, 9].map((rank) => (
          <Swatch key={`flat-${rank}`} label={`flat ${rank}`} colors>
            <Medal rank={rank} />
          </Swatch>
        ))}
        {[1, 2, 3, 9].map((rank) => (
          <Swatch key={`on-art-${rank}`} label={`onArt ${rank}`} colors>
            <span className="flex items-center justify-center rounded-md bg-[linear-gradient(120deg,#5b3f8f,#2b6f6a)] p-2">
              <Medal rank={rank} variant="onArt" />
            </span>
          </Swatch>
        ))}
      </SwatchRow>
      <DemoRow label="UserAvatarStack">
        <div className="flex flex-wrap items-center gap-6">
          <UserAvatarStack members={STACK_MEMBERS.slice(0, 3)} size="sm" />
          <UserAvatarStack members={STACK_MEMBERS} totalCount={17} />
          <UserAvatarStack members={STACK_MEMBERS} totalCount={8} size="lg" />
        </div>
      </DemoRow>
      <DemoRow label="CardLink (cover band)">
        <CardLink
          render={<Link to="/admin/design" hash="tiles" />}
          className="w-full max-w-sm flex-col gap-0 py-0"
        >
          <CoverBand aria-hidden="true" className="flex h-28 items-center justify-center">
            <UserAvatarStack members={STACK_MEMBERS} totalCount={8} size="lg" />
          </CoverBand>
          <div className="flex min-w-0 flex-col gap-1 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Heading className="min-w-0 truncate">Tuesday Night Crew</Heading>
              <Badge>Owner</Badge>
            </div>
            <p className="text-muted-foreground mt-auto pt-1 text-sm tabular-nums">
              8 members
              <span className="mx-1.5 opacity-60">·</span>
              12 shared lists
            </p>
          </div>
        </CardLink>
      </DemoRow>
    </DemoSection>
  );
}

// Self-contained sample art so the design page stays static (no catalog
// fetch). Portrait fills the frame directly; the landscape sample stands in for
// a Battlefield — upright landscape content that the `landscape` prop rotates
// into the portrait frame.
const PORTRAIT_SAMPLE_ART = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 63 88'><defs><linearGradient id='p' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#6366f1'/><stop offset='1' stop-color='#0ea5e9'/></linearGradient></defs><rect width='63' height='88' fill='url(#p)'/><circle cx='31.5' cy='26' r='10' fill='#fde047'/><text x='31.5' y='58' font-family='sans-serif' font-size='8' font-weight='bold' fill='white' text-anchor='middle'>UNIT</text></svg>",
)}`;

const LANDSCAPE_SAMPLE_ART = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 88 63'><defs><linearGradient id='l' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#059669'/><stop offset='1' stop-color='#84cc16'/></linearGradient></defs><rect width='88' height='63' fill='url(#l)'/><text x='44' y='37' font-family='sans-serif' font-size='9' font-weight='bold' fill='white' text-anchor='middle'>BATTLEFIELD</text></svg>",
)}`;

function CardThumbnailsSection() {
  return (
    <DemoSection
      id="card-thumbnails"
      title="Card thumbnails"
      note="CardArtThumb is the lightweight, image-only card frame for lists, tooltips, and stats — three shapes off one prop. shape=card is the portrait card frame, for where the thumb stands in for the card object (covers, tier tiles, stats, floating previews). shape=strip is the wide crop that leads a list row. shape=square is the avatar-sized crop of the art's top, for where a card stands in for a legend beside a name. Size any of them with a width or height utility; the other axis follows. The full grid tile (foil, pricing, sibling fan-out) is CardThumbnail; the whole row lead is CardMiniRow."
      docs="components/cards/card-art-thumb.tsx"
    >
      <DemoRow
        label="Shapes"
        hint="Same art. card locks to the portrait card ratio; strip locks to the landscape-card ratio (88/63) and crops portrait art to its illustration band, which at row height beats its middle landing on the type line; square crops the top, where the splash is."
      >
        <Swatch label="card">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="strip">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="square">
          <CardArtThumb shape="square" src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
      </DemoRow>
      <DemoRow label="Sizes" hint="Height- or width-driven; the shape's aspect ratio stays fixed.">
        <Swatch label="h-8">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-8" />
        </Swatch>
        <Swatch label="h-10">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-10" />
        </Swatch>
        <Swatch label="h-14">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="w-16">
          <CardArtThumb src={PORTRAIT_SAMPLE_ART} className="w-16" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="Strip sizes"
        hint="h-6 is the default, and the deck list's size. Rows that carry more text step up."
      >
        <Swatch label="h-6 (default)">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} />
        </Swatch>
        <Swatch label="h-8">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} className="h-8" />
        </Swatch>
        <Swatch label="h-10">
          <CardArtThumb shape="strip" src={PORTRAIT_SAMPLE_ART} className="h-10" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="Battlefield (landscape)"
        hint="Same source image throughout. A card frame must rotate the art -90° to fill it. A strip is already the art's own ratio, so it fills edge to edge untouched — which is why battlefields read at row size."
      >
        <Swatch label="card, no prop → cropped">
          <CardArtThumb src={LANDSCAPE_SAMPLE_ART} className="h-14" />
        </Swatch>
        <Swatch label="card + landscape → rotated">
          <CardArtThumb src={LANDSCAPE_SAMPLE_ART} landscape className="h-14" />
        </Swatch>
        <Swatch label="strip + landscape → whole">
          <CardArtThumb shape="strip" src={LANDSCAPE_SAMPLE_ART} landscape className="h-14" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="Empty states"
        hint="Shown when no image resolves, or the image fails to load. Both shapes share one fallback chain, so a printing catalogued before its art is rehosted degrades the same way everywhere."
      >
        <Swatch label="generic">
          <CardArtThumb imageId={null} className="h-14" />
        </Swatch>
        <Swatch label="rarity watermark">
          <CardArtThumb imageId={null} rarity="showcase" className="h-14" />
        </Swatch>
        <Swatch label="domain tint">
          <CardArtThumb imageId={null} rarity="showcase" domains={["chaos"]} className="h-14" />
        </Swatch>
        <Swatch label="strip, domain tint">
          <CardArtThumb
            shape="strip"
            imageId={null}
            rarity="showcase"
            domains={["chaos"]}
            className="h-14"
          />
        </Swatch>
        <Swatch label="square, domain tint">
          <CardArtThumb
            shape="square"
            imageId={null}
            rarity="showcase"
            domains={["chaos"]}
            className="h-14"
          />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="CardMiniRow"
        hint="The lead of a card list row: strip art, the domain color bar, and an optional rarity icon + short code. Everything after the art is opt-in — pass only what the row has data for. This is the app's one small-card treatment outside the browsing grids."
      >
        <Swatch label="art only">
          <CardMiniRow src={PORTRAIT_SAMPLE_ART} />
        </Swatch>
        <Swatch label="+ domain bar">
          <CardMiniRow src={PORTRAIT_SAMPLE_ART} domains={["chaos"]} />
        </Swatch>
        <Swatch label="dual domain">
          <CardMiniRow src={PORTRAIT_SAMPLE_ART} domains={["fury", "calm"]} />
        </Swatch>
        <Swatch label="full cluster">
          <CardMiniRow
            src={PORTRAIT_SAMPLE_ART}
            domains={["chaos"]}
            rarity="showcase"
            shortCode="OGN-042"
          />
        </Swatch>
        <Swatch label="battlefield">
          <CardMiniRow
            src={LANDSCAPE_SAMPLE_ART}
            landscape
            domains={["order"]}
            rarity="showcase"
            shortCode="OGN-118"
          />
        </Swatch>
        <Swatch label="no art on file">
          <CardMiniRow imageId={null} domains={["fury"]} rarity="showcase" shortCode="OGN-007" />
        </Swatch>
      </DemoRow>
      <DemoRow
        label="CardFan on CoverBand"
        hint="Fanned card art on the warm-glow CoverBand (product tiles, event heroes). CardFanOutline is the no-art stand-in; anchor=center floats the fan mid-band for taller hero bands. xs is the archive's podium fan, laid out in podium order so the first cover sits centred in front."
      >
        <Swatch label="xs / center">
          <CoverBand aria-hidden="true" className="h-28 w-56 overflow-hidden rounded-lg">
            <CardFan
              size="xs"
              anchor="center"
              covers={[
                { key: "a", src: PORTRAIT_SAMPLE_ART },
                { key: "b", src: PORTRAIT_SAMPLE_ART },
                { key: "c", src: PORTRAIT_SAMPLE_ART },
              ]}
            />
          </CoverBand>
        </Swatch>
        <Swatch label="sm / bottom">
          <CoverBand aria-hidden="true" className="h-36 w-72 overflow-hidden rounded-lg">
            <CardFan
              covers={[
                { key: "a", src: PORTRAIT_SAMPLE_ART },
                { key: "b", src: PORTRAIT_SAMPLE_ART },
                { key: "c", src: PORTRAIT_SAMPLE_ART },
              ]}
            />
          </CoverBand>
        </Swatch>
        <Swatch label="outline">
          <CoverBand aria-hidden="true" className="h-36 w-72 overflow-hidden rounded-lg">
            <CardFanOutline />
          </CoverBand>
        </Swatch>
      </DemoRow>
      <DemoRow
        label="CardArtThumbStack"
        hint="Overlapping thumbs with a +N pill — one row standing for many cards (aggregated activity events, batch summaries). max caps the visible thumbs."
      >
        <Swatch label="3 items">
          <CardArtThumbStack
            items={Array.from({ length: 3 }, (_, index) => ({
              key: `s${index}`,
              src: PORTRAIT_SAMPLE_ART,
            }))}
          />
        </Swatch>
        <Swatch label="8 items, max 5 → +3">
          <CardArtThumbStack
            items={Array.from({ length: 8 }, (_, index) => ({
              key: `m${index}`,
              src: PORTRAIT_SAMPLE_ART,
            }))}
          />
        </Swatch>
        <Swatch label="thumbClassName=w-10">
          <CardArtThumbStack
            thumbClassName="w-10"
            items={Array.from({ length: 4 }, (_, index) => ({
              key: `l${index}`,
              src: PORTRAIT_SAMPLE_ART,
            }))}
          />
        </Swatch>
      </DemoRow>
    </DemoSection>
  );
}

function FormControlsSection() {
  const [date, setDate] = useState<string | undefined>();
  const [energy, setEnergy] = useState("any");
  const [copies, setCopies] = useState(2);
  const energyItems = [
    { value: "any", label: "Any energy" },
    { value: "low", label: "0–2 energy" },
    { value: "high", label: "6+ energy" },
  ];
  return (
    <DemoSection
      id="form-controls"
      title="Form controls"
      note="Date entry always via DatePicker. Selects pass items when values differ from labels."
    >
      <DemoGrid>
        <Demo
          name="Field + Input"
          hint="Label, control, helper text. The standard form row."
          spec="input h-8 · text-base mobile, md:text-sm"
        >
          <Field>
            <FieldLabel htmlFor="design-name">Deck name</FieldLabel>
            <Input id="design-name" placeholder="Jinx Aggro" />
            <FieldDescription>Shown on your public deck page.</FieldDescription>
          </Field>
        </Demo>
        <Demo name="Field (invalid)" hint="aria-invalid on the control drives the error styling.">
          <Field data-invalid>
            <FieldLabel htmlFor="design-code">Deck code</FieldLabel>
            <Input id="design-code" aria-invalid placeholder="RIFT-…" />
            <FieldError>That code doesn&apos;t look right.</FieldError>
          </Field>
        </Demo>
        <Demo name="Textarea" hint="Multi-line free text, auto-growing.">
          <Field>
            <FieldLabel htmlFor="design-notes">Notes</FieldLabel>
            <Textarea id="design-notes" placeholder="Mulligan aggressively for early units…" />
          </Field>
        </Demo>
        <Demo
          name="Select"
          hint="Pass items when values differ from labels (BaseUI quirk)."
          spec="trigger h-8 · keep the default size in top bars, never size=sm"
        >
          <Select
            items={energyItems}
            value={energy}
            onValueChange={(v) => {
              if (v !== null) {
                setEnergy(v);
              }
            }}
          >
            <SelectTrigger aria-label="Energy cost">
              <SelectValue placeholder="Pick a range" />
            </SelectTrigger>
            <SelectContent>
              {energyItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Demo>
        <Demo name="DatePicker" hint="The only sanctioned date entry. Never a raw date input.">
          <DatePicker value={date} onChange={setDate} onClear={() => setDate(undefined)} />
        </Demo>
        <Demo
          name="QuantityStepper"
          hint="How many copies an action touches. `editable` swaps the value for a typable field, for bounds too large to click to. The Field form adds the boxed label row the dialogs use."
          spec="icon buttons size-8 · value w-8 tabular-nums (or w-16 input) · clamped to min/max"
        >
          <div className="w-full space-y-3">
            <QuantityStepper value={copies} onValueChange={setCopies} max={4} />
            <QuantityStepper value={copies} onValueChange={setCopies} max={4} editable />
            <QuantityStepperField
              label="Copies to move"
              value={copies}
              onValueChange={setCopies}
              max={4}
            />
          </div>
        </Demo>
        <Demo name="Checkbox" hint="Binary option in forms and filter panels.">
          <Label className="flex items-center gap-2">
            <Checkbox defaultChecked /> Foils only
          </Label>
        </Demo>
        <Demo name="RadioGroup" hint="Exclusive choice when all options should stay visible.">
          <RadioGroup defaultValue="all" className="flex items-center gap-4">
            <Label className="flex items-center gap-2">
              <RadioGroupItem value="all" /> All
            </Label>
            <Label className="flex items-center gap-2">
              <RadioGroupItem value="owned" /> Owned
            </Label>
          </RadioGroup>
        </Demo>
        <Demo name="Switch" hint="Instant-effect setting, not a form field.">
          <Label className="flex items-center gap-2">
            <Switch defaultChecked /> Show prices
          </Label>
        </Demo>
        <Demo name="Slider" hint="Numeric range entry (e.g. column count, max energy).">
          <Slider defaultValue={[3]} max={10} className="w-40" aria-label="Max energy" />
        </Demo>
        <Demo name="InputGroup" hint="Input with addon slots. SearchInput builds on this.">
          <InputGroup className="w-56">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search cards…" />
          </InputGroup>
        </Demo>
        <Demo name="InputOTP" hint="Verification-code entry (email codes).">
          <InputOTP maxLength={6}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Demo>
        <Demo name="Kbd" hint="Keyboard shortcut hints in menus and palettes.">
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Demo>
        <Demo
          name="Control row"
          hint="Boxed controls in one row share the h-8 tier: default Select, Input, and Button align. Never mix in sm/xs boxes."
          spec="all boxed controls h-8 · compact sizes never mix in (docs/design-language.md)"
          className="sm:col-span-2"
        >
          <div className="flex w-full items-center gap-2">
            <Select
              items={energyItems}
              value={energy}
              onValueChange={(v) => {
                if (v !== null) {
                  setEnergy(v);
                }
              }}
            >
              <SelectTrigger className="w-36 shrink-0" aria-label="Kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {energyItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Value…" className="flex-1" aria-label="Value" />
            <Button variant="outline">
              <PlusIcon /> Add
            </Button>
          </div>
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}

const CHAMPIONS = ["Ahri", "Jinx", "Teemo", "Viktor", "Yasuo"];

function PickersSection() {
  const [champions, setChampions] = useState<string[]>(["Jinx"]);
  const [highlighted, setHighlighted] = useState("");
  const [groupHighlighted, setGroupHighlighted] = useState("");
  const [searchableHighlighted, setSearchableHighlighted] = useState("");
  return (
    <DemoSection
      id="pickers"
      title="Pickers & commands"
      note="Combobox for searchable selects, Command for palettes, PickerList for keyboard-driven popover lists."
    >
      <DemoGrid>
        <Demo name="Combobox" hint="Searchable (multi-)select behind a trigger.">
          <Combobox<string, true>
            multiple
            items={CHAMPIONS}
            value={champions}
            onValueChange={setChampions}
          >
            <ComboboxTrigger
              render={<Button variant="outline" />}
              className={cn(
                "w-56 justify-between font-normal",
                champions.length === 0 && "text-muted-foreground",
              )}
            >
              <span className="truncate">
                {champions.length === 0 ? "Pick legends…" : champions.join(" + ")}
              </span>
            </ComboboxTrigger>
            <ComboboxContent className="w-(--anchor-width) min-w-56">
              <ComboboxInput placeholder="Search legends…" showTrigger={false} />
              <ComboboxEmpty>No matching legend.</ComboboxEmpty>
              <ComboboxList>
                {(name: string) => (
                  <ComboboxItem key={name} value={name}>
                    {name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Demo>
        <Demo name="Command" hint="cmdk palette: typed search over grouped actions.">
          <Command className="w-full max-w-64 rounded-lg border">
            <CommandInput placeholder="Quick add…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Cards">
                {CHAMPIONS.slice(0, 3).map((name) => (
                  <CommandItem key={name} onSelect={() => toast(`Added ${name}`)}>
                    {name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </Demo>
        <Demo name="PickerList" hint="Keyboard-navigable row list for popovers (arrows + Enter).">
          <div className="w-full max-w-56 rounded-lg border">
            <PickerList highlightedId={highlighted} onHighlightChange={setHighlighted}>
              {CHAMPIONS.slice(0, 3).map((name) => (
                <PickerRow key={name} value={name} onSelect={() => toast(`Picked ${name}`)}>
                  {name}
                </PickerRow>
              ))}
            </PickerList>
          </div>
        </Demo>
        <Demo
          name="PickerGroup"
          hint="Labels a band of related rows. Keyboard nav skips the heading."
        >
          <div className="w-full max-w-56 rounded-lg border">
            <PickerList highlightedId={groupHighlighted} onHighlightChange={setGroupHighlighted}>
              <PickerGroup label="Binder A">
                {CHAMPIONS.slice(0, 2).map((name) => (
                  <PickerRow key={name} value={name} onSelect={() => toast(`Picked ${name}`)}>
                    {name}
                  </PickerRow>
                ))}
              </PickerGroup>
              <PickerGroup label="Shoebox">
                {CHAMPIONS.slice(2, 4).map((name) => (
                  <PickerRow key={name} value={name} onSelect={() => toast(`Picked ${name}`)}>
                    {name}
                  </PickerRow>
                ))}
              </PickerGroup>
            </PickerList>
          </div>
        </Demo>
        <Demo
          name="PickerList (searchable)"
          hint="searchPlaceholder adds a type-to-filter input; rows match on their keywords."
        >
          <div className="w-full max-w-56 rounded-lg border">
            <PickerList
              searchPlaceholder="Filter legends…"
              highlightedId={searchableHighlighted}
              onHighlightChange={setSearchableHighlighted}
            >
              <CommandEmpty>No matching legend.</CommandEmpty>
              {CHAMPIONS.map((name) => (
                <PickerRow
                  key={name}
                  value={name}
                  keywords={[name]}
                  onSelect={() => toast(`Picked ${name}`)}
                >
                  {name}
                </PickerRow>
              ))}
            </PickerList>
          </div>
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}

function OverlaysSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <DemoSection
      id="overlays"
      title="Overlays"
      note="Triggers pass primitives via the render prop. Every overlay needs a title for screen readers."
    >
      <DemoRow
        label="Dialogs & panels"
        hint="Dialog for tasks, AlertDialog for confirmations, Sheet for side panels, Drawer for mobile bottom sheets."
      >
        <Button variant="outline" onClick={() => setDialogOpen(true)}>
          Dialog
        </Button>
        <Button variant="outline" onClick={() => setAlertOpen(true)}>
          Alert dialog
        </Button>
        <Button variant="outline" onClick={() => setSheetOpen(true)}>
          Sheet
        </Button>
        <Button variant="outline" onClick={() => setDrawerOpen(true)}>
          Drawer
        </Button>
      </DemoRow>
      <DemoRow
        label="Menus & popovers"
        hint="DropdownMenu for actions, Popover for rich content, Tooltip for icon labels, InfoHint for field explanations (tooltip on desktop, tap-open popover on touch), HoverCard for link previews, ContextMenu on right-click."
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline">
                Menu <ChevronDownIcon />
              </Button>
            }
          />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => toast("Renamed")}>Rename</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => toast("Deleted")}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Popover>
          <PopoverTrigger render={<Button variant="outline">Popover</Button>} />
          <PopoverContent className="w-56 text-sm">
            Anything can live here, like the owned-collections breakdown.
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger render={<Button variant="outline">Tooltip</Button>} />
          <TooltipContent>Exact copies owned, including foils.</TooltipContent>
        </Tooltip>
        <span className="flex items-center gap-1 text-sm font-medium">
          Info hint
          <InfoHint label="Info hint">
            Compares each printing&apos;s latest market price on the marketplace you pick.
          </InfoHint>
        </span>
        <HoverCard>
          <HoverCardTrigger render={<Button variant="link">Hover card</Button>} />
          <HoverCardContent className="text-sm">
            Rich preview content, like a card image on name hover.
          </HoverCardContent>
        </HoverCard>
        <ContextMenu>
          <ContextMenuTrigger className="text-muted-foreground rounded-lg border border-dashed px-4 py-2 text-sm">
            Right-click me
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onClick={() => toast("Added to wishlist")}>
              Add to wishlist
            </ContextMenuItem>
            <ContextMenuItem onClick={() => toast("Added to tradelist")}>
              Add to tradelist
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </DemoRow>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogForm onSubmit={() => setDialogOpen(false)}>
            <DialogHeader>
              <DialogTitle>Rename deck</DialogTitle>
              <DialogDescription>Pick something your group will recognize.</DialogDescription>
            </DialogHeader>
            <Input placeholder="Jinx Aggro" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </DialogForm>
        </DialogContent>
      </Dialog>
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <DialogForm onSubmit={() => setAlertOpen(false)}>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this deck?</AlertDialogTitle>
              <AlertDialogDescription>
                The deck and its plans are removed. Cards in your collection stay untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </DialogForm>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Side panel for secondary workflows.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerTitle className="p-4">Mobile drawer</DrawerTitle>
          <p className="text-muted-foreground px-4 pb-8 text-sm">
            Bottom sheet used for mobile flows like the quick-add palette.
          </p>
        </DrawerContent>
      </Drawer>
    </DemoSection>
  );
}

function FeedbackSection() {
  return (
    <DemoSection
      id="feedback"
      title="Feedback & status"
      note="Toasts via sonner. Alert for inline callouts, Empty for zero states, Skeleton while loading."
    >
      <DemoGrid>
        <Demo name="Toaster (sonner)" hint="Transient result feedback after an action.">
          <Button variant="outline" onClick={() => toast.success("Added 4× Teemo, Swift Scout")}>
            Success toast
          </Button>
          <Button variant="outline" onClick={() => toast.error("Could not copy deck code")}>
            Error toast
          </Button>
        </Demo>
        <Demo name="Alert" hint="Persistent inline callout inside the page flow.">
          <div className="w-full space-y-2">
            <Alert>
              <InfoIcon />
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>Prices refresh once a day.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <TriangleAlertIcon />
              <AlertTitle>Import failed</AlertTitle>
              <AlertDescription>3 lines could not be matched to the catalog.</AlertDescription>
            </Alert>
          </div>
        </Demo>
        <Demo name="Progress" hint="Determinate completion (imports, collection goals).">
          <Progress value={64} className="w-40" aria-label="Collection progress" />
        </Demo>
        <Demo name="Skeleton" hint="Loading placeholder shaped like the coming content.">
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </Demo>
        <Demo name="Avatar" hint="Raw primitive; app code goes through UserAvatar (Composites).">
          <Avatar>
            <AvatarFallback>SK</AvatarFallback>
          </Avatar>
        </Demo>
        <Demo name="Empty" hint="Zero state with icon, copy, and one clear next action.">
          <Empty className="w-full border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageIcon />
              </EmptyMedia>
              <EmptyTitle>No decks yet</EmptyTitle>
              <EmptyDescription>Build your first deck to see it here.</EmptyDescription>
            </EmptyHeader>
            <Button size="sm">
              <PlusIcon /> New deck
            </Button>
          </Empty>
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}

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

// One captioned row inside the trade-chip demo: the chips sweep a mode, the
// caption names it. Hover a chip for the tooltip the strip modes rely on.
function TradeChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-2xs font-mono">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/**
 * Local stand-in for the search-scope store's toggle, so the demo chip behaves
 * like the real one — including its refusal to leave the scope empty.
 * @returns The next scope.
 */
function toggleDemoScope(scope: SearchField[], field: SearchField): SearchField[] {
  if (!scope.includes(field)) {
    return [...scope, field];
  }
  const next = scope.filter((entry) => entry !== field);
  return next.length > 0 ? next : scope;
}

const DEMO_LEGEND = "Lux, Lady of Luminosity";

function MetaArchiveSection() {
  const [scope, setScope] = useState<MetaScope>({});
  // The live eras, not a fixture: the dropdown is only reviewable if it shows
  // the set boundaries the archive will actually offer.
  const eras = useMetaEras();
  return (
    <DemoSection
      id="meta-archive"
      title="Meta archive"
      note="The archive's shared identity pieces. Every /meta surface composes these rather than rolling its own: one tier badge, one identity unit, one scope bar."
      docs="components/meta/"
    >
      <SwatchRow
        label="MetaTierBadge"
        hint="Gold is the archive's colour for winning, so only Premier carries the accent hairline. Competitive's teal is written out for both themes because the dark primary is amber and a themed outline would land back on the Premier gold."
      >
        {(["premier", "competitive", "store", "casual"] as const).map((tier) => (
          <Swatch key={tier} label={tier} colors>
            <MetaTierBadge tier={tier} />
          </Swatch>
        ))}
      </SwatchRow>

      <DemoRow
        label="MetaIdentity"
        hint="Champion name, legend card title, domain runes. The card title always renders — the compact top-8 bracket is the one surface allowed to drop it. Pass a slug to link the champion; omit it inside a wrapper that is itself a link."
        className="items-start gap-6"
      >
        <Demo name="row" hint="Bylines and headers.">
          <MetaIdentity name={DEMO_LEGEND} domains={["order", "calm"]} />
        </Demo>
        <Demo name="stacked" hint="Two-line table cell.">
          <MetaIdentity name={DEMO_LEGEND} domains={["order", "calm"]} layout="stacked" />
        </Demo>
        <Demo name="tile" hint="Deck tiles and winner cards.">
          <MetaIdentity name={DEMO_LEGEND} domains={["order", "calm"]} layout="tile" />
        </Demo>
        <Demo name="championOnly" hint="The compact bracket, and nowhere else.">
          <MetaIdentity name={DEMO_LEGEND} championOnly />
        </Demo>
        <Demo name="linked" hint="Links the champion at its card page.">
          <MetaIdentity name={DEMO_LEGEND} slug="lady-of-luminosity" />
        </Demo>
        <Demo name="untagged" hint="A legend with no champion is all champion.">
          <MetaIdentity name="Emperor of the Sands" />
        </Demo>
      </DemoRow>

      <DemoRow
        label="MetaScopeBar"
        hint="One bar on every archive page: era (set eras derived from release dates, plus all time and a custom range), format, tier, country. The URL wiring lives in useMetaScope; the bar itself is controlled. The country select only appears once there is more than one to choose between."
        className="flex-col items-stretch gap-3"
      >
        <MetaScopeBar
          scope={scope}
          setScope={(patch) => setScope((prev) => ({ ...prev, ...patch }))}
          clearScope={() => setScope({})}
          eras={eras}
          countries={["de", "jp", "us"]}
        />
        <p className="text-muted-foreground text-2xs font-mono">{JSON.stringify(scope)}</p>
      </DemoRow>

      <DemoRow
        label="formatRecord"
        hint="Records always render all three parts. A source with no draw column ran no draws, and a column mixing 5-1 with 5-1-0 reads as two different kinds of number."
      >
        <span className="font-heading tabular-nums">{formatRecord(14, 1, 0)}</span>
        <span className="font-heading tabular-nums">{formatRecord(5, 1, null)}</span>
      </DemoRow>
    </DemoSection>
  );
}

function CompositesSection() {
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

const CHART_DATA = [
  { day: "Mon", value: 4.2 },
  { day: "Tue", value: 4.6 },
  { day: "Wed", value: 4.4 },
  { day: "Thu", value: 5.1 },
  { day: "Fri", value: 5.6 },
  { day: "Sat", value: 5.4 },
  { day: "Sun", value: 6 },
];

const CHART_CONFIG = {
  value: { label: "Price", color: "var(--chart-1)" },
} satisfies ChartConfig;

function LayoutSection() {
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  return (
    <DemoSection
      id="layout"
      title="Layout & data"
      note="Sidebar and NavigationMenu are app chrome; see the admin sidebar and the global header for the live examples."
    >
      <DemoGrid>
        <Demo name="Card" hint="Grouped content block: header, body, footer actions.">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Summoner Skirmish</CardTitle>
              <CardDescription>Saturday · 12 entrants</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">Swiss, 4 rounds, then a cut to top 4.</CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">
                Manage
              </Button>
            </CardFooter>
          </Card>
        </Demo>
        <Demo name="Tabs" hint="Peer views of one surface (not navigation).">
          <Tabs defaultValue="cards" className="w-full">
            <TabsList>
              <TabsTrigger value="cards">Cards</TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
            </TabsList>
            <TabsContent value="cards" className="text-muted-foreground text-sm">
              Tab content renders here.
            </TabsContent>
            <TabsContent value="stats" className="text-muted-foreground text-sm">
              Energy curve, domains, formats.
            </TabsContent>
          </Tabs>
        </Demo>
        <Demo name="ChartContainer" hint="Recharts wrapper; config drives themed var(--color-*).">
          <ChartContainer config={CHART_CONFIG} className="aspect-auto h-16 w-full">
            <AreaChart data={CHART_DATA} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                fill="var(--color-value)"
                fillOpacity={0.15}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ChartContainer>
        </Demo>
        <Demo
          name="Table"
          hint="Static data table. Card browsers use the virtualized card table instead."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Card</TableHead>
                <TableHead>Set</TableHead>
                <TableHead className="text-right">Owned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Teemo, Swift Scout</TableCell>
                <TableCell>Origins</TableCell>
                <TableCell className="text-right tabular-nums">4</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Jinx, Loose Cannon</TableCell>
                <TableCell>Origins</TableCell>
                <TableCell className="text-right tabular-nums">2</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Demo>
        <Demo name="Accordion" hint="Stacked disclosure list; one item open at a time.">
          <Accordion className="w-full">
            <AccordionItem value="rules">
              <AccordionTrigger>Deck rules</AccordionTrigger>
              <AccordionContent>40 cards minimum, 3 copies max.</AccordionContent>
            </AccordionItem>
            <AccordionItem value="legends">
              <AccordionTrigger>Legends</AccordionTrigger>
              <AccordionContent>Exactly one legend per deck.</AccordionContent>
            </AccordionItem>
          </Accordion>
        </Demo>
        <Demo name="Collapsible" hint="Single hide/show region behind its own trigger.">
          <Collapsible
            open={collapsibleOpen}
            onOpenChange={setCollapsibleOpen}
            className="w-full space-y-2"
          >
            <CollapsibleTrigger
              render={
                <Button variant="outline" size="sm">
                  {collapsibleOpen ? "Hide" : "Show"} advanced <ChevronDownIcon />
                </Button>
              }
            />
            <CollapsibleContent className="text-muted-foreground text-sm">
              Collapsed-by-default extras live here.
            </CollapsibleContent>
          </Collapsible>
        </Demo>
        <Demo name="ScrollArea" hint="Styled scrollbars for fixed-height overflow regions.">
          <ScrollArea className="h-24 w-48 rounded-md border p-2 text-sm">
            {[...CHAMPIONS, ...CHAMPIONS].map((name, index) => (
              <p key={index} className="py-0.5">
                {name}
              </p>
            ))}
          </ScrollArea>
        </Demo>
        <Demo name="Separator" hint="Hairline divider, horizontal or vertical.">
          <div className="w-full space-y-2 text-sm">
            <p>Above</p>
            <Separator />
            <div className="flex h-5 items-center gap-2">
              <span>Left</span>
              <Separator orientation="vertical" />
              <span>Right</span>
            </div>
          </div>
        </Demo>
        <Demo name="Calendar" hint="Month grid; usually reached through DatePicker.">
          <Calendar mode="single" className="rounded-md border" />
        </Demo>
      </DemoGrid>
    </DemoSection>
  );
}
