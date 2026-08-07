pub fn choose(container: Option<&str>, video: Option<&str>, audio: Option<&str>) -> String {
    let container = container.unwrap_or("");
    let video = video.unwrap_or("");
    let audio = audio.unwrap_or("");

    if matches!(container, "mp4" | "mov" | "webm")
        && matches!(video, "h264" | "vp8" | "vp9" | "av1" | "")
        && matches!(audio, "aac" | "mp3" | "opus" | "vorbis" | "")
    {
        "direct".into()
    } else if matches!(video, "h264" | "hevc" | "vp9" | "av1")
        && matches!(audio, "aac" | "mp3" | "opus" | "ac3" | "eac3" | "")
    {
        "remux".into()
    } else {
        "transcode".into()
    }
}
