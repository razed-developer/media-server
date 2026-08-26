import { RefreshCw } from "lucide-react";
import type { ActivityEntry } from "../../types";

interface ActivityConsoleProps {
  entries: ActivityEntry[];
  onRefresh: () => void;
  onClear: () => void;
}

export function ActivityConsole({
  entries,
  onRefresh,
  onClear,
}: ActivityConsoleProps) {
  return (
    <>
      <p className="eyebrow">DIAGNOSTICS</p>
      <h1>Activity Console</h1>
      <div className="activity-toolbar">
        <span>{entries.length} recent events</span>
        <div>
          <button onClick={onRefresh}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button onClick={onClear}>Clear</button>
        </div>
      </div>
      <div className="activity-console">
        {entries.length === 0 ? (
          <div className="activity-empty">No activity recorded yet.</div>
        ) : (
          entries.map((entry, index) => (
            <div className="activity-row" key={`${entry.timestamp}-${index}`}>
              <span className="activity-time">
                {new Date(entry.timestamp * 1000).toLocaleTimeString()}
              </span>
              <span className={`activity-level ${entry.level}`}>
                {entry.level}
              </span>
              <span className="activity-category">{entry.category}</span>
              <span className="activity-message">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
