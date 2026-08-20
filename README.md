# Onyx

Onyx is a deliberately simple Tauri home media server focused on movies and television, with an optional, compartmentalized iBroadcast music module. One running desktop instance manages the server and exposes the same viewing interface to browsers on the network.

## Current features

- First-run setup wizard for users, themes, media folders and optional iBroadcast accounts
- Home screen with **Continue Watching**, **Recently Added Shows**, and **Recently Added Movies**
- Separate Movies and TV library folders
- TV hierarchy: **TV → Show → By season / All episodes**
- Optional **Music** section backed by iBroadcast
- Music browsing/search by artist, album, artist + album, track and playlist
- User profiles with individual playback position, history, hidden media, playlists, themes, analytics and iBroadcast connection
- Watched indicators for movies, episodes, seasons and entire shows
- Small per-user progress bars beneath media
- Resume from saved position; when less than 10% remains Onyx asks whether to continue or restart
- User themes: **Onyx** (default), Midnight, Ember and Light
- Per-user analytics for total time, movies, TV and individual TV shows
- Recursive media scanning and filename/folder TV recognition
- Persistent manual identification corrections
- SQLite-backed media state
- FFprobe inspection when available
- Direct Play / Remux / Transcode playback decisions
- HTTP range streaming for direct play
- FFmpeg remux/transcode playback
- External SRT/VTT subtitles and embedded subtitle extraction
- Local/generated posters, backdrops and episode thumbnails
- Persistent user playlists
- Hide/unhide movies, episodes and entire shows
- Right-click context actions to keep the normal interface uncluttered
- Keyboard, TV-remote and gamepad directional navigation
- Frameless Tauri window and true fullscreen mode
- Browser access from other devices on the LAN
- Optional password-protected browser access using Argon2 and HttpOnly sessions
- Categorized Settings page for General, Libraries, Users, Appearance, Remote Access, Music and Cache

## First-run setup

On first launch, the desktop app presents a setup wizard. It lets you:

1. review/create Onyx users
2. choose a theme for each user
3. attach separate Movie and TV folders
4. configure the Onyx iBroadcast client ID
5. optionally connect an iBroadcast account for each Onyx profile

Every option remains editable later under **Settings**.

### Portable mode

Onyx can keep its application state beside the executable rather than in the normal OS application-data directory.

Enable portable data mode by either:

- placing an empty file named `onyx-portable.flag` beside the executable, or
- launching with `ONYX_PORTABLE=1`

Portable state is stored under:

```text
OnyxData/
```

beside the executable. This includes the first-run marker, database, cached artwork and provider cache, so a portable copy has its own setup lifecycle.

## Browser access

Onyx listens on port `8765`. The desktop app displays a LAN URL similar to:

```text
http://192.168.1.123:8765
```

During `npm run tauri dev`, browser clients use the Vite development client with same-origin API/media proxies. Packaged builds serve the compiled React UI directly from port `8765`.

## User profiles

The first profile is **Owner**. Additional profiles can be created under **Settings → Users**.

Each profile stores its own:

- playback position and watch history
- watched/progress state
- hidden media
- Onyx playlists
- theme
- viewing analytics
- optional iBroadcast account/cache

Profiles currently sit behind the server's shared browser-access password; profile-specific PINs/passwords can be added later.

## Watched state

A movie or episode is considered watched once at least 90% has been played. Seasons and shows are watched when all of their episodes meet that threshold.

Resetting watch status removes the saved playback position for the selected movie, episode, season, or show and immediately clears the corresponding watched indicator.

## Analytics

Onyx records accumulated viewing time independently from playback position, allowing a user to seek without artificially inflating time watched.

Current breakdowns include total time, movie time, TV time and time by TV show. Genre analytics require reliable metadata and will be added with an online movie/TV metadata provider.

## iBroadcast music

iBroadcast is implemented as a separate provider module rather than being merged into the Movie/TV library.

To use it:

1. create an application from the iBroadcast web player's developer area
2. enter the resulting client ID under **Settings → Music**
3. choose an Onyx profile
4. select **Connect iBroadcast**
5. authorize the displayed device code from a phone or computer
6. sync the library

The Music page supports:

- Artists
- Albums
- artist + album search
- Tracks
- iBroadcast Playlists
- artwork
- playback through Onyx

Onyx stores iBroadcast OAuth credentials in the operating system credential store. The cached iBroadcast library is kept separately under the provider-data directory for the current Onyx profile. Browser clients never receive the stored OAuth token; audio requests are proxied through Onyx.

The implementation was adapted from the known-working iBroadcast connection in `razed-developer/cherry-rise` and modernized against the current documented iBroadcast OAuth/library/streaming API.

## Library layout

Movies can use ordinary filenames:

```text
Movies/
  Arrival (2016).mkv
  Arrival (2016).en.srt
  Arrival (2016).jpg
```

TV supports filename and folder-assisted identification:

```text
TV/
  Severance/
    poster.jpg
    Season 1/
      01 Good News About Hell.mkv
      02 Half Loop.mkv
```

## FFmpeg

FFprobe is used during scans to inspect codecs, duration, resolution and embedded subtitles. FFmpeg handles remux/transcode playback, generated artwork and embedded-subtitle extraction.

On Windows:

```powershell
winget install Gyan.FFmpeg
```

Then verify:

```powershell
ffprobe -version
ffmpeg -version
```

## Development

```bash
npm install
npm run tauri dev
```

Build:

```bash
npm run tauri build
```

## Security

**Do not directly port-forward port 8765 to the public internet.** The built-in server is plain HTTP. For outside-network access, use a private encrypted network such as Tailscale or a correctly configured HTTPS reverse proxy.

## Validation

Windows CI builds the React client, runs `cargo check`, and runs the Rust test suite. The first iBroadcast/setup/settings implementation passes all three stages.

## Near-term roadmap

- validate iBroadcast device authorization and real-library parsing against a connected account
- HLS/segmented transcoding for better seeking and remote quality selection
- online movie/TV metadata matching and artwork
- genre-aware analytics
- automatic filesystem watching/rescans
- profile PINs/passwords if desired
