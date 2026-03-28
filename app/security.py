from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from app.config import Settings


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return "scrypt$" + base64.urlsafe_b64encode(salt).decode("utf-8") + "$" + base64.urlsafe_b64encode(derived).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    scheme, salt_part, digest_part = password_hash.split("$", 2)
    if scheme != "scrypt":
        return False

    salt = base64.urlsafe_b64decode(salt_part.encode("utf-8"))
    expected = base64.urlsafe_b64decode(digest_part.encode("utf-8"))
    actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return hmac.compare_digest(actual, expected)


def create_access_token(user_id: int, settings: Settings) -> str:
    expires_at = int((datetime.now(timezone.utc) + timedelta(seconds=settings.token_ttl_seconds)).timestamp())
    payload = f"{user_id}:{expires_at}".encode("utf-8")
    signature = hmac.new(settings.secret_key.encode("utf-8"), payload, hashlib.sha256).digest()
    token = payload + b":" + base64.urlsafe_b64encode(signature)
    return base64.urlsafe_b64encode(token).decode("utf-8")


def decode_access_token(token: str, settings: Settings) -> int | None:
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8"))
        user_id_part, exp_part, signature_part = raw.split(b":", 2)
        payload = user_id_part + b":" + exp_part
        expected_signature = hmac.new(settings.secret_key.encode("utf-8"), payload, hashlib.sha256).digest()
        provided_signature = base64.urlsafe_b64decode(signature_part)
        if not hmac.compare_digest(expected_signature, provided_signature):
            return None
        if int(exp_part.decode("utf-8")) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return int(user_id_part.decode("utf-8"))
    except Exception:
        return None
