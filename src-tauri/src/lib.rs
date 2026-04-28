mod api_client;
mod commands;
mod error;
mod store;
mod web_fetch;
mod webview_bridge;

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt::init();

    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add frequency_penalty and presence_penalty",
            sql: include_str!("../migrations/002_add_penalty_fields.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add usage_details and provider_id to messages",
            sql: include_str!("../migrations/003_add_usage_provider.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add tool_call_id to messages",
            sql: include_str!("../migrations/004_add_tool_call_id.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:anychat.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::provider::test_connection,
            commands::provider::fetch_balance,
            commands::provider::encrypt_key,
            commands::provider::decrypt_key,
            commands::conversation::stream_chat,
            webview_bridge::webfetch_result,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
