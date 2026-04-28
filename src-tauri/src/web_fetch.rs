use crate::error::AppError;

pub async fn fetch_url(
    url: &str,
    format: &str,
    timeout_secs: u64,
) -> Result<String, AppError> {
    tracing::info!("[webfetch] Fetching URL: {} (format={}, timeout={}s)", url, format, timeout_secs);

    let timeout = std::time::Duration::from_secs(timeout_secs.clamp(1, 120));

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| AppError::Http(format!("Failed to create HTTP client: {}", e)))?;

    let resp = do_fetch(&client, url, false).await?;

    // CloudFlare bot detection — retry with honest UA
    let resp = if is_cf_blocked(&resp) {
        tracing::info!("[webfetch] CloudFlare blocked, retrying with honest UA for {}", url);
        do_fetch(&client, url, true).await?
    } else {
        resp
    };

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

    // Pre-check Content-Length header to reject oversized responses early
    let max_size = 5 * 1024 * 1024; // 5MB
    if let Some(len_str) = resp.headers().get("content-length") {
        if let Ok(len) = len_str.to_str().unwrap_or("0").parse::<usize>() {
            if len > max_size {
                tracing::warn!(
                    "[webfetch] Content-Length {} exceeds limit for {} (max {})",
                    len, url, max_size
                );
                return Err(AppError::Http(format!(
                    "Response too large ({} bytes, max {} bytes)",
                    len, max_size
                )));
            }
        }
    }

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

    let fmt = if format.is_empty() { "markdown" } else { format };

    match fmt {
        "html" => {
            tracing::info!("[webfetch] Returning raw HTML, {} chars", text.len());
            Ok(text)
        }
        "text" if content_type.contains("text/html") => {
            let plain = strip_html_tags(&text);
            tracing::info!("[webfetch] HTML stripped to plain text, {} chars", plain.len());
            Ok(plain)
        }
        "markdown" if content_type.contains("text/html") => {
            let md = html2md::rewrite_html(&text, false);
            if !md.trim().is_empty() {
                tracing::info!("[webfetch] HTML converted to markdown, {} chars", md.len());
                return Ok(md);
            }
            tracing::warn!("[webfetch] Failed to parse HTML content for {}", url);
            Err(AppError::Http("Failed to parse HTML content".into()))
        }
        _ => {
            if text.len() > 100_000 {
                let truncated_len = 100_000 + "[内容过长，已截断]".len();
                tracing::info!(
                    "[webfetch] Text truncated from {} to {} chars for {}",
                    text.len(), truncated_len, url
                );
                return Ok(text[..100_000].to_string() + "\n\n[内容过长，已截断]");
            }
            tracing::info!("[webfetch] Successfully fetched {} chars from {}", text.len(), url);
            Ok(text)
        }
    }
}

async fn do_fetch(
    client: &reqwest::Client,
    url: &str,
    honest_ua: bool,
) -> Result<reqwest::Response, AppError> {
    let ua = if honest_ua {
        "opencode"
    } else {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36"
    };
    client
        .get(url)
        .header("User-Agent", ua)
        .header("Accept", "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| {
            tracing::warn!("[webfetch] Connection failed for {}: {}", url, e);
            AppError::Http(format!("Connection failed: {}", e))
        })
}

fn is_cf_blocked(resp: &reqwest::Response) -> bool {
    resp.status().as_u16() == 403
        && resp
            .headers()
            .get("cf-mitigated")
            .and_then(|v| v.to_str().ok())
            .map(|v| v == "challenge")
            .unwrap_or(false)
}

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    result
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}
