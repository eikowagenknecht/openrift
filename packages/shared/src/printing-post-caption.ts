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
const DOT = " · ";

function dateSegment(input: PrintingPostCaptionInput): string | null {
  if (!input.dateText) {
    return null;
  }
  return input.labelText ? `${input.labelText} ${input.dateText}` : input.dateText;
}

function captionBlock(input: PrintingPostCaptionInput): string {
  const headline = [input.cardName, input.finishLabel, formatPrintingCode(input.publicCode)]
    .filter((part) => part.length > 0)
    .join(DOT);

  const credits = [
    dateSegment(input),
    input.channelLabel,
    ...input.markerLabels,
    `Art by ${input.artist}`,
    input.imageCredit ? `Image credit: ${input.imageCredit}` : null,
  ]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(DOT);

  return [headline, credits, input.cardUrl].join("\n");
}

export function buildPrintingPostCaption(input: PrintingPostCaptionInput): string {
  return [captionBlock(input), HASHTAG_LINE].join("\n\n");
}

export function buildPrintingsPostCaption(inputs: readonly PrintingPostCaptionInput[]): string {
  if (inputs.length === 0) {
    return "";
  }
  return [inputs.map((input) => captionBlock(input)).join("\n\n"), HASHTAG_LINE].join("\n\n");
}
