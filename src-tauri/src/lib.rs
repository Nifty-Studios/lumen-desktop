mod boot;
mod db;
mod device;
mod reminders;
mod spell;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            app.manage(db::Db::open(&dir.join("lumen.db"))?);
            // While WebView2 starts: read what the first screen will ask for.
            app.manage(boot::Boot::start(app.handle(), &dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_query,
            db::db_batch,
            boot::boot_take,
            boot::boot_plan,
            spell::spell_warm,
            spell::spell_check,
            spell::spell_suggest,
            spell::spell_personal,
            device::device_location,
            device::save_file,
            reminders::schedule_reminders
        ])
        .run(tauri::generate_context!())
        .expect("error while running Lumen");
}
