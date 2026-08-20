import { CONTACT_METHOD_LABELS, CONTACT_METHOD_TYPES } from "@openrift/shared";
import type { ContactMethod, ContactMethodType } from "@openrift/shared";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  LinkIcon,
  MailIcon,
  PhoneIcon,
  UserIcon,
} from "lucide-react";
import { siDiscord, siSignal, siTelegram, siWhatsapp } from "simple-icons";

import type { BrandIconData } from "@/components/ui/brand-glyph";
import { BrandGlyph } from "@/components/ui/brand-glyph";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pressable } from "@/components/ui/pressable";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

/** Per-channel brand glyph (simple-icons) where one exists. */
const BRAND_ICONS: Partial<Record<ContactMethodType, BrandIconData>> = {
  discord: siDiscord,
  signal: siSignal,
  telegram: siTelegram,
  whatsapp: siWhatsapp,
};

/** Lucide fallbacks for the non-brand channels. */
const LUCIDE_ICONS: Partial<Record<ContactMethodType, typeof MailIcon>> = {
  phone: PhoneIcon,
  email: MailIcon,
  in_person: UserIcon,
  other: LinkIcon,
};

/**
 * The actionable link for a channel, or `null` when the best a viewer can do is
 * copy the value (handles, in-person notes).
 * @returns An absolute href, or `null`.
 */
function contactHref(method: ContactMethod): string | null {
  const trimmed = method.value.trim();
  switch (method.type) {
    case "email": {
      return `mailto:${trimmed}`;
    }
    case "phone": {
      return `tel:${trimmed.replaceAll(/[^+\d]/gu, "")}`;
    }
    case "whatsapp": {
      return `https://wa.me/${trimmed.replaceAll(/\D/gu, "")}`;
    }
    default: {
      return null;
    }
  }
}

function ContactGlyph({
  type,
  className = "size-3.5",
}: {
  type: ContactMethodType;
  className?: string;
}) {
  return (
    <BrandGlyph
      icon={BRAND_ICONS[type]}
      fallback={LUCIDE_ICONS[type] ?? LinkIcon}
      className={className}
    />
  );
}

function ContactChip({ method }: { method: ContactMethod }) {
  const { copied, copy } = useCopyToClipboard();
  const label = CONTACT_METHOD_LABELS[method.type];
  const href = contactHref(method);
  // Badge's scale (h-5, text-xs, px-2): these chips share a row with role and
  // group Badges in the person headers, and a mixed-height chip row reads as
  // clutter rather than one line of facts.
  const chipClass =
    "bg-muted text-muted-foreground inline-flex h-5 max-w-full items-center gap-1.5 rounded-full px-2 text-xs";

  const inner = (
    <>
      <ContactGlyph type={method.type} className="size-3" />
      <span className="truncate">{method.value}</span>
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={cn(chipClass, "hover:text-foreground transition-colors")}
        title={`${label}: ${method.value}`}
      >
        {inner}
      </a>
    );
  }

  return (
    // oxlint-disable-next-line react/forbid-elements -- action chip sharing chipClass with anchor twin; Button would fork the shared styles
    <button
      type="button"
      className={cn(chipClass, "hover:text-foreground transition-colors")}
      title={`Copy ${label}: ${method.value}`}
      onClick={() => void copy(method.value)}
    >
      <ContactGlyph type={method.type} className="size-3" />
      <span className="truncate">{method.value}</span>
      {copied ? (
        <CheckIcon className="size-3 shrink-0" aria-hidden="true" />
      ) : (
        <CopyIcon className="size-3 shrink-0 opacity-60" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * The compact chip's round glyph button, shared by every channel type so the
 * roster row keeps one shape regardless of what the channel can do.
 */
const COMPACT_CHIP_CLASS =
  "bg-muted text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors";

/**
 * The dense chip used in list rows. An icon-only chip that copied on tap read
 * as a mystery button: the value was invisible on touch, and a tap that silently
 * copied surprised anyone who only wanted to read the handle. So every channel
 * type opens the same popover instead, which shows the value and offers Open
 * and Copy explicitly.
 * @returns The chip and its popover.
 */
function ContactChipCompact({ method }: { method: ContactMethod }) {
  const { copied, copy } = useCopyToClipboard();
  const label = CONTACT_METHOD_LABELS[method.type];
  const href = contactHref(method);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Pressable className={COMPACT_CHIP_CLASS} aria-label={`${label}: ${method.value}`} />
        }
      >
        <ContactGlyph type={method.type} />
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {label}
          </span>
          <span className="break-all select-all">{method.value}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {href === null ? null : (
            // A styled anchor rather than `<Button render={<a/>}>`: Base UI's
            // button primitive stamps `role="button"` on a non-button render
            // target, which would announce this external navigation as a
            // button. `buttonVariants` keeps it visually identical to Copy.
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <ExternalLinkIcon />
              Open
            </a>
          )}
          <Button size="sm" variant="outline" onClick={() => void copy(method.value)}>
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Renders a member's revealed contact channels as actionable chips. Renders
 * nothing when there are none.
 * @param methods The channels the viewer is allowed to see.
 * @param className Extra classes for the chip row.
 * @param compact Round icon-only chips for dense rows (the members roster),
 * each opening a popover with the value and its actions. Defaults to the
 * labelled, directly-actionable chips used on the member detail page.
 * @returns The chip row, or `null`.
 */
export function ContactMethodChips({
  methods,
  className,
  compact = false,
}: {
  methods: ContactMethod[];
  className?: string;
  compact?: boolean;
}) {
  if (methods.length === 0) {
    return null;
  }
  // The API returns methods in whatever order each member added them, which
  // made the same channels line up differently row to row. Sort by the
  // canonical channel order instead (the profile settings order); toSorted is
  // stable, so several values of one type keep the member's own order.
  const ordered = methods.toSorted(
    (a, b) => CONTACT_METHOD_TYPES.indexOf(a.type) - CONTACT_METHOD_TYPES.indexOf(b.type),
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {ordered.map((method) =>
        compact ? (
          <ContactChipCompact key={method.id} method={method} />
        ) : (
          <ContactChip key={method.id} method={method} />
        ),
      )}
    </div>
  );
}
