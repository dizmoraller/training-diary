from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user
from app.models import Exercise, User
from app.schemas import ExerciseCreate, ExerciseOut, ExerciseUpdate

router = APIRouter(prefix="/exercises", tags=["exercises"])


def _get_owned_exercise(session: Session, user: User, exercise_id: int) -> Exercise:
    exercise = session.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение не найдено")
    return exercise


@router.get("", response_model=list[ExerciseOut])
def list_exercises(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return session.scalars(select(Exercise).where(Exercise.user_id == user.id).order_by(Exercise.created_at.desc())).all()


@router.post("", response_model=ExerciseOut, status_code=status.HTTP_201_CREATED)
def create_exercise(payload: ExerciseCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    existing = session.scalar(select(Exercise).where(Exercise.user_id == user.id, Exercise.name == payload.name))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Упражнение уже существует")

    exercise = Exercise(user_id=user.id, name=payload.name, type=payload.type.value)
    session.add(exercise)
    session.commit()
    session.refresh(exercise)
    return exercise


@router.put("/{exercise_id}", response_model=ExerciseOut)
def update_exercise(
    exercise_id: int,
    payload: ExerciseUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    exercise = _get_owned_exercise(session, user, exercise_id)
    update_data = payload.model_dump(exclude_unset=True)
    new_name = update_data.get("name")
    if new_name is not None:
        existing = session.scalar(
            select(Exercise).where(
                Exercise.user_id == user.id,
                Exercise.name == new_name,
                Exercise.id != exercise_id,
            )
        )
        if existing is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Упражнение уже существует")

    for field, value in update_data.items():
        setattr(exercise, field, value.value if hasattr(value, "value") else value)
    session.commit()
    session.refresh(exercise)
    return exercise


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exercise(exercise_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    exercise = _get_owned_exercise(session, user, exercise_id)
    session.delete(exercise)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
