# Lessons from Building Onyx

This document is a postmortem on the development of Onyx. Its purpose is not to catalogue every feature that was added. It is to identify the **questions that should have been answered, or at least deliberately considered, before implementation began**.

The central lesson is simple:

> Most of the expensive refactors in Onyx did not come from adding ordinary features. They came from discovering late that an early architectural assumption was wrong or incomplete.

Adding another button is cheap. Changing from one user to many users is not. Adding another theme is cheap if theming was anticipated and expensive if every color is hard-coded. Adding a browser client is not just another screen if the application was originally designed as a local Tauri-only program. Portable mode is not just a different installer if every path assumes AppData. Remote-control support is not just handling arrow keys if the whole interface assumes a mouse.

That distinction is the main thing to carry into future projects.

---

# 1. The biggest mistake: building before defining the product contract

The original idea was intentionally simple: a beautiful Tauri home media server for Movies and TV without the clutter of Plex or Jellyfin.

That was a good product instinct, but it was not yet a sufficient engineering specification.

Before implementation, the project should have had a short document answering questions such as:

- What exactly is Onyx?
- Is it primarily a desktop application, a server, or both?
- Which device is authoritative?
- Who uses it?
- Where does its state live?
- Which clients will access it?
- Which features must be personal to each user?
- Which features are global to the server?
- Is it expected to be portable?
- Is it expected to work outside the LAN?
- Does it only manage local video, or is it intended to become a broader media application?
- What is explicitly **not** part of version 1?

We often answered those questions implicitly while coding. That is the expensive way to answer them.

The better rule for future projects is:

> Before writing application code, identify every assumption that would be painful to reverse later.

You do not need to know every future feature. You do need to know where future variation is likely.

---

# 2. Installation model: installed, portable, server service, or all three?

## The question that should have been asked

**How will this program be installed and where is it allowed to store data?**

Possible answers include:

- conventional installed desktop app,
- portable executable,
- portable folder containing executable and data,
- background/server installation,
- Windows service,
- Linux daemon,
- Docker/container deployment,
- more than one of the above.

## What happened in Onyx

Portable mode arrived late. By then the application already assumed the normal operating-system application-data directory.

To support portable mode properly, the data-location decision had to become dynamic. The application now checks for `onyx-portable.flag` or `ONYX_PORTABLE=1` and redirects its database, cache, provider state, and settings into `OnyxData` beside the executable.

That is not conceptually difficult, but it reaches into every piece of persistent state.

## Why this matters

If portable mode is even a realistic possibility, storage paths should never be scattered through the codebase.

The application should begin with one abstraction such as:

```text
AppPaths
  config
  database
  cache
  artwork
  providers
  logs
  temporary
```

Everything should ask `AppPaths` where data belongs.

Then installation mode becomes a policy choice instead of a refactor.

## Questions to ask next time

- Installed or portable?
- Can both modes exist?
- Should a portable copy be completely self-contained?
- Does portable mode need to leave no data behind?
- Where are configuration, database, cache, logs, credentials, and temporary files stored?
- Can the user move the program folder after setup?
- Can multiple copies run with different data directories?
- Is a migration path required between installed and portable mode?
- Should a command-line `--data-dir` override exist from day one?

---

# 3. Who is using the application?

## The question that should have been asked

**Is this application single-user or multi-user?**

This looks like a UI question. It is actually a data-model question.

## What happened in Onyx

Onyx initially behaved like a single personal media library. Later, user profiles were added so each person could have individual:

- watch progress,
- watch history,
- watched/unwatched status,
- hidden media,
- playlists,
- theme,
- analytics,
- iBroadcast account.

That required changing data that had previously been treated as global into data keyed by `user_id`.

## Why this was a heavy refactor

A multi-user application has at least two kinds of state:

### Server/global state

- media folders,
- scanned media inventory,
- artwork cache,
- FFmpeg availability,
- server port,
- browser access policy,
- metadata provider configuration.

### User state

- progress,
- watched state,
- hidden items,
- playlists,
- preferences,
- theme,
- provider connections,
- analytics.

If that boundary exists from the start, adding another user is straightforward.

If it does not, every global table and API has to be reconsidered later.

## Questions to ask next time

- One user or many?
- Are users local profiles or real authenticated accounts?
- Does each user have a password/PIN?
- Is there an administrator/owner role?
- What is global versus user-specific?
- Can users hide content from themselves?
- Can users have separate integrations?
- Can users have separate parental restrictions?
- Can one person use the same profile from multiple devices simultaneously?
- Can a user be deleted without affecting shared media?
- What happens to their history when deleted?

## Better initial data rule

Even if version 1 only has one user, if multiple users are plausible, create an `owner` profile immediately and key personal state by user ID from the first migration.

The cost is tiny at the beginning and enormous to retrofit later.

---

# 4. Is Tauri the application, or is Tauri one client of the application?

## The question that should have been asked

**What is the architectural center of the product?**

There are two very different designs:

### Design A

```text
Tauri application
  └── local functionality
```

### Design B

```text
Onyx Server / Core
  ├── Tauri desktop client
  ├── Browser client
  ├── TV client
  └── future clients
```

## What happened in Onyx

The browser-access requirement arrived after the Tauri application already existed.

Once one instance needed to function as a server that browsers could use, the correct architecture became much closer to Design B.

