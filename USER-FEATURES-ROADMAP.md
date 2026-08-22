# Onyx User Features Roadmap

This document captures user-facing features proposed after the core Movies/TV/Music/Live TV architecture was established. The goal is to add them without turning the media library into a monolithic social/database layer.

## 1. Subtitle discovery and download

Keep this as a compartmentalized subtitle-provider service.

Suggested model:

- Existing local and embedded subtitles remain highest priority.
- Add a provider interface such as `SubtitleProvider`.
- Search by canonical metadata where available: TMDB ID, title, year, season, episode, language.
- Present candidate subtitles in an Onyx-native dialog before download.
- Download into the media folder when writable, or into an Onyx-managed subtitle cache when it is not.
- Record source, language, forced/SDH status, download date, and checksum.
- Never silently overwrite a local subtitle selected by the user.

Potential providers should be evaluated for API terms, authentication requirements, rate limits, and redistribution restrictions before implementation.

## 2. User avatars

Avatars belong to the user/profile layer, not the media database.

Recommended first version:

- Built-in Onyx avatar gallery.
- Optional custom image selection.
- Crop to square inside Onyx.
- Store normalized local copies rather than referencing arbitrary original files.
- Recommended master: 512×512 PNG or WebP.
- Render smaller cached sizes as needed for profile menus and TV interfaces.

The profile ID remains stable even if name/avatar changes.

## 3. Wishlist / Requests

Users should be able to search TMDB for movies and TV shows they would like added to the server.

These are metadata-only records and must not pretend to be library items.

Suggested schema:

- requesting user
- TMDB media type
- TMDB ID
- title/year/poster snapshot
- request note (optional)
- requested timestamp
- status: requested / approved / added / declined

When a later library scan finds media matched to the same TMDB ID, Onyx can automatically mark the request as added.

Possible UI:

- User: `Wishlist` or `Requests` page with TMDB search.
- Admin: pending requests under Settings or a compact admin inbox.
- Media pages: show that another user requested/recommended the title.

## 4. Lightweight social reactions and recommendations

Keep this deliberately small. Onyx is a household media server, not a social network.

Useful reactions could include:

- Loved it
- Liked it
- Made me laugh
- Made me cry
- Scared me
- Not for me

Reactions should be per-user and attach to the canonical Movie or Series entity rather than to a physical media file.

Recommendations should be explicit user-to-user messages:

- `Recommend to…`
- recipient user ID
- media entity ID
- optional short note
- sent/read timestamps

Good surfaces:

- Home: `Recommended for you`
- Movie/show page: household reactions without ratings pressure
- Profile/history: user's own reactions

Avoid public scores, follower systems, feeds, or engagement mechanics unless there is a later concrete need.

## Suggested implementation order

1. User avatars — small, low-risk profile improvement.
2. Wishlist/TMDB requests — leverages metadata infrastructure already present.
3. Reactions and direct recommendations — simple user/entity tables.
4. Subtitle provider framework — larger because provider terms, matching, language selection, download storage, and subtitle formats need careful handling.

## Architectural rule

These features should reference stable IDs rather than duplicate media state:

- Users → stable Onyx user IDs.
- Wishlist → TMDB/provider IDs.
- Reactions/recommendations → normalized metadata entity IDs.
- Downloaded subtitles → media/entity ID plus a provider/download record.

This preserves the separation between physical media files, canonical metadata, and user-specific state.
