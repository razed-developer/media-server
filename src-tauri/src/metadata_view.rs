use crate::{metadata, models::MediaItem};
use std::path::Path;

fn art_url(size:&str,path:&str)->String{format!("/api/metadata/image/{size}/{}",urlencoding::encode(path))}

pub fn canonicalize(path:&Path,items:&mut[MediaItem])->Result<(),String>{
 for item in items.iter_mut(){
  if let Some(entity)=metadata::entity_for_media(path,&item.id)?{
   if !entity.title.trim().is_empty(){item.title=entity.title.clone();}
   if entity.year.is_some(){item.year=entity.year;}
   if entity.overview.is_some(){item.overview=entity.overview.clone();}
   if !entity.genres.is_empty(){item.genres=entity.genres.clone();}
   if entity.rating.is_some(){item.rating=entity.rating;}
   if entity.release_date.is_some(){item.release_date=entity.release_date.clone();}
   if let Some(p)=entity.poster_path.as_deref(){item.poster_url=Some(art_url("w500",p));}
   if let Some(p)=entity.backdrop_path.as_deref(){item.backdrop_url=Some(art_url("w1280",p));}
   if let Some(p)=entity.still_path.as_deref(){item.thumbnail_url=Some(art_url("w500",p));}
  }
  if item.kind=="episode"{
   if let Some(series)=metadata::series_for_media(path,&item.id)?{
    if !series.title.trim().is_empty(){item.show_title=Some(series.title.clone());}
    if item.genres.is_empty(){item.genres=series.genres.clone();}
    if item.poster_url.as_deref().is_none_or(|url|url.starts_with("/art/")){if let Some(p)=series.poster_path.as_deref(){item.poster_url=Some(art_url("w500",p));}}
    if item.backdrop_url.as_deref().is_none_or(|url|url.starts_with("/art/")){if let Some(p)=series.backdrop_path.as_deref(){item.backdrop_url=Some(art_url("w1280",p));}}
   }
  }
 }
 Ok(())
}
