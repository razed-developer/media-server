export type MediaKind = 'movie' | 'episode';
export type PlaybackMode = 'directPlay' | 'remux' | 'transcode';
export interface SubtitleTrack { label:string; language:string; url?:string; streamIndex?:number; embedded:boolean; format?:string; forced:boolean; default:boolean; }
export interface MediaItem {
  id:string; title:string; year?:number; kind:MediaKind; showTitle?:string; season?:number; episode?:number; episodeEnd?:number;
  path:string; streamUrl:string; posterUrl?:string; backdropUrl?:string; thumbnailUrl?:string; subtitles:SubtitleTrack[];
  progressSeconds:number; durationSeconds?:number; container?:string; videoCodec?:string; audioCodec?:string; width?:number; height?:number; playbackMode:PlaybackMode;
}
export interface ServerStatus { running:boolean; localUrl:string; libraryPath?:string; moviePath?:string; tvPath?:string; itemCount:number; ffprobeAvailable:boolean; ffmpegAvailable:boolean; accessPasswordSet?:boolean; artworkCacheBytes?:number; }
export interface AuthStatus { required:boolean; authenticated:boolean; }
