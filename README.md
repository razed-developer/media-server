# Onyx

Onyx is a deliberately simple Tauri home media server focused on movies and television. One running desktop instance manages the library and serves the same interface to browsers on the network.

## Current features

- Home screen with **Continue Watching**, **Recently Added Shows**, and **Recently Added Movies**
- Separate Movies and TV library folders
- TV hierarchy: **TV → Show → By season / All episodes**
- User profiles with individual playback position, history, hidden media, playlists and themes
- Watched indicators for movies, episodes, seasons and entire shows
- Small per-user progress bars beneath media
- Resume from saved position; when less than 10% remains Onyx asks whether to continue or restart
- User themes: **Onyx** (default), Midnight, Ember and Light
- Per-user analytics for total time, movies, TV and individual TV shows
- Recursive media scanning and filename/folder TV recognition
- Persistent manual identification corrections
- SQLite-backed library state
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
- First-run setup for users, themes, libraries and optional iBroadcast
- Optional per-profile iBroadcast Music integration

## Browser access

Onyx listens on port `8765`. The desktop app displays a LAN URL similar to:

```text
http://192.168.1.123:8765
```

During `npm run tauri dev`, browser clients are redirected to the Vite development client. Packaged builds serve the compiled React UI directly from port `8765`.

## User profiles

The first profile is created as the administrator profile and starts with the name **Owner**, but the display name can be changed during first-run setup or later in Settings.

Each profile stores its own:

- playback position and watch history
- watched/progress state
- hidden media
- playlists
- theme
- viewing analytics
- optional iBroadcast connection

Profiles currently sit behind the server's shared browser-access password; profile-specific PINs/passwords can be added later.

## Watched state

A movie or episode is considered watched once at least 90% has been played. Seasons and shows are watched when all of their episodes meet that threshold.

Resetting watch status removes the saved playback position for the selected movie, episode, season, or show and immediately clears the corresponding watched indicator.

## Analytics

Onyx records accumulated viewing time independently from playback position, allowing a user to seek without artificially inflating time watched.

Current breakdowns include:

- total time
- movie time
- TV time
- time by TV show

Genre analytics require reliable genre metadata, so they are deferred until a metadata provider is added.

## Metadata roadmap

Onyx currently identifies media locally from filenames/folders plus persistent manual corrections. The next major library milestone is a provider-backed metadata layer for canonical movie/show IDs, descriptions, episode information, posters/backdrops, genres, cast/crew and improved visual **Fix identification** search. The provider layer should remain separate from scanning so local-only use continues to work.

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

## iBroadcast

iBroadcast is optional and compartmentalized from the movie/TV system. Each Onyx profile may connect a separate iBroadcast account.

When creating an Onyx application in iBroadcast, a square 512×512 PNG logo is included with Onyx at:

```text
public/onyx-logo-512.png
```

The first-run iBroadcast step and **Settings → Music** both expose a download link for this logo.

Implementation details are documented in:

```text
docs/IBROADCAST-INTEGRATION.md
```

## Portable mode

Place this file beside the executable:

```text
onyx-portable.flag
```

or set `ONYX_PORTABLE=1`. Onyx will then keep its database, cache, settings and provider state under an `OnyxData` folder beside the executable rather than using the normal OS application-data directory.

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

## Near-term roadmap

- HLS/segmented transcoding for better seeking and remote quality selection
- online metadata matching/artwork provider
- genre-aware analytics
- automatic filesystem watching/rescans
- profile PINs/passwords if desired
