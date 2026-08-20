# Onyx iBroadcast Integration

## Status

The first iBroadcast integration is now implemented as an **optional, compartmentalized provider module**. It remains separate from the Movie/TV library so it can evolve—or be removed—without changing the core media-server model.

The implementation was informed by the previously working iBroadcast support in `razed-developer/cherry-rise` and updated against iBroadcast's current OAuth 2.0, library, artwork and streaming documentation.

## Separation from core Onyx

Rust provider code lives in:

```text
src-tauri/src/ibroadcast.rs
```

Provider cache lives below the Onyx application-data root:

```text
providers/
  ibroadcast/
    <onyx-profile-id>/
      library.json
```

OAuth credentials are **not** stored in the media SQLite database or sent to browser clients. They are stored through the operating-system credential store using the Rust `keyring` crate.

Removing the iBroadcast module would not remove or corrupt Movies, TV, Onyx watch history, hidden-media choices, Onyx playlists, themes, or video analytics.

## Per-user connection model

Each Onyx profile can independently be disconnected from iBroadcast, connected to its own account, and synced at a different time.

The server-level iBroadcast **client ID** is configured once under **Settings → Music**. Access/refresh tokens belong to individual Onyx profiles.

## Authorization

Onyx uses iBroadcast's device-code OAuth flow because it works well with desktop and couch/TV clients.

1. Onyx requests a device code using the configured client ID.
2. Onyx displays the verification address and short user code.
3. The user authorizes the application from a phone/computer.
4. Onyx polls iBroadcast at the supplied interval.
5. On success, the access/refresh token is stored in the OS credential store for the active profile.
6. Onyx immediately syncs the user's music library.

Onyx requests account/library read access plus `offline_access` for token refresh.

## Library cache and browsing

A successful sync normalizes iBroadcast's map-indexed library response into dedicated provider objects:

- artists
- albums
- tracks
- playlists

The Onyx Music page supports, at minimum:

- artist browsing/search
- album browsing/search
- combined **artist + album** search
- track search
- playlist browsing/search

Selecting an artist opens that artist's albums. Selecting an album or playlist opens its tracks.

## Artwork

The normalized cache keeps iBroadcast artwork URLs for artists, albums, tracks and playlists when supplied. Music artwork remains provider-owned and is not mixed into the Movie/TV artwork cache.

## Playback

The browser is **not** given the iBroadcast OAuth token or the signed iBroadcast streaming URL.

```text
Browser/Tauri Music player
        ↓
Onyx /api/ibroadcast/stream/<track-id>
        ↓
Onyx Rust provider module
        ↓
iBroadcast streaming service
```

Onyx builds the provider streaming request server-side and proxies the response. HTTP `Range` is forwarded where supplied so the audio element can seek when the provider supports it.

The first implementation requests a high-quality 320 kbps stream where the cached source permits. Quality controls can be exposed later without changing the provider boundary.

## Setup wizard

The first-run Onyx wizard contains an optional iBroadcast step:

1. enter the Onyx iBroadcast client ID
2. select an Onyx profile
3. connect that profile's iBroadcast account
4. repeat for other profiles as desired

The whole step can be skipped. iBroadcast can be configured later under **Settings → Music**.

## Settings

```text
Settings
└── Music
    ├── Onyx iBroadcast client ID
    ├── Connect current profile
    ├── Sync current profile
    └── Disconnect current profile
```

## Current validation boundary

The module passes Windows frontend build, Rust/Tauri `cargo check`, and the repository Rust test suite.

The next validation is a live-account test to confirm the exact current library-map fields and streaming path returned for the user's iBroadcast account. The parser intentionally tolerates several field names inherited from Cherry Rise's known-working implementation, but real-account verification remains important.

## Future extensions

- music recently played/home rail
- album/artist detail metadata
- iBroadcast playlist editing
- play queue integration
- per-user music analytics
- selectable streaming quality/original quality
- provider reconnection/expiry diagnostics
