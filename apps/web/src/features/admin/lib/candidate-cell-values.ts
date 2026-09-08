import { stringifyUnknown } from "@openrift/shared/utils";

export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

export function formatValue(value: unknown, suffix?: unknown): string {
  let text: string;
  if (value === null || value === undefined) {
    text = "—";
  } else if (Array.isArray(value)) {
    text = value.length === 0 ? "—" : value.join(", ");
  } else if (typeof value === "object") {
    text = JSON.stringify(value);
  } else if (typeof value === "boolean") {
    text = value ? "Yes" : "No";
  } else {
    text = stringifyUnknown(value);
  }
  if (suffix !== null && suffix !== undefined && suffix !== "") {
    text += ` (${stringifyUnknown(suffix)})`;
  }
  return text;
}
