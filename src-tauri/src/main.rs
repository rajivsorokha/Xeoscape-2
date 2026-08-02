// Suppresses the console window that Windows otherwise shows alongside
// the app window in release builds (kept visible in debug builds, so
// `cargo run`/`tauri dev` still shows log output in the terminal you
// launched it from).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// src-tauri/src/main.rs
//
// This is a thin native shell around the existing Node/Express/NeDB
// backend (the whole app's actual logic -- products, transactions,
// reports, etc. -- lives there unchanged). Responsibilities here are
// deliberately narrow:
//   1. Spawn the backend as a sidecar process on startup.
//   2. Wait until it's actually listening before showing the window
//      (the window is created hidden -- see tauri.conf.json -- so we
//      never show a "connection refused" page during the brief window
//      while the backend is still starting up).
//   3. Build the native menu bar and translate menu clicks into either
//      a window event the frontend listens for (see
//      assets/js/native_menu/tauri-menu-bridge.js), or a native dialog
//      / file-manager action handled entirely here.
//   4. Make sure the sidecar process is killed when the app exits --
//      otherwise it would keep running as an orphaned background
//      process holding the port open.
//
// NOTE: this file has not been compiled in the environment that wrote
// it (no Rust toolchain was available there) -- it's written carefully
// against the documented Tauri 2.x / plugin APIs, but treat the first
// `cargo build` / `tauri build` on your machine as the real test, the
// same way we iterated on the Windows installer earlier. If a method
// name doesn't match what's installed, the compiler error will point
// at the exact line -- send that over and it's a quick fix.

use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

const BACKEND_HOST: &str = "127.0.0.1";
const BACKEND_PORT: u16 = 4173;
const READY_POLL_ATTEMPTS: u32 = 60; // 60 * 250ms = up to 15s
const READY_POLL_INTERVAL_MS: u64 = 250;

/// Holds the running sidecar child process so it can be killed on exit.
struct SidecarState(Mutex<Option<CommandChild>>);

fn backend_data_dir(app: &AppHandle) -> std::path::PathBuf {
    // Mirrors app.config.js's own resolution: the backend's dataDir is
    // "<app data dir>/store". We compute the same path here (rather
    // than trying to ask the running Node process) so native actions
    // like "View Logs" work even before/without a successful backend
    // handshake.
    app.path()
        .app_data_dir()
        .expect("could not resolve app data directory")
        .join("store")
}

fn spawn_backend(app: &AppHandle) {
    let data_dir = backend_data_dir(app);

    let sidecar_command = app
        .shell()
        .sidecar("xeoscape-backend")
        .expect("failed to create sidecar command for xeoscape-backend")
        .env("XEOSCAPE_DATA_DIR", data_dir.to_string_lossy().to_string())
        .env("PORT", BACKEND_PORT.to_string());

    let (mut rx, child) = sidecar_command
        .spawn()
        .expect("failed to spawn xeoscape-backend sidecar");

    app.state::<SidecarState>().0.lock().unwrap().replace(child);

    // Forward the sidecar's own stdout/stderr into this process's
    // output during development -- in production this mostly just
    // mirrors what's already captured in the backend's own log file
    // (see core/logger.js), but it's useful while `tauri dev` is open.
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    print!("[backend] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprint!("[backend] {}", String::from_utf8_lossy(&line));
                }
                _ => {}
            }
        }
    });
}

