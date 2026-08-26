import { IbroadcastConnect } from "../../components/IbroadcastConnect";
import { IbroadcastLogoKit } from "../../components/IbroadcastLogoKit";

interface MusicSettingsProps {
  clientId: string;
  onClientIdChange: (clientId: string) => void;
  onSave: () => void;
  onConnected: () => void;
}

export function MusicSettings({
  clientId,
  onClientIdChange,
  onSave,
  onConnected,
}: MusicSettingsProps) {
  return (
    <>
      <p className="eyebrow">PROVIDER</p>
      <h1>iBroadcast</h1>
      <IbroadcastLogoKit />
      <label className="setup-field">
        <span>Onyx iBroadcast client ID</span>
        <input
          value={clientId}
          onChange={(event) => onClientIdChange(event.target.value)}
          placeholder="Client ID"
        />
        <button onClick={onSave}>Save</button>
      </label>
      <IbroadcastConnect onConnected={onConnected} />
    </>
  );
}
