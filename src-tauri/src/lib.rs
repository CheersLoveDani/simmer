// The app's logic lives in the web layer. The native side only wires up the
// platform plugins it needs: notifications for timers, opening links in the
// system browser, fetching recipe pages for import, and (on desktop) self-update and remembering where the
// window was.
mod page;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![page::fetch_page]);

    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Simmer");
}
