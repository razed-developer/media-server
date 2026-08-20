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

## Creating an Onyx developer app in iBroadcast

iBroadcast requires a **128 × 128 PNG** image for a developer application. Do not upload the older 512 × 512 asset directly.

To configure Onyx:

1. Sign in to the iBroadcast web player.
2. Open **Apps → developer**.
3. Create a new developer application for Onyx.
4. Use **Onyx** as the application name.
5. Upload the supplied **128 × 128 PNG** Onyx application icon.
6. Save/create the application.
7. Copy the **Client ID** issued by iBroadcast.
8. In Onyx, open **Settings → Music**.
9. Paste the Client ID into **Onyx iBroadcast client ID** and save it.
10. Select the Onyx profile that should own the music connection and choose **Connect**.
11. Onyx displays an iBroadcast device authorization code. Open the displayed authorization address on a phone or computer, enter/approve the code, and return to Onyx.
12. After authorization, Onyx stores the account tokens in the operating-system credential store and synchronizes that profile's iBroadcast library.

The iBroadcast **Client ID is server-wide**, while OAuth account connections, tokens, library state, and music preferences are **per Onyx profile**. Do not commit a private client secret, access token, or refresh token to the repository.

The Onyx UI should provide the correctly sized 128 × 128 PNG directly from **Settings → Music** and first-run setup so users do not need to resize the icon themselves.

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
