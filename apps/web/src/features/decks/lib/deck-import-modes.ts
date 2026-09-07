import type { DeckImportFormat } from "@/features/decks/lib/deck-import-parsers";

export type DeckImportMode = "auto" | DeckImportFormat;

export const IMPORT_MODE_LABELS: Record<DeckImportMode, string> = {
  auto: "Detect automatically",
  text: "Text",
  piltover: "Deck Code",
  tts: "TTS",
};

export const IMPORT_MODE_ORDER: DeckImportMode[] = ["auto", "text", "piltover", "tts"];

export const DETECTED_FORMAT_LABELS: Record<DeckImportFormat, string> = {
  piltover: "deck code",
  text: "text list",
  tts: "TTS string",
};

export const IMPORT_PLACEHOLDERS: Record<DeckImportMode, string> = {
  auto: "Paste your deck here...",
  piltover: "Paste a Piltover Archive deck code...",
  text: "Legend:\n1 Card Name\n\nMainDeck:\n3 Card Name\n...",
  tts: "OGN-001-1 OGN-002-1 OGN-003-1 ...",
};
