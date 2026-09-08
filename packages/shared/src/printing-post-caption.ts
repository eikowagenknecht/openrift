import { formatPrintingCode } from "./printing-code.js";

export interface PrintingPostCaptionInput {
  cardName: string;
  publicCode: string;
  finishLabel: string;
  channelLabel: string | null;
  markerLabels: readonly string[];
  artist: string;
  imageCredit: string | null;
  cardUrl: string;
  labelText?: string;
  dateText?: string;
}

const HASHTAG_LINE = "#Riftbound #RiftboundPromo";

function headlineSuffix(input: PrintingPostCaptionInput): string {
  if (!input.dateText) {
    return "";
  }
  return input.labelText ? ` · ${input.labelText} ${input.dateText}` : ` · ${input.dateText}`;
}

function captionBlock(input: PrintingPostCaptionInput): string {
  const name = input.channelLabel
    ? `${input.cardName}, ${input.channelLabel} promo`
    : `${input.cardName} promo`;
  const headline = `${name}${headlineSuffix(input)}`;

  const details = [...input.markerLabels, input.finishLabel, formatPrintingCode(input.publicCode)]
    .filter((part) => part.length > 0)
    .join(" · ");

  const credits = input.imageCredit
    ? `Art: ${input.artist} · Image credit: ${input.imageCredit}`
    : `Art: ${input.artist}`;

  return [headline, details, credits, input.cardUrl].join("\n");
}

export function buildPrintingPostCaption(input: PrintingPostCaptionInput): string {
  return [captionBlock(input), HASHTAG_LINE].join("\n");
}

export function buildPrintingsPostCaption(inputs: readonly PrintingPostCaptionInput[]): string {
  if (inputs.length === 0) {
    return "";
  }
  return [inputs.map((input) => captionBlock(input)).join("\n\n"), HASHTAG_LINE].join("\n");
}
