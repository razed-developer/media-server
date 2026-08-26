import { Check, Plus, Save, X } from "lucide-react";
import type { UserProfile } from "../../types";
import {
  BUILTIN_AVATARS,
  type UserAvatar,
} from "../../userFeaturesApi";
import { AvatarBadge, UserAvatarPicker } from "../../components/UserAvatarPicker";

interface UsersSettingsProps {
  users: UserProfile[];
  avatars: Record<string, UserAvatar>;
  activeUserId: string;
  nameDrafts: Record<string, string>;
  newUserOpen: boolean;
  newUserName: string;
  newUserAvatar: string;
  onNameDraftChange: (userId: string, name: string) => void;
  onSaveName: (user: UserProfile) => void;
  onChooseUser: (userId: string) => void;
  onRemoveUser: (user: UserProfile) => void;
  onAvatarChanged: (userId: string, avatar: UserAvatar) => void;
  onNewUserOpenChange: (open: boolean) => void;
  onNewUserNameChange: (name: string) => void;
  onNewUserAvatarChange: (avatarId: string) => void;
  onAddUser: () => void;
}

export function UsersSettings({
  users,
  avatars,
  activeUserId,
  nameDrafts,
  newUserOpen,
  newUserName,
  newUserAvatar,
  onNameDraftChange,
  onSaveName,
  onChooseUser,
  onRemoveUser,
  onAvatarChanged,
  onNewUserOpenChange,
  onNewUserNameChange,
  onNewUserAvatarChange,
  onAddUser,
}: UsersSettingsProps) {
  const cancelNewUser = () => {
    onNewUserOpenChange(false);
    onNewUserNameChange("");
  };

  return (
    <>
      <p className="eyebrow">PROFILES</p>
      <h1>Users</h1>
      <div className="settings-user-list">
        {users.map((user) => (
          <div className="settings-card settings-user-profile" key={user.id}>
            <div className="settings-user-row">
              <AvatarBadge avatar={avatars[user.id]} name={user.name} />
              <label>
                <span>
                  {user.isAdmin ? "Administrator profile" : "User profile"}
                </span>
                <input
                  value={nameDrafts[user.id] ?? user.name}
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
                <Save size={16} />
              </button>
              <button onClick={() => onChooseUser(user.id)}>
                {user.id === activeUserId ? "Current" : "Switch"}
              </button>
              {!user.isAdmin && (
                <button
                  className="danger-text"
                  onClick={() => onRemoveUser(user)}
                >
                  Delete
                </button>
              )}
            </div>
            <UserAvatarPicker
              userId={user.id}
              name={nameDrafts[user.id] ?? user.name}
              avatar={avatars[user.id]}
              onChanged={(avatar) => onAvatarChanged(user.id, avatar)}
            />
          </div>
        ))}
        {newUserOpen ? (
          <div className="settings-card settings-user-row">
            <AvatarBadge
              avatar={{ userId: "new", avatarId: newUserAvatar }}
              name={newUserName || "New user"}
            />
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
              <Check size={16} />
            </button>
            <button
              className="icon-action"
              aria-label="Cancel"
              onClick={cancelNewUser}
            >
              <X size={16} />
            </button>
            <div className="new-user-avatar-colors" aria-label="Avatar colour">
              {BUILTIN_AVATARS.map((avatarId) => (
                <button
                  key={avatarId}
                  type="button"
                  className={newUserAvatar === avatarId ? "active" : ""}
                  onClick={() => onNewUserAvatarChange(avatarId)}
                  aria-label={`Choose ${avatarId} avatar`}
                >
                  <AvatarBadge
                    avatar={{ userId: "new", avatarId }}
                    name={newUserName || "New user"}
                    size="sm"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => onNewUserOpenChange(true)}>
            <Plus size={17} />
            Add user
          </button>
        )}
      </div>
    </>
  );
}
