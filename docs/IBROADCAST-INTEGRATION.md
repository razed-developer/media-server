# iBroadcast integration for Onyx

## Goal

Add an optional **Music / iBroadcast** source to an Onyx user profile without mixing iBroadcast credentials, history, playlists, or preferences between Onyx users.

## Implemented architecture

The iBroadcast integration is deliberately compartmentalized from Movies and TV:

```text
src-tauri/src/ibroadcast.rs
src/components/IbroadcastConnect.tsx
src/components/MusicPage.tsx
providers/ibroadcast/<onyx-user>/library.json
```

Removing or disabling the provider does not alter the local video library database.

## Authentication

Onyx uses iBroadcast's OAuth 2.0 **device-code** flow. This is appropriate for TV/couch use because the Onyx client displays a code and the user authorizes it from another browser/device.

Access and refresh tokens are stored in the operating-system credential store through Rust's `keyring` integration. Browser clients never receive those tokens.

## Per-user connection

Every Onyx profile can connect an independent iBroadcast account. The provider token key is scoped by the Onyx user ID.

The first-run wizard and **Settings → Music** allow selecting the active Onyx profile before connecting iBroadcast.

## Creating an Onyx app in iBroadcast

Users who create their own iBroadcast developer application can use the supplied square Onyx logo:

```text
public/onyx-logo-512.png
```

It is a 512×512 PNG and is also exposed as a **Download PNG logo** link in the first-run iBroadcast step and in **Settings → Music**.

The iBroadcast client ID is server-wide, while OAuth account connections are per Onyx profile.

## Library

The provider library is fetched from iBroadcast and normalized into Onyx-specific music models:

```text
Artist
  Album
    Track
Playlist
```

Onyx caches the normalized metadata, not the user's audio files.

The Music interface supports finding music by:

- artist
- album
- artist + album
- track
- playlist

## Playback

Audio is proxied through the authenticated Onyx server:

```text
Onyx client
    ↓
Onyx Rust server
    ↓
iBroadcast streaming service
```

This keeps OAuth credentials and provider stream construction out of the browser.

## Current security boundary

The browser never receives an iBroadcast refresh token, client secret, or stored OAuth credential. OAuth exchange, refresh, library calls, and stream lookup occur in the Rust server.

## Remaining real-world validation

A real registered Onyx iBroadcast application/account is still needed to validate current production responses for library synchronization and streaming against an actual account.

## Future work

- iBroadcast artwork caching
- provider play-history reporting
- recently played music
- music analytics inside Onyx
- playlist write/sync operations if supported by the desired API workflow
- improved music queue controls
