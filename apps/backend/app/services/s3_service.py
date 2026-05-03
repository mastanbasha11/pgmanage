"""S3 file storage service — presigned URLs, key namespacing."""
from __future__ import annotations

import mimetypes
import uuid
from uuid import UUID

import boto3
from botocore.config import Config

from app.core.config import settings

_s3_client = None


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        kwargs = {
            "region_name": settings.AWS_REGION,
            "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
            "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
            "config": Config(signature_version="s3v4"),
        }
        if settings.AWS_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.AWS_ENDPOINT_URL
        _s3_client = boto3.client("s3", **kwargs)
    return _s3_client


def get_s3_key(org_id: UUID | str, property_id: UUID | str, resource_type: str, filename: str) -> str:
    """
    Namespaced S3 key: {org_id}/{property_id}/{resource_type}/{uuid}.{ext}
    Never expose internal UUIDs as filenames.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    safe_ext = ext if ext in ("jpg", "jpeg", "png", "gif", "webp", "pdf", "heic") else "bin"
    unique_name = f"{uuid.uuid4()}.{safe_ext}"
    return f"{org_id}/{property_id}/{resource_type}/{unique_name}"


async def generate_presigned_upload_url(
    org_id: UUID | str,
    property_id: UUID | str,
    resource_type: str,
    filename: str,
    expires: int = settings.S3_PRESIGNED_URL_EXPIRE_UPLOAD,
) -> dict:
    """Generate a presigned PUT URL for direct client-side uploads."""
    s3_key = get_s3_key(org_id, property_id, resource_type, filename)

    content_type, _ = mimetypes.guess_type(filename)
    content_type = content_type or "application/octet-stream"

    client = get_s3_client()
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET_NAME,
            "Key": s3_key,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
    )

    return {
        "upload_url": upload_url,
        "s3_key": s3_key,
        "expires_in": expires,
        "content_type": content_type,
    }


async def generate_presigned_view_url(
    s3_key: str,
    expires: int = settings.S3_PRESIGNED_URL_EXPIRE_VIEW,
) -> str:
    """Generate a presigned GET URL for viewing a stored file."""
    client = get_s3_client()
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_NAME, "Key": s3_key},
        ExpiresIn=expires,
    )
    return url


async def delete_object(s3_key: str) -> bool:
    try:
        client = get_s3_client()
        client.delete_object(Bucket=settings.S3_BUCKET_NAME, Key=s3_key)
        return True
    except Exception:
        return False


def ensure_bucket_exists() -> None:
    """Create S3 bucket if it doesn't exist (for local dev with localstack)."""
    if not settings.is_production:
        try:
            client = get_s3_client()
            client.create_bucket(
                Bucket=settings.S3_BUCKET_NAME,
                CreateBucketConfiguration={"LocationConstraint": settings.AWS_REGION},
            )
        except Exception:
            pass  # Bucket already exists
