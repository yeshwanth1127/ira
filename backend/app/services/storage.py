import shutil
import uuid
from pathlib import Path
from typing import BinaryIO

import boto3
from botocore.client import BaseClient

from app.core.config import get_settings


def _client() -> BaseClient:
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        region_name=s.s3_region,
    )


def _local_root() -> Path:
    s = get_settings()
    return Path(s.local_storage_path).resolve()


def _safe_local_file(key: str) -> Path:
    """Resolve key under local storage root; reject path traversal."""
    if Path(key).is_absolute() or ".." in Path(key).parts:
        raise ValueError("Invalid storage key")
    root = _local_root()
    out = (root / key).resolve()
    out.relative_to(root)
    return out


def resolve_local_storage_key(key: str) -> Path:
    """Resolve a storage key to a safe absolute local path."""
    return _safe_local_file(key)


def ensure_bucket() -> None:
    s = get_settings()
    if s.storage_backend == "local":
        _local_root().mkdir(parents=True, exist_ok=True)
        return
    c = _client()
    try:
        c.head_bucket(Bucket=s.s3_bucket)
    except Exception:
        c.create_bucket(Bucket=s.s3_bucket)


def upload_fileobj(fileobj: BinaryIO, key: str, content_type: str | None) -> None:
    s = get_settings()
    ct = (content_type or "").strip() or "application/octet-stream"
    if s.storage_backend == "local":
        ensure_bucket()
        dest = _safe_local_file(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        fileobj.seek(0)
        with open(dest, "wb") as out:
            shutil.copyfileobj(fileobj, out)
        return
    ensure_bucket()
    _client().upload_fileobj(
        fileobj,
        s.s3_bucket,
        key,
        ExtraArgs={"ContentType": ct},
    )


def presigned_get_url(key: str, expires: int = 3600) -> str:
    s = get_settings()
    if s.storage_backend == "local":
        raise NotImplementedError("Use a download endpoint for local storage; presigned URLs are S3-only")
    return _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": s.s3_bucket, "Key": key},
        ExpiresIn=expires,
    )


def make_storage_key(project_id: uuid.UUID, filename: str) -> str:
    safe = filename.replace("/", "_")[:200]
    return f"projects/{project_id}/{uuid.uuid4().hex}_{safe}"


def read_storage_bytes(key: str) -> bytes:
    """Read object bytes for a storage key (local disk or S3)."""
    s = get_settings()
    if s.storage_backend == "local":
        path = resolve_local_storage_key(key)
        return path.read_bytes()
    ensure_bucket()
    obj = _client().get_object(Bucket=s.s3_bucket, Key=key)
    return obj["Body"].read()
