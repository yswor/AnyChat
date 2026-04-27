use crate::api_client;
use crate::store;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    pub models: Option<Vec<api_client::ModelInfo>>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn test_connection(
    base_url: String,
    api_key: String,
) -> Result<TestConnectionResult, String> {
    match api_client::fetch_models(&base_url, &api_key).await {
        Ok(models) => Ok(TestConnectionResult {
            success: true,
            models: Some(models),
            error: None,
        }),
        Err(e) => Ok(TestConnectionResult {
            success: false,
            models: None,
            error: Some(e.to_string()),
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BalanceResponse {
    pub success: bool,
    pub balance: Option<api_client::BalanceInfo>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn fetch_balance(
    base_url: String,
    balance_path: String,
    api_key: String,
) -> Result<BalanceResponse, String> {
    let key = store::decrypt_api_key(&api_key).map_err(|e| e.to_string())?;
    match api_client::fetch_balance(&base_url, &balance_path, &key).await {
        Ok(balance) => Ok(BalanceResponse {
            success: true,
            balance: Some(balance),
            error: None,
        }),
        Err(e) => Ok(BalanceResponse {
            success: false,
            balance: None,
            error: Some(e.to_string()),
        }),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EncryptKeyResult {
    pub encrypted: String,
}

#[tauri::command]
pub fn encrypt_key(key: String) -> Result<EncryptKeyResult, String> {
    Ok(EncryptKeyResult {
        encrypted: store::encrypt_api_key(&key),
    })
}

#[tauri::command]
pub fn decrypt_key(encrypted: String) -> Result<String, String> {
    store::decrypt_api_key(&encrypted).map_err(|e| e.to_string())
}
