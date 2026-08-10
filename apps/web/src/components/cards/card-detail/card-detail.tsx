import type { Printing } from "@openrift/shared";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainTintStyle } from "@/lib/domain";
import { formatPublicCode } from "@/lib/format";

import { CardDetailArt } from "./card-detail-art";
import { CardDetailHeading } from "./card-detail-heading";
import { CardDetailLinks } from "./card-detail-links";
import { CardDetailStats } from "./card-detail-stats";
import { CardDetailText } from "./card-detail-text";
import { CardFooter } from "./card-footer";
import { PrintingNotesSection } from "./printing-notes-section";
import { PrintingPicker } from "./printing-picker";

/**
 * Which arrangement the detail renders in. `pane` is the single-column stack
 * used by the docked side pane, the mobile drawer and the standalone card
 * page. `modal` is the two-column arrangement the desktop dialog uses, which
 * collapses back to one column when the dialog itself is narrow.
 */
export type CardDetailLayout = "pane" | "modal";

interface CardDetailProps {
  printing: Printing;
  onClose?: () => void;
  showImages?: boolean;
  onPrevCard?: () => void;
  onNextCard?: () => void;
  onTagClick?: (tag: string) => void;
  onKeywordClick?: (keyword: string) => void;
  printings?: Printing[];
  onSelectPrinting?: (printing: Printing) => void;
  /** Defaults to the single-column `pane` arrangement. */
  layout?: CardDetailLayout;
  /**
   * Surface-specific add controls (deck zone buttons, owned-count stepper, …).
   * Rendered under the printing picker in both layouts, so an overlay never
   * hides the controls that were on the card cell it covers.
   */
  actions?: ReactNode;
  /**
   * Position within the current list, e.g. `7 / 238`. Shown beside the modal's
   * prev/next buttons; the pane has no room for it.
   */
  navLabel?: string;
  /**
   * Modal only: an overlay-owned control (the dock link) placed opposite the
   * card-page link, so the dialog ends in one footer row rather than a stray
   * link under the columns and a separate line beneath it.
   */
  footerSlot?: ReactNode;
}

function BanAlert({ printing }: { printing: Printing }) {
  return (
    <Alert variant="destructive" className="space-y-1.5">
      {printing.card.bans.map((ban) => (
        <div key={ban.formatId}>
          <AlertTitle>
            Banned in {ban.formatName} since {ban.bannedAt}
          </AlertTitle>
          {ban.reason && <AlertDescription className="mt-0.5">{ban.reason}</AlertDescription>}
        </div>
      ))}
    </Alert>
  );
}

/**
 * The full card detail, rendered in one of two arrangements. Both are composed
 * from the same parts so a field added to one is never missing from the other.
 * @returns The card detail.
 */
export function CardDetail({
  printing,
  onClose,
  showImages,
  onPrevCard,
  onNextCard,
  onTagClick,
  onKeywordClick,
  printings,
  onSelectPrinting,
  layout = "pane",
  actions,
  navLabel,
  footerSlot,
}: CardDetailProps) {
  const { card } = printing;
  const domainColors = useDomainColors();
  const setNumber = formatPublicCode(printing);
  const hasBans = card.bans.length > 0;
  const hasPicker =
    printings !== undefined && printings.length > 0 && onSelectPrinting !== undefined;
  const hasNav = onPrevCard !== undefined || onNextCard !== undefined;

  const notes = <PrintingNotesSection printing={printing} />;
  const footer = <CardFooter printing={printing} />;
  const picker = hasPicker ? (
    <PrintingPicker current={printing} printings={printings} onSelect={onSelectPrinting} />
  ) : null;
  const text = <CardDetailText printing={printing} onKeywordClick={onKeywordClick} />;

  if (layout === "modal") {
    return (
      // No domain tint here: the dialog itself carries it, so the gradient
      // reaches the popup's rounded edges. Repeating it on this inner box would
      // paint it inside the dialog's padding, framing it in a hard-edged border.
      <div className="@container flex flex-col gap-4">
        {/* pr-8 keeps the title clear of the dialog's own close button. */}
        <CardDetailHeading
          printing={printing}
          setNumber={setNumber}
          onTagClick={onTagClick}
          titleClassName="pr-8"
        />

        <div className="grid gap-5 @2xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="space-y-3">
            <CardDetailArt printing={printing} showImages={showImages} />
            {hasNav && (
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onPrevCard}
                  disabled={!onPrevCard}
                  aria-label="Previous card"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                {navLabel && (
                  <span className="text-muted-foreground text-sm tabular-nums">{navLabel}</span>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onNextCard}
                  disabled={!onNextCard}
                  aria-label="Next card"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {hasBans && <BanAlert printing={printing} />}
            <CardDetailStats printing={printing} />
            {text}
            {notes}
            {footer}
            {picker}
            {actions}
          </div>
        </div>

        {/* One footer row: leaving the dialog on the left, changing how it is
            shown on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
          <CardDetailLinks card={card} />
          {footerSlot}
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-background overflow-y-auto rounded-lg md:px-3"
      style={getDomainTintStyle(card.domains, domainColors)}
    >
      {/* Mobile header */}
      {onClose && (
        <div
          className="bg-background/75 sticky top-0 z-10 px-4 pt-3 pb-4 backdrop-blur-lg md:hidden"
          // The frosted fill lifts the title off the card art below; the domain tint
          // ties the bar to the card (matching the drawer root). No border here — only
          // the global header keeps a bottom border; the rest separate by blur + spacing.
          style={getDomainTintStyle(card.domains, domainColors)}
        >
          {/* Drag pill hosted inside the blurred header so the blur band reaches the
              drawer's top edge (the drawer's built-in handle stays off — showSwipeHandle defaults to false). */}
          <div className="bg-muted mx-auto mb-3 h-1 w-[100px] rounded-full" />
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close card details"
              className="absolute top-0 right-0"
            >
              <XIcon className="size-4" />
            </Button>
            <CardDetailHeading
              printing={printing}
              setNumber={setNumber}
              onTagClick={onTagClick}
              truncate
              titleClassName="pr-8"
            />
          </div>
        </div>
      )}

      {/* Desktop header */}
      <div className="relative hidden md:block md:pt-4 md:pb-4">
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close card details"
            className="absolute top-4 right-0"
          >
            <XIcon className="size-4" />
          </Button>
        )}
        <CardDetailHeading
          printing={printing}
          setNumber={setNumber}
          onTagClick={onTagClick}
          titleClassName={onClose ? "pr-8" : undefined}
        />
      </div>

      <div className="space-y-4 p-4 md:p-0 md:pb-4">
        {hasBans && <BanAlert printing={printing} />}

        <CardDetailArt printing={printing} showImages={showImages} />

        {/* Stats with mobile prev/next on the sides */}
        <div className="flex items-start gap-2">
          {hasNav && (
            <Button
              variant="outline"
              size="icon"
              onClick={onPrevCard}
              disabled={!onPrevCard}
              aria-label="Previous card"
              className="md:hidden"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
          )}
          <CardDetailStats printing={printing} />
          {hasNav && (
            <Button
              variant="outline"
              size="icon"
              onClick={onNextCard}
              disabled={!onNextCard}
              aria-label="Next card"
              className="md:hidden"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          )}
        </div>

        {text}

        {/* Distribution & printing notes (markers, channels, per-printing comment) */}
        {notes}

        {footer}

        {picker}

        {actions}

        {/* Card details link (only in an overlay, not on the standalone page) */}
        {onClose && <CardDetailLinks card={card} />}
      </div>
    </div>
  );
}
