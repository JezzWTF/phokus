mod captioner;
mod color;
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
        // Must be the first plugin: a second launch hands its args to the
        // running instance and exits before anything else initializes.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("phokus".into()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(5 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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

            // FFmpeg provisioning happens in the background so the window
            // appears immediately; workers gate video/AVIF jobs on readiness and
            // the onboarding/Settings UI shows progress and retry.
            media::spawn_ffmpeg_provision(app.handle().clone());

            let db_path = app_dir.join("gallery.db");
            let pool = db::create_pool(&db_path).expect("Failed to create database pool");
            let media_tools = media::MediaTools::resolve();

            {
                let conn = pool.get().expect("Failed to get connection for migration");
                db::migrate(&conn).expect("Failed to run migrations");
                db::reset_inflight_jobs(&conn).expect("Failed to reset inflight jobs");
                let repaired_deferred = db::repair_deferred_embedding_jobs(&conn)
                    .expect("Failed to repair deferred embedding jobs");
                if repaired_deferred > 0 {
                    log::info!("Requeued {repaired_deferred} deferred embedding jobs.");
                }
                let repaired_avif =
                    db::repair_avif_jobs(&conn).expect("Failed to repair AVIF jobs");
                if repaired_avif > 0 {
                    log::info!("Requeued {repaired_avif} AVIF jobs.");
                }
                let backfilled =
                    db::backfill_embedding_jobs(&conn).expect("Failed to backfill embedding jobs");
                if backfilled > 0 {
                    log::info!("Backfilled {backfilled} embedding jobs.");
                }
                let (orphaned_vectors, missing_vectors) = db::repair_embedding_consistency(&conn)
                    .expect("Failed to repair embedding consistency");
                if orphaned_vectors > 0 || missing_vectors > 0 {
                    log::info!(
                        "Repaired embedding consistency: removed {orphaned_vectors} orphaned vectors, requeued {missing_vectors} missing vectors."
                    );
                }
            }

            let thumb_dir = app_dir.join("thumbnails");
            std::fs::create_dir_all(&thumb_dir).expect("Failed to create thumbnail dir");

            // The asset protocol scope is no longer a blanket "**": thumbnails
            // are allowed statically in tauri.conf.json, and each indexed
            // folder is allowed here (and in add_folder/update_folder_path).
            {
                let scope = app.asset_protocol_scope();
                let conn = pool.get().expect("Failed to get connection for asset scope");
                for folder in db::get_folders(&conn).unwrap_or_default() {
                    if let Err(error) = scope.allow_directory(&folder.path, true) {
                        log::error!("Failed to allow asset scope for {}: {}", folder.path, error);
                    }
                }
            }

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
            // Backfill color palettes for images indexed before color search existed.
            indexer::start_color_backfill(app.handle().clone(), pool.clone());

            let watcher_handle = indexer::start_watcher(app.handle().clone(), pool.clone(), thumb_dir.clone());

            app.manage(pool);
            app.manage(media_tools);
            app.manage(watcher_handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_folder,
            commands::add_folders,
            commands::list_directories,
            commands::get_folders,
            commands::reorder_folders,
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
            commands::get_failed_tagging_images,
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
            commands::rename_tag,
            commands::delete_tag,
            commands::get_image_exif,
            commands::list_albums,
            commands::create_album,
            commands::rename_album,
            commands::delete_album,
            commands::delete_albums,
            commands::reorder_albums,
            commands::add_images_to_album,
            commands::remove_images_from_album,
            commands::get_album_images,
            commands::bulk_update_details,
            commands::bulk_add_tags,
            commands::bulk_remove_tag,
            commands::get_build_variant,
            commands::search_tags_autocomplete,
            commands::find_duplicates,
            commands::load_duplicate_scan_cache,
            commands::invalidate_duplicate_scan_cache,
            commands::delete_images_from_disk,
            commands::rename_folder,
            commands::update_folder_path,
            commands::get_tagging_queue_scope,
            commands::set_tagging_queue_scope,
            commands::get_tagging_queue_folder_ids,
            commands::set_tagging_queue_folder_ids,
            commands::open_app_data_folder,
            commands::get_database_info,
            commands::vacuum_database,
            commands::rebuild_semantic_index,
            commands::get_orphaned_thumbnails_info,
            commands::cleanup_orphaned_thumbnails,
            commands::get_muted_folder_ids,
            commands::set_muted_folder_ids,
            commands::get_ffmpeg_status,
            commands::retry_ffmpeg_download,
            commands::get_onboarding_completed,
            commands::set_onboarding_completed,
            commands::get_last_seen_version,
            commands::set_last_seen_version,
            commands::get_notifications_paused,
            commands::set_notifications_paused,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
