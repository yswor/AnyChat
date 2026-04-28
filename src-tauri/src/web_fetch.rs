use crate::error::AppError;

pub async fn fetch_url(
    url: &str,
    format: &str,
    timeout_secs: u64,
    app: &tauri::AppHandle,
) -> Result<String, AppError> {
    tracing::info!(
        "[webfetch] Fetching URL: {} (format={}, timeout={}s)",
        url,
        format,
        timeout_secs
    );

    let timeout = std::time::Duration::from_secs(timeout_secs.clamp(1, 120));
    let max_size = 5 * 1024 * 1024; // 5MB

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| AppError::Http(format!("Failed to create HTTP client: {}", e)))?;

    // Attempt 1: browser UA
    let mut output = fetch_and_read(&client, url, false, max_size).await?;

    // Cloudflare blocked — retry with honest UA
    if is_cf_blocked(output.status, &output.cf_headers, &output.bytes) {
        tracing::info!(
            "[webfetch] Cloudflare blocked, retrying with honest UA for {}",
            url
        );
        output = fetch_and_read(&client, url, true, max_size)
            .await
            .map_err(|e| {
                tracing::warn!("[webfetch] Retry failed for {}: {}", url, e);
                e
            })?;

        // Still CF blocked after retry — fall back to WebView (Chrome TLS)
        if is_cf_blocked(output.status, &output.cf_headers, &output.bytes) {
            tracing::info!(
                "[webfetch] Still CF blocked, falling back to WebView fetch for {}",
                url
            );
            let (bytes, ct) = crate::webview_bridge::fetch_via_webview(url, app).await?;
            return process_bytes(bytes, &ct, format, url);
        }
    }

    if output.status >= 400 {
        let text = String::from_utf8_lossy(&output.bytes);
        tracing::warn!("[webfetch] HTTP {} for {}", output.status, url);
        return Err(AppError::Http(format!("HTTP {}: {}", output.status, text)));
    }

    process_bytes(output.bytes, &output.content_type, format, url)
}

fn process_bytes(
    bytes: Vec<u8>,
    content_type: &str,
    format: &str,
    url: &str,
) -> Result<String, AppError> {
    tracing::info!(
        "[webfetch] Received {} bytes from {} (content-type: {})",
        bytes.len(),
        url,
        content_type
    );

    let text = String::from_utf8_lossy(&bytes).to_string();
    let fmt = if format.is_empty() {
        "markdown"
    } else {
        format
    };

    match fmt {
        "html" => {
            tracing::info!("[webfetch] Returning raw HTML, {} chars", text.len());
            Ok(text)
        }
        "text" if content_type.contains("text/html") => {
            let plain = strip_html_tags(&text);
            tracing::info!(
                "[webfetch] HTML stripped to plain text, {} chars",
                plain.len()
            );
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
                    text.len(),
                    truncated_len,
                    url
                );
                return Ok(text[..100_000].to_string() + "\n\n[内容过长，已截断]");
            }
            tracing::info!(
                "[webfetch] Successfully fetched {} chars from {}",
                text.len(),
                url
            );
            Ok(text)
        }
    }
}

struct CfHeaders {
    cf_mitigated: bool,
    has_cf_ray: bool,
    server_is_cloudflare: bool,
}

/// Result of a single HTTP fetch with full body
struct FetchOutput {
    status: u16,
    cf_headers: CfHeaders,
    content_type: String,
    bytes: Vec<u8>,
}

/// Executes a single HTTP GET, reads headers + full body (with size checks)
async fn fetch_and_read(
    client: &reqwest::Client,
    url: &str,
    honest_ua: bool,
    max_size: usize,
) -> Result<FetchOutput, AppError> {
    let resp = do_fetch(client, url, honest_ua).await?;
    let status = resp.status().as_u16();

    let cf_headers = CfHeaders {
        cf_mitigated: resp
            .headers()
            .get("cf-mitigated")
            .and_then(|v| v.to_str().ok())
            .map(|v| v == "challenge")
            .unwrap_or(false),
        has_cf_ray: resp.headers().contains_key("cf-ray"),
        server_is_cloudflare: resp
            .headers()
            .get("server")
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_lowercase().contains("cloudflare"))
            .unwrap_or(false),
    };

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // Pre-check Content-Length to reject oversized responses early
    if let Some(len_str) = resp.headers().get("content-length") {
        if let Ok(len) = len_str.to_str().unwrap_or("0").parse::<usize>() {
            if len > max_size {
                tracing::warn!(
                    "[webfetch] Content-Length {} exceeds limit for {} (max {})",
                    len,
                    url,
                    max_size
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
        })?
        .to_vec();

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

    Ok(FetchOutput {
        status,
        cf_headers,
        content_type,
        bytes,
    })
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

/// Detect Cloudflare anti-bot pages via headers OR body content
fn is_cf_blocked(status: u16, cf: &CfHeaders, bytes: &[u8]) -> bool {
    if status != 403 && status != 503 {
        return false;
    }

    // Header-based detection (cheap, check first)
    if cf.cf_mitigated || cf.has_cf_ray || cf.server_is_cloudflare {
        return true;
    }

    // Body-based detection (more expensive, only fall through if headers are ambiguous)
    let body = String::from_utf8_lossy(bytes);
    let lower = body.to_lowercase();

    // Cloudflare challenge page markers
    lower.contains("_cf_chl_opt")
        || lower.contains("cf-browser-verify")
        || lower.contains("challenge-platform")
        || lower.contains("cf-captcha")
        || (lower.contains("just a moment") && lower.contains("cloudflare"))
        || (lower.contains("checking your browser") && lower.contains("cloudflare"))
        || (lower.contains("cloudflare") && lower.contains("attention required"))
        || lower.contains("cf-chl-bypass")
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
