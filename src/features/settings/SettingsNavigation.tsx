import {
  ArchiveRestore,
  Captions,
  ClipboardList,
  Database,
  HeartPulse,
  Image,
  KeyRound,
  Music2,
  Palette,
  Radio,
  Server,
  Tags,
  TerminalSquare,
  Users,
} from "lucide-react";

export type SettingsCategory =
  | "general"
  | "library"
  | "health"
  | "backup"
  | "metadata"
  | "users"
  | "requests"
  | "appearance"
  | "remote"
  | "music"
  | "subtitles"
  | "live"
  | "cache"
  | "activity";

const entries: Array<{
  category: SettingsCategory;
  label: string;
  icon: typeof Server;
  remoteOnly?: boolean;
}> = [
  { category: "general", label: "General", icon: Server },
  { category: "library", label: "Libraries", icon: Database },
  { category: "backup", label: "Backup & Restore", icon: ArchiveRestore },
  { category: "health", label: "Library Health", icon: HeartPulse },
  { category: "metadata", label: "Metadata", icon: Tags },
  { category: "users", label: "Users", icon: Users },
  { category: "requests", label: "Requests", icon: ClipboardList },
  { category: "appearance", label: "Appearance", icon: Palette },
  {
    category: "remote",
    label: "Remote access",
    icon: KeyRound,
    remoteOnly: true,
  },
  { category: "music", label: "Music", icon: Music2 },
  { category: "subtitles", label: "Subtitles", icon: Captions },
  { category: "live", label: "Live TV", icon: Radio },
  { category: "cache", label: "Cache", icon: Image },
  { category: "activity", label: "Activity", icon: TerminalSquare },
];

interface SettingsNavigationProps {
  active: SettingsCategory;
  canManageRemote: boolean;
  onSelect: (category: SettingsCategory) => void;
}

export function SettingsNavigation({
  active,
  canManageRemote,
  onSelect,
}: SettingsNavigationProps) {
  return (
    <aside className="settings-nav">
      <h2>Settings</h2>
      {entries
        .filter((entry) => !entry.remoteOnly || canManageRemote)
        .map((entry) => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.category}
              className={active === entry.category ? "active" : ""}
              onClick={() => onSelect(entry.category)}
            >
              <Icon size={18} />
              {entry.label}
            </button>
          );
        })}
    </aside>
  );
}
