# Home Media

A deliberately simple Tauri home media server focused on movies and television.

The desktop application manages the server. The same running instance also serves a browser client to other devices on the network.

## Current features

- Separate **Movies** and **TV** library folders
- Separate Movies and TV interfaces
- TV can be viewed **By season** or as **All episodes**
- Recursive scanning for MP4, MKV, WebM, M4V, AVI and MOV files
- TV recognition for `S01E02`, `1x02`, multi-episode and date-based filenames
- TV folder fallback such as `Show/Season 2/03 Episode.mkv`
- SQLite-backed library and playback progress
- FFprobe media inspection when available
- Direct Play / Remux / Transcode playback decisions
- Efficient HTTP range streaming without loading whole movies into RAM
- FFmpeg remuxing and H.264/AAC transcoding when required
- External `.vtt` and `.srt` subtitles
- Embedded subtitle discovery and on-demand WebVTT extraction through FFmpeg
- Local poster artwork discovery
- Browser access from other devices on the LAN
- LAN browser address shown in the desktop app
- Windows CI for the frontend, Rust/Tauri compile and Rust tests

## Browser access

The media server listens on port `8765`.

The desktop app displays the LAN address that another device should open. It will look similar to:

```text
http://192.168.1.123:8765
```

During `npm run tauri dev`, port 8765 redirects browser clients to the development Vite server on port 1420. Packaged builds serve the compiled React client directly from port 8765.

Browser clients can browse, search, play media, use subtitles and save playback progress. Filesystem/library administration remains available only in the desktop Tauri application.

## Library layout

Movies can use ordinary filenames:

```text
Movies/
  Arrival (2016).mkv
  Arrival (2016).en.srt
  Arrival (2016).jpg
```

Local movie artwork is discovered from a matching filename, `poster.jpg`, `folder.jpg`, or `cover.jpg`.

TV supports filename-based identification:

```text
TV/
  Severance/
    Severance S01E02 Half Loop.mkv
```

It also supports folder-assisted identification:

```text
TV/
  Severance/
    poster.jpg
    Season 1/
      01 Good News About Hell.mkv
      02 Half Loop.mkv
```

## FFmpeg

FFprobe is used during scans to inspect codecs, duration, resolution and embedded subtitle streams. FFmpeg is used when a file needs remuxing/transcoding or an embedded subtitle needs extraction.

On Windows, one option is:

```powershell
winget install Gyan.FFmpeg
```

Verify afterwards:

```powershell
ffprobe -version
ffmpeg -version
```

Home Media still scans files without FFmpeg/FFprobe, but incompatible playback and embedded subtitles require FFmpeg.

## Development

Install the Tauri 2, Rust and Node.js prerequisites, then run:

```bash
npm install
npm run tauri dev
```

Build an installer with:

```bash
npm run tauri build
```

## Security

LAN browser access is currently unauthenticated. **Do not port-forward port 8765 directly to the public internet.**

Before public remote access, Home Media needs authentication and an HTTPS/Tailscale/reverse-proxy deployment path.

## Near-term roadmap

- User accounts and authenticated browser sessions
- Safer remote internet access
- Better transcoding seek/resume through segmented playback
- Optional metadata provider integration
- Manual metadata correction
- Automatic library watching/rescans
- Additional poster/backdrop handling
