from __future__ import annotations

from datetime import date as date_type, datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.entities import ExerciseType


class ModelBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    login: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    login: str
    password: str = Field(min_length=8)
    is_admin: bool = False


class UserOut(ModelBase):
    id: int
    login: str
    is_admin: bool
    created_at: datetime


class ExerciseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: ExerciseType


class ExerciseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: ExerciseType | None = None


class ExerciseOut(ModelBase):
    id: int
    name: str
    type: ExerciseType
    created_at: datetime


class TemplateExerciseInput(BaseModel):
    exercise_id: int
    order_index: int
    planned_sets: int | None = Field(default=None, ge=1)
    planned_reps: int | None = Field(default=None, ge=1)


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    exercises: list[TemplateExerciseInput]


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    exercises: list[TemplateExerciseInput] | None = None


class WorkoutTemplateCreateFromWorkout(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class TemplateExerciseOut(ModelBase):
    id: int
    order_index: int
    planned_sets: int | None
    planned_reps: int | None
    exercise: ExerciseOut


class TemplateOut(ModelBase):
    id: int
    name: str
    created_at: datetime
    exercises: list[TemplateExerciseOut]


class SetCreate(BaseModel):
    workout_exercise_id: int
    set_number: int = Field(ge=1)
    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)


class SetUpdate(BaseModel):
    set_number: int | None = Field(default=None, ge=1)
    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)


class SetOut(ModelBase):
    id: int
    set_number: int
    weight: float | None
    reps: int | None
    duration_seconds: int | None


class WorkoutExerciseInput(BaseModel):
    exercise_id: int
    order_index: int
    sets: list["WorkoutSetInput"] = Field(default_factory=list)


class WorkoutTemplateSource(BaseModel):
    template_id: int


class WorkoutCreate(BaseModel):
    date: date_type
    duration_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None
    template_id: int | None = None
    exercises: list[WorkoutExerciseInput] = Field(default_factory=list)


class WorkoutUpdate(BaseModel):
    date: date_type | None = None
    duration_minutes: int | None = Field(default=None, ge=0)
    notes: str | None = None
    exercises: list[WorkoutExerciseInput] | None = None


class WorkoutExerciseOut(ModelBase):
    id: int
    order_index: int
    exercise: ExerciseOut
    sets: list[SetOut]


class WorkoutListItem(ModelBase):
    id: int
    date: date_type
    duration_minutes: int | None
    notes: str | None
    created_at: datetime


class WorkoutDetail(ModelBase):
    id: int
    date: date_type
    duration_minutes: int | None
    notes: str | None
    created_at: datetime
    exercises: list[WorkoutExerciseOut]


class WorkoutSummary(BaseModel):
    workout_id: int
    total_tonnage: float
    personal_records: list["WorkoutPersonalRecord"] = Field(default_factory=list)


class ExerciseHistoryEntry(BaseModel):
    workout_id: int
    workout_date: date_type
    set_id: int
    set_number: int
    weight: float | None
    reps: int | None
    duration_seconds: int | None
    is_personal_record: bool = False


class ExercisePR(BaseModel):
    exercise_id: int
    personal_record_weight: float | None


class ExerciseLatestValues(BaseModel):
    exercise_id: int
    workout_id: int | None
    workout_date: date_type | None
    weight: float | None
    reps: int | None
    duration_seconds: int | None


class ExercisePreviousWorkout(BaseModel):
    exercise_id: int
    workout_id: int | None
    workout_date: date_type | None
    sets: list[SetOut] = Field(default_factory=list)
    total_tonnage: float = 0.0


class WorkoutPersonalRecord(BaseModel):
    exercise_id: int
    exercise_name: str
    weight: float


class WorkoutCopyRequest(BaseModel):
    date: date_type
    notes: str | None = None


class AnalyticsOverview(BaseModel):
    period_days: int
    workouts_count: int
    active_days: int
    total_sets: int
    total_tonnage: float


class WorkoutSetInput(BaseModel):
    set_number: int = Field(ge=1)
    weight: float | None = Field(default=None, ge=0)
    reps: int | None = Field(default=None, ge=0)
    duration_seconds: int | None = Field(default=None, ge=0)


WorkoutSummary.model_rebuild()
WorkoutExerciseInput.model_rebuild()
