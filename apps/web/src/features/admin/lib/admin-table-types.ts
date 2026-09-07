export interface ServerSort {
  key: string;
  direction: "asc" | "desc";
  onChange: (sort: { key: string | null; direction: "asc" | "desc" }) => void;
}
