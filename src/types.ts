export type MediaKind = "movie" | "episode" | "special" | "collection";
export type PlaybackMode = "directPlay" | "remux" | "transcode";
export type ThemeName =
  | "onyx"
  | "midnight"
  | "ember"
  | "light"
  | "pink"
  | "royal";
export interface SubtitleTrack {
  label: string;
  language: string;
  url?: string;
  streamIndex?: number;
  embedded: boolean;
  format?: string;
  forced: boolean;
  default: boolean;
}
export interface CaptionJob {
  mediaId: string;
  title: string;
  status: "queued" | "extracting" | "transcribing" | "complete" | "failed";
  message?: string;
  queuedAt: number;
  startedAt?: number;
  finishedAt?: number;
  progressPercent: number;
}
export interface CaptionStatus {
  enabled: boolean;
  autoNew: boolean;
  language: string;
  executable?: string;
  modelPath?: string;
  ready: boolean;
  activeMediaId?: string;
  jobs: CaptionJob[];
}
export interface SleepVideo { id: string; name: string; url: string; }
export interface SleepVideoStatus { folder?: string; videos: SleepVideo[]; }
export interface MediaItem {
  id: string;
  title: string;
  year?: number;
  kind: MediaKind;
  showTitle?: string;
  season?: number;
  episode?: number;
  episodeEnd?: number;
  path: string;
  streamUrl: string;
  posterUrl?: string;
  backdropUrl?: string;
  thumbnailUrl?: string;
  subtitles: SubtitleTrack[];
  progressSeconds: number;
  durationSeconds?: number;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  width?: number;
  height?: number;
  playbackMode: PlaybackMode;
  addedAt?: number;
  lastWatchedAt?: number;
  metadataEntityId?: string;
  overview?: string;
  genres: string[];
  rating?: number;
  releaseDate?: string;
  provider?: string;
  providerId?: string;
  collectionSourceId?: string;
  collectionSourceName?: string;
  collectionFolder?: string;
  collectionProtected?: boolean;
}
export interface CollectionSource { id:string; name:string; path:string; protected:boolean; }
export interface CollectionSourceInput { id?:string; name:string; path:string; protected:boolean; pin?:string; }
export interface UserProfile {
  id: string;
  name: string;
  isAdmin: boolean;
}
export interface UserPreferences {
  theme: ThemeName;
  splitContinueWatching: boolean;
}
export interface Playlist {
  id: string;
  name: string;
  mediaIds: string[];
}
export interface AnalyticsEntry {
  label: string;
  seconds: number;
}
export interface AnalyticsSummary {
  totalSeconds: number;
  movieSeconds: number;
  tvSeconds: number;
  shows: AnalyticsEntry[];
  genres: AnalyticsEntry[];
}
export interface ActivityEntry {
  timestamp: number;
  level: "info" | "warning" | "error" | string;
  category: string;
  message: string;
}
export interface ScanProgress {
  active: boolean;
  phase: string;
  discovered: number;
  inspected: number;
  currentPath?: string;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}
