# Connecting OpenSubtitles to Onyx

Onyx uses the current **OpenSubtitles.com REST API** for optional subtitle discovery and download. This integration is isolated from normal local/embedded subtitle playback: if it is not configured, or the provider is unavailable, existing subtitles continue to work.

## What you need

- An OpenSubtitles.com account.
- An OpenSubtitles API consumer/application and its API key.
- The OpenSubtitles.com username and password for the account that will perform downloads.

Do not commit any of these credentials to the Onyx repository.

## Onyx setup

1. Create/sign in to your OpenSubtitles.com account.
2. Create an API consumer/application in OpenSubtitles and copy its API key.
3. In the Onyx desktop/server application open **Settings → Subtitles**.
4. Enter:
   - API key
   - OpenSubtitles.com username
   - OpenSubtitles.com password
5. Choose **Save & test**.
6. Onyx stores the credentials in the operating-system credential store. It does not write them to `settings.json`, the media database, or browser clients.

After configuration, play a movie or episode and choose **Find subtitles** from the player toolbar.

## API flow used by Onyx

Onyx uses these OpenSubtitles API concepts:

1. `POST /api/v1/login` with the application API key, User-Agent, username, and password.
2. OpenSubtitles returns a JWT token and a `base_url` host.
3. Further search/download requests use that returned host and Bearer token.
4. `GET /api/v1/subtitles` searches for candidate subtitles.
5. `POST /api/v1/download` requests a temporary download URL for a selected subtitle file.
6. Onyx downloads the subtitle and stores it locally.

The login token is intentionally short-lived provider state; the long-term account/API credentials remain in the OS credential store.

## Matching strategy

Onyx prefers metadata IDs over filename guessing.

For a matched movie it searches using the TMDB movie ID.

For a matched TV episode it searches using the TMDB series ID plus the local season and episode numbers.

If no usable TMDB identity is available, Onyx falls back to a title/show-name query.

The user still chooses the actual subtitle result before anything is downloaded.

## Download storage

Onyx first tries to store the subtitle beside the video using a sidecar name such as:

```text
Arrival.mkv
Arrival.en.srt
```

It never silently overwrites an existing sidecar. Additional downloads receive a numeric suffix.

If the media directory is read-only, Onyx stores the downloaded file under its own provider-data directory instead. The currently playing desktop client can still use that subtitle through Tauri's local asset mechanism.

A sidecar saved beside the media file is preferred because it remains useful to other players and survives independently of the OpenSubtitles provider.

## Immediate playback

After a successful download, Onyx adds the new subtitle track to the currently playing video and enables it immediately. A later normal library scan will discover sidecar subtitles saved beside media as ordinary local subtitles.

## Download limits

OpenSubtitles accounts have provider-controlled download limits. Those limits can vary by account level and can change independently of Onyx. A failed `/download` response is surfaced to the user and recorded in **Settings → Activity**; Onyx does not attempt to bypass provider limits.

## Troubleshooting

### `OpenSubtitles is not configured`

Configure the API key/account in **Settings → Subtitles**.

### Login fails

Check all three credential fields. The application API key is separate from the OpenSubtitles account password.

### Search returns no results

Confirm the movie/show has a correct metadata match. Try another language. Unmatched media falls back to title search, which can be less precise.

### Download fails but search works

This commonly indicates a provider download allowance/account issue. Check **Settings → Activity** for the HTTP status/message returned by OpenSubtitles.

### Subtitle downloads but is not written next to the video

The media folder may be read-only. Onyx falls back to its managed subtitle storage and logs that decision under the `Subtitles` Activity category.

## Security rules for future projects

- Keep provider credentials server/desktop-side.
- Store long-lived secrets in the OS credential store, not JSON or SQLite.
- Never send provider credentials to browser clients.
- Respect the provider-returned `base_url` after login.
- Never log API keys, passwords, JWTs, or temporary download URLs.
- Prefer canonical metadata IDs over filename-only searches.
- Never overwrite a user's existing subtitle file automatically.
- Keep provider integration optional so local playback still works during provider outages.
