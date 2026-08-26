use crate::{activity, metadata, models::MediaItem, Shared};
use rusqlite::Connection;
use serde::Serialize;
use std::{collections::{HashMap, HashSet}, path::Path, time::Instant};
use tauri::State;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHealthItem {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub year: Option<u16>,
    pub path: String,
    pub status: String,
    pub issues: Vec<String>,
    pub manual_match: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryHealthReport {
    pub total: usize,
    pub complete: usize,
    pub needs_attention: usize,
    pub unmatched: usize,
    pub missing_artwork: usize,
    pub missing_information: usize,
    pub probe_failed: usize,
    pub missing_files: usize,
    pub items: Vec<LibraryHealthItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairReport {
    pub attempted: usize,
    pub repaired: usize,
    pub refreshed: usize,
    pub needs_review: usize,
    pub failed: usize,
    pub failures: Vec<String>,
    pub health: LibraryHealthReport,
}

#[derive(Default)]
struct HealthMetadata {
    title: Option<String>,
    year: Option<u16>,
    overview: Option<String>,
    poster: bool,
    backdrop: bool,
    thumbnail: bool,
    provider_id: Option<String>,
    manual_match: bool,
}

fn load_health_metadata(database_path: &Path) -> Result<HashMap<String, HealthMetadata>, String> {
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    let mut statement = connection.prepare(
        "SELECT links.media_id,
                entity.title, entity.year, entity.overview,
                entity.poster_path, entity.backdrop_path, entity.still_path,
                direct.provider_id, direct.matched_by, direct.locked,
                series.title, series.overview, series.poster_path, series.backdrop_path,
                series_match.provider_id, series_match.matched_by, series_match.locked
         FROM media_entity_links links
         JOIN metadata_entities entity ON entity.id = links.entity_id
         LEFT JOIN metadata_entities season
           ON entity.entity_type = 'episode' AND season.id = entity.parent_id
         LEFT JOIN metadata_entities series ON series.id = season.parent_id
         LEFT JOIN provider_matches direct
           ON direct.entity_id = entity.id AND direct.provider = 'tmdb'
         LEFT JOIN provider_matches series_match
           ON series_match.entity_id = series.id AND series_match.provider = 'tmdb'",
    ).map_err(|error| error.to_string())?;
    let rows = statement.query_map([], |row| {
        let direct_provider = row.get::<_, Option<String>>(7)?;
        let series_provider = row.get::<_, Option<String>>(14)?;
        let direct_method = row.get::<_, Option<String>>(8)?;
        let series_method = row.get::<_, Option<String>>(15)?;
        let direct_locked = row.get::<_, Option<i64>>(9)?.unwrap_or_default() != 0;
        let series_locked = row.get::<_, Option<i64>>(16)?.unwrap_or_default() != 0;
        let provider_id = direct_provider.or(series_provider);
        let matched = provider_id.is_some();
        let direct_title = row.get::<_, Option<String>>(1)?;
        let series_title = row.get::<_, Option<String>>(10)?;
        let direct_overview = row.get::<_, Option<String>>(3)?;
        let series_overview = row.get::<_, Option<String>>(11)?;
        let poster = row.get::<_, Option<String>>(4)?.is_some()
            || row.get::<_, Option<String>>(12)?.is_some();
        let backdrop = row.get::<_, Option<String>>(5)?.is_some()
            || row.get::<_, Option<String>>(13)?.is_some();
        let thumbnail = row.get::<_, Option<String>>(6)?.is_some();
        Ok((
            row.get::<_, String>(0)?,
            HealthMetadata {
                title: if matched { direct_title.or(series_title) } else { None },
                year: row.get(2)?,
                overview: direct_overview.or(series_overview),
                poster,
                backdrop,
                thumbnail,
                provider_id,
                manual_match: direct_locked
                    || series_locked
                    || direct_method.as_deref() == Some("manual")
                    || series_method.as_deref() == Some("manual"),
            },
        ))
    }).map_err(|error| error.to_string())?;
    let mut metadata = HashMap::new();
    for row in rows {
        let (media_id, value) = row.map_err(|error| error.to_string())?;
        metadata.insert(media_id, value);
    }
    Ok(metadata)
}

fn assess_item(item: &MediaItem, metadata: Option<&HealthMetadata>) -> LibraryHealthItem {
    let mut issues: Vec<String> = Vec::new();
    if !Path::new(&item.path).is_file() { issues.push("Source file is missing".into()); }
    let local_only = item.kind == "collection";
    let provider_id = metadata.and_then(|value| value.provider_id.as_ref()).or(item.provider_id.as_ref());
    let year = metadata.and_then(|value| value.year).or(item.year);
    let overview = metadata.and_then(|value| value.overview.as_ref()).or(item.overview.as_ref());
    let has_poster = item.poster_url.is_some() || metadata.is_some_and(|value| value.poster);
    let has_backdrop = item.backdrop_url.is_some() || metadata.is_some_and(|value| value.backdrop);
    let has_thumbnail = item.thumbnail_url.is_some() || metadata.is_some_and(|value| value.thumbnail);
    if !local_only && provider_id.is_none() { issues.push("Not matched to TMDB".into()); }
    if (item.kind == "movie" || item.kind == "special") && year.is_none() { issues.push("Release year is missing".into()); }
    if item.kind == "episode" {
        if item.show_title.as_deref().map_or(true, str::is_empty) { issues.push("Show name is missing".into()); }
        if item.season.is_none() || item.episode.is_none() { issues.push("Season or episode number is missing".into()); }
    }
    if !local_only && overview.map_or(true, |value| value.is_empty()) { issues.push("Overview is missing".into()); }
    if !local_only && !has_poster { issues.push("Poster is missing".into()); }
    if !local_only && !has_backdrop { issues.push("Backdrop is missing".into()); }
    if item.kind == "episode" && !has_thumbnail { issues.push("Episode artwork is missing".into()); }
    if item.duration_seconds.is_none() || item.container.is_none() { issues.push("Technical media probe is incomplete".into()); }
    let manual_match = !local_only && metadata.is_some_and(|value| value.manual_match);
    let status = if issues.is_empty() { "complete" }
        else if issues.iter().any(|issue| issue == "Source file is missing") { "missing-file" }
        else if issues.iter().any(|issue| issue == "Not matched to TMDB") { "unmatched" }
        else if issues.iter().any(|issue| issue.contains("artwork") || issue.contains("Poster") || issue.contains("Backdrop")) { "needs-artwork" }
        else if issues.iter().any(|issue| issue.contains("probe")) { "probe-failed" }
        else { "incomplete" }.to_string();
    LibraryHealthItem {
        id: item.id.clone(),
        title: metadata.and_then(|value| value.title.clone()).unwrap_or_else(|| item.title.clone()),
        kind: item.kind.clone(),
        year,
        path: item.path.clone(),
        status,
        issues,
        manual_match,
    }
}

pub fn report(state: &crate::app_state::AppState) -> Result<LibraryHealthReport, String> {
    let started = Instant::now();
    let media = state.media.read().map_err(|_| "Media lock poisoned")?.clone();
    let metadata = load_health_metadata(&state.database_path)?;
    let mut items = media.iter().map(|item| assess_item(item, metadata.get(&item.id))).collect::<Vec<_>>();
    items.sort_by(|a, b| a.status.cmp(&b.status).then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase())));
    let total = items.len();
    let complete = items.iter().filter(|item| item.status == "complete").count();
    let report = LibraryHealthReport {
        total, complete, needs_attention: total.saturating_sub(complete),
        unmatched: items.iter().filter(|item| item.status == "unmatched").count(),
        missing_artwork: items.iter().filter(|item| item.issues.iter().any(|issue| issue.contains("artwork") || issue.contains("Poster") || issue.contains("Backdrop"))).count(),
        missing_information: items.iter().filter(|item| item.issues.iter().any(|issue| issue.contains("Overview") || issue.contains("year") || issue.contains("Season") || issue.contains("Show name"))).count(),
        probe_failed: items.iter().filter(|item| item.issues.iter().any(|issue| issue.contains("probe"))).count(),
        missing_files: items.iter().filter(|item| item.status == "missing-file").count(),
        items,
    };
    activity::info(
        "Library Health",
        format!("Checked {} media items in {} ms", report.total, started.elapsed().as_millis()),
    );
    Ok(report)
}

