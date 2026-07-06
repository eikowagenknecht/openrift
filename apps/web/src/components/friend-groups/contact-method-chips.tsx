import { CONTACT_METHOD_LABELS } from "@openrift/shared";
import type { ContactMethod, ContactMethodType } from "@openrift/shared";
import { CheckIcon, CopyIcon, LinkIcon, MailIcon, PhoneIcon, UserIcon } from "lucide-react";
import { useState } from "react";
import { siDiscord, siSignal, siTelegram, siWhatsapp } from "simple-icons";

import { cn } from "@/lib/utils";

interface BrandIcon {
  path: string;
}

/** Per-channel brand glyph (simple-icons) where one exists. */
const BRAND_ICONS: Partial<Record<ContactMethodType, BrandIcon>> = {
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

function ContactGlyph({ type }: { type: ContactMethodType }) {
  const brand = BRAND_ICONS[type];
  if (brand) {
    return (
      <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden="true">
        <path d={brand.path} fill="currentColor" />
      </svg>
    );
  }
  const Lucide = LUCIDE_ICONS[type] ?? LinkIcon;
  return <Lucide className="size-3.5 shrink-0" aria-hidden="true" />;
}

function ContactChip({ method }: { method: ContactMethod }) {
  const [copied, setCopied] = useState(false);
  const label = CONTACT_METHOD_LABELS[method.type];
  const href = contactHref(method);
  const chipClass =
    "bg-muted text-muted-foreground inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-sm";

  const inner = (
    <>
      <ContactGlyph type={method.type} />
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
      onClick={async () => {
        await navigator.clipboard.writeText(method.value);
        setCopied(true);
        globalThis.setTimeout(() => setCopied(false), 1500);
      }}
    >
      <ContactGlyph type={method.type} />
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
 * Renders a member's revealed contact channels as actionable chips. Renders
 * nothing when there are none.
 * @returns The chip row, or `null`.
 */
export function ContactMethodChips({
  methods,
  className,
}: {
  methods: ContactMethod[];
  className?: string;
}) {
  if (methods.length === 0) {
    return null;
  }
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {methods.map((method) => (
        <ContactChip key={method.id} method={method} />
      ))}
    </div>
  );
}
