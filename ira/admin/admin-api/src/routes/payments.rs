use axum::{
    extract::{Request, State},
    http::StatusCode,
    response::Redirect,
    Form,
    Json,
};
use axum::body::to_bytes;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::ira_backend::{issue_license, IssueLicenseBody};
use crate::state::AppState;

const RAZORPAY_API: &str = "https://api.razorpay.com/v1";

#[derive(Debug, Deserialize)]
pub struct CreateSubscriptionRequest {
    pub plan: String, // starter, pro, power
    pub email: String,
    pub user_id: Option<String>, // if signed in
    pub license_key: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateSubscriptionResponse {
    pub subscription_id: String,
    pub key_id: String,
}

#[derive(Debug, Deserialize)]
pub struct VerifyPaymentRequest {
    pub razorpay_payment_id: String,
    pub razorpay_subscription_id: String,
    pub razorpay_signature: String,
}

/// Razorpay POSTs these to callback_url (form-urlencoded) after payment
#[derive(Debug, Deserialize)]
pub struct PaymentCallbackForm {
    pub razorpay_payment_id: Option<String>,
    pub razorpay_subscription_id: Option<String>,
    pub razorpay_signature: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct VerifyPaymentResponse {
    pub success: bool,
    pub license_key: Option<String>,
    pub plan: Option<String>,
    pub message: String,
}

fn get_plan_id<'a>(config: &'a crate::config::Config, plan: &str) -> Option<&'a str> {
    match plan {
        "starter" => Some(config.razorpay_plan_starter.as_str()),
        "pro" => Some(config.razorpay_plan_pro.as_str()),
        "power" => Some(config.razorpay_plan_power.as_str()),
        _ => None,
    }
}

fn get_token_limit(plan: &str) -> i64 {
    match plan {
        "starter" => 500_000,
        "pro" => 1_000_000,
        "power" => 2_000_000,
        _ => 5_000,
    }
}

fn generate_placeholder_password_hash() -> Result<String, String> {
    bcrypt::hash(Uuid::new_v4().to_string(), bcrypt::DEFAULT_COST).map_err(|e| e.to_string())
}

pub async fn create_subscription(
    State(state): State<AppState>,
    Json(req): Json<CreateSubscriptionRequest>,
) -> Result<Json<CreateSubscriptionResponse>, (axum::http::StatusCode, String)> {
    if state.config.razorpay_key_id.is_empty() {
        return Err((axum::http::StatusCode::SERVICE_UNAVAILABLE, "Razorpay not configured".to_string()));
    }

    let plan_id = get_plan_id(&state.config, &req.plan)
        .filter(|s| !s.is_empty())
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "Invalid plan".to_string()))?;

    let email = req.email.trim().to_lowercase();
    if email.is_empty() || !email.contains('@') {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Invalid email".to_string()));
    }

    let (user_id, email_for_notes) = if let Some(uid) = &req.user_id {
        (uid.clone(), email.clone())
    } else if let Some(lk) = &req.license_key {
        let row = sqlx::query("SELECT u.id, u.email FROM users u JOIN licenses l ON l.user_id = u.id WHERE l.license_key = $1")
            .bind(lk)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if let Some(r) = row {
            let id: Uuid = r.get("id");
            let em: String = r.get("email");
            (id.to_string(), em)
        } else {
            (Uuid::new_v4().to_string(), email.clone())
        }
    } else {
        let row = sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        if let Some(id) = row {
            (id.to_string(), email.clone())
        } else {
            (Uuid::new_v4().to_string(), email.clone())
        }
    };

    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "plan_id": plan_id,
        "total_count": 12,
        "quantity": 1,
        "customer_notify": true,
        "notes": {
            "email": email_for_notes,
            "user_id": user_id
        }
    });

    let res = client
        .post(format!("{}/subscriptions", RAZORPAY_API))
        .basic_auth(&state.config.razorpay_key_id, Some(&state.config.razorpay_key_secret))
        .json(&body)
        .send()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = res.status();
    let text = res.text().await.map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    if !status.is_success() {
        return Err((axum::http::StatusCode::BAD_GATEWAY, format!("Razorpay error: {}", text)));
    }

    let sub: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let subscription_id = sub["id"]
        .as_str()
        .ok_or((axum::http::StatusCode::INTERNAL_SERVER_ERROR, "No subscription id".to_string()))?
        .to_string();

    Ok(Json(CreateSubscriptionResponse {
        subscription_id,
        key_id: state.config.razorpay_key_id.clone(),
    }))
}

