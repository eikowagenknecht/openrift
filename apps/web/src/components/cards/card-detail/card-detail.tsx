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
import { CardHoldingsSection } from "./card-holdings-section";
import { PrintingNotesSection } from "./printing-notes-section";
import { PrintingPicker } from "./printing-picker";

/**
 * Which arrangement the detail renders in. `pane` is the single-column stack
 * used by the docked side pane, the mobile drawer and the standalone card
 * page. `modal` is the two-column arrangement the desktop dialog uses, which
 * collapses back to one column when the dialog itself is narrow.
 */
type CardDetailLayout = "pane" | "modal";

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
  layout?: CardDetailLayout;
  actions?: ReactNode;
  navLabel?: string;
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
  const holdings = <CardHoldingsSection printing={printing} printings={printings} />;
  const footer = <CardFooter printing={printing} />;
  const picker = hasPicker ? (
    <PrintingPicker current={printing} printings={printings} onSelect={onSelectPrinting} />
  ) : null;
  const text = <CardDetailText printing={printing} onKeywordClick={onKeywordClick} />;

  if (layout === "modal") {
    return (
      // No domain tint here: the dialog itself carries it, reaching the popup's rounded edges.
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
            {holdings}
            {footer}
            {picker}
            {actions}
          </div>
        </div>

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
      {onClose && (
        <div
          className="bg-background/80 sticky top-0 z-10 px-4 pt-3 pb-4 backdrop-blur-lg md:hidden"
          style={getDomainTintStyle(card.domains, domainColors)}
        >
          {/* showSwipeHandle stays false: this replaces the drawer's built-in handle. */}
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

        {notes}

        {holdings}

        {footer}

        {picker}

        {actions}

        {onClose && <CardDetailLinks card={card} />}
      </div>
    </div>
  );
}
