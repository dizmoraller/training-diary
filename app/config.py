from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(slots=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./workout_tracker.db")
    secret_key: str = os.getenv("APP_SECRET_KEY", "change-me")
    token_ttl_seconds: int = int(os.getenv("TOKEN_TTL_SECONDS", "43200"))
    cors_origins: str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    default_admin_login: str | None = os.getenv("DEFAULT_ADMIN_LOGIN") or os.getenv("DEFAULT_ADMIN_EMAIL")
    default_admin_password: str | None = os.getenv("DEFAULT_ADMIN_PASSWORD")


def get_settings() -> Settings:
    return Settings()