/// Razorpay POSTs to callback_url after payment. We redirect to frontend /pay/success with params.
/// This fixes 405: nginx try_files only handles GET; Razorpay sends POST.
pub async fn payment_callback(
    Form(form): Form<PaymentCallbackForm>,
) -> Redirect {
    let params = match (
        form.razorpay_payment_id.as_deref(),
        form.razorpay_subscription_id.as_deref(),
        form.razorpay_signature.as_deref(),
    ) {
        (Some(pid), Some(sid), Some(sig)) if !pid.is_empty() && !sid.is_empty() && !sig.is_empty() => {
            format!(
                "razorpay_payment_id={}&razorpay_subscription_id={}&razorpay_signature={}",
                urlencoding::encode(pid),
                urlencoding::encode(sid),
                urlencoding::encode(sig),
            )
        }
        _ => String::new(),
    };
    let url = if params.is_empty() {
        "/pay/success".to_string()
    } else {
        format!("/pay/success?{}", params)
    };
    Redirect::to(&url)
}

/// Sync subscription to DB (plan, token limit, license). Used by webhook as fallback when
/// user never reached success page. Idempotent - safe to call multiple times.
async fn sync_subscription_to_db(state: &AppState, subscription_id: &str) -> Result<(), String> {
    if state.config.razorpay_key_id.is_empty() || state.config.razorpay_key_secret.is_empty() {
        return Err("Razorpay not configured".into());
    }
    let client = reqwest::Client::new();
    let res = client
        .get(format!("{}/subscriptions/{}", RAZORPAY_API, subscription_id))
        .basic_auth(&state.config.razorpay_key_id, Some(&state.config.razorpay_key_secret))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Razorpay API error: {}", res.status()));
    }
    let sub: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let plan_id = sub["plan_id"].as_str().unwrap_or("");
    let notes = sub.get("notes").and_then(|n| n.as_object());
    let email = notes
        .and_then(|n| n.get("email"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let user_id_str = notes
        .and_then(|n| n.get("user_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let plan = if state.config.razorpay_plan_starter == plan_id {
        "starter"
    } else if state.config.razorpay_plan_pro == plan_id {
        "pro"
    } else if state.config.razorpay_plan_power == plan_id {
        "power"
    } else {
        "starter"
    };
    let token_limit = get_token_limit(plan);
    let plan_id: Uuid = sqlx::query_scalar("SELECT id FROM plans WHERE code = $1 LIMIT 1")
        .bind(plan)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| e.to_string())?;

    let mut tx = state.pool.begin().await.map_err(|e| e.to_string())?;

    let user_id: Uuid = if !user_id_str.is_empty() {
        Uuid::parse_str(user_id_str).map_err(|_| "Invalid user_id".to_string())?
    } else if !email.is_empty() {
        let row = sqlx::query("SELECT id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        match row {
            Some(r) => r.get("id"),
            None => {
                let uid = Uuid::new_v4();
                let now = chrono::Utc::now();
                let password_hash = generate_placeholder_password_hash()
                    .map_err(|e| format!("Failed to generate placeholder password hash: {}", e))?;
                sqlx::query(
                    "INSERT INTO users (id, email, password_hash, plan, monthly_token_limit, tokens_used_this_month, monthly_reset_at, razorpay_subscription_id, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $8)",
                )
                .bind(&uid)
                .bind(&email)
                .bind(&password_hash)
                .bind(plan)
                .bind(token_limit)
                .bind(now + chrono::Duration::days(30))
                .bind(subscription_id)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
                uid
            }
        }
    } else {
        tx.rollback().await.ok();
        return Err("No email in subscription notes".into());
    };

    // Ensure user exists when user_id_str was provided (user_id comes from our DB)
    if !user_id_str.is_empty() {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
            .bind(&user_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        if !exists {
            tx.rollback().await.ok();
            return Err("User not found".into());
        }
    }

    let is_owner: bool = sqlx::query_scalar("SELECT COALESCE(is_owner, false) FROM users WHERE id = $1")
        .bind(&user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or(false);
    if is_owner {
        tx.rollback().await.ok();
        return Ok(()); // Skip owner
    }

    sqlx::query(
        "UPDATE users SET plan = $1, monthly_token_limit = $2, razorpay_subscription_id = $3, updated_at = NOW() WHERE id = $4 AND COALESCE(is_owner, false) = false",
    )
    .bind(plan)
    .bind(token_limit)
    .bind(subscription_id)
    .bind(&user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let updated = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM licenses WHERE user_id = $1 AND COALESCE(is_owner, false) = false",
    )
    .bind(&user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let need_ira_license = updated == 0;

    if updated > 0 {
        sqlx::query(
            "UPDATE licenses SET tier = $1, plan_id = $2, is_trial = false, trial_ends_at = NULL, updated_at = NOW() WHERE user_id = $3 AND COALESCE(is_owner, false) = false",
        )
        .bind(plan)
        .bind(&plan_id)
        .bind(&user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    if need_ira_license {
        let http = reqwest::Client::new();
        issue_license(
            &http,
            &state.config,
            IssueLicenseBody {
                user_id: user_id.to_string(),
                plan_id: plan_id.to_string(),
                subscription_id: Some(subscription_id.to_string()),
                is_trial: false,
                trial_ends_at: None,
                tier: plan.to_string(),
                max_instances: 1,
                max_activations: Some(1),
                expires_at: None,
                notes: Some("razorpay subscription sync".to_string()),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn verify_razorpay_signature(secret: &str, payment_id: &str, subscription_id: &str, signature: &str) -> bool {
    type HmacSha256 = Hmac<Sha256>;
    let payload = format!("{}|{}", payment_id, subscription_id);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(payload.as_bytes());
    let result = mac.finalize();
    let expected = hex::encode(result.into_bytes());
    expected == signature
}

pub async fn verify_payment(
    State(state): State<AppState>,
    Json(req): Json<VerifyPaymentRequest>,
) -> Result<Json<VerifyPaymentResponse>, (axum::http::StatusCode, String)> {
    if state.config.razorpay_key_secret.is_empty() {
        return Err((axum::http::StatusCode::SERVICE_UNAVAILABLE, "Razorpay not configured".to_string()));
    }

    if !verify_razorpay_signature(
        &state.config.razorpay_key_secret,
        &req.razorpay_payment_id,
        &req.razorpay_subscription_id,
        &req.razorpay_signature,
    ) {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Invalid signature".to_string()));
    }

    let client = reqwest::Client::new();
    let res = client
        .get(format!("{}/subscriptions/{}", RAZORPAY_API, req.razorpay_subscription_id))
        .basic_auth(&state.config.razorpay_key_id, Some(&state.config.razorpay_key_secret))
        .send()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    let sub: serde_json::Value = res
        .json()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    let plan_id = sub["plan_id"].as_str().unwrap_or("");
    let notes = sub.get("notes").and_then(|n| n.as_object());
    let email = notes
        .and_then(|n| n.get("email"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let user_id_str = notes
        .and_then(|n| n.get("user_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let plan = if state.config.razorpay_plan_starter == plan_id {
        "starter"
    } else if state.config.razorpay_plan_pro == plan_id {
        "pro"
    } else if state.config.razorpay_plan_power == plan_id {
        "power"
    } else {
        "starter"
    };

    let token_limit = get_token_limit(plan);
    let plan_id: Uuid = sqlx::query_scalar("SELECT id FROM plans WHERE code = $1 LIMIT 1")
        .bind(plan)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    type DeferredIssue = (Uuid, String, String);
    let (user_id, existing_key, deferred_issue): (Uuid, Option<String>, Option<DeferredIssue>) =
        if !user_id_str.is_empty() {
            let uid = Uuid::parse_str(user_id_str)
                .map_err(|_| (axum::http::StatusCode::BAD_REQUEST, "Invalid user_id".to_string()))?;
            let is_owner: bool = sqlx::query_scalar("SELECT COALESCE(is_owner, false) FROM users WHERE id = $1")
                .bind(&uid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
                .unwrap_or(false);
            if is_owner {
                tx.rollback().await.ok();
                return Err((axum::http::StatusCode::BAD_REQUEST, "Cannot process payment for owner account".to_string()));
            }
            let lk: Option<String> = sqlx::query_scalar(
                "SELECT license_key FROM licenses WHERE user_id = $1 AND COALESCE(is_owner, false) = false LIMIT 1",
            )
            .bind(&uid)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            sqlx::query(
                "UPDATE users SET plan = $1, monthly_token_limit = $2, razorpay_subscription_id = $3, updated_at = NOW() WHERE id = $4 AND COALESCE(is_owner, false) = false",
            )
            .bind(plan)
            .bind(token_limit)
            .bind(&req.razorpay_subscription_id)
            .bind(&uid)
            .execute(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            sqlx::query(
                "UPDATE licenses SET tier = $1, plan_id = $2, is_trial = false, trial_ends_at = NULL, updated_at = NOW() WHERE user_id = $3 AND COALESCE(is_owner, false) = false",
            )
            .bind(plan)
            .bind(&plan_id)
            .bind(&uid)
            .execute(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            if let Some(k) = lk {
                (uid, Some(k), None)
            } else {
                (
                    uid,
                    None,
                    Some((
                        plan_id,
                        plan.to_string(),
                        req.razorpay_subscription_id.clone(),
                    )),
                )
            }
        } else if !email.is_empty() {
            let existing = sqlx::query("SELECT u.id FROM users u WHERE u.email = $1")
                .bind(&email)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            if let Some(row) = existing {
                let uid: Uuid = row.get("id");
                let is_owner: bool = sqlx::query_scalar("SELECT COALESCE(is_owner, false) FROM users WHERE id = $1")
                    .bind(&uid)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
                    .unwrap_or(false);
                if is_owner {
                    tx.rollback().await.ok();
                    return Err((axum::http::StatusCode::BAD_REQUEST, "Cannot process payment for owner account".to_string()));
                }
                let lk: Option<String> = sqlx::query_scalar(
                    "SELECT license_key FROM licenses WHERE user_id = $1 AND COALESCE(is_owner, false) = false LIMIT 1",
                )
                .bind(&uid)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                sqlx::query(
                    "UPDATE users SET plan = $1, monthly_token_limit = $2, razorpay_subscription_id = $3, updated_at = NOW() WHERE id = $4 AND COALESCE(is_owner, false) = false",
                )
                .bind(plan)
                .bind(token_limit)
                .bind(&req.razorpay_subscription_id)
                .bind(&uid)
                .execute(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

                sqlx::query(
                    "UPDATE licenses SET tier = $1, plan_id = $2, is_trial = false, trial_ends_at = NULL, updated_at = NOW() WHERE user_id = $3 AND COALESCE(is_owner, false) = false",
                )
                .bind(plan)
                .bind(&plan_id)
                .bind(&uid)
                .execute(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

                if let Some(k) = lk {
                    (uid, Some(k), None)
                } else {
                    (
                        uid,
                        None,
                        Some((
                            plan_id,
                            plan.to_string(),
                            req.razorpay_subscription_id.clone(),
                        )),
                    )
                }
            } else {
                let new_user_id = Uuid::new_v4();
                let now = chrono::Utc::now();
                let password_hash = generate_placeholder_password_hash()
                    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

                sqlx::query(
                    "INSERT INTO users (id, email, password_hash, plan, monthly_token_limit, tokens_used_this_month, monthly_reset_at, razorpay_subscription_id, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $8)",
                )
                .bind(&new_user_id)
                .bind(&email)
                .bind(&password_hash)
                .bind(plan)
                .bind(token_limit)
                .bind(now + chrono::Duration::days(30))
                .bind(&req.razorpay_subscription_id)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

                (
                    new_user_id,
                    None,
                    Some((
                        plan_id,
                        plan.to_string(),
                        req.razorpay_subscription_id.clone(),
                    )),
                )
            }
        } else {
            tx.rollback().await.ok();
            return Err((axum::http::StatusCode::BAD_REQUEST, "No email in subscription notes".to_string()));
        };

    tx.commit().await.map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let http = reqwest::Client::new();
    let license_key = if let Some((pid, tier, sub_id)) = deferred_issue {
        issue_license(
            &http,
            &state.config,
            IssueLicenseBody {
                user_id: user_id.to_string(),
                plan_id: pid.to_string(),
                subscription_id: Some(sub_id),
                is_trial: false,
                trial_ends_at: None,
                tier,
                max_instances: 1,
                max_activations: Some(1),
                expires_at: None,
                notes: Some("razorpay verify_payment".to_string()),
            },
        )
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?
        .license_key
    } else {
        existing_key.ok_or((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Expected existing license key".to_string(),
        ))?
    };

    let license_id: Uuid = sqlx::query_scalar(
        "SELECT id FROM licenses WHERE user_id = $1 AND COALESCE(is_owner, false) = false LIMIT 1",
    )
    .bind(&user_id)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        "INSERT INTO transactions (license_id, amount, currency, status, payment_provider, provider_transaction_id, created_at)
         VALUES ($1, 0, 'INR', 'captured', 'razorpay', $2, NOW())",
    )
    .bind(&license_id)
    .bind(&req.razorpay_payment_id)
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(VerifyPaymentResponse {
        success: true,
        license_key: Some(license_key),
        plan: Some(plan.to_string()),
        message: "Payment verified. Your plan has been upgraded.".to_string(),
    }))
}

/// Razorpay webhook payload structure
#[derive(Debug, Deserialize)]
pub struct WebhookPayload {
    pub entity: String,
    pub event: String,
    pub payload: WebhookPayloadData,
}

#[derive(Debug, Deserialize)]
pub struct WebhookPayloadData {
    pub subscription: Option<WebhookSubscription>,
    pub payment: Option<WebhookPayment>,
}

#[derive(Debug, Deserialize)]
pub struct WebhookSubscription {
    pub entity: WebhookSubscriptionEntity,
}

#[derive(Debug, Deserialize)]
pub struct WebhookSubscriptionEntity {
    pub id: String,
    pub plan_id: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WebhookPayment {
    pub entity: WebhookPaymentEntity,
}

#[derive(Debug, Deserialize)]
pub struct WebhookPaymentEntity {
    pub id: String,
    pub amount: Option<i64>,
    pub currency: Option<String>,
    pub status: Option<String>,
}

fn verify_webhook_signature(secret: &str, body: &[u8], signature: &str) -> bool {
    if secret.is_empty() {
        return false;
    }
    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    let result = mac.finalize();
    let expected = hex::encode(result.into_bytes());
    expected == signature
}

pub async fn webhook(
    State(state): State<AppState>,
    request: Request,
) -> Result<StatusCode, (StatusCode, String)> {
    if state.config.razorpay_webhook_secret.is_empty() {
        return Err((StatusCode::SERVICE_UNAVAILABLE, "Webhook not configured".to_string()));
    }

    let (parts, body) = request.into_parts();
    let body_bytes = to_bytes(body, usize::MAX)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let signature = parts
        .headers
        .get("X-Razorpay-Signature")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    if !verify_webhook_signature(
        &state.config.razorpay_webhook_secret,
        &body_bytes,
        signature,
    ) {
        return Err((StatusCode::BAD_REQUEST, "Invalid signature".to_string()));
    }

    let payload: WebhookPayload = serde_json::from_slice(&body_bytes)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid JSON: {}", e)))?;

    match payload.event.as_str() {
        "subscription.charged" => {
            if let (Some(sub), Some(pay)) = (payload.payload.subscription, payload.payload.payment) {
                let sub_id = sub.entity.id;
                let payment_id = pay.entity.id;
                let amount = pay.entity.amount.unwrap_or(0) as f64 / 100.0;

                let row = sqlx::query(
                    "SELECT l.id, l.user_id FROM licenses l
                     JOIN users u ON u.id = l.user_id
                     WHERE u.razorpay_subscription_id = $1 AND COALESCE(u.is_owner, false) = false",
                )
                .bind(&sub_id)
                .fetch_optional(&state.pool)
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

                if let Some(r) = row {
                    let license_id: Uuid = r.get("id");
                    sqlx::query(
                        "INSERT INTO transactions (license_id, amount, currency, status, payment_provider, provider_transaction_id, created_at)
                         VALUES ($1, $2, 'INR', 'captured', 'razorpay', $3, NOW())",
                    )
                    .bind(&license_id)
                    .bind(amount)
                    .bind(&payment_id)
                    .execute(&state.pool)
                    .await
                    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
                }
            }
        }
        "subscription.cancelled" | "subscription.completed" | "subscription.halted" => {
            if let Some(sub) = payload.payload.subscription {
                let sub_id = sub.entity.id;
                let _ = sqlx::query(
                    "UPDATE licenses
                     SET tier = 'free',
                         plan_id = (SELECT id FROM plans WHERE code = 'free_trial' LIMIT 1),
                         is_trial = true,
                         trial_ends_at = NOW() + INTERVAL '14 days',
                         updated_at = NOW()
                     WHERE user_id IN (SELECT id FROM users WHERE razorpay_subscription_id = $1 AND COALESCE(is_owner, false) = false)",
                )
                .bind(&sub_id)
                .execute(&state.pool)
                .await;
                let _ = sqlx::query(
                    "UPDATE users SET plan = 'free', monthly_token_limit = 5000, razorpay_subscription_id = NULL, updated_at = NOW()
                     WHERE razorpay_subscription_id = $1 AND COALESCE(is_owner, false) = false",
                )
                .bind(&sub_id)
                .execute(&state.pool)
                .await;
            }
        }
        "subscription.activated" => {
            // Fallback: sync plan/token/license when user never reached success page
            if let Some(sub) = &payload.payload.subscription {
                let sub_id = sub.entity.id.clone();
                if let Err(e) = sync_subscription_to_db(&state, &sub_id).await {
                    tracing::warn!("subscription.activated sync failed for {}: {}", sub_id, e);
                }
            }
        }
        _ => {
            // Ignore other events
        }
    }

    Ok(StatusCode::OK)
}
