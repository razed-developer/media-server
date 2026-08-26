import { Palette } from "lucide-react";
import type { ThemeName, UserProfile } from "../../types";

const themes: ThemeName[] = [
  "onyx",
  "midnight",
  "ember",
  "light",
  "pink",
  "royal",
];

const themeLabels: Record<ThemeName, string> = {
  onyx: "Onyx",
  midnight: "Midnight",
  ember: "Ember",
  light: "Light",
  pink: "Light Pink",
  royal: "Royal Purple",
};

interface SetupAppearanceStepProps {
  users: UserProfile[];
  selectedUser: string;
  onUserChange: (userId: string) => void;
  onThemeChange: (theme: ThemeName) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function SetupAppearanceStep({
  users,
  selectedUser,
  onUserChange,
  onThemeChange,
  onBack,
  onContinue,
}: SetupAppearanceStepProps) {
  return (
    <section>
      <Palette size={34} />
      <h1>Appearance</h1>
      <p>Each user can have their own theme. Select a user, then choose a theme.</p>
      <select
        className="setup-select"
        value={selectedUser}
        onChange={(event) => onUserChange(event.target.value)}
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
          </option>
        ))}
      </select>
      <div className="theme-choice-grid">
        {themes.map((value) => (
          <button
            key={value}
            className={`theme-choice theme-${value}`}
            onClick={() => onThemeChange(value)}
          >
            <span />
            <strong>{themeLabels[value]}</strong>
          </button>
        ))}
      </div>
      <div className="setup-actions">
        <button onClick={onBack}>Back</button>
        <button className="primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </section>
  );
}
