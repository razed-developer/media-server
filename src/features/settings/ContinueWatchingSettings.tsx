import type { ContinueWatchingLayout } from "../../types";

interface ContinueWatchingSettingsProps { layout: ContinueWatchingLayout; onChange: (layout: ContinueWatchingLayout) => void; }

export function ContinueWatchingSettings({
  layout,
  onChange,
}: ContinueWatchingSettingsProps) {
  return (
    <div className="settings-card">
      <h3>Continue Watching</h3>
      <p>
        Keep movies and TV together with matching poster-shaped cards, or split
        them so episodes can use their wider thumbnails.
      </p>
      <label className="setup-field">
        <span>Home screen layout</span>
        <select
          value={layout}
          onChange={(event) => onChange(event.target.value as ContinueWatchingLayout)}
        >
          <option value="all">All media in one row</option>
          <option value="movies-shows">Movies and shows in one row</option>
          <option value="movies-shows-split">Movies and shows in two rows</option>
          <option value="movies-shows-others">Movies, shows, and all others in three rows</option>
          <option value="movies-shows-specials">Movies, shows, and specials in one row</option>
          <option value="movies-specials-shows">Movies and specials together; shows separately</option>
        </select>
      </label>
    </div>
  );
}
