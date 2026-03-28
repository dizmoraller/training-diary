from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user, require_admin
from app.models import User
from app.schemas import UserCreate, UserOut
from app.security import hash_password

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, _: User = Depends(require_admin), session: Session = Depends(get_session)):
    existing = session.scalar(select(User).where(User.login == payload.login))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Пользователь уже существует")

    user = User(login=payload.login, password_hash=hash_password(payload.password), is_admin=payload.is_admin)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.get("", response_model=list[UserOut])
def list_users(_: User = Depends(require_admin), session: Session = Depends(get_session)):
    return session.scalars(select(User).order_by(User.created_at.desc())).all()
