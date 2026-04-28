use crate::error::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub object: String,
    pub owned_by: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelsResponse {
    pub object: String,
    pub data: Vec<ModelInfo>,
}

pub async fn fetch_models(base_url: &str, api_key: &str) -> Result<Vec<ModelInfo>, AppError> {
    let url = if base_url.ends_with('/') {
        format!("{}models", base_url)
    } else {
        format!("{}/models", base_url)
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Http(format!("Failed to create HTTP client: {}", e)))?;

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| AppError::Http(format!("Connection failed: {}", e)))?;

    if !resp.status().is_success() {
        return Err(AppError::Http(format!(
            "Server returned {}: {}",
            resp.status().as_u16(),
            resp.text().await.unwrap_or_default()
        )));
    }

    let models: ModelsResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Http(format!("Failed to parse models response: {}", e)))?;

    Ok(models.data)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BalanceInfo {
    pub currency: String,
    pub total_balance: String,
    pub granted_balance: String,
    pub topped_up_balance: String,
}

pub async fn fetch_balance(
    base_url: &str,
    balance_path: &str,
    api_key: &str,
) -> Result<BalanceInfo, AppError> {
    let url = if base_url.ends_with('/') {
        format!("{}{}", base_url, balance_path.trim_start_matches('/'))
    } else {
        format!("{}/{}", base_url, balance_path.trim_start_matches('/'))
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| AppError::Http(format!("Failed to create HTTP client: {}", e)))?;

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| AppError::Http(format!("Connection failed: {}", e)))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Http(format!(
            "Balance API error {}: {}",
            status, text
        )));
    }

    let raw: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::Http(format!("Failed to parse balance response: {}", e)))?;

    parse_balance_response(&raw)
}

fn parse_balance_response(raw: &serde_json::Value) -> Result<BalanceInfo, AppError> {
    // DeepSeek format: { "is_available": true, "balance_infos": [{ "currency": "CNY", ... }] }
    if let Some(infos) = raw.get("balance_infos").and_then(|v| v.as_array()) {
        if let Some(item) = infos.first() {
            return Ok(BalanceInfo {
                currency: item["currency"].as_str().unwrap_or("CNY").to_string(),
                total_balance: item["total_balance"].as_str().unwrap_or("0").to_string(),
                granted_balance: item["granted_balance"].as_str().unwrap_or("0").to_string(),
                topped_up_balance: item["topped_up_balance"]
                    .as_str()
                    .unwrap_or("0")
                    .to_string(),
            });
        }
        return Err(AppError::Http(
            "Balance response contained no balance infos".into(),
        ));
    }

    // Kimi format: { "code": 0, "data": { "available_balance": 49.58, ... } }
    if let Some(data) = raw.get("data") {
        let available = data
            .get("available_balance")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        return Ok(BalanceInfo {
            currency: "CNY".to_string(),
            total_balance: format!("{:.2}", available),
            granted_balance: "0".to_string(),
            topped_up_balance: "0".to_string(),
        });
    }

    Err(AppError::Http(
        "Unrecognized balance response format".into(),
    ))
}
