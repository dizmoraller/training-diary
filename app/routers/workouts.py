from __future__ import annotations

from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_session
from app.dependencies import get_current_user
from app.models import Exercise, SetEntry, TemplateExercise, User, Workout, WorkoutExercise, WorkoutTemplate
from app.schemas import (
    SetCreate,
    SetOut,
    SetUpdate,
    WorkoutCopyRequest,
    WorkoutCreate,
    WorkoutDetail,
    WorkoutExerciseInput,
    WorkoutListItem,
    WorkoutSetInput,
    WorkoutUpdate,
)

router = APIRouter(tags=["workouts"])


def _get_workout_statement(workout_id: int, user_id: int):
    return (
        select(Workout)
        .options(
            selectinload(Workout.exercises)
            .selectinload(WorkoutExercise.exercise),
            selectinload(Workout.exercises)
            .selectinload(WorkoutExercise.sets),
        )
        .where(Workout.id == workout_id, Workout.user_id == user_id)
    )


def _get_owned_workout(session: Session, user: User, workout_id: int) -> Workout:
    workout = session.scalar(_get_workout_statement(workout_id, user.id))
    if workout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тренировка не найдена")
    return workout


def _validate_workout_exercise_ids(session: Session, user: User, exercise_ids: set[int]) -> None:
    existing = set(session.scalars(select(Exercise.id).where(Exercise.user_id == user.id, Exercise.id.in_(exercise_ids))).all())
    if existing != exercise_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Тренировка содержит отсутствующие упражнения")


def _ensure_workout_not_empty(template_id: int | None, exercises_payload: list[WorkoutExerciseInput] | None) -> None:
    has_template = template_id is not None
    has_exercises = bool(exercises_payload)
    if not has_template and not has_exercises:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя сохранить пустую тренировку")


def _attach_sets(workout_exercise: WorkoutExercise, items: list[WorkoutSetInput]) -> None:
    workout_exercise.sets.clear()
    for item in items:
        workout_exercise.sets.append(
            SetEntry(
                set_number=item.set_number,
                weight=item.weight,
                reps=item.reps,
                duration_seconds=item.duration_seconds,
            )
        )


def _build_sets_from_template(template_exercise: TemplateExercise, exercise_type: str) -> list[SetEntry]:
    total_sets = template_exercise.planned_sets or 0
    if total_sets <= 0:
        return []

    items: list[SetEntry] = []
    for index in range(total_sets):
        items.append(
            SetEntry(
                set_number=index + 1,
                weight=None,
                reps=template_exercise.planned_reps if exercise_type == "strength" else None,
                duration_seconds=0 if exercise_type in {"cardio", "static"} else None,
            )
        )
    return items


def _validate_set_values(weight: float | None, reps: int | None, duration_seconds: int | None, exercise_type: str | None = None) -> None:
    if exercise_type == "strength" and reps is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Для силового упражнения нужны повторы")
    if exercise_type in {"cardio", "static"} and duration_seconds is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Для этого упражнения нужна длительность")


def _replace_workout_exercises(
    session: Session,
    workout: Workout,
    user: User,
    template_id: int | None,
    exercises_payload: list[WorkoutExerciseInput],
) -> None:
    workout.exercises.clear()

    if template_id is not None:
        template = session.scalar(
            select(WorkoutTemplate)
            .options(selectinload(WorkoutTemplate.exercises))
            .where(WorkoutTemplate.id == template_id, WorkoutTemplate.user_id == user.id)
        )
        if template is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Шаблон не найден")
        for item in template.exercises:
            exercise = session.get(Exercise, item.exercise_id)
            if exercise is None or exercise.user_id != user.id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Шаблон содержит отсутствующие упражнения")
            workout_exercise = WorkoutExercise(exercise_id=item.exercise_id, order_index=item.order_index)
            workout_exercise.sets.extend(_build_sets_from_template(item, exercise.type))
            workout.exercises.append(workout_exercise)

    for item in exercises_payload:
        exercise = session.get(Exercise, item.exercise_id)
        if exercise is None or exercise.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Тренировка содержит отсутствующие упражнения")
        workout_exercise = WorkoutExercise(exercise_id=item.exercise_id, order_index=item.order_index)
        for set_item in item.sets:
            _validate_set_values(set_item.weight, set_item.reps, set_item.duration_seconds, exercise.type)
        _attach_sets(workout_exercise, item.sets)
        workout.exercises.append(workout_exercise)