That meant introducing an Axum HTTP server, HTTP APIs, sessions, browser authentication, HTTP media streaming, web-safe artwork URLs, browser-safe subtitles, and distinction between desktop-only administrative operations and browser-accessible operations.

## Why this matters

This was one of the largest architectural pivots in the project.

If browser access had been a first-day requirement, the clean design would have been:

```text
Core/domain layer
Database
Provider layer
Playback layer
HTTP API
        ↑
   ┌────┴─────┐
Desktop      Browser
Tauri UI      UI
```

The Tauri layer would call the same application services as the HTTP layer rather than becoming the original center of the system.

## Questions to ask next time

- Is the desktop application the product or merely one client?
- Will there ever be a browser client?
- Mobile app?
- Smart-TV app?
- CLI?
- Remote-control app?
- Does all useful functionality need an API?
- Which functions are local-machine-only?
- Should the server run when the desktop window is closed?
- Is headless mode required?
- Can the frontend be replaced without rewriting the backend?

---

# 5. Local access or remote access?

## The question that should have been asked

**Where are clients expected to be physically located?**

Possible answers:

- same machine only,
- same LAN,
- private VPN such as Tailscale,
- internet through reverse proxy,
- directly internet-facing.

## What happened in Onyx

The requirement to let other people access the server from outside the network was present fairly early, but the consequences could have been designed more explicitly from the start.

Remote access affects much more than networking.

It affects:

- authentication,
- transport encryption,
- bitrate,
- transcoding,
- seeking,
- bandwidth assumptions,
- media compatibility,
- session security,
- CORS,
- cookies,
- exposure of filesystem paths,
- provider-token security.

## Better framing

A media server should begin with a deployment matrix:

| Scenario | Required? |
| --- | --- |
| Same-PC playback | Yes/No |
| LAN browser playback | Yes/No |
| LAN TV playback | Yes/No |
| Tailscale playback | Yes/No |
| Public HTTPS playback | Yes/No |
| Direct port forwarding | Never/Allowed |

Then security and playback decisions can be made deliberately.

## Questions to ask next time

- LAN only or internet?
- Is HTTPS built in or delegated to a reverse proxy?
- Is Tailscale an officially supported deployment mode?
- Are remote clients trusted?
- Shared password or per-user credentials?
- Session expiry?
- Brute-force protection?
- Do remote users need lower-bitrate transcoding?
- What upload bandwidth is assumed?
- Can the server expose original files directly?
- Is there a download feature?

---

# 6. What devices are first-class clients?

## The question that should have been asked

**What input device does the interface assume?**

This should have been decided before constructing the UI.

## What happened in Onyx

The initial desktop/browser interface naturally assumed mouse and keyboard use. Later, both the Tauri client and browser needed to work with directional remotes that provide only:

- Up,
- Down,
- Left,
- Right,
- Select/OK,
- Back,
- playback buttons.

Remote navigation then had to be layered over an interface designed primarily for pointer interaction.

## Why this is architectural

A couch interface needs different fundamentals:

- every interactive element must be focusable,
- spatial navigation must be predictable,
- focus must be visibly obvious from several metres away,
- hover cannot be required,
- right-click cannot be the only route to essential actions,
- modal focus must be controlled,
- grids need deterministic movement,
- Back semantics need to be consistent,
- video controls need remote equivalents.

## Questions to ask next time

- Mouse?
- Keyboard?
- Touch?
- TV remote?
- Gamepad?
- Screen reader?
- Is ten-foot UI use a primary scenario?
- Does every action have a non-pointer route?
- What does Back do on every screen?
- What element receives focus after navigation?
- Are context menus accessible without right-click?

## Better initial rule

If TV use is expected, build focus navigation with the first screen, not at the end.

---

# 7. What are the actual primary product features?

## The question that should have been asked

**What are the smallest number of things Onyx must be excellent at?**

This is different from listing every possible feature.

A useful first version could have been formally defined as:

```text
1. Scan separate Movie and TV libraries.
2. Present them beautifully.
3. Correctly group TV → Show → Season → Episode.
4. Play media reliably.
5. Support subtitles.
6. Remember progress per user.
7. Work from desktop and browser.
```

Everything else could be classified as either architectural preparation or post-MVP functionality.

## Why this matters

Without a written feature hierarchy, development can become reactive:

> This would be nice.
> Add it.
> This implies something else.
> Refactor.
> Add that too.

That happened repeatedly in Onyx—not because the ideas were bad, but because their relationship to the core architecture had not been mapped.

## Questions to ask next time

- What are the five essential user outcomes?
- What must work before the app is useful?
- What would make users choose this over alternatives?
- What features are explicitly excluded from v1?
- Which future features need architectural hooks now even if the UI comes later?

---

# 8. Movies and TV are not just two filters

## The question that should have been asked

**What is the domain model of the media library?**

## What happened in Onyx

Keeping Movies and TV separate eventually became important.

TV then developed a hierarchy:

```text
TV
  Show
    Season
      Episode
```

and users needed to view either:

```text
Show → Seasons → Episodes
```

or:

```text
Show → All Episodes
```

That means a TV show is not merely a collection of files tagged `kind=episode`.

## Better model

Before UI implementation, define the conceptual entities:

```text
Library
Movie
Series
Season
Episode
MediaFile
SubtitleTrack
Artwork
Person/User
Playlist
PlaybackState
```

Then decide which are persisted and which are derived.

