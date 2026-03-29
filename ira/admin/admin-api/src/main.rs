mod auth;
mod config;
mod ira_backend;
mod routes;
mod state;

use axum::{routing::get, routing::post, Router};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber;

use routes::{admin, auth as auth_routes, payments as payment_routes, trial as trial_routes};
use state::AppState;

async fn ensure_bootstrap_schema(pool: &sqlx::PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        .execute(pool)
        .await?;

    // Core user table compatibility for admin-ui routes.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id uuid PRIMARY KEY,
            email text NOT NULL UNIQUE,
            password_hash text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free'")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_token_limit int DEFAULT 5000")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_used_this_month int DEFAULT 0")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS monthly_reset_at timestamptz")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_subscription_id text")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false")
        .execute(pool)
        .await?;

    // License table compatibility.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS licenses (
            id uuid PRIMARY KEY,
            user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            license_key text UNIQUE,
            status text NOT NULL DEFAULT 'active',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS tier text DEFAULT 'free'")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_key text")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS max_instances int DEFAULT 1")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS is_trial boolean DEFAULT false")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false")
        .execute(pool)
        .await?;
    sqlx::query("ALTER TABLE licenses ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz")
        .execute(pool)
        .await?;
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_license_key ON licenses(license_key)")
        .execute(pool)
        .await?;

    // Ensure common plan codes used by admin-ui/payment paths exist.
    sqlx::query(
        r#"
        INSERT INTO plans(code, name, is_active, trial_days, limits)
        VALUES
          ('free_trial', 'Free Trial', true, 14, '{"requests_per_day": 30, "tokens_per_month": 50000}'::jsonb),
          ('starter', 'Starter', true, NULL, '{"requests_per_day": 200, "tokens_per_month": 300000}'::jsonb),
          ('pro', 'Pro', true, NULL, '{"requests_per_day": 500, "tokens_per_month": 1000000}'::jsonb),
          ('power', 'Power', true, NULL, '{"requests_per_day": 1000, "tokens_per_month": 2000000}'::jsonb)
        ON CONFLICT (code) DO NOTHING
        "#,
    )
    .execute(pool)
    .await?;

    // Admin users for /api/auth/login.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS admin_users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            username text NOT NULL UNIQUE,
            password_hash text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        "#,
    )
    .execute(pool)
    .await?;

    // OTP storage used by trial/login verification flow.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS otp_verifications (
            id uuid PRIMARY KEY,
            email text NOT NULL,
            otp_hash text NOT NULL,
            expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        CREATE INDEX IF NOT EXISTS idx_otp_verifications_email
            ON otp_verifications(email)
        "#,
    )
    .execute(pool)
    .await?;

    // Stats/payment compatibility tables.
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS messages (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id uuid REFERENCES users(id) ON DELETE SET NULL,
            model text NOT NULL DEFAULT 'unknown',
            provider text NOT NULL DEFAULT 'unknown',
            total_tokens int NOT NULL DEFAULT 0,
            cost_usd numeric(12,6) NOT NULL DEFAULT 0,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)")
        .execute(pool)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)")
        .execute(pool)
        .await?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS transactions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            license_id uuid REFERENCES licenses(id) ON DELETE SET NULL,
            amount numeric(12,2) NOT NULL DEFAULT 0,
            currency text NOT NULL DEFAULT 'INR',
            status text NOT NULL DEFAULT 'succeeded',
            payment_provider text NOT NULL DEFAULT 'razorpay',
            provider_transaction_id text,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        "#,
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_transactions_provider_tx ON transactions(provider_transaction_id)",
    )
    .execute(pool)
    .await?;

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Required for rustls (used by mail-send SMTP)
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    // Load this crate's `.env` with **override** so it wins over a stale Windows/User `DATABASE_URL`.
    // (`from_path` alone does not override existing process env vars — that caused 28P01 while Node worked.)
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let _ = dotenvy::from_path_override(manifest_dir.join(".env"));
    // Optional scribe defaults: only fill vars that are still unset (never clobber admin-api/.env).
    let scribe_env = manifest_dir.join("../../scribe/scribe/scribe-api/.env");
    if scribe_env.exists() {
        let _ = dotenvy::from_path(&scribe_env);
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "admin_api=info,info".to_string()),
        )
        .init();

    let config = Arc::new(config::Config::from_env()?);

    match url::Url::parse(&config.database_url) {
        Ok(u) => {
            tracing::info!(
                "Postgres URL parsed OK (password not logged): user={} host={:?} port={:?} db={}",
                u.username(),
                u.host_str(),
                u.port(),
                u.path().trim_start_matches('/')
            );
        }
        Err(e) => {
            tracing::error!("DATABASE_URL is not a valid URL: {}", e);
            return Err(e.into());
        }
    }

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&config.database_url)
        .await?;
    ensure_bootstrap_schema(&pool).await?;

    let app_state = AppState {
        pool: pool.clone(),
        config: config.clone(),
    };

    let cors = CorsLayer::new()
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_origin(Any);

    let protected = axum::middleware::from_fn_with_state(app_state.clone(), auth::require_auth);

    let stats_routes = Router::new()
        .route("/global", get(admin::global_stats))
        .route("/model-breakdown", get(admin::model_breakdown))
        .route("/top-users", get(admin::top_users))
        .route("/recent-messages", get(admin::recent_messages))
        .route_layer(protected)
        .with_state(app_state.clone());

    let app = Router::new()
        .route("/api/auth/login", post(auth_routes::login))
        .route("/api/auth/customer-login", post(auth_routes::customer_login))
        .route("/api/auth/register", post(auth_routes::register))
        .route("/api/trial/check-email", post(trial_routes::check_email))
        .route("/api/trial/send-otp", post(trial_routes::send_otp))
        .route("/api/trial/send-subscription-otp", post(trial_routes::send_subscription_otp))
        .route("/api/trial/send-login-otp", post(trial_routes::send_login_otp))
        .route("/api/trial/verify-otp", post(trial_routes::verify_otp))
        .route("/api/payments/create-subscription", post(payment_routes::create_subscription))
        .route("/api/payments/verify", post(payment_routes::verify_payment))
        .route("/api/payments/webhook", post(payment_routes::webhook))
        .route("/api/payments/callback", post(payment_routes::payment_callback))
        .nest("/api/stats", stats_routes)
        .layer(cors)
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Admin API listening on {}", addr);
    if !config.smtp_username.is_empty() {
        tracing::info!("Email (SMTP) configured: {} @ {}", config.smtp_username, config.smtp_host);
    } else if !config.resend_api_key.is_empty() {
        tracing::info!("Email (Resend) configured");
    } else {
        tracing::info!("Email not configured - OTP will be logged to console only");
    }
    axum::serve(tokio::net::TcpListener::bind(addr).await?, app).await?;
    Ok(())
}
