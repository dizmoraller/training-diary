from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import Settings


class Base(DeclarativeBase):
    pass


engine = None
SessionLocal = None


def init_db(settings: Settings) -> None:
    global engine, SessionLocal

    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(settings.database_url, future=True, connect_args=connect_args)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_session():
    if SessionLocal is None:
        raise RuntimeError("Database is not initialized")

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