async fn repair_target(state: &crate::app_state::AppState, media_id: &str) -> Result<(String, bool), String> {
    let entity = metadata::entity_for_media(&state.database_path, media_id)?.ok_or("Metadata entity is missing")?;
    let target = if entity.entity_type == "movie" { entity } else { metadata::series_for_media(&state.database_path, media_id)?.ok_or("Series metadata entity is missing")? };
    if let Some(existing) = metadata::provider_match(&state.database_path, &target.id, "tmdb")? {
        metadata::tmdb::apply_match(&state.database_path, media_id, &existing.provider_id, &existing.matched_by, existing.locked).await?;
        Ok((target.id, true))
    } else {
        let matched = metadata::tmdb::auto_match(&state.database_path, media_id).await?;
        Ok((target.id, matched))
    }
}

fn repair_target_id(state: &crate::app_state::AppState, media_id: &str) -> Result<String, String> {
    let entity = metadata::entity_for_media(&state.database_path, media_id)?.ok_or("Metadata entity is missing")?;
    if entity.entity_type == "movie" { Ok(entity.id) }
    else { Ok(metadata::series_for_media(&state.database_path, media_id)?.ok_or("Series metadata entity is missing")?.id) }
}

#[tauri::command]
pub async fn library_health(state: State<'_, Shared>) -> Result<LibraryHealthReport, String> {
    let shared = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || report(&shared)).await.map_err(|error| error.to_string())?
}

