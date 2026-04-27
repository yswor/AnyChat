use base64::{engine::general_purpose::STANDARD as BASE64, Engine};

const XOR_KEY: &[u8] = b"AnyChatSecretKey2024!@#$%^";

pub fn encrypt_api_key(key: &str) -> String {
    let xored: Vec<u8> = key
        .as_bytes()
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ XOR_KEY[i % XOR_KEY.len()])
        .collect();
    BASE64.encode(&xored)
}

pub fn decrypt_api_key(encrypted: &str) -> Result<String, base64::DecodeError> {
    let bytes = BASE64.decode(encrypted)?;
    let decrypted: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ XOR_KEY[i % XOR_KEY.len()])
        .collect();
    Ok(String::from_utf8_lossy(&decrypted).to_string())
}
