/**
 * Props every import input step takes. The step itself stays per-surface (the
 * collections page is a full-width form, the list dialog is a dialog form with
 * its own submit button), but the flow hooks all hand down the same six values,
 * so the shape lives here to keep them from drifting apart.
 */
export interface ImportInputStepProps {
  rawText: string;
  onTextChange: (text: string) => void;
  onParse: (text: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  parseErrors: string[];
}
