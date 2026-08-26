import { Music2 } from "lucide-react";
import type { UserProfile } from "../../types";
import { IbroadcastConnect } from "../music/components/IbroadcastConnect";
import { IbroadcastLogoKit } from "../../components/IbroadcastLogoKit";

interface SetupMusicStepProps {
  users: UserProfile[];
  selectedUser: string;
  clientId: string;
  onUserChange: (userId: string) => void;
  onClientIdChange: (clientId: string) => void;
  onSaveClient: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export function SetupMusicStep({
  users,
  selectedUser,
  clientId,
  onUserChange,
  onClientIdChange,
  onSaveClient,
  onBack,
  onContinue,
}: SetupMusicStepProps) {
  return (
    <section>
      <Music2 size={34} />
      <h1>iBroadcast</h1>
      <p>
        Optional. In the iBroadcast web player open <strong>Apps → developer</strong>,
        create an app for Onyx, use the supplied 128×128 PNG below, then copy the
        app’s Client ID into Onyx. Each Onyx profile can authorize its own
        iBroadcast account afterward.
      </p>
      <IbroadcastLogoKit />
      <label className="setup-field">
        <span>iBroadcast client ID</span>
        <input
          value={clientId}
          onChange={(event) => onClientIdChange(event.target.value)}
          placeholder="Client ID"
          onBlur={onSaveClient}
        />
      </label>
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
      <IbroadcastConnect />
      <div className="setup-actions">
        <button onClick={onBack}>Back</button>
        <button className="primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </section>
  );
}
