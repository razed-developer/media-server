# iBroadcast integration for Onyx

## Goal

Add an optional **Music / iBroadcast** source to an Onyx user profile without mixing iBroadcast credentials, history, playlists, or preferences between Onyx users.

## Why it fits

iBroadcast has an official developer API and OAuth 2.0 flow. Its current developer documentation describes separate API, Library, Play Queue, Streaming, and Artwork services. The Library response includes a user's tracks, artists, albums, playlists, and tags, while the Streaming server provides audio playback URLs.

References:

- https://help.ibroadcast.com/en/developer/introduction
- https://help.ibroadcast.com/en/developer/authentication
- https://help.ibroadcast.com/en/developer/quick-start
- https://help.ibroadcast.com/en/developer/components/streaming

## Proposed Onyx architecture

### Per-user connection

Add a table such as:

```sql
CREATE TABLE user_integrations (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at INTEGER,
  provider_user_id TEXT,
  settings_json TEXT,
  PRIMARY KEY (user_id, provider)
);
```

Tokens should ultimately be encrypted at rest or stored through the operating-system credential store. They should never be exposed to browser clients.

### Authentication

iBroadcast now documents OAuth 2.0 and supports both `authorization_code` and `device_code` grants.

For Onyx, the preferred approach is:

1. Desktop setup: use authorization-code + PKCE or device-code.
2. TV/browser setup: device-code is ideal because a couch/TV user can authorize on a phone or computer.
3. Store the resulting access token, refresh token, and expiry against the active Onyx user.
4. Refresh tokens server-side in Rust when required.
5. Revoke the provider token when the user disconnects iBroadcast.

### Library

The Rust server would request the user's library from iBroadcast's Library service and normalize it into Onyx-specific music models:

```text
Artist
  Album
    Track
Playlist
Tag
```

The provider library should remain separate from Movies and TV in SQLite. Onyx should cache metadata/artwork indexes, not duplicate the user's iBroadcast audio files.

### Playback

iBroadcast's Streaming service creates signed audio URLs from the user's access information, track URL, file ID, platform, and version. Onyx should generate these URLs server-side and proxy or hand them to the authenticated client without exposing refresh tokens.

### Play history

iBroadcast's API supports sending history information. Onyx should keep its own per-profile analytics while also reporting plays/skips to iBroadcast when appropriate, so the two systems stay useful independently.

### Playlists

Initially treat iBroadcast playlists as provider playlists rather than merging them with Onyx movie/TV playlists. Later, the UI can visually unify them while retaining provider ownership.

## UI proposal

Under the active Onyx profile:

```text
Connected services
  iBroadcast
    [ Connect ]
```

After connection:

```text
Music
  Recently Played
  Albums
  Artists
  Playlists
```

The Movies and TV interface should remain unchanged.

## Implementation milestones

1. Register Onyx as an app in the iBroadcast web player and obtain a `client_id` (and any secret required by the chosen grant).
2. Add provider-token storage and OAuth/device-code endpoints in Rust.
3. Add Connect/Disconnect controls to the Onyx profile menu.
4. Fetch and cache the iBroadcast library.
5. Add a minimal Music section.
6. Add audio playback and artwork.
7. Synchronize play history and provider playlists.
8. Add music-specific analytics to Onyx.

## Security boundary

The browser should never receive an iBroadcast refresh token or client secret. OAuth/token exchange, refresh, library calls, and signed playback URL generation should happen in the Rust server. Browser clients should talk only to Onyx's authenticated HTTP API.
