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

const BRAND_ICONS: Partial<Record<ContactMethodType, BrandIconData>> = {
  discord: siDiscord,
  signal: siSignal,
  telegram: siTelegram,
  whatsapp: siWhatsapp,
};

const LUCIDE_ICONS: Partial<Record<ContactMethodType, typeof MailIcon>> = {
  phone: PhoneIcon,
  email: MailIcon,
  in_person: UserIcon,
  other: LinkIcon,
};

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

const COMPACT_CHIP_CLASS =
  "bg-muted text-muted-foreground hover:text-foreground inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors";

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
            // Base UI's button primitive stamps role="button" on a non-button render target.
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
  // toSorted is stable, so several values of one type keep the member's own order.
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
