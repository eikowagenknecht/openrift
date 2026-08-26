import { BoxIcon, CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardMiniRow } from "@/components/cards/card-mini-row";
import { cn } from "@/lib/utils";

import { ClipFrame } from "./clip-frame";

const META_WIDTH = "w-16";

function Thumb({
  shortCode,
  rarity,
  domain = "order",
}: {
  shortCode: string;
  rarity: string;
  domain?: string;
}) {
  return (
    <CardMiniRow
      domains={[domain]}
      rarity={rarity}
      shortCode={shortCode}
      metaClassName={META_WIDTH}
    />
  );
}

function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
      )}
    >
      {checked && <CheckIcon className="size-3.5" />}
    </span>
  );
}

function Row({
  leading,
  thumb,
  name,
  details,
  trailing,
  muted,
}: {
  leading: ReactNode;
  thumb: ReactNode;
  name: string;
  details?: ReactNode;
  trailing?: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded px-2 py-1 text-sm sm:gap-2">
      {leading}
      {thumb}
      <span className={cn("min-w-0 flex-1 truncate", muted && "text-muted-foreground")}>
        {name}
      </span>
      {details}
      {trailing}
    </div>
  );
}

function Detail({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("text-muted-foreground shrink-0 text-xs", className)}>{children}</span>
  );
}

/** One stacked pair: the state before the tick, and the one after it. */
function Swap({ before, after }: { before: ReactNode; after: ReactNode }) {
  return (
    <span className="inline-grid shrink-0 items-center justify-items-start align-middle">
      <span className="motion-safe:animate-box-before col-start-1 row-start-1">{before}</span>
      <span className="motion-safe:animate-box-after col-start-1 row-start-1 opacity-0">
        {after}
      </span>
    </span>
  );
}

function PickerRow({
  shortCode,
  rarity,
  details,
  count,
  highlighted,
}: {
  shortCode: string;
  rarity: string;
  details?: string;
  count?: number;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-1.5 py-1 text-sm",
        highlighted && "motion-safe:animate-box-pick-row",
      )}
    >
      <Thumb shortCode={shortCode} rarity={rarity} />
      {details && <Detail>{details}</Detail>}
      {count !== undefined && (
        <span className="text-muted-foreground ml-auto text-xs tabular-nums">×{count}</span>
      )}
    </div>
  );
}

function PickerGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-2xs px-1.5 pt-2 pb-0.5 tracking-wide uppercase">
      {children}
    </p>
  );
}

/**
 * The deck's Box tab: one row per physical copy, ticked off as it goes in, with
 * the popover that swaps a row for a different copy of the same card. The
 * animation runs the real order — pick the copy first, then tick it in.
 */
export function BoxVignette() {
  return (
    <ClipFrame className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2">
        <BoxIcon className="text-muted-foreground size-4" aria-hidden="true" />
        <span className="font-medium">
          <span className="tabular-nums">
            <Swap before="12 / 40" after="13 / 40" />
          </span>{" "}
          in Binder
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex h-6 items-center gap-2 border-b">
          <span className="text-muted-foreground text-2xs font-semibold tracking-widest uppercase">
            Main Deck
          </span>
          <span className="ml-auto text-xs tabular-nums">
            <Swap
              before={<span className="text-muted-foreground">2/4</span>}
              after={<span className="text-green-600 dark:text-green-500">3/4</span>}
            />
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <Row
            leading={<Tick checked />}
            thumb={<Thumb shortCode="SFD-154" rarity="common" />}
            name="Guards!"
          />
          <Row
            leading={<Tick checked />}
            thumb={<Thumb shortCode="OGN-213" rarity="common" />}
            name="Hidden Blade"
          />
          <div className="relative">
            <Row
              leading={<Swap before={<Tick checked={false} />} after={<Tick checked />} />}
              thumb={
                <Swap
                  before={<Thumb shortCode="SFD-177a" rarity="showcase" />}
                  after={<Thumb shortCode="SFD-177" rarity="epic" />}
                />
              }
              name="Azir, Sovereign"
              details={<Detail className="motion-safe:animate-box-before">Showcase</Detail>}
              trailing={
                <span className="text-muted-foreground motion-safe:animate-box-before flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-xs">
                  <span>Binder</span>
                  <span>+2</span>
                </span>
              }
            />
            <div className="bg-popover text-popover-foreground ring-foreground/10 motion-safe:animate-box-picker absolute top-full right-0 z-10 mt-1 w-72 rounded-lg text-sm opacity-0 shadow-md ring-1">
              <p className="text-muted-foreground px-2.5 pt-2 text-xs">Take this copy instead</p>
              <div className="p-1">
                <PickerGroupLabel>Binder</PickerGroupLabel>
                <PickerRow shortCode="SFD-177" rarity="epic" highlighted />
                <PickerGroupLabel>Bulk box</PickerGroupLabel>
                <PickerRow shortCode="SFD-177a" rarity="showcase" details="Showcase" count={2} />
              </div>
            </div>
          </div>
          <Row
            leading={<span aria-hidden="true" className="size-4 shrink-0" />}
            thumb={<Thumb shortCode="OGN-030" rarity="rare" domain="fury" />}
            name="Jinx, Demolitionist"
            muted
            trailing={<Detail>not owned</Detail>}
          />
        </div>
      </div>
    </ClipFrame>
  );
}
