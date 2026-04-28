use crate::error::AppError;

pub async fn fetch_url(url: &str, _api_key: &str) -> Result<String, AppError> {
    tracing::info!("[webfetch] Fetching URL: {}", url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Http(format!("Failed to create HTTP client: {}", e)))?;

    let resp = client
        .get(url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| {
            tracing::warn!("[webfetch] Connection failed for {}: {}", url, e);
            AppError::Http(format!("Connection failed: {}", e))
        })?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        tracing::warn!("[webfetch] HTTP {} for {}", status, url);
        return Err(AppError::Http(format!("HTTP {}: {}", status, text)));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let max_size = 2 * 1024 * 1024;
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| {
            tracing::warn!("[webfetch] Failed to read response body for {}: {}", url, e);
            AppError::Http(format!("Failed to read response: {}", e))
        })?;

    if bytes.len() > max_size {
        tracing::warn!(
            "[webfetch] Response too large for {}: {} bytes (max {})",
            url,
            bytes.len(),
            max_size
        );
        return Err(AppError::Http(format!(
            "Response too large ({} bytes, max {} bytes)",
            bytes.len(),
            max_size
        )));
    }

    let text = String::from_utf8_lossy(&bytes).to_string();

    tracing::info!(
        "[webfetch] Received {} bytes from {} (content-type: {})",
        bytes.len(),
        url,
        content_type
    );

    if content_type.contains("text/html") {
        let md = html2md::rewrite_html(&text, false);
        if !md.trim().is_empty() {
            tracing::info!("[webfetch] HTML converted to markdown, {} chars", md.len());
            return Ok(md);
        }
        tracing::warn!("[webfetch] Failed to parse HTML content for {}", url);
        return Err(AppError::Http("Failed to parse HTML content".into()));
    }

    if text.len() > 100_000 {
        let truncated_len = 100_000 + "[内容过长，已截断]".len();
        tracing::info!(
            "[webfetch] Text truncated from {} to {} chars for {}",
            text.len(),
            truncated_len,
            url
        );
        return Ok(text[..100_000].to_string() + "\n\n[内容过长，已截断]");
    }
    tracing::info!("[webfetch] Successfully fetched {} chars from {}", text.len(), url);
    Ok(text)
}
