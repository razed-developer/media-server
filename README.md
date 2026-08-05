# Home Media

A deliberately simple Tauri home media server focused on movies and television.

## MVP features

- Local media-folder selection
- Recursive scanning for MP4, MKV, WebM, M4V, AVI and MOV files
- Movie and TV episode filename detection
- Responsive gallery view and search
- Direct browser playback with HTTP range requests
- External `.vtt` and `.srt` subtitle discovery
- Per-title playback progress
- Local JSON persistence
- Embedded Rust/Axum server on `127.0.0.1:8765`

## Naming

Movies can use ordinary filenames such as:

```text
Arrival (2016).mkv
```

TV episodes should contain a season and episode token:

```text
Severance S01E02 Half Loop.mkv
Severance S01E02 Half Loop.en.srt
```

## Development

Install the prerequisites for Tauri 2, Rust and Node.js, then run:

```bash
npm install
npm run tauri dev
```

Build an installer with:

```bash
npm run tauri build
```

## Current limitations

This first version intentionally does not include metadata providers, posters, transcoding, user accounts or public internet exposure. Direct playback depends on the formats supported by the operating-system webview. The embedded server binds only to localhost.

## Remote-access direction

The next secure step is a separate authenticated web client plus a configurable LAN bind address, initially exposed through Tailscale Serve. Do not port-forward the current local-only MVP to the public internet.