async fn report_async(shared: Shared) -> Result<LibraryHealthReport, String> {
    tauri::async_runtime::spawn_blocking(move || report(&shared)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn library_health_repair_item(id: String, state: State<'_, Shared>) -> Result<RepairReport, String> {
    let before = report_async(state.inner().clone()).await?;
    let was_incomplete = before.items.iter().any(|item| item.id == id && item.status != "complete");
    let (_, refreshed) = repair_target(&state, &id).await?;
    let health = report_async(state.inner().clone()).await?;
    let repaired = usize::from(was_incomplete && health.items.iter().any(|item| item.id == id && item.status == "complete"));
    Ok(RepairReport { attempted: 1, repaired, refreshed: usize::from(refreshed), needs_review: usize::from(repaired == 0), failed: 0, failures: vec![], health })
}

#[tauri::command]
pub async fn library_health_repair_all(state: State<'_, Shared>) -> Result<RepairReport, String> {
    if !metadata::tmdb::configured() { return Err("Configure TMDB in Settings → Metadata before repairing the library.".into()); }
    let before = report_async(state.inner().clone()).await?;
    let candidates = before.items.iter().filter(|item| item.status != "complete" && item.status != "missing-file" && !item.issues.iter().all(|issue| issue.contains("probe"))).map(|item| (item.id.clone(), item.title.clone())).collect::<Vec<_>>();
    let mut seen = HashSet::new();
    let mut attempted = 0; let mut refreshed = 0; let mut failures = Vec::new();
    for (id, title) in candidates {
        let target = match repair_target_id(&state, &id) {
            Ok(target) if seen.insert(target.clone()) => target,
            Ok(_) => continue,
            Err(error) => { attempted += 1; failures.push(format!("{title}: {error}")); continue; }
        };
        match repair_target(&state, &id).await {
            Ok((repaired_target, did_refresh)) => {
                debug_assert_eq!(target, repaired_target);
                attempted += 1;
                refreshed += usize::from(did_refresh);
            }
            Err(error) => { attempted += 1; failures.push(format!("{title}: {error}")); }
        }
    }
    let health = report_async(state.inner().clone()).await?;
    let repaired = before.needs_attention.saturating_sub(health.needs_attention);
    let needs_review = health.items.iter().filter(|item| item.status == "unmatched").count();
    activity::info("Library", format!("Metadata repair complete: {repaired} repaired, {needs_review} need review, {} failed", failures.len()));
    Ok(RepairReport { attempted, repaired, refreshed, needs_review, failed: failures.len(), failures, health })
}
