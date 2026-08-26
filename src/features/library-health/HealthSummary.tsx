import {
  AlertTriangle,
  CheckCircle2,
  FileQuestion,
  ImageOff,
  Link2Off,
  Stethoscope,
} from "lucide-react";
import type { LibraryHealthReport } from "../../types";
import type { HealthFilter } from "./healthFilters";

interface HealthSummaryProps {
  report: LibraryHealthReport;
  activeFilter: HealthFilter;
  onFilterChange: (filter: HealthFilter) => void;
}

export function HealthSummary({
  report,
  activeFilter,
  onFilterChange,
}: HealthSummaryProps) {
  const entries = [
    { filter: "all", icon: Stethoscope, count: report.total, label: "Total" },
    {
      filter: "attention",
      icon: AlertTriangle,
      count: report.needsAttention,
      label: "Needs attention",
    },
    {
      filter: "complete",
      icon: CheckCircle2,
      count: report.complete,
      label: "Complete",
    },
    {
      filter: "unmatched",
      icon: Link2Off,
      count: report.unmatched,
      label: "Unmatched",
    },
    {
      filter: "artwork",
      icon: ImageOff,
      count: report.missingArtwork,
      label: "Artwork",
    },
    {
      filter: "information",
      icon: AlertTriangle,
      count: report.missingInformation,
      label: "Information",
    },
    {
      filter: "probe",
      icon: Stethoscope,
      count: report.probeFailed,
      label: "Media probe",
    },
    {
      filter: "missing-file",
      icon: FileQuestion,
      count: report.missingFiles,
      label: "Missing files",
    },
  ] satisfies Array<{
    filter: HealthFilter;
    icon: typeof Stethoscope;
    count: number;
    label: string;
  }>;

  return (
    <div className="health-summary">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <button
            key={entry.filter}
            className={activeFilter === entry.filter ? "active" : ""}
            onClick={() => onFilterChange(entry.filter)}
          >
            <Icon />
            <strong>{entry.count}</strong>
            <span>{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
}
