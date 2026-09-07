import type { ReactNode } from "react";

export interface CardSearchResult {
  id: string;
  label: string;
  sublabel?: ReactNode;
  detail?: ReactNode;
  adornment?: ReactNode;
  leading?: ReactNode;
}