@router.get("/workouts", response_model=list[WorkoutListItem])
def list_workouts(date: date_type | None = None, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    statement = select(Workout).where(Workout.user_id == user.id).order_by(Workout.date.desc(), Workout.id.desc())
    if date is not None:
        statement = statement.where(Workout.date == date)
    return session.scalars(statement).all()


@router.post("/workouts", response_model=WorkoutDetail, status_code=status.HTTP_201_CREATED)
def create_workout(payload: WorkoutCreate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _ensure_workout_not_empty(payload.template_id, payload.exercises)
    if payload.exercises:
        _validate_workout_exercise_ids(session, user, {item.exercise_id for item in payload.exercises})

    workout = Workout(user_id=user.id, date=payload.date, duration_minutes=payload.duration_minutes, notes=payload.notes)
    _replace_workout_exercises(session, workout, user, payload.template_id, payload.exercises)
    session.add(workout)
    session.commit()
    return _get_owned_workout(session, user, workout.id)


@router.get("/workouts/{workout_id}", response_model=WorkoutDetail)
def get_workout(workout_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return _get_owned_workout(session, user, workout_id)


@router.put("/workouts/{workout_id}", response_model=WorkoutDetail)
def update_workout(
    workout_id: int,
    payload: WorkoutUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    workout = _get_owned_workout(session, user, workout_id)
    if payload.date is not None:
        workout.date = payload.date
    if "duration_minutes" in payload.model_fields_set:
        workout.duration_minutes = payload.duration_minutes
    if "notes" in payload.model_fields_set:
        workout.notes = payload.notes
    if payload.exercises is not None:
        _ensure_workout_not_empty(None, payload.exercises)
        if payload.exercises:
            _validate_workout_exercise_ids(session, user, {item.exercise_id for item in payload.exercises})
        _replace_workout_exercises(session, workout, user, None, payload.exercises)
    session.commit()
    return _get_owned_workout(session, user, workout_id)


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workout(workout_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    workout = _get_owned_workout(session, user, workout_id)
    session.delete(workout)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _get_owned_workout_exercise(session: Session, user: User, workout_id: int, workout_exercise_id: int) -> WorkoutExercise:
    statement = (
        select(WorkoutExercise)
        .join(Workout)
        .where(WorkoutExercise.id == workout_exercise_id, Workout.id == workout_id, Workout.user_id == user.id)
    )
    workout_exercise = session.scalar(statement)
    if workout_exercise is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Упражнение тренировки не найдено")
    return workout_exercise


def _get_owned_set(session: Session, user: User, set_id: int) -> SetEntry:
    statement = (
        select(SetEntry)
        .join(WorkoutExercise)
        .join(Workout)
        .where(SetEntry.id == set_id, Workout.user_id == user.id)
    )
    set_entry = session.scalar(statement)
    if set_entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Подход не найден")
    return set_entry


@router.post("/workouts/{workout_id}/sets", response_model=SetOut, status_code=status.HTTP_201_CREATED)
def create_set(
    workout_id: int,
    payload: SetCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    workout_exercise = _get_owned_workout_exercise(session, user, workout_id, payload.workout_exercise_id)
    _validate_set_values(payload.weight, payload.reps, payload.duration_seconds, workout_exercise.exercise.type)
    set_entry = SetEntry(
        workout_exercise_id=workout_exercise.id,
        set_number=payload.set_number,
        weight=payload.weight,
        reps=payload.reps,
        duration_seconds=payload.duration_seconds,
    )
    session.add(set_entry)
    session.commit()
    session.refresh(set_entry)
    return set_entry


@router.put("/sets/{set_id}", response_model=SetOut)
def update_set(set_id: int, payload: SetUpdate, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    set_entry = _get_owned_set(session, user, set_id)
    _validate_set_values(
        payload.weight if "weight" in payload.model_fields_set else set_entry.weight,
        payload.reps if "reps" in payload.model_fields_set else set_entry.reps,
        payload.duration_seconds if "duration_seconds" in payload.model_fields_set else set_entry.duration_seconds,
        set_entry.workout_exercise.exercise.type,
    )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(set_entry, field, value)
    session.commit()
    session.refresh(set_entry)
    return set_entry


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(set_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    set_entry = _get_owned_set(session, user, set_id)
    session.delete(set_entry)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/workouts/{workout_id}/copy", response_model=WorkoutDetail, status_code=status.HTTP_201_CREATED)
def copy_workout(
    workout_id: int,
    payload: WorkoutCopyRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    source = _get_owned_workout(session, user, workout_id)
    copied = Workout(
        user_id=user.id,
        date=payload.date,
        duration_minutes=source.duration_minutes,
        notes=payload.notes if "notes" in payload.model_fields_set else source.notes,
    )
    for item in source.exercises:
        copied_exercise = WorkoutExercise(exercise_id=item.exercise_id, order_index=item.order_index)
        for set_item in item.sets:
            copied_exercise.sets.append(
                SetEntry(
                    set_number=set_item.set_number,
                    weight=set_item.weight,
                    reps=set_item.reps,
                    duration_seconds=set_item.duration_seconds,
                )
            )
        copied.exercises.append(copied_exercise)
    session.add(copied)
    session.commit()
    return _get_owned_workout(session, user, copied.id)
