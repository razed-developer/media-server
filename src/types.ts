export type MediaKind = 'movie' | 'episode';

export interface SubtitleTrack {
  label: string;
  language: string;
  url: string;
}

export interface MediaItem {
  id: string;
  title: string;
  year?: number;
  kind: MediaKind;
  showTitle?: string;
  season?: number;
  episode?: number;
  path: string;
  streamUrl: string;
  subtitles: SubtitleTrack[];
  progressSeconds: number;
  durationSeconds?: number;
}

export interface ServerStatus {
  running: boolean;
  localUrl: string;
  libraryPath?: string;
  itemCount: number;
}