## Questions to ask next time

- Is a TV show a first-class entity?
- Is a season a first-class entity or a calculated grouping?
- Can one episode contain multiple episode numbers?
- Specials/Season 0?
- Date-based shows?
- Miniseries?
- Multiple versions of the same movie?
- Extras?
- Trailers?
- Multi-part movies?
- Multiple files for one episode?

The multi-episode parser test that later failed on `S01E05-E06` is a good example of why naming rules and domain rules deserve explicit design rather than incremental regex growth.

---

# 9. How is media identified?

## The question that should have been asked

**What is the source of truth for media identity?**

Possible approaches:

- filename only,
- folder hierarchy,
- embedded metadata,
- local NFO files,
- online provider,
- manual user matching,
- a combination with precedence rules.

## What happened in Onyx

The application initially used filename/folder inference. Later it became obvious that identification will sometimes fail, so manual correction and persistent overrides were required.

This was predictable.

No filename parser is perfect.

## Better initial policy

Design identification as a pipeline:

```text
File discovered
      ↓
Automatic parser
      ↓
Metadata candidate
      ↓
Manual override? ─── Yes → use override
      ↓ No
Resolved identity
```

The manual override should never mutate the physical filename unless explicitly requested. It should be stored separately so rescanning does not erase the user's correction.

## Questions to ask next time

- How is identity determined?
- What happens when confidence is low?
- Can the user correct it?
- Are corrections persistent across rescans?
- Can an entire show's identity be corrected at once?
- Can an override be reset to automatic detection?
- What happens if the file moves?
- Is the stable ID path-based, hash-based, metadata-based, or provider-based?

---

# 10. Metadata provider strategy should have been decided early

## The question that should have been asked

**Is Onyx intentionally local-metadata-only, or will it eventually use an online metadata provider?**

## Why this matters

Posters, titles, descriptions, cast, genres, release dates, episode names, analytics by genre, and robust matching all depend on metadata.

We initially worked around the absence of a provider with filenames, folder names, local art, and generated thumbnails. That is perfectly reasonable for an MVP, but the provider boundary should have been explicit.

## Better design

Create a provider interface even if v1 only implements `LocalMetadataProvider`:

```text
MetadataProvider
  searchMovie()
  searchSeries()
  getMovie()
  getSeries()
  getSeason()
  getEpisode()
  artwork()
```

Later TMDB or another provider can be added without rewriting library logic.

## Questions to ask next time

- Online metadata or local only?
- Which provider?
- API key required?
- Who supplies the key?
- What happens offline?
- Is metadata cached?
- How are provider IDs stored?
- Can users manually rematch?
- Does changing provider destroy existing matches?
- Which fields can users override locally?

---

# 11. Artwork needs a storage policy, not just an image feature

## The question that should have been asked

**Where will artwork come from and how much disk may it consume?**

## What happened in Onyx

The desire for posters, TV artwork, backdrops, and episode thumbnails immediately raised the issue of storage growth.

That led to artwork caching and generated thumbnails.

## Better initial design

Define artwork types and policy:

```text
poster
backdrop
episode thumbnail
album artwork
```

For each:

- source,
- target resolution,
- encoding,
- quality,
- cache key,
- expiry,
- maximum size,
- cleanup rules.

## Questions to ask next time

- Do we store originals or resized derivatives?
- Generate episode thumbnails or fetch them?
- Cache indefinitely?
- Maximum cache size?
- LRU cleanup?
- Can the user clear cache?
- What happens when artwork changes?
- Is artwork per media item or shared across a show?
- Should browser and desktop share the same cache?

---

# 12. Playback architecture should have been specified before the player UI

## The question that should have been asked

**What kinds of media must be playable, on which clients, and by what mechanism?**

## What happened in Onyx

Playback evolved through several stages. Videos initially opened in a floating/external style. The desired behavior was integrated playback. Browser playback then required HTTP streaming. Codec incompatibility introduced Direct Play, Remux, and Transcode decisions. Seeking exposed the limitations of progressive FFmpeg output and pointed toward HLS/segmented transcoding.

## Better initial playback matrix

Before writing the player, define:

| Container | Video | Audio | Browser target | Strategy |
| --- | --- | --- | --- | --- |
| MP4 | H.264 | AAC | modern browser | Direct Play |
| MKV | H.264 | AAC | browser | Remux |
| MKV | HEVC | DTS | browser | Transcode |

Then decide whether the MVP needs:

- byte-range direct streaming,
- remux,
- full transcode,
- segmented/HLS output,
- bitrate selection,
- hardware acceleration.

## Questions to ask next time

- Which containers/codecs must work?
- Browser compatibility target?
- Direct Play first?
- Is FFmpeg mandatory or optional?
- Hardware transcoding?
- Multiple concurrent transcodes?
- Seeking requirements?
- Resume precision?
- Remote bitrate adaptation?
- Is transcoding cached?
- What happens if FFmpeg is missing?

---

# 13. Subtitles are their own subsystem

## The question that should have been asked

**What subtitle sources and formats are required?**

## What happened in Onyx

Subtitles were an early desired feature, but full support means more than finding `.srt` files.

Onyx eventually had to consider:

- external SRT,
- external VTT,
- embedded subtitle streams,
- browser-compatible conversion,
- language labels,
- forced/default flags,
- subtitle selection in the player.

## Questions to ask next time

