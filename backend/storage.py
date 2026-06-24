"""Emergent Object Storage helper (init / put / get).

Files are stored in cloud object storage; MongoDB keeps the canonical metadata.
The storage_key is session-scoped and reused. Sync `requests` calls are wrapped
with asyncio.to_thread so they don't block the FastAPI event loop on large files.
"""
import os
import asyncio
import logging
import requests

logger = logging.getLogger("storage")

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "herco360"

_storage_key = None


def _key():
    return os.environ.get("EMERGENT_LLM_KEY")


def _init_sync(force=False):
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": _key()}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_sync(path, data, content_type):
    key = _init_sync()
    headers = {"X-Storage-Key": key, "Content-Type": content_type}
    resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers=headers, data=data, timeout=600)
    if resp.status_code == 403:  # key expired -> refresh once
        key = _init_sync(force=True)
        headers["X-Storage-Key"] = key
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers=headers, data=data, timeout=600)
    resp.raise_for_status()
    return resp.json()


def _get_sync(path):
    key = _init_sync()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=300)
    if resp.status_code == 403:
        key = _init_sync(force=True)
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=300)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def init_storage():
    return await asyncio.to_thread(_init_sync)


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    return await asyncio.to_thread(_put_sync, path, data, content_type)


async def get_object(path: str):
    return await asyncio.to_thread(_get_sync, path)
