from functools import lru_cache
from typing import Literal
import json

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # SQLite file lives in the current working directory (run uvicorn from `backend/`)
    database_url: str = "sqlite:///./alufit.db"
    secret_key: str = "dev-secret-change-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    algorithm: str = "HS256"

    redis_url: str = "redis://localhost:6379/0"

    # "local" = files on disk (no MinIO). "s3" = MinIO/S3-compatible (requires STORAGE_BACKEND=s3 and a running endpoint).
    storage_backend: Literal["local", "s3"] = "local"
    # Root directory for local storage (relative to process cwd, usually `backend/`)
    local_storage_path: str = "uploads"

    s3_endpoint_url: str = "http://127.0.0.1:9000"
    s3_access_key: str = "minio"
    s3_secret_key: str = "minio12345"
    s3_bucket: str = "alufit"
    s3_region: str = "us-east-1"

    # Public base URL of this API (no path). Used only if N8N_BOQ_CALLBACK_URL is unset — must be reachable from the internet for hosted n8n.
    public_app_url: str = ""
    # Full public URL n8n must POST to when the customer approves (set this on the server; do not use localhost for cloud n8n)
    n8n_boq_callback_url: str | None = None
    # n8n “Webhook” node URL to trigger when a BOQ is submitted for customer approval (optional)
    n8n_boq_submitted_webhook_url: str | None = None
    # Shared secret: n8n must send this in header X-Webhook-Secret when POSTing approval results
    customer_approval_webhook_secret: str = "dev-n8n-secret-change-in-production"

    # Outbound email when a BOQ is submitted for approval (contracts: new upload / submit for approval)
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_use_tls: bool = True
    smtp_user: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SMTP_USER", "SMTP_USERNAME"),
    )
    smtp_password: str | None = None
    # Display/sender address (e.g. support@your-domain.com); falls back to SMTP_USER if unset
    smtp_from_email: str | None = None
    boq_submit_notify_email: str = "yeshwanthsh128@gmail.com"

    # RBAC: Email domain to role mapping (JSON format)
    # Example: '{"contracts.com": "contracts", "design.co.uk": "design", "qs.com": "qs"}'
    email_domain_role_mapping: str = '{}'

    def get_role_for_email(self, email: str) -> str | None:
        """
        Determine the role for a user based on their email domain.
        Returns the role name (contracts, design, qs) or None if no match found.
        """
        try:
            mapping = json.loads(self.email_domain_role_mapping)
        except (json.JSONDecodeError, TypeError):
            return None
        
        if "@" not in email:
            return None
        
        domain = email.split("@")[1].lower()
        return mapping.get(domain)


@lru_cache
def get_settings() -> Settings:
    return Settings()


def resolved_n8n_boq_callback_url() -> str:
    """Absolute public URL n8n should POST to for BOQ approval (header X-Webhook-Secret). Never use localhost for production n8n."""
    s = get_settings()
    explicit = (s.n8n_boq_callback_url or "").strip()
    if explicit:
        return explicit.rstrip("/")
    base = (s.public_app_url or "").strip().rstrip("/")
    if base:
        return f"{base}/api/approval"
    return ""
