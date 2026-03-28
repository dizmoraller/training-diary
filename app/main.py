from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
import app.db as db
from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router
from app.routers.exercises import router as exercises_router
from app.routers.templates import router as templates_router
from app.routers.users import router as users_router
from app.routers.workouts import router as workouts_router
from app.services.bootstrap import ensure_default_admin


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()
    db.init_db(app_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if db.engine is None or db.SessionLocal is None:
            raise RuntimeError("Database is not initialized")
        db.Base.metadata.create_all(bind=db.engine)
        with db.SessionLocal() as session:
            ensure_default_admin(session, app_settings)
        yield

    app = FastAPI(title="Workout Tracker", lifespan=lifespan)
    app.state.settings = app_settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in app_settings.cors_origins.split(",") if origin.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(users_router)
    app.include_router(exercises_router)
    app.include_router(templates_router)
    app.include_router(workouts_router)
    app.include_router(analytics_router)

    @app.get("/health")
    def healthcheck():
        return {"status": "ok"}

    return app


app = create_app()
