from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User
from app.security import hash_password


def ensure_default_admin(session: Session, settings: Settings) -> None:
    if not settings.default_admin_login or not settings.default_admin_password:
        return

    existing_user = session.scalar(select(User).where(User.login == settings.default_admin_login))
    if existing_user is not None:
        return

    admin = User(
        login=settings.default_admin_login,
        password_hash=hash_password(settings.default_admin_password),
        is_admin=True,
    )
    session.add(admin)
    session.commit()
