# Workout Tracker

Сервис для ведения журнала тренировок.

## Запуск через Docker

```bash
docker compose --profile frontend up --build
```

Запустятся PostgreSQL, backend и frontend.

* backend: `http://localhost:8000`
* frontend: `http://localhost:3000`

Стартовый пользователь по умолчанию:

* логин: `admin`
* пароль: `password123`

## Локальный запуск

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e .[test]
uvicorn app.main:app --reload
```

Во втором терминале:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 3000
```

Если нужен PostgreSQL локально, перед запуском backend задай `DATABASE_URL` в формате `postgresql+psycopg://...`.

## Переменные окружения

Поддерживаются:

* `DATABASE_URL` - адрес БД SQLAlchemy, например `postgresql+psycopg://user:pass@localhost:5432/workout_tracker`
* `APP_SECRET_KEY` - секрет для токенов
* `DEFAULT_ADMIN_LOGIN` - логин стартового администратора
* `DEFAULT_ADMIN_PASSWORD` - пароль стартового администратора
* `TOKEN_TTL_SECONDS` - время жизни токена в секундах
* `CORS_ORIGINS` - разрешенные адреса frontend

Если `DATABASE_URL` не задан, backend использует локальный SQLite.

## Вход

Для получения bearer-токена используй `POST /login` с `login` и `password`.

Если заданы `DEFAULT_ADMIN_LOGIN` и `DEFAULT_ADMIN_PASSWORD`, стартовый администратор создается автоматически.
