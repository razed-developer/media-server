# Onyx Code Organization

Onyx separates application orchestration, feature workflows, reusable UI, and
platform communication so changes stay localized.

## Frontend structure

- `src/App.tsx` is the composition root. It connects feature controllers to
  route-level screens and should not implement domain workflows directly.
- `src/app/hooks/` owns application bootstrap and other truly application-wide
  lifecycle coordination.
- `src/pages/` contains route-level screens. Pages compose features and shared
  components but should not contain platform API implementations.
- `src/features/` contains focused workflows with their own UI, hooks, and
  controllers. Current domains include collections, library, live channels,
  metadata, music, playback, playlists, profiles, settings, sleep, and social.
- Feature UI belongs in `src/features/<feature>/components/`; behavioural state
  belongs in `src/features/<feature>/hooks/`.
- `src/components/` contains reusable or application-wide UI that is not owned
  by a single route or feature.
- `src/components/layout/` contains general layout primitives.
- `src/components/media/` contains reusable media cards, rails, and status UI.
- `src/components/navigation/` contains window and application navigation.
- `src/components/menus/` contains reusable menus.
- `src/utils/` contains pure helpers without React or platform state.
- `src/types.ts` contains types shared across several domains.

## API structure

`src/api.ts` is a compatibility entry point. Existing code may import from it,
but implementations belong in `src/api/` by domain:

- `core.ts`: desktop detection, server URLs, authenticated fetches, active user
- `auth.ts`: authentication and first-run setup state
- `users.ts`: profiles and user preferences
- `media.ts`: library reads, progress, hidden status, analytics
- `library.ts`: scans, roots, and cache administration
- `metadata.ts`: identification, providers, and library health commands
- `playlists.ts`, `liveChannels.ts`, `collections.ts`: media organization
- `backups.ts`, `captions.ts`, `sleepVideos.ts`: focused application services
- `funnel.ts`: remote-access administration
- `ibroadcast.ts`: iBroadcast authorization, library, and audio access

New platform functions should be added to the relevant domain module and
re-exported from `src/api.ts` when compatibility imports are useful.

## State boundaries

- Keep only route selection and composition state in `App.tsx`.
- Keep workflow state and mutations beside the owning feature in a hook or
  controller. Do not add new playback, collection, playlist, profile, or
  library derivation logic directly to `App.tsx`.
- Derived library views belong in `useLibraryCatalog`; server bootstrap belongs
  in `useAppData`; feature mutations belong in their named controllers.
- Pass callbacks across feature boundaries instead of importing parent state.
- Keep expensive filesystem and database work in Rust commands, outside React
  rendering.
- Use bulk database operations for library-wide work; avoid opening a database
  connection for each media item.

## Validation

Before committing frontend changes, run:

```sh
npm run build
git diff --check
```

Before releasing a desktop build, also run the Tauri/Rust build on a machine
with the Rust toolchain installed.
