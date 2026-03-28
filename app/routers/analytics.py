from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.db import get_session
from app.dependencies import get_current_user
from app.models import Exercise, SetEntry, User, Workout, WorkoutExercise
from app.schemas import (
    AnalyticsOverview,
    ExerciseHistoryEntry,
    ExerciseLatestValues,
    ExercisePR,
    ExercisePreviousWorkout,
    WorkoutPersonalRecord,
    WorkoutSummary,
)

router = APIRouter(tags=["analytics"])


def _ensure_owned_exercise(session: Session, user: User, exercise_id: int) -> Exercise:
    exercise = session.get(Exercise, exercise_id)
    if exercise is None or exercise.user_id != user.id:
        raise HTTPException(status_code=404, detail="Упражнение не найдено")
    return exercise


@router.get("/exercises/{exercise_id}/history", response_model=list[ExerciseHistoryEntry])
def get_exercise_history(exercise_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _ensure_owned_exercise(session, user, exercise_id)
    max_weight_statement = (
        select(func.max(SetEntry.weight))
        .join(WorkoutExercise, WorkoutExercise.id == SetEntry.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.user_id == user.id, WorkoutExercise.exercise_id == exercise_id)
    )
    max_weight = session.scalar(max_weight_statement)
    statement = (
        select(
            Workout.id.label("workout_id"),
            Workout.date.label("workout_date"),
            SetEntry.id.label("set_id"),
            SetEntry.set_number,
            SetEntry.weight,
            SetEntry.reps,
            SetEntry.duration_seconds,
        )
        .join(WorkoutExercise, WorkoutExercise.id == SetEntry.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.user_id == user.id, WorkoutExercise.exercise_id == exercise_id)
        .order_by(Workout.date.asc(), SetEntry.set_number.asc(), SetEntry.id.asc())
    )
    return [
        ExerciseHistoryEntry.model_validate(
            {
                **row._mapping,
                "is_personal_record": max_weight is not None and row._mapping["weight"] == max_weight,
            }
        )
        for row in session.execute(statement)
    ]


@router.get("/exercises/{exercise_id}/pr", response_model=ExercisePR)
def get_exercise_pr(exercise_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _ensure_owned_exercise(session, user, exercise_id)
    statement = (
        select(func.max(SetEntry.weight))
        .join(WorkoutExercise, WorkoutExercise.id == SetEntry.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.user_id == user.id, WorkoutExercise.exercise_id == exercise_id)
    )
    return ExercisePR(exercise_id=exercise_id, personal_record_weight=session.scalar(statement))


@router.get("/workouts/{workout_id}/summary", response_model=WorkoutSummary)
def get_workout_summary(workout_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    workout = session.get(Workout, workout_id)
    if workout is None or workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")

    statement = (
        select(func.coalesce(func.sum(SetEntry.weight * SetEntry.reps), 0.0))
        .join(WorkoutExercise, WorkoutExercise.id == SetEntry.workout_exercise_id)
        .where(WorkoutExercise.workout_id == workout_id)
    )
    max_by_exercise = (
        select(
            WorkoutExercise.exercise_id.label("exercise_id"),
            func.max(SetEntry.weight).label("max_weight"),
        )
        .join(SetEntry, SetEntry.workout_exercise_id == WorkoutExercise.id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.user_id == user.id)
        .group_by(WorkoutExercise.exercise_id)
        .subquery()
    )
    prs_statement = (
        select(Exercise.id, Exercise.name, SetEntry.weight)
        .join(WorkoutExercise, WorkoutExercise.exercise_id == Exercise.id)
        .join(SetEntry, SetEntry.workout_exercise_id == WorkoutExercise.id)
        .join(max_by_exercise, and_(max_by_exercise.c.exercise_id == Exercise.id, max_by_exercise.c.max_weight == SetEntry.weight))
        .where(WorkoutExercise.workout_id == workout_id, SetEntry.weight.is_not(None))
        .distinct()
    )
    personal_records = [
        WorkoutPersonalRecord(exercise_id=row.id, exercise_name=row.name, weight=row.weight)
        for row in session.execute(prs_statement)
    ]
    return WorkoutSummary(
        workout_id=workout_id,
        total_tonnage=float(session.scalar(statement) or 0.0),
        personal_records=personal_records,
    )


@router.get("/exercises/{exercise_id}/latest", response_model=ExerciseLatestValues)
def get_exercise_latest(exercise_id: int, user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    _ensure_owned_exercise(session, user, exercise_id)
    statement = (
        select(
            Workout.id.label("workout_id"),
            Workout.date.label("workout_date"),
            SetEntry.weight,
            SetEntry.reps,
            SetEntry.duration_seconds,
        )
        .join(WorkoutExercise, WorkoutExercise.id == SetEntry.workout_exercise_id)
        .join(Workout, Workout.id == WorkoutExercise.workout_id)
        .where(Workout.user_id == user.id, WorkoutExercise.exercise_id == exercise_id)
        .order_by(
            case((SetEntry.weight.is_not(None), 0), (SetEntry.duration_seconds.is_not(None), 0), else_=1),
            Workout.date.desc(),
            SetEntry.set_number.desc(),
            SetEntry.id.desc(),
        )
        .limit(1)
    )
    row = session.execute(statement).first()
    if row is None:
        return ExerciseLatestValues(
            exercise_id=exercise_id,
            workout_id=None,
            workout_date=None,
            weight=None,
            reps=None,
            duration_seconds=None,
        )
    return ExerciseLatestValues(exercise_id=exercise_id, **row._mapping)


@router.get("/exercises/{exercise_id}/previous", response_model=ExercisePreviousWorkout)
def get_exercise_previous_workout(
    exercise_id: int,
    before_workout_id: int = Query(..., ge=1),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    _ensure_owned_exercise(session, user, exercise_id)
    current_workout = session.get(Workout, before_workout_id)
    if current_workout is None or current_workout.user_id != user.id:
        raise HTTPException(status_code=404, detail="Текущая тренировка не найдена")

    previous_statement = (
        select(Workout)
        .join(WorkoutExercise)
        .where(
            Workout.user_id == user.id,
            WorkoutExercise.exercise_id == exercise_id,
            ((Workout.date < current_workout.date) | ((Workout.date == current_workout.date) & (Workout.id < current_workout.id))),
        )
        .order_by(Workout.date.desc(), Workout.id.desc())
        .limit(1)
    )
    previous_workout = session.scalar(previous_statement)
    if previous_workout is None:
        return ExercisePreviousWorkout(exercise_id=exercise_id, workout_id=None, workout_date=None, sets=[], total_tonnage=0.0)

    sets_statement = (
        select(SetEntry)
        .join(WorkoutExercise)
        .where(WorkoutExercise.workout_id == previous_workout.id, WorkoutExercise.exercise_id == exercise_id)
        .order_by(SetEntry.set_number.asc(), SetEntry.id.asc())
    )
    sets = session.scalars(sets_statement).all()
    total_tonnage = sum((set_item.weight or 0) * (set_item.reps or 0) for set_item in sets)
    return ExercisePreviousWorkout(
        exercise_id=exercise_id,
        workout_id=previous_workout.id,
        workout_date=previous_workout.date,
        sets=sets,
        total_tonnage=float(total_tonnage),
    )


@router.get("/analytics/overview", response_model=AnalyticsOverview)
def get_analytics_overview(
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    start_date = date.today() - timedelta(days=days - 1)
    workouts_statement = select(Workout.id, Workout.date).where(Workout.user_id == user.id, Workout.date >= start_date)
    workouts = session.execute(workouts_statement).all()
    workout_ids = [row.id for row in workouts]
    if not workout_ids:
        return AnalyticsOverview(period_days=days, workouts_count=0, active_days=0, total_sets=0, total_tonnage=0.0)

    totals_statement = (
        select(
            func.count(SetEntry.id),
            func.coalesce(func.sum(SetEntry.weight * SetEntry.reps), 0.0),
        )
        .join(WorkoutExercise, WorkoutExercise.id == SetEntry.workout_exercise_id)
        .where(WorkoutExercise.workout_id.in_(workout_ids))
    )
    total_sets, total_tonnage = session.execute(totals_statement).one()
    return AnalyticsOverview(
        period_days=days,
        workouts_count=len(workout_ids),
        active_days=len({row.date for row in workouts}),
        total_sets=int(total_sets or 0),
        total_tonnage=float(total_tonnage or 0.0),
    )
