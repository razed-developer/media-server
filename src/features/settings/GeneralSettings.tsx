import type { ServerStatus } from "../../types";

export function GeneralSettings({ status }: { status: ServerStatus | null }) {
  return (
    <>
      <p className="eyebrow">ONYX</p>
      <h1>General</h1>
      <div className="settings-card">
        <h3>Server</h3>
        <p>{status?.localUrl ?? "Starting…"}</p>
        <dl>
          <div>
            <dt>Media items</dt>
            <dd>{status?.itemCount ?? 0}</dd>
          </div>
          <div>
            <dt>FFmpeg</dt>
            <dd>{status?.ffmpegAvailable ? "Available" : "Not found"}</dd>
          </div>
          <div>
            <dt>FFprobe</dt>
            <dd>{status?.ffprobeAvailable ? "Available" : "Not found"}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}
