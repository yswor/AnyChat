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

#[derive(Debug, Serialize, Deserialize)]
struct BalanceApiResponse {
    is_available: bool,
    balance_infos: Vec<BalanceApiItem>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BalanceApiItem {
    currency: String,
    total_balance: String,
    granted_balance: String,
    topped_up_balance: String,
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

    let data: BalanceApiResponse = resp
        .json()
        .await
        .map_err(|e| AppError::Http(format!("Failed to parse balance response: {}", e)))?;

    data.balance_infos.into_iter().next().map_or_else(
        || {
            Err(AppError::Http(
                "Balance response contained no balance infos".into(),
            ))
        },
        |item| {
            Ok(BalanceInfo {
                currency: item.currency,
                total_balance: item.total_balance,
                granted_balance: item.granted_balance,
                topped_up_balance: item.topped_up_balance,
            })
        },
    )
}
