use crate::web_fetch;

pub async fn execute_tool(name: &str, args: &serde_json::Value, app: &tauri::AppHandle) -> String {
    match name {
        "webfetch" => {
            let urls: Vec<&str> = if let Some(arr) = args["urls"].as_array() {
                arr.iter().take(5).filter_map(|v| v.as_str()).collect()
            } else if let Some(u) = args["url"].as_str() {
                vec![u]
            } else {
                tracing::warn!("[tool] webfetch called with no URLs");
                return "错误: 未提供 URL".to_string();
            };
            if urls.is_empty() {
                return "错误: 未提供 URL".to_string();
            }
            let format = args["format"].as_str().unwrap_or("markdown");
            let timeout = args["timeout"].as_u64().unwrap_or(30);
            tracing::info!(
                "[tool] Executing webfetch for {} URL(s) (format={}, timeout={}s)",
                urls.len(),
                format,
                timeout
            );

            let mut results: Vec<String> = Vec::new();
            for url in &urls {
                match web_fetch::fetch_url(url, format, timeout, app).await {
                    Ok(content) => {
                        tracing::info!(
                            "[tool] webfetch succeeded for {}: {} chars",
                            url,
                            content.len()
                        );
                        results.push(format!("## {}\n\n{}", url, content));
                    }
                    Err(e) => {
                        tracing::warn!("[tool] webfetch failed for {}: {}", url, e);
                        results.push(format!("## {}\n\n获取失败: {}", url, e));
                    }
                }
            }
            let combined = results.join("\n\n---\n\n");
            if combined.len() > 500_000 {
                format!("{}\n\n[内容过长，已截断]", &combined[..500_000])
            } else {
                combined
            }
        }
        "get_current_time" => {
            let now = chrono::Local::now();
            let weekday = match now.format("%u").to_string().parse::<usize>() {
                Ok(d) if d < 7 => ["一", "二", "三", "四", "五", "六", "日"][d - 1],
                _ => "?",
            };
            let tz = now.format("%Z").to_string();
            format!(
                "当前时间: {}年{}月{}日 {}:{:02}:{:02} ({}，星期{})",
                now.format("%Y"),
                now.format("%m"),
                now.format("%d"),
                now.format("%H"),
                now.format("%M").to_string().parse::<u32>().unwrap_or(0),
                now.format("%S").to_string().parse::<u32>().unwrap_or(0),
                if tz.is_empty() { "本地时区" } else { &tz },
                weekday,
            )
        }
        "get_weather" => {
            let location = args["location"].as_str().unwrap_or("");
            if location.is_empty() {
                return "错误: 未提供城市名称".to_string();
            }
            let client = crate::api_client::http_client();
            let encoded = urlencoding::encode(location);
            let weather_url = format!("https://wttr.in/{}?format=j1&lang=zh", encoded);

            let w_json: serde_json::Value = match client
                .get(&weather_url)
                .header("User-Agent", "AnyChat/1.0")
                .timeout(std::time::Duration::from_secs(15))
                .send()
                .await
            {
                Ok(r) => match r.json().await {
                    Ok(j) => j,
                    Err(e) => return format!("解析天气数据失败: {}", e),
                },
                Err(e) => return format!("查询天气失败: {}", e),
            };

            let cc = &w_json["current_condition"][0];
            let temp = cc["temp_C"].as_str().unwrap_or("N/A");
            let desc = cc["weatherDesc"][0]["value"].as_str().unwrap_or("未知");
            let wind = cc["windspeedKmph"].as_str().unwrap_or("N/A");
            let humidity = cc["humidity"].as_str().unwrap_or("N/A");
            let feels = cc["FeelsLikeC"].as_str().unwrap_or("N/A");

            let area = &w_json["nearest_area"][0];
            let city = area["areaName"][0]["value"].as_str().unwrap_or(location);
            let country = area["country"][0]["value"].as_str().unwrap_or("");

            let mut result = format!(
                "{} ({})\n当前天气: {}，温度 {}°C (体感 {}°C)，风速 {} km/h，湿度 {}%",
                city, country, desc, temp, feels, wind, humidity
            );

            if let Some(forecasts) = w_json["weather"].as_array() {
                result.push_str("\n\n未来天气预报:");
                for day in forecasts {
                    let date = day["date"].as_str().unwrap_or("");
                    let hi = day["maxtempC"].as_str().unwrap_or("N/A");
                    let lo = day["mintempC"].as_str().unwrap_or("N/A");
                    let day_desc = day["hourly"][4]["weatherDesc"][0]["value"]
                        .as_str()
                        .unwrap_or("未知");
                    result.push_str(&format!("\n{}: {}，{}°C ~ {}°C", date, day_desc, lo, hi));
                }
            }
            result
        }
        _ => {
            tracing::warn!("[tool] Unknown tool requested: {}", name);
            format!("不支持的工具: {}", name)
        }
    }
}
