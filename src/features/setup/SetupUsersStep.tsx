import { Check, Plus, Save, Users, X } from "lucide-react";
import type { UserProfile } from "../../types";

interface SetupUsersStepProps {
  users: UserProfile[];
  nameDrafts: Record<string, string>;
  newUserOpen: boolean;
  newUserName: string;
  onNameDraftChange: (userId: string, name: string) => void;
  onSaveName: (user: UserProfile) => void;
  onNewUserOpenChange: (open: boolean) => void;
  onNewUserNameChange: (name: string) => void;
  onAddUser: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export function SetupUsersStep({
  users,
  nameDrafts,
  newUserOpen,
  newUserName,
  onNameDraftChange,
  onSaveName,
  onNewUserOpenChange,
  onNewUserNameChange,
  onAddUser,
  onBack,
  onContinue,
}: SetupUsersStepProps) {
  const cancelNewUser = () => {
    onNewUserOpenChange(false);
    onNewUserNameChange("");
  };

  return (
    <section>
      <Users size={34} />
      <h1>Users</h1>
      <p>
        Create the profiles that will have independent watch history, hidden
        media, playlists, themes, and music accounts. The administrator starts
        as “Owner” only as a placeholder; type the name you actually want to
        use.
      </p>
      <div className="setup-user-editor">
        {users.map((user) => {
          const name = nameDrafts[user.id] ?? user.name;
          return (
            <div className="setup-user-row" key={user.id}>
              <div className="user-avatar">{name.charAt(0).toUpperCase()}</div>
              <label>
                <span>
                  {user.isAdmin ? "Administrator profile" : "User profile"}
                </span>
                <input
                  value={name}
                  onChange={(event) =>
                    onNameDraftChange(user.id, event.target.value)
                  }
                  onBlur={() => onSaveName(user)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSaveName(user);
                  }}
                />
              </label>
              <button
                className="icon-action"
                aria-label={`Save ${user.name}`}
                onClick={() => onSaveName(user)}
              >
                <Save size={17} />
              </button>
            </div>
          );
        })}
        {newUserOpen ? (
          <div className="setup-user-row new-user-row">
            <div className="user-avatar">
              {newUserName.charAt(0).toUpperCase() || "+"}
            </div>
            <label>
              <span>New user</span>
              <input
                autoFocus
                value={newUserName}
                onChange={(event) => onNewUserNameChange(event.target.value)}
                placeholder="Name"
                onKeyDown={(event) => {
                  if (event.key === "Enter") onAddUser();
                  if (event.key === "Escape") cancelNewUser();
                }}
              />
            </label>
            <button
              className="icon-action"
              aria-label="Add user"
              onClick={onAddUser}
            >
              <Check size={17} />
            </button>
            <button
              className="icon-action"
              aria-label="Cancel"
              onClick={cancelNewUser}
            >
              <X size={17} />
            </button>
          </div>
        ) : (
          <button
            className="add-user-card"
            onClick={() => onNewUserOpenChange(true)}
          >
            <Plus size={18} />
            Add another user
          </button>
        )}
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
