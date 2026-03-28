from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_session
from app.dependencies import get_current_user
from app.models import Exercise, TemplateExercise, User, Workout, WorkoutExercise, WorkoutTemplate
from app.schemas import TemplateCreate, TemplateOut, TemplateUpdate, WorkoutTemplateCreateFromWorkout

router = APIRouter(prefix="/templates", tags=["templates"])


def _get_owned_template(session: Session, user: User, template_id: int) -> WorkoutTemplate:
    statement = (
        select(WorkoutTemplate)
        .options(selectinload(WorkoutTemplate.exercises).selectinload(TemplateExercise.exercise))
        .where(WorkoutTemplate.id == template_id, WorkoutTemplate.user_id == user.id)
    )
    template = session.scalar(statement)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")
    return template


def _validate_exercise_ids(session: Session, user: User, exercise_ids: set[int]) -> None:
    existing_ids = set(
        session.scalars(select(Exercise.id).where(Exercise.user_id == user.id, Exercise.id.in_(exercise_ids))).all()
    )
    if existing_ids != exercise_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Шаблон содержит отсутствующие упражнения")


def _replace_template_exercises(template: WorkoutTemplate, payload_exercises):
    template.exercises.clear()
    for item in payload_exercises:
        template.exercises.append(
            TemplateExercise(
                exercise_id=item.exercise_id,
                order_index=item.order_index,
                planned_sets=item.planned_sets,
                planned_reps=item.planned_reps,
            )
        )


@router.get("", response_model=list[TemplateOut])
def list_templates(user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    statement = (
        select(WorkoutTemplate)
        .options(selectinload(WorkoutTemplate.exercises).selectinload(TemplateExercise.exercise))
        .where(WorkoutTemplate.user_id == user.id)
        .order_by(WorkoutTemplate.created_at.desc())
    )
    return session.scalars(statement).unique().all()


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(payload: TemplateCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    if payload.exercises:
        _validate_exercise_ids(session, user, {item.exercise_id for item in payload.exercises})

    template = WorkoutTemplate(user_id=user.id, name=payload.name)
    _replace_template_exercises(template, payload.exercises)
    session.add(template)
    session.commit()
    return _get_owned_template(session, user, template.id)


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(template_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return _get_owned_template(session, user, template_id)


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int,
    payload: TemplateUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    template = _get_owned_template(session, user, template_id)
    if payload.name is not None:
        template.name = payload.name
    if payload.exercises is not None:
        if payload.exercises:
            _validate_exercise_ids(session, user, {item.exercise_id for item in payload.exercises})
        _replace_template_exercises(template, payload.exercises)
    session.commit()
    return _get_owned_template(session, user, template_id)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    template = _get_owned_template(session, user, template_id)
    session.delete(template)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/from-workout/{workout_id}", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template_from_workout(
    workout_id: int,
    payload: WorkoutTemplateCreateFromWorkout,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    statement = (
        select(Workout)
        .options(selectinload(Workout.exercises).selectinload(WorkoutExercise.sets), selectinload(Workout.exercises).selectinload(WorkoutExercise.exercise))
        .where(Workout.id == workout_id, Workout.user_id == user.id)
    )
    workout = session.scalar(statement)
    if workout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")
    if not workout.exercises:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя создать шаблон из пустой тренировки")

    template = WorkoutTemplate(user_id=user.id, name=payload.name)
    for item in workout.exercises:
        planned_reps = next((set_item.reps for set_item in item.sets if set_item.reps is not None), None)
        template.exercises.append(
            TemplateExercise(
                exercise_id=item.exercise_id,
                order_index=item.order_index,
                planned_sets=len(item.sets) or None,
                planned_reps=planned_reps,
            )
        )
    session.add(template)
    session.commit()
    return _get_owned_template(session, user, template.id)
