use crate::error::AppError;

pub async fn fetch_url(url: &str, _api_key: &str) -> Result<String, AppError> {
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
        .map_err(|e| AppError::Http(format!("Connection failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
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
        .map_err(|e| AppError::Http(format!("Failed to read response: {}", e)))?;

    if bytes.len() > max_size {
        return Err(AppError::Http(format!(
            "Response too large ({} bytes, max {} bytes)",
            bytes.len(),
            max_size
        )));
    }

    let text = String::from_utf8_lossy(&bytes).to_string();

    if content_type.contains("text/html") {
        let md = html2md::rewrite_html(&text, false);
        if !md.trim().is_empty() {
            return Ok(md);
        }
        return Err(AppError::Http("Failed to parse HTML content".into()));
    }

    if text.len() > 100_000 {
        return Ok(text[..100_000].to_string() + "\n\n[内容过长，已截断]");
    }
    Ok(text)
}
