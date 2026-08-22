# Backend modules

The media backend is intentionally split by responsibility:

- `app_state.rs`: settings and shared state
- `commands.rs`: Tauri commands
- `database.rs`: SQLite library and playback progress
- `library.rs`: filesystem scan orchestration
- `models.rs`: shared media models
- `naming.rs`: movie/episode filename parsing
- `probe.rs`: optional FFprobe inspection and playback-mode selection
- `server.rs`: local Axum HTTP streaming/subtitle server