export interface ServerStatus {
  running: boolean;
  localUrl: string;
  libraryPath?: string;
  moviePath?: string;
  tvPath?: string;
  moviePaths?: string[];
  tvPaths?: string[];
  specialPaths?: string[];
  itemCount: number;
  ffprobeAvailable: boolean;
  ffmpegAvailable: boolean;
  accessPasswordSet?: boolean;
  artworkCacheBytes?: number;
  setupComplete?: boolean;
  ibroadcastClientId?: string;
  scanProgress?: ScanProgress;
}
export interface FunnelStatus {
  available: boolean;
  enabled: boolean;
  url?: string;
  passwordSet: boolean;
  detail?: string;
}
export interface BackupPreview {
  createdAt: number;
  moviePaths: string[];
  tvPaths: string[];
  specialPaths: string[];
  mediaItems: number;
  users: number;
  includesTmdb: boolean;
  includesSubtitles: boolean;
  includesIbroadcast: boolean;
}
export interface RootMapping {
  from: string;
  to: string;
}
export interface RestoreReport {
  mediaItems: number;
  users: number;
  remappedRoots: number;
  safetyBackupPath: string;
}
export interface AuthStatus {
  required: boolean;
  authenticated: boolean;
}
export interface SetupStatus {
  complete: boolean;
  moviePath?: string;
  tvPath?: string;
  moviePaths?: string[];
  tvPaths?: string[];
  specialPaths?: string[];
  ibroadcastClientId?: string;
  users: UserProfile[];
}
export interface MetadataProviderStatus {
  provider: string;
  configured: boolean;
  enabled: boolean;
  primary: boolean;
  attribution: string;
}
export interface MetadataSearchResult {
  provider: string;
  providerId: string;
  entityType: "movie" | "series";
  title: string;
  year?: number;
  overview?: string;
  posterUrl?: string;
  backdropUrl?: string;
  rating?: number;
}
export interface LibraryHealthItem {
  id: string;
  title: string;
  kind: string;
  year?: number;
  path: string;
  status:
    | "complete"
    | "missing-file"
    | "unmatched"
    | "needs-artwork"
    | "probe-failed"
    | "incomplete";
  issues: string[];
  manualMatch: boolean;
}
export interface LibraryHealthReport {
  total: number;
  complete: number;
  needsAttention: number;
  unmatched: number;
  missingArtwork: number;
  missingInformation: number;
  probeFailed: number;
  missingFiles: number;
  items: LibraryHealthItem[];
}
export interface LibraryRepairReport {
  attempted: number;
  repaired: number;
  refreshed: number;
  needsReview: number;
  failed: number;
  failures: string[];
  health: LibraryHealthReport;
}

export type LiveChannelCriteria = "show" | "genre" | "playlist";
export type LiveChannelOrder = "sequential" | "shuffle";
export type LiveChannelGenreScope = "movies" | "shows" | "both";
export interface LiveChannel {
  id: string;
  name: string;
  criteriaType: LiveChannelCriteria;
  criteriaValue: string;
  criteriaValues?: string[];
  genreScope?: LiveChannelGenreScope;
  orderMode: LiveChannelOrder;
  anchorTime: number;
  createdAt: number;
  artUrl?: string;
  artIcon?: string;
  artColor?: string;
}
export interface LiveChannelInput {
  id?: string;
  name: string;
  criteriaType: LiveChannelCriteria;
  criteriaValue?: string;
  criteriaValues?: string[];
  genreScope?: LiveChannelGenreScope;
  orderMode: LiveChannelOrder;
}
export interface GuideProgram {
  mediaId: string;
  title: string;
  subtitle?: string;
  startsAt: number;
  endsAt: number;
  offsetSeconds: number;
  durationSeconds: number;
}
export interface GuideChannel {
  channel: LiveChannel;
  current?: GuideProgram;
  programs: GuideProgram[];
}

export interface IbTrack {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  durationSeconds: number;
  artworkUrl?: string;
  sourcePath?: string;
}
export interface IbAlbum {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  year?: number;
  trackIds: string[];
  artworkUrl?: string;
}
export interface IbArtist {
  id: string;
  name: string;
  artworkUrl?: string;
}
export interface IbPlaylist {
  id: string;
  name: string;
  trackIds: string[];
  artworkUrl?: string;
}
export interface IbLibrary {
  tracks: IbTrack[];
  albums: IbAlbum[];
  artists: IbArtist[];
  playlists: IbPlaylist[];
  syncedAt?: number;
  streamingServer?: string;
  providerUserId?: string;
}
export interface IbConnectionStatus {
  configured: boolean;
  connected: boolean;
  providerUser?: string;
  lastSyncAt?: number;
}
export interface IbDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  interval: number;
  expiresIn: number;
}
export interface IbDevicePoll {
  pending: boolean;
  connected: boolean;
  message?: string;
}
