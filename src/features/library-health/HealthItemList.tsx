import { CheckCircle2, RefreshCw } from "lucide-react";
import type { LibraryHealthItem } from "../../types";
import { repairable } from "./healthFilters";

interface HealthItemListProps {
  items: LibraryHealthItem[];
  totalItems: number;
  busyItemId: string | null;
  remaining: number;
  loadMoreCount: number;
  onRepair: (id: string) => void;
  onLoadMore: () => void;
}

export function HealthItemList({
  items,
  totalItems,
  busyItemId,
  remaining,
  loadMoreCount,
  onRepair,
  onLoadMore,
}: HealthItemListProps) {
  return (
    <div className="health-list">
      {items.map((item) => (
        <article className="settings-card health-item" key={item.id}>
          <div className="health-item-copy">
            <div className="health-item-heading">
              <strong>
                {item.title}
                {item.year ? ` (${item.year})` : ""}
              </strong>
              <span className={`health-status ${item.status}`}>
                {item.status.replaceAll("-", " ")}
              </span>
              {item.manualMatch && (
                <span className="health-manual">Manual match protected</span>
              )}
            </div>
            <p>{item.issues.join(" · ") || "Metadata and artwork are complete"}</p>
            <code title={item.path}>{item.path}</code>
            {item.status === "unmatched" && (
              <small>
                Ambiguous results remain unchanged. Use Fix Match from the movie
                or show menu to choose one.
              </small>
            )}
          </div>
          {item.status !== "complete" && repairable(item) && (
            <button
              disabled={busyItemId !== null}
              onClick={() => onRepair(item.id)}
            >
              <RefreshCw
                className={busyItemId === item.id ? "spin" : ""}
                size={15}
              />
              {busyItemId === item.id ? "Repairing…" : "Repair metadata"}
            </button>
          )}
        </article>
      ))}
      {totalItems === 0 && (
        <div className="settings-card health-empty">
          <CheckCircle2 /> No items match this filter.
        </div>
      )}
      {remaining > 0 && (
        <button className="health-load-more" onClick={onLoadMore}>
          Show {loadMoreCount} more
        </button>
      )}
    </div>
  );
}
