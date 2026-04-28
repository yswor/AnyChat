use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use tauri::Emitter;
use tokio::sync::oneshot;

/// Result of a WebView-based HTTP fetch
pub struct WebViewResult {
    pub status: u16,
    pub content_type: String,
    pub body: Vec<u8>,
}

/// Global pending requests awaiting WebView response
static PENDING: LazyLock<Mutex<HashMap<String, oneshot::Sender<WebViewResult>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Send a URL to the frontend WebView for fetching, wait for result.
/// Used as fallback when native TLS is blocked (e.g. Cloudflare).
pub async fn fetch_via_webview(
    url: &str,
    app: &tauri::AppHandle,
) -> Result<(Vec<u8>, String), crate::error::AppError> {
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel();

    PENDING.lock().unwrap().insert(id.clone(), tx);

    let _ = app.emit(
        "webfetch-request",
        serde_json::json!({ "id": id, "url": url }),
    );

    match tokio::time::timeout(std::time::Duration::from_secs(30), rx).await {
        Ok(Ok(result)) => {
            if result.status >= 400 {
                let preview = String::from_utf8_lossy(&result.body)
                    .chars()
                    .take(500)
                    .collect::<String>();
                Err(crate::error::AppError::Http(format!(
                    "WebView fetch HTTP {}: {}",
                    result.status, preview
                )))
            } else {
                Ok((result.body, result.content_type))
            }
        }
        Ok(Err(_)) => Err(crate::error::AppError::Stream(
            "WebView fetch channel closed".into(),
        )),
        Err(_) => {
            PENDING.lock().unwrap().remove(&id);
            Err(crate::error::AppError::Stream(
                "WebView fetch timed out".into(),
            ))
        }
    }
}

/// Tauri command: frontend calls this after completing a WebView fetch
#[tauri::command]
pub fn webfetch_result(
    id: String,
    status: u16,
    content_type: String,
    body_base64: String,
) -> Result<(), String> {
    let body = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &body_base64)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let mut pending = PENDING.lock().unwrap();
    if let Some(tx) = pending.remove(&id) {
        let _ = tx.send(WebViewResult {
            status,
            content_type,
            body,
        });
    }
    Ok(())
}
