// Compatibility entry point. Domain implementations live in src/api/.
export {
  getActiveUserId,
  isTauriDesktop,
  resolveMediaUrl,
  serverBaseUrl,
  setActiveUserId,
} from "./api/core";

export * from "./api/auth";
export * from "./api/backups";
export * from "./api/captions";
export * from "./api/collections";
export * from "./api/funnel";
export * from "./api/ibroadcast";
export * from "./api/library";
export * from "./api/liveChannels";
export * from "./api/media";
export * from "./api/metadata";
export * from "./api/playlists";
export * from "./api/sleepVideos";
export * from "./api/users";
