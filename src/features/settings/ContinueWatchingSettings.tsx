interface ContinueWatchingSettingsProps {
  split: boolean;
  onChange: (split: boolean) => void;
}

export function ContinueWatchingSettings({
  split,
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
          value={split ? "split" : "combined"}
          onChange={(event) => onChange(event.target.value === "split")}
        >
          <option value="combined">
            One row — movies and shows use posters
          </option>
          <option value="split">
            Separate movie and TV rows — episodes use thumbnails
          </option>
        </select>
      </label>
    </div>
  );
}
