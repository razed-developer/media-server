# Backup and restore

Onyx desktop backups use the `.onyx-backup` format. The payload is compressed, encrypted with AES-256-GCM, and protected by a key derived from the user password with Argon2. A password cannot be recovered by Onyx, so it should be stored somewhere safe.

## Included

- Server settings and browser-access configuration
- Profiles, preferences, watch progress, watch time, hidden items, playlists, reactions, recommendations, and requests
- Library records, manual identification overrides, provider matches, and cached provider state
- Custom profile assets and subtitles stored inside Onyx's managed provider directory
- TMDB, OpenSubtitles, and per-profile iBroadcast credentials from the operating-system credential store

## Excluded

- Movie, television, and music files
- Generated artwork and thumbnail caches
- Temporary files and logs

## Restore behavior

The preview validates the password and archive before changes are offered. Every original movie and TV root can be mapped to a new drive or parent directory while preserving its subfolder structure. Replace mode restores the backup as the authoritative Onyx state. Merge mode imports backed-up database records and combines library roots with the current installation.

Immediately before a restore, Onyx creates an encrypted `Onyx-pre-restore-*.onyx-backup` safety backup beside the selected archive. After restoration, the in-memory library is reloaded so the restored state is available without restarting Onyx.