- External subtitles?
- Embedded subtitles?
- SRT, VTT, ASS/SSA, PGS?
- Need conversion?
- Burn-in required for image subtitles?
- Language detection?
- Preferred subtitle language per user?
- Forced subtitles?
- Default subtitles?
- Subtitle offsets?
- Downloaded subtitle providers later?

---

# 14. Watch state should have been modeled before playback history was added

## The question that should have been asked

**What does “watched” actually mean?**

## What happened in Onyx

We later added:

- progress position,
- watched indicator,
- reset status,
- season status,
- show status,
- Continue Watching,
- “less than 10% remaining” restart/resume prompt,
- actual viewing-time analytics.

These features all depend on a coherent playback-state model.

## Better model

Keep these concepts separate:

```text
resume_position
media_duration
completion_state
last_watched_at
accumulated_watch_time
```

Seeking to the end should not necessarily imply that the person genuinely watched the entire program. Likewise, analytics should not simply equal the highest playback timestamp.

## Questions to ask next time

- At what percentage is media considered watched?
- Does manually marking watched exist?
- What happens on replay?
- When is something removed from Continue Watching?
- How close to the end triggers “restart or resume”?
- Is season progress average completion or count watched?
- Does a show become watched when all currently indexed episodes are watched?
- What happens when a new episode is added?
- How is actual time watched measured?
- Does seeking count toward analytics?

---

# 15. Playlists: decide whether they are media-agnostic

## The question that should have been asked

**What can a playlist contain?**

This became more important once iBroadcast entered the project.

Possible models:

### Video-only playlist

```text
OnyxPlaylist → MediaItem IDs
```

### Universal playlist

```text
PlaylistItem
  provider = local | ibroadcast | future
  type = movie | episode | track
  provider_item_id
```

## What happened in Onyx

Video playlists were implemented before music integration. iBroadcast playlists were intentionally kept as provider-owned playlists rather than immediately forcing them into Onyx's video playlist model.

That compartmentalization was the right response, but the question could have been asked earlier.

## Questions to ask next time

- Are playlists video only?
- Can Movies and TV episodes mix?
- Can music join them?
- Are provider playlists read-only or editable?
- Is playlist order persisted?
- Can one playlist contain an entire season/show as a dynamic entry?
- Is shuffle/repeat needed?
- Are playlists user-specific?

---

# 16. Hide/unhide, favourites, ratings, and personal organization belong in one personalization model

## The question that should have been asked

**What personal organization features might users expect?**

Onyx gained hide/unhide functionality relatively late. Similar future requests could include:

- favourites,
- custom collections,
- ratings,
- tags,
- pinned items,
- “not interested”.

These should share a user-media preference model instead of each requiring a new ad hoc table.

A flexible design could be:

```text
user_media_state
  user_id
  media_id
  hidden
  favourite
  personal_rating
  custom_json
```

Not everything needs to be implemented initially. The shape can still anticipate personalization.

---

# 17. Themes should have been treated as a design-system question

## The question that should have been asked

**Is appearance fixed, globally configurable, or user configurable?**

## What happened in Onyx

Onyx began with a strong visual direction, then later gained user-specific themes.

Themes are easy to add if the interface uses semantic design tokens. They are tedious if individual components contain literal colors.

## Better initial design

Use tokens from the start:

```css
--bg
--surface
--surface-raised
--text
--text-muted
--accent
--danger
--border
--focus
```

Components should never care whether the theme is Onyx, Midnight, Ember, or Light.

## Questions to ask next time

- One theme or many?
- Global or per-user?
- Light mode?
- System-theme mode?
- Accent color separately configurable?
- High-contrast mode?
- Reduced-motion support?
- Should themes affect artwork treatments and player chrome too?

---

# 18. A Settings page should have been planned before settings existed

## The question that should have been asked

**How much configuration will this application eventually have?**

## What happened in Onyx

Administrative actions accumulated in the main sidebar:

- Movie folder,
- TV folder,
- rescan,
- thumbnail cache,
- browser password,
- user administration,
- themes,
- iBroadcast.

Eventually the main navigation was getting polluted by things that users do rarely.

A categorized Settings page then became necessary.

## Better rule

If a product will have more than three or four non-primary configuration actions, plan a Settings area from day one.

Even if it initially contains only:

```text
Settings
  General
  Libraries
```

it gives future options somewhere to go.

## Questions to ask next time

- Which actions are everyday navigation?
- Which are administrative?
- Which are per-user settings?
- Which are server settings?
- Which require desktop access?
- Which can browser users modify?
- Are dangerous settings separated?
- Is there a reset-to-default option?
- Does each setting need validation and explanation?

---

# 19. First-run setup is not the same thing as Settings

## The question that should have been asked

**What must a new installation know before the application is useful?**

## What happened in Onyx

Once users, themes, folders, remote access, and iBroadcast existed, a first-run wizard became an obvious improvement.

But by then each feature already had its own setup mechanics.

## Better initial design

Create configuration services that both Settings and Setup Wizard call.

The wizard should be a guided orchestration layer, not a second implementation of configuration.

## Questions to ask next time

- What is required before first use?
- What can be skipped?
- Can setup be resumed?
- Can the wizard be rerun?
- Does setup differ in portable mode?
- Does setup create the owner user?
- Should server password be configured during setup?
- Should FFmpeg availability be tested?
- Should folder permissions be validated?
- Should external integrations be optional steps?

