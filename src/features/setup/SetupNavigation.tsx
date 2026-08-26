const steps = [
  "Welcome",
  "Users",
  "Appearance",
  "Media",
  "iBroadcast",
  "Finish",
];

interface SetupNavigationProps {
  activeStep: number;
  onSelect: (step: number) => void;
}

export function SetupNavigation({
  activeStep,
  onSelect,
}: SetupNavigationProps) {
  return (
    <aside className="setup-steps">
      <div className="setup-logo">
        <span className="brand-mark">O</span>
        <strong>Onyx</strong>
      </div>
      {steps.map((label, index) => (
        <button
          key={label}
          className={activeStep === index ? "active" : ""}
          onClick={() => onSelect(index)}
        >
          <span>{index + 1}</span>
          {label}
        </button>
      ))}
    </aside>
  );
}
