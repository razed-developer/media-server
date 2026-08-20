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
- Per-user analytics for total time, movies, TV, individual TV shows and metadata genres
- Recursive media scanning and filename/folder TV recognition
- Persistent local identification corrections
- Normalized metadata domain: **Movie / Series / Season / Episode / Media File**
- Optional TMDB metadata matching for canonical titles, descriptions, genres, ratings and artwork
- Conservative automatic matching plus visual, locked **Fix Match** corrections
- SQLite-backed library and metadata state
- FFprobe inspection when available
- Direct Play / Remux / Transcode playback decisions
- HTTP range streaming for direct play
- FFmpeg remux/transcode playback
- External SRT/VTT subtitles and embedded subtitle extraction
- Local/generated/provider posters, backdrops and episode thumbnails
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

## Metadata

Onyx keeps filesystem scanning separate from media identity. Scanned files are linked to normalized entities:

```text
Movie
  └── Media File

Series
  └── Season
       └── Episode
            └── Media File
```

This lets metadata belong to the thing it describes rather than being duplicated onto every physical file.

### TMDB

TMDB is the current primary optional online metadata provider. Configure it from:

```text
Settings → Metadata → TMDB
```

Paste a TMDB **API Read Access Token**, then use **Save & test**. The token is stored in the operating-system credential store and is never exposed to browser clients.

When configured, Onyx can populate:

- canonical movie and series titles
- movie/show overviews
- release / air dates
- genres
- ratings
- posters and backdrops
- season information and season posters
- episode titles, summaries, air dates, runtimes, ratings and stills

A rescan can queue conservative automatic matching. **Match unmatched media** can also be run manually from Settings. Only high-confidence automatic matches are accepted; ambiguous items remain unmatched.

Right-click a movie or TV show and select **Fix Match…** to search TMDB visually by poster, title, year, rating and synopsis. A manual provider match is locked so normal rescans do not silently replace the user's choice.

Metadata/artwork precedence is intentionally:

```text
1. User/local artwork and local corrections
2. Locked manual provider match
3. High-confidence automatic provider match
4. Generated artwork fallback
```

Provider images are fetched through Onyx and cached locally rather than making browser clients depend directly on provider URLs.

### TheTVDB

The provider boundary includes TheTVDB as an optional secondary provider, but it is deliberately not enabled in this milestone. Onyx does not depend on TVDB. It can later be useful for alternate TV ordering or TV-specific data where a user prefers it over TMDB.

More detail is in `docs/METADATA.md`.

## Analytics

Onyx records accumulated viewing time independently from playback position, allowing a user to seek without artificially inflating time watched.

Current breakdowns include:

- total time
- movie time
- TV time
- time by TV show
- time by genre when metadata is available

Analytics remain user-specific while descriptive movie/TV metadata is shared by the server.

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

Local artwork remains preferred even after an online metadata match.

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

- real-library validation and tuning of metadata confidence scoring
- optional TheTVDB secondary provider / alternate episode ordering
- cast/crew presentation and richer movie/show detail screens
- HLS/segmented transcoding for better seeking and remote quality selection
- automatic filesystem watching/rescans
- profile PINs/passwords if desired