---

# 20. External integrations need a provider/plugin boundary

## The question that should have been asked

**Will this application ever consume media that it does not own locally?**

## What happened in Onyx

iBroadcast arrived very late and could easily have contaminated the local video architecture.

Fortunately, it was deliberately compartmentalized:

```text
Onyx
  local Movies/TV domain
  iBroadcast provider module
```

with separate credentials, cache, APIs, and UI.

That is the architecture we should have identified before implementing any external integration.

## General lesson

Never let a third-party API's data model become your application's data model.

Normalize it behind a provider boundary.

## Questions to ask next time

- Will third-party services exist?
- One or several?
- Per server or per user?
- Read-only or writable?
- What happens when a provider is offline?
- Can the provider module be removed without affecting the core app?
- Where do provider credentials live?
- Does the browser ever see provider tokens?
- Does provider media participate in global search?
- Does provider playback use the same player abstraction?

---

# 21. Secrets and authentication should have been explicitly classified

## The question that should have been asked

**What secrets exist, who owns them, and where may they appear?**

Onyx eventually had several different security concepts:

- browser-access password,
- browser session cookie,
- per-user iBroadcast OAuth tokens,
- iBroadcast client ID,
- possible future metadata API keys.

These are not equivalent.

## Better secret inventory

Before implementation, make a table:

| Secret/config | Owner | Storage | May browser receive it? |
| --- | --- | --- | --- |
| Server password hash | Server | settings/database | No |
| Session token | Browser/server | HttpOnly cookie | Cookie only |
| iBroadcast access token | User/provider | OS keyring | No |
| iBroadcast refresh token | User/provider | OS keyring | No |
| Provider client ID | Application | config | Usually yes/not secret |

## Questions to ask next time

- Is this value actually secret?
- Must it be encrypted at rest?
- OS keyring or database?
- Is it per user?
- Can browser JavaScript access it?
- How is it revoked?
- How is it migrated in portable mode?
- Does portable mode even have access to a suitable credential store?

That final portable-mode/keyring question is particularly important for future work.

---

# 22. Browser API design should have been treated as a stable contract

## The question that should have been asked

**What is the API boundary between clients and the server?**

Once browsers became clients, every useful operation needed to be classified:

```text
public unauthenticated
browser authenticated
user scoped
admin only
desktop only
```

## Better initial endpoint policy

For every operation, answer:

- Who may call it?
- Which user does it act as?
- Is the user ID taken from trusted server session state or a client header?
- Does it expose filesystem paths?
- Is it idempotent?
- What error shape does it return?
- Will a TV/mobile client need this too?

## Long-term issue to watch

Onyx currently uses a user-selection header in browser requests behind server authentication. That was practical for the MVP, but if profiles eventually gain separate authentication or permissions, the authenticated identity should become server-authoritative rather than simply accepting a requested valid profile.

This is exactly the kind of future security boundary that is cheaper to discuss early.

---

# 23. Context menus reduce clutter, but cannot be the only interaction path

## The question that should have been asked

**Which actions are primary, secondary, and hidden?**

## What happened in Onyx

Right-click menus were introduced to reduce visible buttons. This fits the desire for a simple interface.

However, remote control later became a requirement.

A TV remote does not naturally have a right-click.

## Better interaction model

Define three levels:

### Primary

Visible and directly selectable:

- Play,
- open show,
- navigate.

### Secondary

Context/overflow menu:

- reset watched,
- add to playlist,
- hide,
- fix match.

### Administrative

Settings only:

- media folders,
- rescans,
- cache clearing,
- provider setup.

Then ensure every secondary action has a remote-accessible menu trigger such as Menu/Options/long-press.

---

# 24. Search requirements should have been defined by entity, not by text box

## The question that should have been asked

**What exactly can the user search for?**

Onyx now spans several entities:

```text
Movie
TV show
Episode
Artist
Album
Track
Playlist
```

A generic search box can become ambiguous quickly.

## Questions to ask next time

- Global search or section search?
- Search Movies and TV together?
- Search episode titles?
- Search actors later?
- Search artist + album combinations?
- Search provider playlists?
- Are results grouped by type?
- Does remote input need an on-screen keyboard?
- Fuzzy matching?
- Diacritic normalization?
- Search index or simple filtering?

The earlier these entities are known, the easier it is to design one search architecture instead of several local filters.

---

# 25. Analytics should begin with event design

## The question that should have been asked

**Which user actions should produce durable events?**

## What happened in Onyx

Analytics were added after progress tracking already existed. It became necessary to distinguish playback position from actual viewing time.

That was the correct decision.

## Better initial model

Consider an event stream or at least event-like counters:

```text
play_started
play_resumed
play_paused
play_stopped
progress_checkpoint
completed
seeked
```

You do not need to retain every event forever, but the semantics should be clear.

## Questions to ask next time

- What metrics might matter later?
- Viewing time?
- Completion rate?
- Most watched show?
- Genre?
- Device?
- User?
- Time of day?
- Does privacy require local-only analytics?
- How much history is retained?

If genre analytics are desired, that immediately exposes the dependency on a metadata provider—another reason architecture questions should be connected rather than considered independently.

---

# 26. “Beautiful but simple” needs measurable UI rules

## The question that should have been asked

**What does simple mean in concrete interaction terms?**

