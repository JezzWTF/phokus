mod commands;
mod db;
mod embedder;
mod indexer;
mod media;
mod storage;
mod thumbnail;
mod vector;

use tauri::Manager;
use crate::storage::StorageProfile;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
                let backfilled = db::backfill_embedding_jobs(&conn)
                    .expect("Failed to backfill embedding jobs");
                if backfilled > 0 {
                    println!("Backfilled {} embedding jobs.", backfilled);
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

            app.manage(pool);
            app.manage(media_tools);

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
            commands::retry_failed_embeddings,
            commands::semantic_search_images,
            commands::set_worker_paused,
            commands::get_worker_states,
            commands::get_tag_cloud,
            commands::get_failed_embedding_images,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
