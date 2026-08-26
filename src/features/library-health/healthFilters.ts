import type { LibraryHealthItem } from "../../types";

export type HealthFilter =
  | "attention"
  | "all"
  | "complete"
  | "unmatched"
  | "artwork"
  | "information"
  | "missing-file"
  | "probe";

export const repairable = (item: LibraryHealthItem) =>
  item.status !== "missing-file" &&
  !item.issues.every((issue) => issue.includes("probe"));

export function filterHealthItems(
  items: LibraryHealthItem[],
  filter: HealthFilter,
) {
  if (filter === "all") return items;
  if (filter === "complete")
    return items.filter((item) => item.status === "complete");
  if (filter === "attention")
    return items.filter((item) => item.status !== "complete");
  if (filter === "unmatched")
    return items.filter((item) => item.status === "unmatched");
  if (filter === "artwork")
    return items.filter((item) =>
      item.issues.some((issue) => /artwork|poster|backdrop/i.test(issue)),
    );
  if (filter === "information")
    return items.filter((item) =>
      item.issues.some((issue) =>
        /overview|year|season|show name/i.test(issue),
      ),
    );
  if (filter === "missing-file")
    return items.filter((item) => item.status === "missing-file");
  return items.filter((item) =>
    item.issues.some((issue) => issue.includes("probe")),
  );
}