The goal of avoiding Plex/Jellyfin-style feature overload was central to Onyx, but “simple” can become subjective unless converted into constraints.

Useful rules might have been:

- no more than 7 primary navigation entries,
- administrative controls never appear in normal library views,
- one obvious primary action per media card,
- secondary operations live in one consistent context/overflow menu,
- no feature is added to Home unless used frequently,
- every page must be fully usable with five remote buttons,
- advanced configuration goes under Settings,
- external providers get their own compartment rather than contaminating Movies/TV.

Those rules make future feature decisions much easier.

---

# 27. Dependency requirements should have been explicit

## The question that should have been asked

**What external software must the user install?**

Onyx relies on FFprobe/FFmpeg for important functionality.

That raises product questions:

- Are they bundled?
- Automatically detected?
- User-installed?
- Optional?
- What functionality disappears without them?

## Better setup behavior

The first-run wizard should eventually perform a dependency check and explain capabilities:

```text
FFmpeg: Found
FFprobe: Found
Direct Play: Available
Transcoding: Available
Thumbnail generation: Available
Embedded subtitle extraction: Available
```

If external dependencies are required, decide this before claiming “portable mode,” because a truly portable media server may need portable FFmpeg binaries too.

---

# 28. Migration strategy should exist before persistent data becomes important

## The question that should have been asked

**How will old installations survive schema and architecture changes?**

Onyx evolved from the earlier Home Media naming/state while trying to preserve existing data.

As more user-specific tables and provider information are added, schema evolution matters more.

## Questions to ask next time

- Is the database versioned?
- Are migrations sequential and repeatable?
- Can migration fail safely?
- Is a backup made before destructive migration?
- Can the app downgrade?
- Can portable/install data be migrated?
- Do IDs survive folder moves?

A prototype can get away with recreating a database. A personal media server with years of watch history cannot.

---

# 29. Stable media identity deserves more thought

## The question that should have been asked

**What makes a media item the same item after a rescan?**

If IDs depend too heavily on paths, moving or renaming a file risks losing:

- progress,
- watched state,
- playlist membership,
- manual match,
- analytics association.

Possible identity strategies include:

- canonical path,
- filesystem ID,
- partial file hash,
- full hash,
- provider ID plus version,
- composite approach.

This is a foundational media-server decision and should be settled before significant user state accumulates.

---

# 30. Rescanning versus filesystem watching

## The question that should have been asked

**How does the server discover changes after initial setup?**

Current manual rescanning is reasonable for an MVP, but a media server normally evolves toward filesystem watching.

That raises questions:

- watch continuously?
- periodic scan?
- debounce copied files?
- ignore partially copied media?
- detect deletes?
- detect renames?
- update metadata asynchronously?
- regenerate artwork?

If filesystem watching is expected, library scanning should be decomposed into reusable operations rather than written only as “rebuild the entire library.”

---

# 31. Concurrency should have been considered once “server” was in the name

## The question that should have been asked

**How many clients may do things at once?**

Examples:

- two people watching different videos,
- one user rescanning while another watches,
- multiple browser clients saving progress,
- iBroadcast sync while local scan runs,
- artwork generation from several requests.

## Questions to ask next time

- How many simultaneous streams?
- How many transcodes can the machine support?
- Are expensive jobs queued?
- Is library state immutable during scans?
- Can cache generation race?
- Should provider sync be serialized?
- Are database writes transactional?

Single-user desktop assumptions hide these issues. Server architecture exposes them.

---

# 32. Background/headless behavior should have been discussed

## The question that should have been asked

**What does closing the Tauri window mean?**

For an ordinary desktop app, Close means stop.

For a media server, users may expect:

```text
Close window → server keeps running in tray
```

or even:

```text
Server starts automatically with Windows before anyone opens the UI
```

That affects lifecycle architecture.

Questions:

- tray app?
- minimize to tray?
- run at startup?
- headless mode?
- Windows service later?
- how does the user know the server is running?
- how are updates applied without interrupting streams?

---

# 33. The name and product identity should be decided earlier than it was

Renaming the application to Onyx was not technically the worst refactor, but names leak into:

- package identifiers,
- window titles,
- application-data directories,
- browser storage keys,
- session cookie names,
- executable names,
- documentation,
- installer metadata,
- URLs and service names.

We deliberately kept the old `home-media` data directory for migration compatibility, which is sensible but illustrates the point.

Before the first persistent release, settle:

- product name,
- app identifier,
- database/data-directory name,
- package name,
- internal service prefix.

Renaming UI text is easy. Renaming persisted namespaces is not.

---

# 34. “Could we add music?” is really a scope question

## The question that should have been asked

**Is the domain “video server” or “personal media hub”?**

There is no objectively correct answer.

But it changes the architecture.

If Onyx is a Movie/TV product, iBroadcast should remain an optional isolated module.

If Onyx is a personal media hub, then eventually the domain model should anticipate:

```text
Video
Music
Photos
Audiobooks
Podcasts
```

Those are very different product futures.

The good decision made during iBroadcast integration was **not** to prematurely rebuild Onyx around music. The provider was kept separate.

That same restraint should continue unless the product definition intentionally changes.

---

# 35. Feature ideas should be classified by refactor risk before implementation

A useful practice for future projects is to classify every proposed feature.

## Type A — Local UI feature

Usually cheap.

Examples:

- new button,
- sorting option,
- small layout change.

## Type B — Domain feature

