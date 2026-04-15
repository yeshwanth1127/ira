import logging
import mimetypes
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings, resolved_n8n_boq_callback_url
from app.models.entities import BoqVersion, Project
from app.services.storage import read_storage_bytes

logger = logging.getLogger(__name__)

# Most SMTP providers reject very large messages; skip attachment above this size.
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024


def send_boq_submitted_for_approval_email(boq: BoqVersion, project: Project) -> None:
    """Notify configured inbox when a BOQ is submitted for client approval. Requires SMTP_* in settings."""
    settings = get_settings()
    notify_to = (settings.boq_submit_notify_email or "").strip()
    if not notify_to:
        logger.warning("BOQ_SUBMIT_NOTIFY_EMAIL is empty; skipping notify email")
        return

    if not settings.smtp_host:
        logger.warning(
            "SMTP not configured (set SMTP_HOST); skipping notify email to %s",
            notify_to,
        )
        return

    from_addr = settings.smtp_from_email or settings.smtp_user
    if not from_addr:
        logger.warning(
            "Set SMTP_USER or SMTP_FROM_EMAIL; skipping notify email to %s",
            notify_to,
        )
        return

    callback = (resolved_n8n_boq_callback_url() or "").strip()
    if not callback:
        logger.warning(
            "N8N_BOQ_CALLBACK_URL / PUBLIC_APP_URL not set; approval callback URL in email will be empty"
        )
    callback_line = callback or (
        "(not configured — set N8N_BOQ_CALLBACK_URL or PUBLIC_APP_URL in server env)"
    )

    subject = f"[Alufit] BOQ submitted for approval — {project.name}"
    body = (
        f"A BOQ was submitted and is awaiting customer approval.\n\n"
        f"Project: {project.name} ({project.code})\n"
        f"BOQ label: {boq.label}\n"
        f"BOQ version ID: {boq.id}\n"
        f"Form project: {boq.form_project_name or '—'}\n"
        f"Client: {boq.client_name or '—'}\n"
        f"Cluster head: {boq.cluster_head or '—'}\n"
        f"Rows: {boq.row_count_snapshot}\n\n"
        f"--- Customer approval callback (POST this URL from n8n when the client decides) ---\n"
        f"{callback_line}\n"
        f"Header: X-Webhook-Secret must match CUSTOMER_APPROVAL_WEBHOOK_SECRET on the API.\n"
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = notify_to
    msg.set_content(body)

    attach_name = (boq.source_filename or "boq-upload").strip() or "boq-upload"
    if boq.source_storage_key:
        try:
            raw = read_storage_bytes(boq.source_storage_key)
            if len(raw) > MAX_ATTACHMENT_BYTES:
                logger.warning(
                    "BOQ file too large to attach (%s bytes, max %s); email sent without attachment",
                    len(raw),
                    MAX_ATTACHMENT_BYTES,
                )
            else:
                mime = mimetypes.guess_type(attach_name)[0] or "application/octet-stream"
                if "/" in mime:
                    maintype, subtype = mime.split("/", 1)
                else:
                    maintype, subtype = "application", "octet-stream"
                msg.add_attachment(
                    raw,
                    maintype=maintype,
                    subtype=subtype,
                    filename=attach_name,
                )
                logger.info(
                    "Attached BOQ file %s (%s bytes) for version %s",
                    attach_name,
                    len(raw),
                    boq.id,
                )
        except Exception as e:
            logger.warning(
                "Could not read or attach BOQ file for version %s (key=%s): %s",
                boq.id,
                boq.source_storage_key,
                e,
            )

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        logger.info(
            "BOQ submit notification email sent to %s (from %s)",
            notify_to,
            from_addr,
        )
    except Exception as e:
        logger.warning("Failed to send BOQ submit email to %s: %s", notify_to, e)
