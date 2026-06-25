"""Object storage helper for HERCO360 report files.

Supports two backends, selected automatically by environment variables:

  • Cloudflare R2 (S3-compatible)  -> used in PRODUCTION (Render, etc.)
      Required env vars:
        R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
        and R2_ACCOUNT_ID  (or a full R2_ENDPOINT)
      Optional:
        STORAGE_PROVIDER=r2   (force R2)

  • Emergent Object Storage        -> used in the Emergent PREVIEW environment
      Uses EMERGENT_LLM_KEY (default fallback when R2 is not configured).

The rest of the app calls put_object / get_object / init_storage and does not
care which backend is active. MongoDB remains the source of truth for metadata.
"""
import os
import asyncio
import logging
import requests

logger = logging.getLogger("storage")

APP_NAME = "herco360"

# ---- Cloudflare R2 (S3-compatible) configuration ----
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")  # optional override

# ---- Emergent storage (preview fallback) ----
EMERGENT_STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"

_provider = None
_s3_client = None
_emergent_key = None


def _r2_configured() -> bool:
    return bool(R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET and (R2_ACCOUNT_ID or R2_ENDPOINT))


def provider() -> str:
    """Return the active provider: 'r2' or 'emergent'."""
    global _provider
    if _provider:
        return _provider
    forced = (os.environ.get("STORAGE_PROVIDER") or "").lower()
    if forced == "r2" or (forced != "emergent" and _r2_configured()):
        _provider = "r2"
    else:
        _provider = "emergent"
    return _provider


# ===================== Cloudflare R2 (S3) =====================
def _r2_endpoint() -> str:
    if R2_ENDPOINT:
        return R2_ENDPOINT
    return f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"


def _get_s3():
    global _s3_client
    if _s3_client is not None:
        return _s3_client
    import boto3
    from botocore.config import Config
    _s3_client = boto3.client(
        "s3",
        endpoint_url=_r2_endpoint(),
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )
    return _s3_client


def _r2_put(path, data, content_type):
    client = _get_s3()
    client.put_object(Bucket=R2_BUCKET, Key=path, Body=data, ContentType=content_type)
    return {"path": path, "size": len(data)}


def _r2_get(path):
    client = _get_s3()
    obj = client.get_object(Bucket=R2_BUCKET, Key=path)
    return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")


# ===================== Emergent storage =====================
def _emergent_init(force=False):
    global _emergent_key
    if _emergent_key and not force:
        return _emergent_key
    key = os.environ.get("EMERGENT_LLM_KEY")
    resp = requests.post(f"{EMERGENT_STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
    resp.raise_for_status()
    _emergent_key = resp.json()["storage_key"]
    return _emergent_key


def _emergent_put(path, data, content_type):
    key = _emergent_init()
    headers = {"X-Storage-Key": key, "Content-Type": content_type}
    resp = requests.put(f"{EMERGENT_STORAGE_URL}/objects/{path}", headers=headers, data=data, timeout=600)
    if resp.status_code == 403:
        headers["X-Storage-Key"] = _emergent_init(force=True)
        resp = requests.put(f"{EMERGENT_STORAGE_URL}/objects/{path}", headers=headers, data=data, timeout=600)
    resp.raise_for_status()
    return resp.json()


def _emergent_get(path):
    key = _emergent_init()
    resp = requests.get(f"{EMERGENT_STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=300)
    if resp.status_code == 403:
        resp = requests.get(f"{EMERGENT_STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": _emergent_init(force=True)}, timeout=300)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ===================== Public async API =====================
def _init_sync():
    if provider() == "r2":
        _get_s3()  # build the client; credentials validated on first real call
        return "r2"
    return _emergent_init()


def _put_sync(path, data, content_type):
    return _r2_put(path, data, content_type) if provider() == "r2" else _emergent_put(path, data, content_type)


def _get_sync(path):
    return _r2_get(path) if provider() == "r2" else _emergent_get(path)


async def init_storage():
    p = provider()
    await asyncio.to_thread(_init_sync)
    logger.info(f"Storage provider: {p}")
    return p


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(_put_sync, path, data, content_type)


async def get_object(path: str):
    return await asyncio.to_thread(_get_sync, path)