Touches models/database/API.

Examples:

- playlists,
- favourites,
- watched status.

## Type C — Architectural feature

Changes assumptions across the system.

Examples from Onyx:

- multi-user profiles,
- browser client,
- remote access,
- portable mode,
- TV remote navigation,
- external media provider.

## Type D — Platform feature

Affects deployment/lifecycle/security.

Examples:

- background server,
- Windows service,
- automatic updates,
- HTTPS termination.

Before implementing Type C or D, stop and write a short design note.

That one habit would have prevented many of the heavier Onyx refactors.

---

# 36. The questions I would force us to answer if we restarted Onyx today

Before writing code, I would require answers to the following questionnaire.

## Product

- What is the one-sentence purpose of the product?
- Who is it for?
- What problem does it solve better than Plex/Jellyfin?
- What are the five essential features?
- What is explicitly not in v1?
- Is this a video server or a broader media hub?

## Deployment

- Installed, portable, service, container, or several?
- Windows only initially?
- Linux later?
- Where is every category of data stored?
- Does closing the window stop the server?
- Does it start automatically?

## Clients

- Tauri desktop?
- Browser?
- Smart TV?
- Mobile?
- Remote/gamepad?
- Which is the primary client?
- Is the UI designed for a ten-foot viewing distance?

## Network

- Local machine?
- LAN?
- Tailscale?
- Internet?
- Who provides HTTPS?
- Is direct port forwarding prohibited?

## Users

- One user or many?
- Owner/admin role?
- Per-user passwords/PINs?
- What data is global?
- What data is personal?

## Library

- Separate Movie/TV roots?
- Multiple roots of each type?
- How is media identified?
- How are mismatches corrected?
- What is the stable media ID?
- How are moves/renames detected?
- Manual rescan or filesystem watcher?

## Metadata

- Local only or online provider?
- Which provider?
- How are provider IDs cached?
- Can users override metadata?
- What happens offline?

## Playback

- Required containers/codecs?
- Direct Play?
- Remux?
- Transcode?
- HLS?
- Hardware acceleration?
- Maximum concurrent streams?
- Remote bitrate control?

## Subtitles

- External?
- Embedded?
- Formats?
- Image subtitles?
- Preferred language?

## User state

- Resume behavior?
- Watched threshold?
- Continue Watching rules?
- Manual watched/unwatched?
- Hide/favourite/rating?
- Analytics?

## Artwork

- Source?
- Cache policy?
- Size limit?
- Thumbnail generation?
- User cleanup controls?

## UI

- Main navigation items?
- Settings page from the start?
- Context-menu policy?
- Remote navigation?
- Theme system?
- Per-user theme?
- Accessibility expectations?

## Integrations

- Are provider integrations expected?
- Per user or server?
- How are tokens stored?
- Is there a generic provider boundary?
- Can integrations be removed cleanly?

## Security

- Authentication model?
- Authorization model?
- Secret inventory?
- Session expiration?
- HTTPS assumptions?
- Does browser JavaScript ever see provider credentials?

## Persistence

- Database technology?
- Migration/versioning strategy?
- Backup strategy?
- Portable/install migration?
- What state must survive file moves?

## Operations

- Logging?
- Diagnostics page?
- Dependency checks?
- FFmpeg discovery?
- Cache sizes?
- Server health status?

## Testing

- Which naming patterns are fixtures?
- Which codec combinations are tested?
- Browser playback test?
- Remote navigation test?
- Migration test?
- Multi-user isolation test?
- Security test?

---

# 37. A better development sequence for this exact project

If rebuilding Onyx from zero, I would use this order.

## Phase 0 — Product/design document

Write no application code yet.

Decide:

- product scope,
- deployment modes,
- client types,
- user model,
- network model,
- media entities,
- persistence ownership,
- playback target,
- settings categories,
- extension/provider boundaries.

Output should be perhaps 3–5 pages, not a giant specification.

## Phase 1 — Domain and storage

Build:

```text
User
Movie
Series
Season
Episode
PlaybackState
Playlist
AppSettings
UserPreferences
ProviderConnection
```

Create versioned database migrations immediately.

## Phase 2 — Application services

Create reusable services independent of Tauri/Axum:

```text
LibraryService
PlaybackService
UserService
PlaylistService
SettingsService
ProviderService
```

## Phase 3 — HTTP server first

Because browser/TV access is a core requirement, make the server API first-class.

The Tauri application can still call Rust services directly for privileged operations, but the domain should not depend on the Tauri UI.

## Phase 4 — Minimal UI/design system

Implement:

- semantic theme tokens,
- sidebar shell,
- Settings shell,
- focus navigation,
- media-card primitives,
- modal/context-menu primitives.

Do this before building dozens of screens.

## Phase 5 — Movie/TV library

Implement scanning, stable IDs, identification pipeline, manual corrections, local artwork.

## Phase 6 — Playback

Implement direct play, then subtitles, then remux/transcode deliberately against a codec test matrix.

## Phase 7 — Per-user state

Continue Watching, progress, watched state, history, playlists, hidden items.

Because the data model was already user-scoped, this should not require structural refactoring.

## Phase 8 — Setup and settings

The configuration services already exist, so first-run setup becomes a guided frontend over them.

## Phase 9 — External providers

Only after the local product is stable, add iBroadcast through the already-defined provider boundary.

---

# 38. Things that were good decisions and should be repeated

