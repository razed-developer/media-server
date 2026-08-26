use crate::{activity, metadata, metadata_view, models::MediaItem, Shared};
use serde::Serialize;
use std::{collections::HashSet, path::Path};
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

fn assess_item(database_path: &Path, item: &MediaItem) -> LibraryHealthItem {
    let mut issues: Vec<String> = Vec::new();
    if !Path::new(&item.path).is_file() { issues.push("Source file is missing".into()); }
    let local_only = item.kind == "collection";
    if !local_only && item.provider_id.is_none() { issues.push("Not matched to TMDB".into()); }
    if (item.kind == "movie" || item.kind == "special") && item.year.is_none() { issues.push("Release year is missing".into()); }
    if item.kind == "episode" {
        if item.show_title.as_deref().map_or(true, str::is_empty) { issues.push("Show name is missing".into()); }
        if item.season.is_none() || item.episode.is_none() { issues.push("Season or episode number is missing".into()); }
    }
    if !local_only && item.overview.as_deref().map_or(true, str::is_empty) { issues.push("Overview is missing".into()); }
    if !local_only && item.poster_url.is_none() { issues.push("Poster is missing".into()); }
    if !local_only && item.backdrop_url.is_none() { issues.push("Backdrop is missing".into()); }
    if item.kind == "episode" && item.thumbnail_url.is_none() { issues.push("Episode artwork is missing".into()); }
    if item.duration_seconds.is_none() || item.container.is_none() { issues.push("Technical media probe is incomplete".into()); }
    let manual_match = !local_only && metadata::entity_for_media(database_path, &item.id).ok().flatten().and_then(|entity| {
        let target = if entity.entity_type == "movie" { Some(entity) } else { metadata::series_for_media(database_path, &item.id).ok().flatten() }?;
        metadata::provider_match(database_path, &target.id, "tmdb").ok().flatten()
    }).is_some_and(|value| value.locked || value.matched_by == "manual");
    let status = if issues.is_empty() { "complete" }
        else if issues.iter().any(|issue| issue == "Source file is missing") { "missing-file" }
        else if issues.iter().any(|issue| issue == "Not matched to TMDB") { "unmatched" }
        else if issues.iter().any(|issue| issue.contains("artwork") || issue.contains("Poster") || issue.contains("Backdrop")) { "needs-artwork" }
        else if issues.iter().any(|issue| issue.contains("probe")) { "probe-failed" }
        else { "incomplete" }.to_string();
    LibraryHealthItem { id: item.id.clone(), title: item.title.clone(), kind: item.kind.clone(), year: item.year, path: item.path.clone(), status, issues, manual_match }
}

pub fn report(state: &crate::app_state::AppState) -> Result<LibraryHealthReport, String> {
    let mut media = state.media.read().map_err(|_| "Media lock poisoned")?.clone();
    metadata::enrich_media(&state.database_path, &mut media)?;
    metadata_view::canonicalize(&state.database_path, &mut media)?;
    let mut items = media.iter().map(|item| assess_item(&state.database_path, item)).collect::<Vec<_>>();
    items.sort_by(|a, b| a.status.cmp(&b.status).then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase())));
    let total = items.len();
    let complete = items.iter().filter(|item| item.status == "complete").count();
    Ok(LibraryHealthReport {
        total, complete, needs_attention: total.saturating_sub(complete),
        unmatched: items.iter().filter(|item| item.status == "unmatched").count(),
        missing_artwork: items.iter().filter(|item| item.issues.iter().any(|issue| issue.contains("artwork") || issue.contains("Poster") || issue.contains("Backdrop"))).count(),
        missing_information: items.iter().filter(|item| item.issues.iter().any(|issue| issue.contains("Overview") || issue.contains("year") || issue.contains("Season") || issue.contains("Show name"))).count(),
        probe_failed: items.iter().filter(|item| item.issues.iter().any(|issue| issue.contains("probe"))).count(),
        missing_files: items.iter().filter(|item| item.status == "missing-file").count(),
        items,
    })
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
