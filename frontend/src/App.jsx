import { useEffect, useMemo, useState } from 'react'
import { getToken, request, setToken } from './api'

const DRAFT_WORKOUT_KEY = 'workout_tracker_draft_workout'

const initialRoute = () => {
  const hash = window.location.hash.replace(/^#/, '')
  if (hash) {
    return hash
  }

  return getToken() ? '/workouts' : '/login'
}
const today = () => new Date().toISOString().slice(0, 10)

export default function App() {
  const [token, setTokenState] = useState(getToken())
  const [route, setRoute] = useState(initialRoute)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    const onHashChange = () => setRoute(initialRoute())
    window.addEventListener('hashchange', onHashChange)
    if (!window.location.hash) {
      window.location.hash = token ? '#/workouts' : '#/login'
    }

    return () => window.removeEventListener('hashchange', onHashChange)
  }, [token])

  const page = useMemo(() => parseRoute(route), [route])

  const navigate = (path) => {
    window.location.hash = `#${path}`
  }

  useEffect(() => {
    if (!token && page.name !== 'login') {
      navigate('/login')
    }

    if (token && page.name === 'login') {
      navigate('/workouts')
    }
  }, [token, page.name])

  useEffect(() => {
    if (!token) {
      setCurrentUser(null)
      return
    }

    const loadCurrentUser = async () => {
      try {
        const user = await request('/users/me')
        setCurrentUser(user)
      } catch {
        setToken('')
        setTokenState('')
        setCurrentUser(null)
      }
    }

    loadCurrentUser()
  }, [token])

  const handleLogin = async (credentials) => {
    setBusy(true)
    setError('')

    try {
      const data = await request('/login', {
        method: 'POST',
        token: '',
        body: JSON.stringify(credentials),
      })
      setToken(data.access_token)
      setTokenState(data.access_token)
      navigate('/workouts')
    } catch (error_) {
      setError(error_.message)
    } finally {
      setBusy(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    setTokenState('')
    setCurrentUser(null)
    navigate('/login')
  }

  if (!token && page.name !== 'login') {
    return null
  }

  if (token && page.name === 'login') {
    return null
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Дневник тренировок</p>
          <h1>Трекер тренировок</h1>
        </div>
        <nav className="nav">
          {token ? (
            <>
              <a href="#/workouts">Тренировки</a>
              <a href="#/templates">Шаблоны</a>
              <a href="#/exercises">Упражнения</a>
              <a href="#/history">История</a>
              {currentUser?.is_admin ? <a href="#/users">Пользователи</a> : null}
              <button type="button" className="link-button" onClick={handleLogout}>
                Выйти
              </button>
            </>
          ) : null}
        </nav>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      <main className="content">
        {page.name === 'login' ? (
          <LoginPage onSubmit={handleLogin} busy={busy} />
        ) : null}
        {page.name === 'workouts' ? (
          <WorkoutsPage navigate={navigate} token={token} setError={setError} />
        ) : null}
        {page.name === 'workout-detail' ? (
          <WorkoutDetailPage id={page.id} token={token} navigate={navigate} setError={setError} />
        ) : null}
        {page.name === 'templates' ? (
          <TemplatesPage token={token} setError={setError} />
        ) : null}
        {page.name === 'exercises' ? (
          <ExercisesPage token={token} setError={setError} navigate={navigate} />
        ) : null}
        {page.name === 'history' ? (
          <HistoryPage token={token} exerciseId={page.id} navigate={navigate} setError={setError} />
        ) : null}
        {page.name === 'users' ? (
          <UsersPage currentUser={currentUser} setError={setError} />
        ) : null}
      </main>
    </div>
  )
}

function parseRoute(route) {
  const parts = route.replace(/^\//, '').split('/').filter(Boolean)

  if (parts.length === 0) {
    return { name: 'login' }
  }

  if (parts[0] === 'login') {
    return { name: 'login' }
  }

  if (parts[0] === 'workouts' && parts.length === 1) {
    return { name: 'workouts' }
  }

  if (parts[0] === 'workouts' && parts[1] === 'new') {
    return { name: 'workout-detail', id: 'new' }
  }

  if (parts[0] === 'workouts' && parts[1]) {
    return { name: 'workout-detail', id: Number(parts[1]) }
  }

  if (parts[0] === 'templates') {
    return { name: 'templates' }
  }

  if (parts[0] === 'exercises') {
    return { name: 'exercises' }
  }

  if (parts[0] === 'history') {
    return { name: 'history', id: parts[1] ? Number(parts[1]) : undefined }
  }

  if (parts[0] === 'users') {
    return { name: 'users' }
  }

  return { name: 'workouts' }
}

function LoginPage({ onSubmit, busy }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')

  return (
    <section className="card">
      <h2>Вход</h2>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit({ login, password })
        }}
      >
        <label>
          Логин
          <input value={login} onChange={(event) => setLogin(event.target.value)} type="text" autoComplete="username" />
        </label>
        <label>
          Пароль
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Вход...' : 'Войти'}
        </button>
      </form>
    </section>
  )
}

