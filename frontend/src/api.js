const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const TOKEN_KEY = 'workout_tracker_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
    return
  }
  localStorage.removeItem(TOKEN_KEY)
}

export async function request(path, options = {}) {
  const token = options.token ?? getToken()
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const text = await response.text()
  const payload = text ? tryParseJson(text) : null

  if (!response.ok) {
    throw new Error(extractErrorMessage(payload, text, response.status))
  }

  return payload
}

function tryParseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function extractErrorMessage(payload, fallbackText, status) {
  if (payload && typeof payload === 'object') {
    if (typeof payload.detail === 'string') {
      return payload.detail
    }
    if (Array.isArray(payload.detail) && payload.detail[0]?.msg) {
      return payload.detail[0].msg
    }
  }

  if (typeof payload === 'string' && payload) {
    return payload
  }

  return fallbackText || `Ошибка запроса (${status})`
}
