use crate::error::AppError;

pub async fn fetch_url(
    url: &str,
    format: &str,
    timeout_secs: u64,
    _app: &tauri::AppHandle,
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

    let output = fetch_and_read(&client, url, max_size, format).await?;

    if output.status >= 400 {
        let text = String::from_utf8_lossy(&output.bytes);
        tracing::warn!("[webfetch] HTTP {} for {}", output.status, url);
        return Err(AppError::Http(format!("HTTP {}: {}", output.status, text)));
    }

    process_bytes(output.bytes, &output.content_type, format, url)
}

fn parse_charset(content_type: &str) -> Option<String> {
    for part in content_type.split(';') {
        let part = part.trim();
        if let Some(val) = part.to_lowercase().strip_prefix("charset=") {
            let val = val.trim().trim_matches('"').trim_matches('\'');
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn is_binary_mime(content_type: &str) -> bool {
    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    if mime.is_empty() {
        return false;
    }
    if mime.starts_with("text/") {
        return false;
    }
    let text_apps = [
        "application/json",
        "application/xml",
        "application/atom+xml",
        "application/rss+xml",
        "application/javascript",
        "application/ecmascript",
        "application/x-javascript",
        "application/x-www-form-urlencoded",
        "application/xhtml+xml",
    ];
    if mime.starts_with("application/") && !text_apps.iter().any(|t| mime == *t) {
        return true;
    }
    if mime.starts_with("image/")
        || mime.starts_with("video/")
        || mime.starts_with("audio/")
        || mime.starts_with("font/")
    {
        return true;
    }
    if mime == "application/octet-stream" {
        return true;
    }
    false
}

fn decode_text(bytes: &[u8], content_type: &str) -> String {
    if let Some(charset) = parse_charset(content_type) {
        if let Some(encoding) = encoding_rs::Encoding::for_label(charset.as_bytes()) {
            if encoding != encoding_rs::UTF_8 {
                tracing::info!(
                    "[webfetch] Decoding with charset: {} (from content-type)",
                    charset
                );
                let (decoded, _encoding, _had_errors) = encoding.decode(bytes);
                return decoded.into_owned();
            }
        }
    }
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let (decoded, _encoding, _) = encoding_rs::UTF_16LE.decode(bytes);
        return decoded.into_owned();
    }
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let (decoded, _encoding, _) = encoding_rs::UTF_16BE.decode(bytes);
        return decoded.into_owned();
    }
    String::from_utf8_lossy(bytes).to_string()
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

    let mime = content_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_lowercase();
    if is_binary_mime(content_type) {
        tracing::warn!(
            "[webfetch] Binary content type {} not supported for {}",
            mime,
            url
        );
        return Err(AppError::Http(format!(
            "二进制内容类型 {} 不支持文本提取，请检查 URL 是否指向一个网页",
            mime
        )));
    }

    let text = decode_text(&bytes, content_type);
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
            let raw = html2text::from_read(text.as_bytes(), usize::MAX);
            let plain = raw
                .lines()
                .fold((String::new(), 0usize), |(mut acc, blanks), line| {
                    if line.trim().is_empty() {
                        if blanks == 0 {
                            acc.push('\n');
                        }
                        (acc, blanks + 1)
                    } else {
                        acc.push_str(line);
                        acc.push('\n');
                        (acc, 0)
                    }
                })
                .0
                .trim()
                .to_string();
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
            if text.len() > 500_000 {
                let truncated_len = 500_000 + "[内容过长，已截断]".len();
                tracing::info!(
                    "[webfetch] Text truncated from {} to {} chars for {}",
                    text.len(),
                    truncated_len,
                    url
                );
                return Ok(text[..500_000].to_string() + "\n\n[内容过长，已截断]");
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

struct FetchOutput {
    status: u16,
    content_type: String,
    bytes: Vec<u8>,
}

async fn fetch_and_read(
    client: &reqwest::Client,
    url: &str,
    max_size: usize,
    format: &str,
) -> Result<FetchOutput, AppError> {
    let resp = do_fetch(client, url, format).await?;
    let status = resp.status().as_u16();

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

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
        content_type,
        bytes,
    })
}

async fn do_fetch(
    client: &reqwest::Client,
    url: &str,
    format: &str,
) -> Result<reqwest::Response, AppError> {
    let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36";

    let accept = match format {
        "markdown" => "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1",
        "text" => "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1",
        "html" => "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, */*;q=0.1",
        _ => "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1",
    };

    client
        .get(url)
        .header("User-Agent", ua)
        .header("Accept", accept)
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| {
            tracing::warn!("[webfetch] Connection failed for {}: {}", url, e);
            AppError::Http(format!("Connection failed: {}", e))
        })
}
