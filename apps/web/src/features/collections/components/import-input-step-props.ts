/** Shared props for every import input step; each surface renders its own layout around them. */
export interface ImportInputStepProps {
  rawText: string;
  onTextChange: (text: string) => void;
  onParse: (text: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  parseErrors: string[];
}
