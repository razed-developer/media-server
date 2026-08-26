import { Check } from "lucide-react";

export function SetupWelcomeStep({
  onFreshInstall,
  onRestore,
}: {
  onFreshInstall: () => void;
  onRestore: () => void;
}) {
  return (
    <section>
      <p className="eyebrow">CHOOSE INSTALL TYPE</p>
      <h1>Welcome to Onyx.</h1>
      <p className="setup-lead">
        Start a new Onyx library or restore an existing installation from an
        encrypted backup.
      </p>
      <div className="install-choice-grid">
        <button className="install-choice primary" onClick={onFreshInstall}>
          <strong>Fresh installation</strong>
          <span>
            Create profiles, choose an appearance, and select media folders.
          </span>
        </button>
        <button className="install-choice" onClick={onRestore}>
          <strong>Import from backup</strong>
          <span>
            Restore profiles, history, settings, credentials, and media
            locations.
          </span>
        </button>
      </div>
    </section>
  );
}

export function SetupFinishStep({
  onBack,
  onFinish,
}: {
  onBack: () => void;
  onFinish: () => void;
}) {
  return (
    <section>
      <Check size={40} />
      <h1>Onyx is ready.</h1>
      <p className="setup-lead">
        You can change every option later from Settings. iBroadcast remains
        optional and compartmentalized from Movies and TV.
      </p>
      <div className="setup-actions">
        <button onClick={onBack}>Back</button>
        <button className="primary" onClick={onFinish}>
          Finish setup
        </button>
      </div>
    </section>
  );
}
