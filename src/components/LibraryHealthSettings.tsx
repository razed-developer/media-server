import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  ImageOff,
  Link2Off,
  RefreshCw,
  Stethoscope,
  Wrench,
} from "lucide-react";
import {
  getLibraryHealth,
  repairLibraryHealth,
  repairLibraryHealthItem,
} from "../api";
import type {
  LibraryHealthItem,
  LibraryHealthReport,
  LibraryRepairReport,
} from "../types";
import "../libraryHealth.css";

type Filter =
  | "attention"
  | "all"
  | "complete"
  | "unmatched"
  | "artwork"
  | "information"
  | "missing-file"
  | "probe";

const repairable = (item: LibraryHealthItem) =>
  item.status !== "missing-file" &&
  !item.issues.every((issue) => issue.includes("probe"));

export function LibraryHealthSettings({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const [report, setReport] = useState<LibraryHealthReport | null>(null);
  const [filter, setFilter] = useState<Filter>("attention");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LibraryRepairReport | null>(null);

  const load = async () => {
    setError(null);
    try {
      setReport(await getLibraryHealth());
    } catch (cause) {
      setError(String(cause));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const items = useMemo(() => {
    if (!report) return [];
    if (filter === "all") return report.items;
    if (filter === "complete")
      return report.items.filter((item) => item.status === "complete");
    if (filter === "attention")
      return report.items.filter((item) => item.status !== "complete");
    if (filter === "unmatched")
      return report.items.filter((item) => item.status === "unmatched");
    if (filter === "artwork")
      return report.items.filter((item) =>
        item.issues.some((issue) => /artwork|poster|backdrop/i.test(issue)),
      );
    if (filter === "information")
      return report.items.filter((item) =>
        item.issues.some((issue) =>
          /overview|year|season|show name/i.test(issue),
        ),
      );
    if (filter === "missing-file")
      return report.items.filter((item) => item.status === "missing-file");
    return report.items.filter((item) =>
      item.issues.some((issue) => issue.includes("probe")),
    );
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
        <button disabled={busy !== null} onClick={() => void load()}>
          <RefreshCw className={busy ? "spin" : ""} size={16} /> Refresh
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
          <div className="health-summary">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              <Stethoscope />
              <strong>{report.total}</strong>
              <span>Total</span>
            </button>
            <button
              className={filter === "attention" ? "active" : ""}
              onClick={() => setFilter("attention")}
            >
              <AlertTriangle />
              <strong>{report.needsAttention}</strong>
              <span>Needs attention</span>
            </button>
            <button
              className={filter === "complete" ? "active" : ""}
              onClick={() => setFilter("complete")}
            >
              <CheckCircle2 />
              <strong>{report.complete}</strong>
              <span>Complete</span>
            </button>
            <button
              className={filter === "unmatched" ? "active" : ""}
              onClick={() => setFilter("unmatched")}
            >
              <Link2Off />
              <strong>{report.unmatched}</strong>
              <span>Unmatched</span>
            </button>
            <button
              className={filter === "artwork" ? "active" : ""}
              onClick={() => setFilter("artwork")}
            >
              <ImageOff />
              <strong>{report.missingArtwork}</strong>
              <span>Artwork</span>
            </button>
            <button
              className={filter === "information" ? "active" : ""}
              onClick={() => setFilter("information")}
            >
              <AlertTriangle />
              <strong>{report.missingInformation}</strong>
              <span>Information</span>
            </button>
            <button
              className={filter === "probe" ? "active" : ""}
              onClick={() => setFilter("probe")}
            >
              <Stethoscope />
              <strong>{report.probeFailed}</strong>
              <span>Media probe</span>
            </button>
            <button
              className={filter === "missing-file" ? "active" : ""}
              onClick={() => setFilter("missing-file")}
            >
              <FileQuestion />
              <strong>{report.missingFiles}</strong>
              <span>Missing files</span>
            </button>
          </div>

          <div className="health-toolbar">
            <span>
              {items.length} {items.length === 1 ? "item" : "items"} shown
            </span>
            <button
              className="primary"
              disabled={busy !== null || report.needsAttention === 0}
              onClick={() => void runRepair()}
            >
              <Wrench size={16} />{" "}
              {busy === "all" ? "Repairing…" : "Repair all incomplete metadata"}
            </button>
          </div>

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
                      <span className="health-manual">
                        Manual match protected
                      </span>
                    )}
                  </div>
                  <p>
                    {item.issues.join(" · ") ||
                      "Metadata and artwork are complete"}
                  </p>
                  <code title={item.path}>{item.path}</code>
                  {item.status === "unmatched" && (
                    <small>
                      Ambiguous results remain unchanged. Use Fix Match from the
                      movie or show menu to choose one.
                    </small>
                  )}
                </div>
                {item.status !== "complete" && repairable(item) && (
                  <button
                    disabled={busy !== null}
                    onClick={() => void runRepair(item.id)}
                  >
                    <RefreshCw
                      className={busy === item.id ? "spin" : ""}
                      size={15}
                    />
                    {busy === item.id ? "Repairing…" : "Repair metadata"}
                  </button>
                )}
              </article>
            ))}
            {items.length === 0 && (
              <div className="settings-card health-empty">
                <CheckCircle2 /> No items match this filter.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
