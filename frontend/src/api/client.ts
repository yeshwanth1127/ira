const API_BASE = import.meta.env.VITE_API_URL || '/api'

const ACCESS = 'alufit_access'
const REFRESH = 'alufit_refresh'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS)
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access)
  localStorage.setItem(REFRESH, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS)
  localStorage.removeItem(REFRESH)
}

async function refreshAccess(): Promise<boolean> {
  const r = localStorage.getItem(REFRESH)
  if (!r) return false
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: r }),
  })
  if (!res.ok) return false
  const data = (await res.json()) as { access_token: string; refresh_token: string }
  setTokens(data.access_token, data.refresh_token)
  return true
}

export async function api<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {},
): Promise<T> {
  const { skipAuth, ...init } = options
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (!skipAuth) {
    const t = getAccessToken()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  let res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (res.status === 401 && !skipAuth) {
    const ok = await refreshAccess()
    if (ok) {
      headers.Authorization = `Bearer ${getAccessToken()}`
      res = await fetch(`${API_BASE}${path}`, { ...init, headers })
    }
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export async function apiUpload<T>(
  path: string,
  form: FormData,
  method = 'POST',
): Promise<T> {
  const headers: Record<string, string> = {}
  const t = getAccessToken()
  if (t) headers.Authorization = `Bearer ${t}`
  let res = await fetch(`${API_BASE}${path}`, { method, body: form, headers })
  if (res.status === 401) {
    const ok = await refreshAccess()
    if (ok) {
      headers.Authorization = `Bearer ${getAccessToken()}`
      res = await fetch(`${API_BASE}${path}`, { method, body: form, headers })
    }
  }
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  return res.json() as Promise<T>
}

export async function downloadActivityCsv(projectId: string, filename: string) {
  const t = getAccessToken()
  const res = await fetch(`${API_BASE}/projects/${projectId}/activity/export.csv`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  })
  if (!res.ok) throw new Error(await res.text())
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
