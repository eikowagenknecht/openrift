import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { QrCode } from "@/components/ui/qr-code";
import { ShareLinkRow } from "@/features/groups/components/share-link-row";

import { DemoRow, DemoSection } from "./demo-primitives";

const DEMO_SHARE_URL = "https://openrift.app/lists/share/AbCdEf123456";

export function QrCodesSection() {
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