/// Blocks (on a background thread) until the backend is accepting TCP
/// connections, then shows the main window. Falls back to showing the
/// window with an error dialog if it never comes up in time, rather
/// than leaving the app looking like it silently did nothing.
fn wait_for_backend_then_show_window(app: AppHandle) {
    std::thread::spawn(move || {
        let addr = format!("{BACKEND_HOST}:{BACKEND_PORT}");
        let mut ready = false;

        for _ in 0..READY_POLL_ATTEMPTS {
            if TcpStream::connect_timeout(
                &addr.parse().expect("invalid backend address"),
                Duration::from_millis(300),
            )
            .is_ok()
            {
                ready = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(READY_POLL_INTERVAL_MS));
        }

        if let Some(window) = app.get_webview_window("main") {
            if !ready {
                app.dialog()
                    .message(
                        "The application backend didn't start in time. \
                         Please check the log file (Help > View Logs) and try restarting the app.",
                    )
                    .title("Xeoscape")
                    .kind(MessageDialogKind::Error)
                    .buttons(MessageDialogButtons::Ok)
                    .blocking_show();
            }
            let _ = window.show();
            let _ = window.set_focus();
        }
    });
}

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let new_product = MenuItemBuilder::with_id("nav-new-product", "Product...").build(app)?;
    let new_customer = MenuItemBuilder::with_id("nav-new-customer", "Customer...").build(app)?;
    let new_submenu = SubmenuBuilder::new(app, "New")
        .item(&new_product)
        .item(&new_customer)
        .build()?;

    let logout = MenuItemBuilder::with_id("logout", "Log Out").build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_submenu)
        .separator()
        .item(&logout)
        .separator()
        .item(&PredefinedMenuItem::quit(app, None)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let nav_items = [
        ("nav-pos", "Point of Sale"),
        ("nav-products", "Products"),
        ("nav-categories", "Categories"),
        ("nav-customers", "Customers"),
        ("nav-transactions", "Transactions"),
        ("nav-settings", "Settings"),
    ];
    let mut view_builder = SubmenuBuilder::new(app, "View");
    for (id, label) in nav_items {
        view_builder = view_builder.item(&MenuItemBuilder::with_id(id, label).build(app)?);
    }
    let view_menu = view_builder.build()?;

    let about = MenuItemBuilder::with_id("about", "About Xeoscape").build(app)?;
    let view_logs = MenuItemBuilder::with_id("view-logs", "View Logs").build(app)?;
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&about)
        .item(&view_logs)
        .build()?;

    MenuBuilder::new(app)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&help_menu)
        .build()
}

fn handle_menu_event(app: &AppHandle, event_id: &str) {
    let nav_route = match event_id {
        "nav-new-product" => Some("products"),
        "nav-new-customer" => Some("customers"),
        "nav-pos" => Some("pos"),
        "nav-products" => Some("products"),
        "nav-categories" => Some("categories"),
        "nav-customers" => Some("customers"),
        "nav-transactions" => Some("transactions"),
        "nav-settings" => Some("settings"),
        _ => None,
    };

    if let Some(route) = nav_route {
        let _ = app.emit("menu:navigate", route);
        return;
    }

    match event_id {
        "logout" => {
            let _ = app.emit("menu:logout", ());
        }
        "about" => {
            app.dialog()
                .message(format!(
                    "Xeoscape\nVersion {}\n\u{00a9} Xeoscape",
                    app.package_info().version
                ))
                .title("About Xeoscape")
                .kind(MessageDialogKind::Info)
                .buttons(MessageDialogButtons::Ok)
                .blocking_show();
        }
        "view-logs" => {
            let log_path = backend_data_dir(app)
                .parent()
                .expect("data dir should have a parent")
                .join("logs")
                .join("app.log");
            if let Err(err) = app.opener().reveal_item_in_dir(log_path) {
                eprintln!("Failed to reveal log file: {err}");
            }
        }
        _ => {}
    }
}

fn main() {
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(None)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            spawn_backend(&handle);
            wait_for_backend_then_show_window(handle.clone());

            let menu = build_menu(&handle)?;
            app.set_menu(menu)?;

            Ok(())
        })
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            // Belt-and-suspenders: also kill the sidecar if the window
            // is closed directly (normally covered by ExitRequested
            // below too, but this fires even in edge cases where the
            // process doesn't otherwise get a chance to clean up).
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(child) = window
                    .app_handle()
                    .state::<SidecarState>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                if let Some(child) = app_handle.state::<SidecarState>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