This postmortem should not imply that everything was handled badly. Several decisions made during the project were exactly the sort of decisions worth repeating.

## Keeping Movies and TV separate

Good. Their browsing and metadata structures genuinely differ.

## Making TV shows first-class in the UI

Good. Users think in shows and seasons, not in filesystem entries.

## Persistent manual identification overrides

Good. Automatic identification should never be trusted absolutely.

## Moving administrative clutter into Settings

Good. This protects Onyx's “beautiful but simple” product principle.

## User-specific watch state

Correct domain ownership.

## Separating actual viewing time from playback position

Good analytics design.

## Compartmentalizing iBroadcast

Very good. This prevented a late external integration from infecting the local-video domain.

## Keeping provider tokens server-side

Correct security boundary.

## Adding CI during active development

Very useful. It caught both the frontend syntax issue and an existing multi-episode parser defect.

## Writing tests for filename conventions

Correct direction. This should be expanded significantly.

---

# 39. Things I would be stricter about next time

This is the blunt section.

## Stop implementing immediately after every new idea

Many ideas were good, but a good idea is not automatically ready to code.

For every significant new idea, first ask:

> Does this change an assumption?

If yes, stop coding and inspect the architecture first.

Examples:

- “Let's have users.” → changes state ownership.
- “Let's use it in a browser.” → changes application topology.
- “Let's support a TV remote.” → changes the interaction model.
- “Let's make it portable.” → changes persistence/location assumptions.
- “Let's add iBroadcast.” → introduces an external trust/data domain.

Those deserve design time before implementation.

## Do not let the UI define the backend model

Several requirements initially appeared as interface ideas and later revealed deeper implications.

Examples:

- progress bar → playback-state model,
- user menu → multi-user persistence,
- theme picker → user preferences + design tokens,
- Music tab → provider architecture,
- Settings tab → configuration ownership,
- browser button → server architecture.

When a UI request appears, ask what persistent/domain behavior it implies before changing React.

## Do not confuse “MVP” with “no architecture”

An MVP should have less functionality, not necessarily weaker boundaries.

The correct MVP can still establish:

- one path service,
- one user model,
- one provider interface,
- one settings service,
- one stable API boundary,
- one migration system.

Those foundations are often only tens or hundreds of lines early and thousands of lines to retrofit later.

## Avoid giant central components

As the project grew, `App.tsx` accumulated navigation, users, playback, playlists, analytics, hidden media, context menus, and settings transitions.

That is a warning sign.

Future projects should split major domains earlier:

```text
features/
  home/
  movies/
  tv/
  playback/
  users/
  playlists/
  music/
  settings/
```

The same applies on the Rust side: domain services should not become one giant commands/server module.

## Treat “we might want this later” selectively

Do **not** over-engineer every hypothetical future feature.

Instead distinguish:

### Cheap to add later

- another sort order,
- another theme,
- another settings toggle.

Ignore until needed.

### Expensive to add later

- multi-user,
- remote clients,
- portable storage,
- provider integrations,
- stable identity,
- authentication,
- migration strategy.

Design seams for these early.

That is the balance.

---

# 40. A reusable pre-build exercise for future projects

Before starting another substantial app, spend one focused session answering four categories.

## A. Things that define the product

```text
Who uses it?
What are they trying to accomplish?
What are the essential features?
What should the product deliberately not do?
```

## B. Things that define the architecture

```text
Where does it run?
What clients exist?
Where does state live?
Who owns each piece of state?
What external systems exist?
What must be secure?
```

## C. Things that are expensive to reverse

```text
single-user vs multi-user
local vs networked
installed vs portable
one client vs many clients
local data vs external providers
path identity vs stable identity
mouse UI vs remote/touch UI
fixed theme vs design system
```

## D. Things that can safely wait

```text
exact icons
minor sorting options
small context-menu actions
secondary visual polish
rare preference toggles
```

Spend disproportionate planning time on category C.

---

# Final lesson

The problem was not that Onyx changed during development. Software should change as ideas improve.

The problem was that several late ideas changed **foundational assumptions** that had never been written down.

The goal for future projects should therefore not be:

> Predict every feature before coding.

That is impossible and would cause paralysis.

The goal should be:

> Identify the handful of decisions that determine the shape of the whole system, make those decisions consciously, and create clean boundaries where uncertainty remains.

For Onyx, the questions with the highest value would have been:

1. **What exactly is this product: desktop app, server, or both?**
2. **Who uses it: one person or multiple profiles?**
3. **What clients must work: desktop, browser, TV remote, future mobile?**
4. **Where can those clients connect from: same PC, LAN, VPN, internet?**
5. **Installed, portable, or both?**
6. **What data is global and what is user-specific?**
7. **What are the first-class media entities?**
8. **How is a media item identified and how does identity survive rescans/moves?**
9. **What is the metadata strategy?**
10. **What is the playback compatibility/transcoding strategy?**
11. **What is the Settings/configuration architecture?**
12. **Is theming fixed or user-configurable?**
13. **Will external providers ever exist, and if so what is the provider boundary?**
14. **What secrets exist and where are they stored?**
15. **Which architectural assumptions would be painful to reverse six months later?**

If those fifteen questions had been discussed before the first serious implementation pass, Onyx would still have evolved, but a large portion of the heavy refactoring could have been avoided.

That is the lesson worth carrying forward.