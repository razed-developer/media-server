import type { ThemeName } from "../../types";
import { SleepVideoSettings } from "../../components/SleepVideoSettings";

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

interface AppearanceSettingsProps {
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
}

export function AppearanceSettings({
  theme,
  onThemeChange,
}: AppearanceSettingsProps) {
  return (
    <>
      <p className="eyebrow">PROFILE</p>
      <h1>Appearance</h1>
      <div className="theme-choice-grid">
        {themes.map((value) => (
          <button
            key={value}
            className={`theme-choice theme-${value} ${theme === value ? "active" : ""}`}
            onClick={() => onThemeChange(value)}
          >
            <span />
            <strong>{themeLabels[value]}</strong>
          </button>
        ))}
      </div>
      <SleepVideoSettings />
    </>
  );
}
