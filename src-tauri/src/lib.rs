mod commands;
mod db;
mod indexer;
mod media;
mod thumbnail;
mod vector;

use tauri::Manager;

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
            }

            let thumb_dir = app_dir.join("thumbnails");
            std::fs::create_dir_all(&thumb_dir).expect("Failed to create thumbnail dir");

            indexer::start_thumbnail_worker(
                app.handle().clone(),
                pool.clone(),
                media_tools.clone(),
                thumb_dir,
            );
            indexer::start_metadata_worker(app.handle().clone(), pool.clone(), media_tools.clone());

            app.manage(pool);
            app.manage(media_tools);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::add_folder,
            commands::get_folders,
            commands::remove_folder,
            commands::get_images,
            commands::reindex_folder,
            commands::update_image_details,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
