import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Wrench } from "lucide-react";
import {
  getLibraryHealth,
  repairLibraryHealth,
  repairLibraryHealthItem,
} from "../../api";
import type { LibraryHealthReport, LibraryRepairReport } from "../../types";
import { HealthItemList } from "./HealthItemList";
import { HealthSummary } from "./HealthSummary";
import { filterHealthItems, type HealthFilter } from "./healthFilters";
import "../../libraryHealth.css";

const PAGE_SIZE = 100;

export function LibraryHealthSettings({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [report, setReport] = useState<LibraryHealthReport | null>(null);
  const [filter, setFilter] = useState<HealthFilter>("attention");
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LibraryRepairReport | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getLibraryHealth());
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const items = useMemo(
    () => filterHealthItems(report?.items ?? [], filter),
    [filter, report],
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, report]);

  const runRepair = async (id?: string) => {
    setBusy(id ?? "all");
    setError(null);
    setResult(null);
    try {
      const next = id
        ? await repairLibraryHealthItem(id)
        : await repairLibraryHealth();
      setReport(next.health);
      setResult(next);
      onChanged?.();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(null);
    }
  };

  const visibleItems = items.slice(0, visibleCount);
  const remaining = Math.max(0, items.length - visibleCount);

  return (
    <>
      <p className="eyebrow">LIBRARY DIAGNOSTICS</p>
      <div className="library-health-title">
        <div>
          <h1>Library Health</h1>
          <p>
            Find and repair incomplete metadata without removing media or
            changing watch history, playlists, or manual matches.
          </p>
        </div>
        <button
          disabled={busy !== null || loading}
          onClick={() => void load()}
        >
          <RefreshCw className={loading ? "spin" : ""} size={16} /> Refresh
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {result && (
        <div className="settings-success health-result">
          Repair finished: {result.repaired} completed, {result.refreshed}{" "}
          refreshed, {result.needsReview} need review, {result.failed} failed.
          {result.failures.length > 0 && (
            <small>{result.failures.slice(0, 3).join(" · ")}</small>
          )}
        </div>
      )}

      {!report ? (
        <div className="settings-card health-loading">
          <RefreshCw className="spin" /> Checking library…
        </div>
      ) : (
        <>
          <HealthSummary
            report={report}
            activeFilter={filter}
            onFilterChange={setFilter}
          />
          <div className="health-toolbar">
            <span>
              {items.length} {items.length === 1 ? "item" : "items"} shown
            </span>
            <button
              className="primary"
              disabled={busy !== null || report.needsAttention === 0}
              onClick={() => void runRepair()}
            >
              <Wrench size={16} />
              {busy === "all" ? "Repairing…" : "Repair all incomplete metadata"}
            </button>
          </div>
          <HealthItemList
            items={visibleItems}
            totalItems={items.length}
            busyItemId={busy}
            remaining={remaining}
            loadMoreCount={Math.min(PAGE_SIZE, remaining)}
            onRepair={(id) => void runRepair(id)}
            onLoadMore={() =>
              setVisibleCount((current) => current + PAGE_SIZE)
            }
          />
        </>
      )}
    </>
  );
}
