interface CacheSettingsProps {
  artworkCacheBytes: number;
  onClearThumbnails: () => void;
}

export function CacheSettings({
  artworkCacheBytes,
  onClearThumbnails,
}: CacheSettingsProps) {
  return (
    <>
      <p className="eyebrow">STORAGE</p>
      <h1>Cache</h1>
      <div className="settings-card">
        <h3>Artwork and metadata</h3>
        <p>{Math.round(artworkCacheBytes / 1024 / 1024)} MB used</p>
        <button onClick={onClearThumbnails}>
          Clear generated episode thumbnails
        </button>
      </div>
    </>
  );
}
