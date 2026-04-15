//! License keys are minted only by the IRA Node backend (`POST /licenses/internal/issue`).
use serde::{Deserialize, Serialize};

use crate::config::Config;

#[derive(Debug, Serialize)]
pub struct IssueLicenseBody {
    pub user_id: String,
    pub plan_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(default)]
    pub is_trial: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trial_ends_at: Option<String>,
    pub tier: String,
    pub max_instances: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_activations: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct IssueLicenseResponse {
    pub license_id: String,
    pub license_key: String,
}

pub async fn issue_license(
    http: &reqwest::Client,
    cfg: &Config,
    body: IssueLicenseBody,
) -> Result<IssueLicenseResponse, String> {
    let base = cfg.ira_backend_url.trim_end_matches('/');
    if base.is_empty() {
        return Err("IRA_BACKEND_URL is not set".into());
    }
    if cfg.ira_internal_api_key.is_empty() {
        return Err("INTERNAL_API_KEY is not set (must match IRA backend)".into());
    }
    let url = format!("{}/licenses/internal/issue", base);
    let res = http
        .post(&url)
        .header("x-internal-api-key", &cfg.ira_internal_api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("IRA backend request failed: {}", e))?;
    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(format!("IRA license issue failed: {}", text));
    }
    res.json().await.map_err(|e| e.to_string())
}