function WorkoutsPage({ navigate, token, setError }) {
  const [workouts, setWorkouts] = useState([])
  const [templates, setTemplates] = useState([])
  const [overview, setOverview] = useState(null)
  const [createDate, setCreateDate] = useState(today())
  const [templateId, setTemplateId] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [token])

  const load = async () => {
    setLoading(true)
    setError('')

    try {
      const [workoutsData, templatesData, overviewData] = await Promise.all([
        request('/workouts'),
        request('/templates'),
        request('/analytics/overview?days=30'),
      ])
      setWorkouts(workoutsData)
      setTemplates(templatesData)
      setOverview(overviewData)
    } catch (error_) {
      setError(error_.message)
    } finally {
      setLoading(false)
    }
  }

  const createWorkout = async (event) => {
    event.preventDefault()
    setError('')

    try {
      if (!templateId) {
        saveWorkoutDraft({
          date: createDate,
          notes: notes || null,
          exercises: [],
        })
        navigate('/workouts/new')
        return
      }

      const payload = {
        date: createDate,
        notes: notes || null,
        template_id: Number(templateId),
      }

      const created = await request('/workouts', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      navigate(`/workouts/${created.id}`)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const filteredWorkouts = workouts.filter((workout) => {
    const value = search.trim().toLowerCase()
    if (!value) {
      return true
    }
    return `${workout.id} ${workout.date} ${workout.notes || ''}`.toLowerCase().includes(value)
  })
  const groupedWorkouts = groupWorkoutsByDate(filteredWorkouts)

  return (
    <div className="grid">
      <section className="card">
        <div className="section-head">
          <div>
            <h2>Все тренировки</h2>
            <p className="muted">Полный список тренировок по всем датам.</p>
          </div>
        </div>
        {overview ? (
          <div className="stats-grid">
            <div className="stat-card">
              <strong>{overview.workouts_count}</strong>
              <span>тренировок за 30 дней</span>
            </div>
            <div className="stat-card">
              <strong>{overview.active_days}</strong>
              <span>активных дней</span>
            </div>
            <div className="stat-card">
              <strong>{overview.total_sets}</strong>
              <span>подходов</span>
            </div>
            <div className="stat-card">
              <strong>{Math.round(overview.total_tonnage)}</strong>
              <span>кг тоннажа</span>
            </div>
          </div>
        ) : null}
        <label className="search-block">
          Поиск
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Дата, заметка или номер тренировки" />
        </label>
        {loading ? <p>Загрузка...</p> : null}
        {!loading && workouts.length === 0 ? <p className="muted">Тренировок пока нет.</p> : null}
        {!loading && filteredWorkouts.length === 0 ? <p className="muted">По запросу ничего не найдено.</p> : null}
        <div className="stack">
          {groupedWorkouts.map(([workoutDate, items]) => (
            <section key={workoutDate} className="group-block">
              <div className="section-head">
                <h3>{formatDate(workoutDate)}</h3>
                <span className="muted">{items.length} шт.</span>
              </div>
              <div className="list">
                {items.map((workout) => (
                  <button key={workout.id} type="button" className="list-row" onClick={() => navigate(`/workouts/${workout.id}`)}>
                    <div>
                      <strong>Тренировка №{workout.id}</strong>
                      <p className="muted">{workout.notes || 'Без заметок'}</p>
                    </div>
                    <span>{workout.duration_minutes ? `${workout.duration_minutes} мин` : workout.date}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="card card-form">
        <div className="card-intro">
          <h2>Создать тренировку</h2>
        </div>
        <form className="stack" onSubmit={createWorkout}>
          <label>
            Дата
            <input type="date" value={createDate} onChange={(event) => setCreateDate(event.target.value)} />
          </label>
          <label>
            Шаблон
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              <option value="">Без шаблона</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">Без шаблона откроется черновик. Он не сохранится, пока ты явно не сохранишь тренировку с упражнениями.</p>
          <label>
            Заметки
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows="3" />
          </label>
          <button type="submit" className="wide-button">
            Создать тренировку
          </button>
        </form>
      </section>
    </div>
  )
}

function WorkoutDetailPage({ id, navigate, setError }) {
  const isDraft = id === 'new'
  const [workout, setWorkout] = useState(null)
  const [exercises, setExercises] = useState([])
  const [allExercises, setAllExercises] = useState([])
  const [templates, setTemplates] = useState([])
  const [summary, setSummary] = useState(null)
  const [draftNotes, setDraftNotes] = useState('')
  const [draftDate, setDraftDate] = useState(today())
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [draftExerciseId, setDraftExerciseId] = useState('')
  const [draftSets, setDraftSets] = useState([emptyWorkoutSetRow(1)])
  const [draftTemplateId, setDraftTemplateId] = useState('')
  const [draftTemplate, setDraftTemplate] = useState(null)
  const [latestValues, setLatestValues] = useState(null)
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false)
  const [copyDate, setCopyDate] = useState(today())
  const [isCreateTemplateModalOpen, setIsCreateTemplateModalOpen] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [draggedExerciseIndex, setDraggedExerciseIndex] = useState(null)
  const [exerciseDropIndex, setExerciseDropIndex] = useState(null)

  useEffect(() => {
    if (isDraft) {
      loadDraft()
      return
    }
    load()
  }, [id])

  useEffect(() => {
    if (!draftExerciseId) {
      setLatestValues(null)
      return
    }

    const loadLatestValues = async () => {
      try {
        const latest = await request(`/exercises/${draftExerciseId}/latest`)
        setLatestValues(latest)
      } catch (error_) {
        setError(error_.message)
      }
    }

    loadLatestValues()
  }, [draftExerciseId])

  useEffect(() => {
    if (!isDraft || !workout) {
      return
    }

    saveWorkoutDraft({
      date: draftDate,
      notes: draftNotes || null,
      exercises,
    })
  }, [isDraft, workout, draftDate, draftNotes, exercises])

  const load = async () => {
    setError('')

    try {
      const [workoutData, summaryData, allExercisesData, templatesData] = await Promise.all([
        request(`/workouts/${id}`),
        request(`/workouts/${id}/summary`),
        request('/exercises'),
        request('/templates'),
      ])
      setWorkout(workoutData)
      setExercises(workoutData.exercises || [])
      setSummary(summaryData)
      setAllExercises(allExercisesData)
      setTemplates(templatesData)
      setDraftNotes(workoutData.notes || '')
      setDraftDate(workoutData.date)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const loadDraft = async () => {
    setError('')

    try {
      const [allExercisesData, templatesData] = await Promise.all([request('/exercises'), request('/templates')])
      const draft = readWorkoutDraft()
      const draftExercises = (draft?.exercises || []).map((item, index) => normalizeDraftExercise(item, index))
      setWorkout({
        id: 'new',
        date: draft?.date || today(),
        notes: draft?.notes || null,
        exercises: draftExercises,
      })
      setExercises(draftExercises)
      setSummary({ total_tonnage: calculateDraftTonnage(draftExercises), personal_records: [] })
      setAllExercises(allExercisesData)
      setTemplates(templatesData)
      setDraftNotes(draft?.notes || '')
      setDraftDate(draft?.date || today())
    } catch (error_) {
      setError(error_.message)
    }
  }

  const saveWorkout = async (event) => {
    event.preventDefault()

    try {
      if (isDraft) {
        if (!exercises.length) {
          setError('Добавь хотя бы одно упражнение перед сохранением тренировки')
          return
        }

        const created = await request('/workouts', {
          method: 'POST',
          body: JSON.stringify({
            date: draftDate,
            notes: draftNotes || null,
            exercises: buildWorkoutPayloadExercises(exercises),
          }),
        })
        clearWorkoutDraft()
        navigate(`/workouts/${created.id}`)
        return
      }

      await request(`/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: draftDate,
          notes: draftNotes || null,
          exercises: buildWorkoutPayloadExercises(exercises),
        }),
      })
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const addExercise = async (event) => {
    event.preventDefault()

    if (!draftExerciseId) {
      return
    }

    const draftExercise = allExercises.find((item) => item.id === Number(draftExerciseId)) || null
    if (!draftExercise) {
      return
    }

    if (isDraft) {
      const nextDraftExercises = [
        ...exercises,
        normalizeDraftExercise(
          {
            exercise: draftExercise,
            exercise_id: draftExercise.id,
            order_index: exercises.length + 1,
            sets: draftSets.map((setDraft, index) => ({
              id: `draft-set-${exercises.length + 1}-${index + 1}`,
              set_number: index + 1,
              weight: setDraft.weight === '' ? null : Number(setDraft.weight),
              reps: setDraft.reps === '' ? null : Number(setDraft.reps),
              duration_seconds: setDraft.duration_seconds === '' ? null : Number(setDraft.duration_seconds),
            })),
          },
          exercises.length,
        ),
      ]

      setExercises(nextDraftExercises)
      setWorkout((current) => ({ ...(current || {}), exercises: nextDraftExercises }))
      setSummary({ total_tonnage: calculateDraftTonnage(nextDraftExercises), personal_records: [] })
      saveWorkoutDraft({ date: draftDate, notes: draftNotes || null, exercises: nextDraftExercises })
      closeAddModal()
      return
    }

    const nextExercises = [
      ...exercises.map((item) => ({
        exercise_id: item.exercise.id,
        order_index: item.order_index,
        sets: item.sets.map((set) => ({
          workout_exercise_id: item.id,
          set_number: set.set_number,
          weight: set.weight,
          reps: set.reps,
          duration_seconds: set.duration_seconds,
        })),
      })),
      {
        exercise_id: Number(draftExerciseId),
        order_index: exercises.length + 1,
        sets: draftSets.map((setDraft, index) => ({
          set_number: index + 1,
          weight: setDraft.weight === '' ? null : Number(setDraft.weight),
          reps: setDraft.reps === '' ? null : Number(setDraft.reps),
          duration_seconds: setDraft.duration_seconds === '' ? null : Number(setDraft.duration_seconds),
        })),
      },
    ]

    try {
      await request(`/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: draftDate,
          notes: draftNotes || null,
          exercises: nextExercises,
        }),
      })
      closeAddModal()
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const openAddModal = () => {
    setDraftExerciseId('')
    setLatestValues(null)
    setDraftSets([emptyWorkoutSetRow()])
    setIsAddModalOpen(true)
  }

  const closeAddModal = () => {
    setIsAddModalOpen(false)
    setDraftExerciseId('')
    setLatestValues(null)
    setDraftSets([emptyWorkoutSetRow()])
  }

  const openTemplateModal = () => {
    setDraftTemplateId('')
    setDraftTemplate(null)
    setIsTemplateModalOpen(true)
  }

  const closeTemplateModal = () => {
    setIsTemplateModalOpen(false)
    setDraftTemplateId('')
    setDraftTemplate(null)
  }

  const handleTemplateChange = async (templateId) => {
    setDraftTemplateId(templateId)
    if (!templateId) {
      setDraftTemplate(null)
      return
    }

    try {
      const detail = await request(`/templates/${templateId}`)
      setDraftTemplate(detail)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const addTemplateToWorkout = async (event) => {
    event.preventDefault()
    if (!draftTemplate) {
      return
    }

    if (isDraft) {
      const nextDraftExercises = [
        ...exercises,
        ...draftTemplate.exercises.map((item, index) =>
          normalizeDraftExercise(
            {
              exercise: item.exercise,
              exercise_id: item.exercise.id,
              order_index: exercises.length + index + 1,
              sets: buildSetsFromTemplate(item).map((set, setIndex) => ({
                ...set,
                id: `draft-set-${exercises.length + index + 1}-${setIndex + 1}`,
              })),
            },
            exercises.length + index,
          ),
        ),
      ]

      setExercises(nextDraftExercises)
      setWorkout((current) => ({ ...(current || {}), exercises: nextDraftExercises }))
      setSummary({ total_tonnage: calculateDraftTonnage(nextDraftExercises), personal_records: [] })
      saveWorkoutDraft({ date: draftDate, notes: draftNotes || null, exercises: nextDraftExercises })
      closeTemplateModal()
      return
    }

    const nextExercises = [
      ...exercises.map((item) => ({
        exercise_id: item.exercise.id,
        order_index: item.order_index,
        sets: item.sets.map((set) => ({
          workout_exercise_id: item.id,
          set_number: set.set_number,
          weight: set.weight,
          reps: set.reps,
          duration_seconds: set.duration_seconds,
        })),
      })),
      ...draftTemplate.exercises.map((item, index) => ({
        exercise_id: item.exercise.id,
        order_index: exercises.length + index + 1,
        sets: buildSetsFromTemplate(item),
      })),
    ]

    try {
      await request(`/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: draftDate,
          notes: draftNotes || null,
          exercises: nextExercises,
        }),
      })
      closeTemplateModal()
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const updateDraftSet = (index, patch) => {
    setDraftSets(draftSets.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }

  const addDraftSetRow = () => {
    setDraftSets([...draftSets, emptyWorkoutSetRow(latestValues)])
  }

  const removeDraftSetRow = (index) => {
    const nextRows = draftSets.filter((_, rowIndex) => rowIndex !== index)
    setDraftSets(nextRows.length > 0 ? nextRows : [emptyWorkoutSetRow(latestValues)])
  }

  const applyLatestValues = () => {
    setDraftSets([emptyWorkoutSetRow(latestValues)])
  }

  const openCopyModal = () => {
    if (isDraft) {
      return
    }
    setCopyDate(today())
    setIsCopyModalOpen(true)
  }

  const closeCopyModal = () => {
    setIsCopyModalOpen(false)
  }

  const copyWorkout = async (event) => {
    event.preventDefault()
    try {
      const copied = await request(`/workouts/${id}/copy`, {
        method: 'POST',
        body: JSON.stringify({ date: copyDate }),
      })
      closeCopyModal()
      navigate(`/workouts/${copied.id}`)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const openCreateTemplateModal = () => {
    if (isDraft) {
      return
    }
    setNewTemplateName(workout?.notes ? `Шаблон: ${workout.notes}` : `Шаблон из тренировки №${workout?.id}`)
    setIsCreateTemplateModalOpen(true)
  }

  const closeCreateTemplateModal = () => {
    setIsCreateTemplateModalOpen(false)
    setNewTemplateName('')
  }

  const createTemplateFromWorkout = async (event) => {
    event.preventDefault()
    try {
      await request(`/templates/from-workout/${id}`, {
        method: 'POST',
        body: JSON.stringify({ name: newTemplateName }),
      })
      closeCreateTemplateModal()
      navigate('/templates')
    } catch (error_) {
      setError(error_.message)
    }
  }

  const reorderWorkoutExercises = async (fromIndex, toIndex) => {
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) {
      return
    }

    const reorderedExercises = moveListItem(exercises, fromIndex, toIndex)
    const normalizedExercises = normalizeExerciseOrder(reorderedExercises)

    try {
      if (isDraft) {
        setExercises(normalizedExercises)
        setWorkout((current) => ({ ...(current || {}), exercises: normalizedExercises }))
        setSummary({ total_tonnage: calculateDraftTonnage(normalizedExercises), personal_records: [] })
        saveWorkoutDraft({ date: draftDate, notes: draftNotes || null, exercises: normalizedExercises })
        return
      }

      setExercises(normalizedExercises)
      setWorkout((current) => ({ ...(current || {}), exercises: normalizedExercises }))
      await request(`/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          date: draftDate,
          notes: draftNotes || null,
          exercises: buildWorkoutPayloadExercises(normalizedExercises),
        }),
      })
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  if (!workout) {
    return <section className="card">Загрузка...</section>
  }

  const selectedExercise = allExercises.find((item) => item.id === Number(draftExerciseId)) || null
  const personalRecordMap = new Map((summary?.personal_records || []).map((item) => [item.exercise_id, item]))

  return (
    <div className="detail-layout">
      <div className="stack">
        <section className="card">
          <div className="section-head">
            <div>
              <h2>{isDraft ? 'Черновик тренировки' : `Тренировка №${workout.id}`}</h2>
              <p className="muted">Общий тоннаж: {summary ? summary.total_tonnage : 0}</p>
            </div>
            <div className="inline wrap">
              {!isDraft ? (
                <button type="button" className="secondary" onClick={openCopyModal}>
                  Копировать тренировку
                </button>
              ) : null}
              {!isDraft ? (
                <button type="button" className="secondary" onClick={openCreateTemplateModal}>
                  Сделать шаблон
                </button>
              ) : null}
              <button type="button" onClick={() => navigate('/workouts')}>
                Назад
              </button>
            </div>
          </div>
          {summary?.personal_records?.length ? (
            <div className="inline wrap">
              {summary.personal_records.map((record) => (
                <span key={record.exercise_id} className="pill">
                  PR: {record.exercise_name} ({record.weight} кг)
                </span>
              ))}
            </div>
          ) : null}

          <form className="stack" onSubmit={saveWorkout}>
            <div className="two-columns">
              <label>
                Дата
                <input type="date" value={draftDate} onChange={(event) => setDraftDate(event.target.value)} />
              </label>
              <label>
                Заметки
                <input value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} />
              </label>
            </div>
            <button type="submit" className="wide-button">
              Сохранить тренировку
            </button>
          </form>
        </section>

        <section className="card">
          <div className="section-head">
            <div>
              <h3>Упражнения</h3>
              <p className="muted">Каждое упражнение хранит свои подходы, вес и повторы.</p>
            </div>
          </div>
          <div className="toolbar">
            <button type="button" className="secondary" onClick={openTemplateModal}>
                Добавить шаблон
            </button>
            <button type="button" onClick={openAddModal}>
                Добавить упражнение
            </button>
          </div>

          <div className="stack">
            {exercises.map((exerciseItem, index) => (
              <div
                key={exerciseItem.id}
                className={`sortable-card ${exerciseDropIndex === index ? 'sortable-card-drop-target' : ''}`}
                draggable
                onDragStart={() => {
                  setDraggedExerciseIndex(index)
                  setExerciseDropIndex(index)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setExerciseDropIndex(index)
                }}
                onDrop={async () => {
                  await reorderWorkoutExercises(draggedExerciseIndex, index)
                  setDraggedExerciseIndex(null)
                  setExerciseDropIndex(null)
                }}
                onDragEnd={() => {
                  setDraggedExerciseIndex(null)
                  setExerciseDropIndex(null)
                }}
              >
                <ExerciseBlock
                  workoutId={id}
                  exerciseItem={exerciseItem}
                  personalRecord={personalRecordMap.get(exerciseItem.exercise.id)}
                  isDraft={isDraft}
                  navigate={navigate}
                  dragIndex={index + 1}
                  onDraftChange={(nextExercise) => {
                    const nextDraftExercises = normalizeExerciseOrder(exercises.map((item) => (item.id === nextExercise.id ? nextExercise : item)))
                    setExercises(nextDraftExercises)
                    setWorkout((current) => ({ ...(current || {}), exercises: nextDraftExercises }))
                    setSummary({ total_tonnage: calculateDraftTonnage(nextDraftExercises), personal_records: [] })
                    saveWorkoutDraft({ date: draftDate, notes: draftNotes || null, exercises: nextDraftExercises })
                  }}
                  onChanged={load}
                  setError={setError}
                />
              </div>
            ))}
          </div>
        </section>
      </div>

      <aside className="card sidebar-card">
        <div className="section-head">
          <div>
            <h3>Что уже добавлено</h3>
            <p className="muted">Краткий список упражнений в текущей тренировке.</p>
          </div>
        </div>

        {exercises.length === 0 ? <p className="muted">Упражнения ещё не добавлены.</p> : null}

        <div className="list">
          {exercises.map((exerciseItem, index) => (
            <button
              key={exerciseItem.id}
              type="button"
              className="list-row sidebar-row"
              onClick={() => navigate(`/history/${exerciseItem.exercise.id}`)}
            >
              <div>
                <strong>
                  {index + 1}. {exerciseItem.exercise.name}
                </strong>
                <p className="muted">{translateExerciseType(exerciseItem.exercise.type)}</p>
              </div>
              <span>{exerciseItem.sets.length} подх.</span>
            </button>
          ))}
        </div>
      </aside>

      {isAddModalOpen ? (
        <div className="modal-backdrop" onClick={closeAddModal}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>Добавить упражнение</h3>
                <p className="muted">Сразу укажи подходы, вес, повторы и длительность.</p>
              </div>
              <button type="button" className="secondary" onClick={closeAddModal}>
                Закрыть
              </button>
            </div>

            <form className="stack" onSubmit={addExercise}>
              <label>
                Упражнение
                <select
                  value={draftExerciseId}
                  onChange={(event) => {
                    setDraftExerciseId(event.target.value)
                    setDraftSets([emptyWorkoutSetRow()])
                  }}
                >
                  <option value="">Выбери упражнение</option>
                  {allExercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedExercise ? (
                <div className="draft-hint">
                  Тип упражнения: <strong>{translateExerciseType(selectedExercise.type)}</strong>
                  {latestValues?.workout_id ? (
                    <>
                      {' · '}последние значения от {formatDate(latestValues.workout_date)}
                    </>
                  ) : null}
                </div>
              ) : null}

              {latestValues?.workout_id ? (
                <div className="inline wrap">
                  <span className="muted">
                    Последнее: {formatSetSummary(latestValues)}
                  </span>
                  <button type="button" className="secondary" onClick={applyLatestValues}>
                    Подставить последние значения
                  </button>
                </div>
              ) : null}

              <div className="stack">
                {draftSets.map((setDraft, index) => (
                  <div key={index} className="set-editor">
                    <div className="section-head">
                      <strong>Подход {index + 1}</strong>
                      <button type="button" className="secondary" onClick={() => removeDraftSetRow(index)}>
                        Удалить
                      </button>
                    </div>
                    <SetFields
                      exerciseType={selectedExercise?.type}
                      draft={setDraft}
                      onChange={(patch) => updateDraftSet(index, patch)}
                    />
                  </div>
                ))}
              </div>

              <div className="inline wrap">
                <button type="button" className="secondary" onClick={addDraftSetRow}>
                  Добавить подход
                </button>
                <button type="submit">Сохранить упражнение</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isTemplateModalOpen ? (
        <div className="modal-backdrop" onClick={closeTemplateModal}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>Добавить шаблон в тренировку</h3>
                <p className="muted">Шаблон будет добавлен к уже существующим упражнениям.</p>
              </div>
              <button type="button" className="secondary" onClick={closeTemplateModal}>
                Закрыть
              </button>
            </div>

            <form className="stack" onSubmit={addTemplateToWorkout}>
              <label>
                Шаблон
                <select value={draftTemplateId} onChange={(event) => handleTemplateChange(event.target.value)}>
                  <option value="">Выбери шаблон</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>

              {draftTemplate ? (
                <div className="stack">
                  {draftTemplate.exercises.map((item, index) => (
                    <div key={item.id} className="set-editor">
                      <strong>
                        {index + 1}. {item.exercise.name}
                      </strong>
                      <p className="muted">
                        {translateExerciseType(item.exercise.type)}
                        {' · '}
                        подходов: {item.planned_sets ?? 0}
                        {' · '}
                        повторов: {item.planned_reps ?? 0}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <button type="submit" disabled={!draftTemplate}>
                Добавить шаблон
              </button>
            </form>
          </section>
        </div>
      ) : null}

      {isCopyModalOpen ? (
        <div className="modal-backdrop" onClick={closeCopyModal}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>Копировать тренировку</h3>
                <p className="muted">Создастся новая тренировка с теми же упражнениями и подходами.</p>
              </div>
              <button type="button" className="secondary" onClick={closeCopyModal}>
                Закрыть
              </button>
            </div>
            <form className="stack" onSubmit={copyWorkout}>
              <label>
                Дата новой тренировки
                <input type="date" value={copyDate} onChange={(event) => setCopyDate(event.target.value)} />
              </label>
              <button type="submit">Скопировать</button>
            </form>
          </section>
        </div>
      ) : null}

      {isCreateTemplateModalOpen ? (
        <div className="modal-backdrop" onClick={closeCreateTemplateModal}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-head">
              <div>
                <h3>Создать шаблон из тренировки</h3>
                <p className="muted">Возьмём текущие упражнения и количество подходов как основу нового шаблона.</p>
              </div>
              <button type="button" className="secondary" onClick={closeCreateTemplateModal}>
                Закрыть
              </button>
            </div>
            <form className="stack" onSubmit={createTemplateFromWorkout}>
              <label>
                Название шаблона
                <input value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} />
              </label>
              <button type="submit">Создать шаблон</button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}

function ExerciseBlock({ workoutId, exerciseItem, personalRecord, isDraft, navigate, onDraftChange, onChanged, setError, dragIndex }) {
  const [previousWorkout, setPreviousWorkout] = useState(null)

  useEffect(() => {
    if (isDraft || typeof workoutId !== 'number') {
      setPreviousWorkout(null)
      return
    }

    const loadPreviousWorkout = async () => {
      try {
        const data = await request(`/exercises/${exerciseItem.exercise.id}/previous?before_workout_id=${workoutId}`)
        setPreviousWorkout(data)
      } catch (error_) {
        setError(error_.message)
      }
    }

    loadPreviousWorkout()
  }, [isDraft, workoutId, exerciseItem.exercise.id])

  const addSet = async () => {
    const nextSetNumber = exerciseItem.sets.length + 1

    try {
      if (isDraft) {
        onDraftChange({
          ...exerciseItem,
          sets: [...exerciseItem.sets, buildEmptySetPayload(exerciseItem, nextSetNumber)],
        })
        return
      }

      await request(`/workouts/${workoutId}/sets`, {
        method: 'POST',
        body: JSON.stringify(buildEmptySetPayload(exerciseItem, nextSetNumber)),
      })
      await onChanged()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const progress = previousWorkout?.workout_id
    ? buildExerciseProgress(exerciseItem.exercise.type, exerciseItem.sets, previousWorkout.sets)
    : null

  return (
    <article className="exercise-card">
      <div className="section-head">
        <div>
          <div className="exercise-title-row">
            <button type="button" className="drag-handle" aria-label={`Переместить упражнение ${dragIndex}`}>
              <span />
              <span />
              <span />
            </button>
            <h4>{exerciseItem.exercise.name}</h4>
          </div>
          <button type="button" className="link-button" onClick={() => navigate(`/history/${exerciseItem.exercise.id}`)}>
            Смотреть историю
          </button>
        </div>
        <div className="inline wrap">
          {personalRecord ? <span className="pill">PR {personalRecord.weight} кг</span> : null}
          <span className="pill">{translateExerciseType(exerciseItem.exercise.type)}</span>
          <button type="button" className="secondary" onClick={addSet}>
            Добавить подход
          </button>
        </div>
      </div>

      {!isDraft && previousWorkout?.workout_id ? (
        <div className="comparison-card">
          <div className="section-head">
            <strong>Прошлая тренировка: {formatDate(previousWorkout.workout_date)}</strong>
            {progress ? <span className={`progress-badge progress-${progress.status}`}>{progress.label}</span> : null}
          </div>
          <p className="muted">
            Подходов: {previousWorkout.sets.length} · тоннаж: {Math.round(previousWorkout.total_tonnage)}
          </p>
          {progress ? (
            <div className="progress-summary">
              <span className="progress-primary">{progress.currentLabel}</span>
              <span className="muted">было: {progress.previousLabel}</span>
              <span className={`progress-delta progress-${progress.status}`}>{progress.deltaLabel}</span>
            </div>
          ) : null}
          {progress?.metricLabel || progress?.volumeLabel ? (
            <div className="comparison-metrics">
              {progress.metricLabel ? <span>{progress.metricLabel}</span> : null}
              {progress.volumeLabel ? <span className="muted">{progress.volumeLabel}</span> : null}
            </div>
          ) : null}
          <div className="comparison-list">
            {previousWorkout.sets.slice(0, 3).map((set) => (
              <span key={set.id} className="comparison-pill">
                {set.set_number}: {formatSetSummary(set)}
              </span>
            ))}
            {previousWorkout.sets.length > 3 ? (
              <span className="comparison-pill comparison-pill-muted">+ ещё {previousWorkout.sets.length - 3}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Вес</th>
            <th>Повторы</th>
            <th>Длительность</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {exerciseItem.sets.map((set) => (
            <SetRow
              key={set.id}
              workoutId={workoutId}
              setItem={set}
              exerciseType={exerciseItem.exercise.type}
              isPersonalRecord={Boolean(personalRecord && set.weight === personalRecord.weight)}
              isDraft={isDraft}
              onDraftChange={(nextSet) => {
                onDraftChange({
                  ...exerciseItem,
                  sets: exerciseItem.sets.map((item) => (item.id === nextSet.id ? nextSet : item)),
                })
              }}
              onDraftRemove={(setId) => {
                onDraftChange({
                  ...exerciseItem,
                  sets: exerciseItem.sets.filter((item) => item.id !== setId),
                })
              }}
              onChanged={onChanged}
              setError={setError}
            />
          ))}
        </tbody>
      </table>
    </article>
  )
}

function SetRow({ setItem, exerciseType, isPersonalRecord, isDraft, onDraftChange, onDraftRemove, onChanged, setError }) {
  const [draft, setDraft] = useState({
    set_number: setItem.set_number,
    weight: setItem.weight ?? '',
    reps: setItem.reps ?? '',
    duration_seconds: setItem.duration_seconds ?? '',
  })

  const save = async () => {
    try {
      if (isDraft) {
        onDraftChange({
          ...setItem,
          set_number: Number(draft.set_number),
          weight: draft.weight === '' ? null : Number(draft.weight),
          reps: draft.reps === '' ? null : Number(draft.reps),
          duration_seconds: draft.duration_seconds === '' ? null : Number(draft.duration_seconds),
        })
        return
      }

      await request(`/sets/${setItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          set_number: Number(draft.set_number),
          weight: draft.weight === '' ? null : Number(draft.weight),
          reps: draft.reps === '' ? null : Number(draft.reps),
          duration_seconds: draft.duration_seconds === '' ? null : Number(draft.duration_seconds),
        }),
      })
      await onChanged()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const remove = async () => {
    try {
      if (isDraft) {
        onDraftRemove(setItem.id)
        return
      }

      await request(`/sets/${setItem.id}`, { method: 'DELETE' })
      await onChanged()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      save()
    }
  }

  return (
    <tr>
      <td>
        <div className="stack compact-stack">
          <input
            type="number"
            min="1"
            value={draft.set_number}
            onChange={(event) => setDraft({ ...draft, set_number: event.target.value })}
            onKeyDown={handleKeyDown}
          />
          {isPersonalRecord ? <span className="inline-badge">PR</span> : null}
        </div>
      </td>
      <td>{renderCellInput(exerciseType, 'weight', draft, setDraft, save)}</td>
      <td>{renderCellInput(exerciseType, 'reps', draft, setDraft, save)}</td>
      <td>{renderCellInput(exerciseType, 'duration_seconds', draft, setDraft, save)}</td>
      <td className="actions">
        <button type="button" onClick={save}>
          Сохранить
        </button>
        <button type="button" className="secondary" onClick={remove}>
          Удалить
        </button>
      </td>
    </tr>
  )
}

function TemplatesPage({ token, setError }) {
  const [templates, setTemplates] = useState([])
  const [exercises, setExercises] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [rows, setRows] = useState([emptyTemplateRow()])

  useEffect(() => {
    load()
  }, [token])

  const load = async () => {
    setError('')

    try {
      const [templatesData, exercisesData] = await Promise.all([request('/templates'), request('/exercises')])
      setTemplates(templatesData)
      setExercises(exercisesData)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const startEdit = async (template) => {
    setEditingId(template.id)
    setName(template.name)
    const detail = await request(`/templates/${template.id}`)
    setRows(
      detail.exercises.length > 0
        ? normalizeTemplateRows(
            detail.exercises.map((entry) => ({
              exercise_id: entry.exercise.id,
              order_index: entry.order_index,
              planned_sets: entry.planned_sets ?? '',
              planned_reps: entry.planned_reps ?? '',
            })),
          )
        : [emptyTemplateRow()],
    )
  }

  const saveTemplate = async (event) => {
    event.preventDefault()

    const payload = {
      name,
      exercises: rows
        .filter((row) => row.exercise_id)
        .map((row, index) => ({
          exercise_id: Number(row.exercise_id),
          order_index: index + 1,
          planned_sets: row.planned_sets === '' ? null : Number(row.planned_sets),
          planned_reps: row.planned_reps === '' ? null : Number(row.planned_reps),
        })),
    }

    try {
      if (editingId) {
        await request(`/templates/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await request('/templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      setEditingId(null)
      setName('')
      setRows([emptyTemplateRow()])
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const deleteTemplate = async (id) => {
    try {
      await request(`/templates/${id}`, { method: 'DELETE' })
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <div className="section-head">
          <h2>{editingId ? 'Редактировать шаблон' : 'Создать шаблон'}</h2>
          {editingId ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditingId(null)
                setName('')
                setRows([emptyTemplateRow()])
              }}
            >
              Отмена
            </button>
          ) : null}
        </div>
        <form className="stack" onSubmit={saveTemplate}>
          <label>
            Название
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <TemplateRows rows={rows} setRows={setRows} exercises={exercises} />
          <button type="submit">{editingId ? 'Обновить' : 'Создать'}</button>
        </form>
      </section>

      <section className="card">
        <h2>Шаблоны</h2>
        <div className="list">
          {templates.map((template) => (
            <div key={template.id} className="list-item">
              <div>
                <strong>{template.name}</strong>
                <p className="muted">
                  {template.exercises.length} упражн.
                  {template.exercises.length
                    ? ` · ${template.exercises.map((item) => item.exercise.name).slice(0, 3).join(', ')}`
                    : ''}
                </p>
              </div>
              <div className="item-actions">
                <button type="button" className="secondary action-button" onClick={() => startEdit(template)}>
                  Редактировать
                </button>
                <button type="button" className="secondary action-button" onClick={() => deleteTemplate(template.id)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function TemplateRows({ rows, setRows, exercises }) {
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dropIndex, setDropIndex] = useState(null)

  const updateRow = (index, patch) => {
    setRows(normalizeTemplateRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))))
  }

  const removeRow = (index) => {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index)
    setRows(nextRows.length ? normalizeTemplateRows(nextRows) : [emptyTemplateRow()])
  }

  const addRow = () => {
    setRows(normalizeTemplateRows([...rows, emptyTemplateRow()]))
  }

  const moveRow = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex == null || toIndex == null) {
      return
    }

    const nextRows = [...rows]
    const [movedRow] = nextRows.splice(fromIndex, 1)
    nextRows.splice(toIndex, 0, movedRow)
    setRows(normalizeTemplateRows(nextRows))
  }

  return (
    <div className="stack">
      {rows.map((row, index) => (
        <div
          key={row.row_id}
          className={`template-row ${draggedIndex === index ? 'template-row-dragging' : ''} ${dropIndex === index ? 'template-row-drop-target' : ''}`}
          draggable
          onDragStart={() => {
            setDraggedIndex(index)
            setDropIndex(index)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDropIndex(index)
          }}
          onDrop={() => {
            moveRow(draggedIndex, index)
            setDraggedIndex(null)
            setDropIndex(null)
          }}
          onDragEnd={() => {
            setDraggedIndex(null)
            setDropIndex(null)
          }}
        >
          <button type="button" className="template-row-handle" aria-label={`Переместить упражнение ${index + 1}`}>
            <span />
            <span />
            <span />
          </button>
          <div className="template-row-fields">
            <select value={row.exercise_id} onChange={(event) => updateRow(index, { exercise_id: event.target.value })}>
              <option value="">Упражнение</option>
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
            <div className="template-row-order" aria-label={`Порядок ${index + 1}`}>
              {index + 1}
            </div>
            <input
              type="number"
              min="1"
              value={row.planned_sets}
              onChange={(event) => updateRow(index, { planned_sets: event.target.value })}
              placeholder="Подходы"
            />
            <input
              type="number"
              min="1"
              value={row.planned_reps}
              onChange={(event) => updateRow(index, { planned_reps: event.target.value })}
              placeholder="Повторы"
            />
          </div>
          <button
            type="button"
            className="secondary template-row-remove"
            onClick={() => removeRow(index)}
          >
            Удалить
          </button>
        </div>
      ))}
      <button type="button" className="secondary wide-button" onClick={addRow}>
        Добавить упражнение
      </button>
    </div>
  )
}

function ExercisesPage({ token, setError, navigate }) {
  const [items, setItems] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [type, setType] = useState('strength')

  useEffect(() => {
    load()
  }, [token])

  const load = async () => {
    setError('')

    try {
      const data = await request('/exercises')
      setItems(data)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const saveExercise = async (event) => {
    event.preventDefault()

    const payload = { name, type }

    try {
      if (editingId) {
        await request(`/exercises/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      } else {
        await request('/exercises', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }

      setEditingId(null)
      setName('')
      setType('strength')
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  const startEdit = (exercise) => {
    setEditingId(exercise.id)
    setName(exercise.name)
    setType(exercise.type)
  }

  const deleteExercise = async (id) => {
    try {
      await request(`/exercises/${id}`, { method: 'DELETE' })
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <div className="section-head">
          <h2>{editingId ? 'Редактировать упражнение' : 'Создать упражнение'}</h2>
          {editingId ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setEditingId(null)
                setName('')
                setType('strength')
              }}
            >
              Отмена
            </button>
          ) : null}
        </div>

        <form className="stack" onSubmit={saveExercise}>
          <label>
            Название
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Тип
            <select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="strength">силовое</option>
              <option value="cardio">кардио</option>
              <option value="static">статическое</option>
            </select>
          </label>
          <button type="submit">{editingId ? 'Обновить' : 'Создать'}</button>
        </form>
      </section>

      <section className="card">
        <h2>Упражнения</h2>
        <div className="list">
          {items.map((exercise) => (
            <div key={exercise.id} className="list-item">
              <div>
                <strong>{exercise.name}</strong>
                <p className="muted">{translateExerciseType(exercise.type)}</p>
              </div>
              <div className="item-actions">
                <button type="button" className="secondary action-button" onClick={() => navigate(`/history/${exercise.id}`)}>
                  История
                </button>
                <button type="button" className="secondary action-button" onClick={() => startEdit(exercise)}>
                  Редактировать
                </button>
                <button type="button" className="secondary action-button" onClick={() => deleteExercise(exercise.id)}>
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function HistoryPage({ exerciseId, navigate, setError }) {
  const [items, setItems] = useState([])
  const [pr, setPr] = useState(null)
  const [selectedExerciseId, setSelectedExerciseId] = useState(exerciseId || '')
  const [allExercises, setAllExercises] = useState([])

  useEffect(() => {
    loadExercises()
  }, [])

  useEffect(() => {
    if (selectedExerciseId) {
      loadHistory(selectedExerciseId)
    }
  }, [selectedExerciseId])

  const loadExercises = async () => {
    try {
      const data = await request('/exercises')
      setAllExercises(data)
      if (!selectedExerciseId && data[0]) {
        setSelectedExerciseId(data[0].id)
      }
    } catch (error_) {
      setError(error_.message)
    }
  }

  const loadHistory = async (id) => {
    try {
      const [historyData, prData] = await Promise.all([request(`/exercises/${id}/history`), request(`/exercises/${id}/pr`)])
      setItems(historyData)
      setPr(prData)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const selectedExercise = allExercises.find((item) => item.id === Number(selectedExerciseId)) || null

  return (
    <section className="card">
      <div className="section-head">
        <h2>История</h2>
        <button type="button" onClick={() => navigate('/exercises')}>
          Упражнения
        </button>
      </div>

      <div className="stack">
        <label>
          Упражнение
          <select value={selectedExerciseId} onChange={(event) => setSelectedExerciseId(event.target.value)}>
            {allExercises.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        {selectedExercise ? <p className="muted">{selectedExercise.name}</p> : null}
        {pr ? <p className="pill">Рекорд: {pr.personal_record_weight ?? 0} кг</p> : null}

        <div className="list">
          {items.map((entry) => (
            <div key={entry.set_id} className="list-item">
              <div>
                <strong>{entry.workout_date}</strong>
                <p className="muted">Тренировка №{entry.workout_id}, подход {entry.set_number}</p>
              </div>
              <div className="history-meta">
                <p>
                  {entry.weight ?? '-'} кг / {entry.reps ?? '-'} повт. / {entry.duration_seconds ?? '-'} сек
                </p>
                {entry.is_personal_record ? <span className="inline-badge">PR</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function UsersPage({ currentUser, setError }) {
  const [users, setUsers] = useState([])
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (currentUser?.is_admin) {
      load()
    }
  }, [currentUser])

  const load = async () => {
    try {
      const data = await request('/users')
      setUsers(data)
    } catch (error_) {
      setError(error_.message)
    }
  }

  const createUser = async (event) => {
    event.preventDefault()
    try {
      await request('/users', {
        method: 'POST',
        body: JSON.stringify({
          login,
          password,
          is_admin: isAdmin,
        }),
      })
      setLogin('')
      setPassword('')
      setIsAdmin(false)
      await load()
    } catch (error_) {
      setError(error_.message)
    }
  }

  if (!currentUser?.is_admin) {
    return (
      <section className="card">
        <h2>Пользователи</h2>
        <p className="muted">Этот раздел доступен только администратору.</p>
      </section>
    )
  }

  return (
    <div className="grid">
      <section className="card">
        <h2>Создать аккаунт</h2>
        <form className="stack" onSubmit={createUser}>
          <label>
            Логин
            <input value={login} onChange={(event) => setLogin(event.target.value)} />
          </label>
          <label>
            Пароль
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={isAdmin} onChange={(event) => setIsAdmin(event.target.checked)} />
            <span>Сделать администратором</span>
          </label>
          <button type="submit">Создать пользователя</button>
        </form>
      </section>

      <section className="card">
        <h2>Пользователи</h2>
        <div className="list">
          {users.map((user) => (
            <div key={user.id} className="list-item">
              <div>
                <strong>{user.login}</strong>
                <p className="muted">{user.is_admin ? 'Администратор' : 'Пользователь'}</p>
              </div>
              <span>{formatDateTime(user.created_at)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function emptyTemplateRow() {
  return {
    row_id: `template-row-${Math.random().toString(36).slice(2, 9)}`,
    exercise_id: '',
    order_index: 1,
    planned_sets: '',
    planned_reps: '',
  }
}

function normalizeTemplateRows(rows) {
  return rows.map((row, index) => ({
    ...row,
    row_id: row.row_id || `template-row-${Math.random().toString(36).slice(2, 9)}`,
    order_index: index + 1,
  }))
}

function normalizeExerciseOrder(exercises) {
  return exercises.map((exercise, index) => ({
    ...exercise,
    order_index: index + 1,
  }))
}

function moveListItem(items, fromIndex, toIndex) {
  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)
  nextItems.splice(toIndex, 0, movedItem)
  return nextItems
}

function emptyWorkoutSetRow(latestValues = null) {
  return {
    weight: latestValues?.weight ?? '',
    reps: latestValues?.reps ?? '',
    duration_seconds: latestValues?.duration_seconds ?? '',
  }
}

function buildSetsFromTemplate(templateExercise) {
  const totalSets = templateExercise.planned_sets ?? 0
  if (totalSets <= 0) {
    return []
  }

  return Array.from({ length: totalSets }, (_, index) => ({
    set_number: index + 1,
    weight: null,
    reps: templateExercise.planned_reps ?? null,
    duration_seconds: null,
  }))
}

function SetFields({ exerciseType, draft, onChange }) {
  return (
    <>
      {exerciseType !== 'static' ? (
        <div className="two-columns">
          {exerciseType === 'strength' ? (
            <label>
              Вес
              <input type="number" min="0" value={draft.weight} onChange={(event) => onChange({ weight: event.target.value })} />
            </label>
          ) : (
            <div />
          )}
          {exerciseType === 'strength' ? (
            <label>
              Повторы
              <input type="number" min="0" value={draft.reps} onChange={(event) => onChange({ reps: event.target.value })} />
            </label>
          ) : null}
        </div>
      ) : null}
      {exerciseType !== 'strength' ? (
        <label>
          Длительность в секундах
          <input
            type="number"
            min="0"
            value={draft.duration_seconds}
            onChange={(event) => onChange({ duration_seconds: event.target.value })}
          />
        </label>
      ) : (
        <label>
          Длительность в секундах
          <input
            type="number"
            min="0"
            value={draft.duration_seconds}
            onChange={(event) => onChange({ duration_seconds: event.target.value })}
            placeholder="Опционально"
          />
        </label>
      )}
    </>
  )
}

function renderCellInput(exerciseType, field, draft, setDraft, onEnter) {
  if (field === 'weight' && exerciseType !== 'strength') {
    return <span className="muted">-</span>
  }
  if (field === 'reps' && exerciseType !== 'strength') {
    return <span className="muted">-</span>
  }
  if (field === 'duration_seconds' && exerciseType === 'strength') {
    return (
      <input
        type="number"
        min="0"
        value={draft.duration_seconds}
        onChange={(event) => setDraft({ ...draft, duration_seconds: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onEnter()
          }
        }}
      />
    )
  }
  return (
    <input
      type="number"
      min="0"
      value={draft[field]}
      onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onEnter()
        }
      }}
    />
  )
}

function groupWorkoutsByDate(workouts) {
  const groups = new Map()
  workouts.forEach((workout) => {
    const items = groups.get(workout.date) || []
    items.push(workout)
    groups.set(workout.date, items)
  })
  return Array.from(groups.entries())
}

function formatDate(value) {
  if (!value) {
    return ''
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU')
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('ru-RU')
}

function formatSetSummary(setValues) {
  return `${setValues.weight ?? '-'} кг / ${setValues.reps ?? '-'} повт. / ${setValues.duration_seconds ?? '-'} сек`
}

function buildExerciseProgress(exerciseType, currentSets, previousSets) {
  const current = summarizeExerciseSets(exerciseType, currentSets)
  const previous = summarizeExerciseSets(exerciseType, previousSets)
  if (!current.filledCount || !previous.filledCount) {
    return null
  }

  if (exerciseType === 'strength') {
    return buildStrengthProgress(current, previous)
  }

  return buildDurationProgress(current, previous, exerciseType)
}

function buildStrengthProgress(current, previous) {
  const bestSetComparison = compareStrengthSets(current.bestSet, previous.bestSet)
  const tonnageDiff = current.tonnage - previous.tonnage

  if (bestSetComparison > 0) {
    return {
      status: 'up',
      label: 'Прогресс',
      currentLabel: `лучший подход: ${formatStrengthSet(current.bestSet)}`,
      previousLabel: formatStrengthSet(previous.bestSet),
      deltaLabel:
        current.bestSet.weight !== previous.bestSet.weight
          ? `+${formatNumber(current.bestSet.weight - previous.bestSet.weight)} кг`
          : `+${current.bestSet.reps - previous.bestSet.reps} повт.`,
      metricLabel: `Тоннаж: ${Math.round(current.tonnage)} кг`,
      volumeLabel: `Было ${Math.round(previous.tonnage)} кг · рабочих подходов ${current.filledCount} против ${previous.filledCount}`,
    }
  }

  if (bestSetComparison === 0 && tonnageDiff > 0) {
    return {
      status: 'up',
      label: 'Прогресс',
      currentLabel: `лучший подход: ${formatStrengthSet(current.bestSet)}`,
      previousLabel: formatStrengthSet(previous.bestSet),
      deltaLabel: `+${Math.round(tonnageDiff)} кг тоннажа`,
      metricLabel: `Тоннаж: ${Math.round(current.tonnage)} кг`,
      volumeLabel: `Было ${Math.round(previous.tonnage)} кг · рабочих подходов ${current.filledCount} против ${previous.filledCount}`,
    }
  }

  if (bestSetComparison === 0 && tonnageDiff === 0) {
    return {
      status: 'same',
      label: 'Без изменений',
      currentLabel: `лучший подход: ${formatStrengthSet(current.bestSet)}`,
      previousLabel: formatStrengthSet(previous.bestSet),
      deltaLabel: 'Лучший подход и объём совпадают',
      metricLabel: `Тоннаж: ${Math.round(current.tonnage)} кг`,
      volumeLabel: `Рабочих подходов: ${current.filledCount}`,
    }
  }

  return {
    status: 'down',
    label: 'Ниже прошлого',
    currentLabel: `лучший подход: ${formatStrengthSet(current.bestSet)}`,
    previousLabel: formatStrengthSet(previous.bestSet),
    deltaLabel:
      current.bestSet.weight !== previous.bestSet.weight
        ? `-${formatNumber(previous.bestSet.weight - current.bestSet.weight)} кг`
        : `-${previous.bestSet.reps - current.bestSet.reps} повт.`,
    metricLabel: `Тоннаж: ${Math.round(current.tonnage)} кг`,
    volumeLabel: `Было ${Math.round(previous.tonnage)} кг · рабочих подходов ${current.filledCount} против ${previous.filledCount}`,
  }
}

function buildDurationProgress(current, previous, exerciseType) {
  const durationLabel = exerciseType === 'cardio' ? 'лучший отрезок' : 'лучшее удержание'
  const currentBest = current.bestDuration
  const previousBest = previous.bestDuration
  const totalDiff = current.totalDuration - previous.totalDuration

  if (currentBest > previousBest || (currentBest === previousBest && totalDiff > 0)) {
    return {
      status: 'up',
      label: 'Прогресс',
      currentLabel: `${durationLabel}: ${currentBest} сек`,
      previousLabel: `${previousBest} сек`,
      deltaLabel: currentBest > previousBest ? `+${currentBest - previousBest} сек` : `+${totalDiff} сек суммарно`,
      metricLabel: `Суммарно: ${current.totalDuration} сек`,
      volumeLabel: `Было ${previous.totalDuration} сек · рабочих подходов ${current.filledCount} против ${previous.filledCount}`,
    }
  }

  if (currentBest === previousBest && totalDiff === 0) {
    return {
      status: 'same',
      label: 'Без изменений',
      currentLabel: `${durationLabel}: ${currentBest} сек`,
      previousLabel: `${previousBest} сек`,
      deltaLabel: 'Время совпадает',
      metricLabel: `Суммарно: ${current.totalDuration} сек`,
      volumeLabel: `Рабочих подходов: ${current.filledCount}`,
    }
  }

  return {
    status: 'down',
    label: 'Ниже прошлого',
    currentLabel: `${durationLabel}: ${currentBest} сек`,
    previousLabel: `${previousBest} сек`,
    deltaLabel: currentBest !== previousBest ? `-${previousBest - currentBest} сек` : `-${Math.abs(totalDiff)} сек суммарно`,
    metricLabel: `Суммарно: ${current.totalDuration} сек`,
    volumeLabel: `Было ${previous.totalDuration} сек · рабочих подходов ${current.filledCount} против ${previous.filledCount}`,
  }
}

function summarizeExerciseSets(exerciseType, sets) {
  const filledSets = getMeaningfulSets(exerciseType, sets)
  if (exerciseType === 'strength') {
    const sorted = [...filledSets].sort((left, right) => {
      const weightDiff = Number(right.weight || 0) - Number(left.weight || 0)
      if (weightDiff !== 0) {
        return weightDiff
      }
      return Number(right.reps || 0) - Number(left.reps || 0)
    })
    return {
      filledCount: filledSets.length,
      bestWeight: Number(sorted[0]?.weight || 0),
      bestReps: Number(sorted[0]?.reps || 0),
      bestSet: {
        weight: Number(sorted[0]?.weight || 0),
        reps: Number(sorted[0]?.reps || 0),
      },
      tonnage: filledSets.reduce((total, set) => total + Number(set.weight || 0) * Number(set.reps || 0), 0),
    }
  }

  return {
    filledCount: filledSets.length,
    bestDuration: Math.max(...filledSets.map((set) => Number(set.duration_seconds || 0)), 0),
    totalDuration: filledSets.reduce((total, set) => total + Number(set.duration_seconds || 0), 0),
  }
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function getMeaningfulSets(exerciseType, sets) {
  if (exerciseType === 'strength') {
    return sets.filter((set) => Number(set.weight || 0) > 0 || Number(set.reps || 0) > 0)
  }
  return sets.filter((set) => Number(set.duration_seconds || 0) > 0)
}

function compareStrengthSets(currentSet, previousSet) {
  const weightDiff = currentSet.weight - previousSet.weight
  if (weightDiff !== 0) {
    return weightDiff
  }
  return currentSet.reps - previousSet.reps
}

function formatStrengthSet(set) {
  return `${formatNumber(set.weight)} кг × ${set.reps}`
}

function buildWorkoutPayloadExercises(exercises) {
  return exercises.map((item) => ({
    exercise_id: item.exercise.id,
    order_index: item.order_index,
    sets: item.sets.map((set) => ({
      set_number: set.set_number,
      weight: set.weight,
      reps: set.reps,
      duration_seconds: set.duration_seconds,
    })),
  }))
}

function buildEmptySetPayload(exerciseItem, setNumber) {
  if (exerciseItem.exercise.type === 'strength') {
    return {
      id: `draft-set-${exerciseItem.id}-${setNumber}`,
      workout_exercise_id: exerciseItem.id,
      set_number: setNumber,
      weight: null,
      reps: 0,
      duration_seconds: null,
    }
  }

  return {
    id: `draft-set-${exerciseItem.id}-${setNumber}`,
    workout_exercise_id: exerciseItem.id,
    set_number: setNumber,
    weight: null,
    reps: null,
    duration_seconds: 0,
  }
}

function normalizeDraftExercise(item, index) {
  return {
    ...item,
    id: item.id || `draft-exercise-${index + 1}`,
    order_index: item.order_index ?? index + 1,
    exercise:
      item.exercise || {
        id: item.exercise_id,
        name: item.name,
        type: item.type,
      },
    sets: (item.sets || []).map((set, setIndex) => ({
      ...set,
      id: set.id || `draft-set-${index + 1}-${setIndex + 1}`,
    })),
  }
}

function calculateDraftTonnage(exercises) {
  return exercises.reduce(
    (total, exercise) =>
      total +
      exercise.sets.reduce((setTotal, set) => setTotal + Number(set.weight || 0) * Number(set.reps || 0), 0),
    0,
  )
}

function readWorkoutDraft() {
  try {
    const value = localStorage.getItem(DRAFT_WORKOUT_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function saveWorkoutDraft(draft) {
  localStorage.setItem(DRAFT_WORKOUT_KEY, JSON.stringify(draft))
}

function clearWorkoutDraft() {
  localStorage.removeItem(DRAFT_WORKOUT_KEY)
}

function translateExerciseType(type) {
  switch (type) {
    case 'strength':
      return 'силовое'
    case 'cardio':
      return 'кардио'
    case 'static':
      return 'статическое'
    default:
      return type
  }
}
