mod captioner;
mod commands;
mod db;
mod embedder;
mod hnsw_index;
mod indexer;
mod media;
mod storage;
mod tagger;
mod thumbnail;
mod vector;

use crate::storage::StorageProfile;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");

            media::MediaTools::ensure_installed().expect("Failed to provision FFmpeg sidecar");

            let db_path = app_dir.join("gallery.db");
            let pool = db::create_pool(&db_path).expect("Failed to create database pool");
            let media_tools = media::MediaTools::resolve();

            {
                let conn = pool.get().expect("Failed to get connection for migration");
                db::migrate(&conn).expect("Failed to run migrations");
                db::reset_inflight_jobs(&conn).expect("Failed to reset inflight jobs");
                let backfilled =
                    db::backfill_embedding_jobs(&conn).expect("Failed to backfill embedding jobs");
                if backfilled > 0 {
                    println!("Backfilled {} embedding jobs.", backfilled);
                }
                let (orphaned_vectors, missing_vectors) = db::repair_embedding_consistency(&conn)
                    .expect("Failed to repair embedding consistency");
                if orphaned_vectors > 0 || missing_vectors > 0 {
                    println!(
                        "Repaired embedding consistency: removed {} orphaned vectors, requeued {} missing vectors.",
                        orphaned_vectors, missing_vectors
                    );
                }
            }

            let thumb_dir = app_dir.join("thumbnails");
            std::fs::create_dir_all(&thumb_dir).expect("Failed to create thumbnail dir");

            let thumbnail_worker_count = std::thread::available_parallelism()
                .map(|parallelism| StorageProfile::Balanced.thumbnail_workers(parallelism.get()))
                .unwrap_or(2);

            for _ in 0..thumbnail_worker_count {
                indexer::start_thumbnail_worker(
                    app.handle().clone(),
                    pool.clone(),
                    media_tools.clone(),
                    thumb_dir.clone(),
                );
            }
            indexer::start_metadata_worker(app.handle().clone(), pool.clone(), media_tools.clone());
            indexer::start_embedding_worker(app.handle().clone(), pool.clone());
            // Caption worker disabled — UI removed; keeping backend code intact for future use.
            // indexer::start_caption_worker(app.handle().clone(), pool.clone(), app_dir.clone());
            indexer::start_tagging_worker(app.handle().clone(), pool.clone(), app_dir.clone());

            let watcher_handle = indexer::start_watcher(app.handle().clone(), pool.clone());

            app.manage(pool);
            app.manage(media_tools);
            app.manage(watcher_handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_folder,
            commands::get_folders,
            commands::get_background_job_progress,
            commands::remove_folder,
            commands::get_images,
            commands::reindex_folder,
            commands::update_image_details,
            commands::find_similar_images,
            commands::find_similar_by_region,
            commands::debug_similar_images,
            commands::retry_failed_embeddings,
            commands::semantic_search_images,
            commands::search_images_by_tag,
            commands::get_caption_model_status,
            commands::get_caption_acceleration,
            commands::set_caption_acceleration,
            commands::get_caption_detail,
            commands::set_caption_detail,
            commands::prepare_caption_model,
            commands::delete_caption_model,
            commands::probe_caption_runtime,
            commands::probe_caption_image,
            commands::generate_caption_for_image,
            commands::queue_caption_jobs,
            commands::clear_caption_jobs,
            commands::reset_generated_captions,
            commands::set_generated_caption,
            commands::suggest_image_tags,
            commands::set_worker_paused,
            commands::get_worker_states,
            commands::get_tag_cloud,
            commands::get_explore_tags,
            commands::get_images_by_ids,
            commands::get_failed_embedding_images,
            commands::get_tagger_model_status,
            commands::get_tagger_acceleration,
            commands::set_tagger_acceleration,
            commands::probe_tagger_runtime,
            commands::get_tagger_threshold,
            commands::set_tagger_threshold,
            commands::get_tagger_batch_size,
            commands::set_tagger_batch_size,
            commands::prepare_tagger_model,
            commands::delete_tagger_model,
            commands::queue_tagging_jobs,
            commands::clear_tagging_jobs,
            commands::get_image_tags,
            commands::add_user_tag,
            commands::remove_tag,
            commands::search_tags_autocomplete,
            commands::find_duplicates,
            commands::load_duplicate_scan_cache,
            commands::invalidate_duplicate_scan_cache,
            commands::delete_images_from_disk,
            commands::rename_folder,
            commands::update_folder_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
