# Building Onyx

Onyx uses Tauri 2. Builds must be created on the operating system they target.

## Requirements

- Node.js 20 or newer
- Rust and Cargo
- Tauri's platform prerequisites
- Windows: Microsoft Edge WebView2 and the Visual Studio C++ build tools
- Linux: the Tauri WebKitGTK and packaging dependencies
- FFmpeg and FFprobe are runtime requirements for media inspection and transcoding

Install JavaScript dependencies before the first build:

```bash
npm install
```

## Development

Browser-only frontend:

```bash
npm run dev
```

Complete Tauri desktop application:

```bash
npm run dev:desktop
```

## Build commands

| Command | Output |
| --- | --- |
| `npm run build` | React frontend in `dist/` |
| `npm run build:app` | Optimized unpackaged Tauri executable |
| `npm run build:bundle` | Every bundle supported by the current operating system |
| `npm run build:windows` | Windows NSIS setup executable and MSI installer |
| `npm run build:windows:nsis` | Windows NSIS setup executable only |
| `npm run build:windows:msi` | Windows MSI installer only |
| `npm run build:windows:portable` | Portable Windows folder and ZIP |
| `npm run build:linux` | Linux DEB package and AppImage |
| `npm run build:linux:deb` | Linux DEB package only |
| `npm run build:linux:appimage` | Linux AppImage only |

Tauri's normal build products are written below `src-tauri/target/release/`.
Portable packages are written to the repository's ignored `release/` directory.

## Windows portable package

Run this command from Windows:

```powershell
npm run build:windows:portable
```

It creates both:

```text
release/Onyx-<version>-windows-<architecture>-portable/
release/Onyx-<version>-windows-<architecture>-portable.zip
```

The portable folder contains:

```text
Onyx.exe
onyx-portable.flag
OnyxData/
web/
README.txt
```

The flag tells Onyx to keep its settings, database, cache, artwork, and provider state inside `OnyxData/` instead of Windows application data. Keep the executable, flag, `web/`, and `OnyxData/` together.

The portable build is not a fully static executable. The target computer still needs Microsoft Edge WebView2. Media probing and transcoding also require FFmpeg and FFprobe to be available on `PATH`.

## Platform limitation

Tauri does not cross-package these native desktop formats. Create Windows outputs on Windows and Linux outputs on Linux. A CI workflow can run the same scripts on separate Windows and Linux runners when automated releases are added.
