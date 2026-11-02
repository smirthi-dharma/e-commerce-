import axios from 'axios'

const api = axios.create({
  timeout: 20000,
  baseURL: import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api/v1' : 'http://localhost:8000/api/v1'),
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sm_access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) config.headers.delete('Content-Type')
  return config
})

let refreshRequest = null
api.interceptors.response.use((response) => {
  if (typeof response.data === 'string' && /^\s*(<!doctype html|<html)/i.test(response.data)) {
    throw new Error('The shop is temporarily unavailable. Please try again shortly.')
  }
  return response
}, async (error) => {
  const config = error.config
  const refresh = localStorage.getItem('sm_refresh')
  if (error.response?.status !== 401 || !config || config._retried || !refresh || /\/auth\/(login|register|refresh|logout)\//.test(config.url)) throw error
  config._retried = true
  if (!refreshRequest) {
    refreshRequest = api.post('/auth/refresh/', { refresh }).then(({ data }) => {
      if (localStorage.getItem('sm_refresh') !== refresh) throw new Error('Session changed. Please sign in again.')
      localStorage.setItem('sm_access', data.access)
      if (data.refresh) localStorage.setItem('sm_refresh', data.refresh)
      return data.access
    }).finally(() => { refreshRequest = null })
  }
  const access = await refreshRequest
  config.headers.Authorization = `Bearer ${access}`
  return api(config)
})

export function errorMessage(error) {
  const data = error?.response?.data
  if (typeof data === 'string') {
    // Server crashes and gateway errors return an HTML page; never show markup to shoppers.
    if (/^\s*<(!doctype|html)/i.test(data)) {
      return error?.response?.status >= 500
        ? 'The store is having trouble right now. Please try again in a moment.'
        : 'Something went wrong. Please try again.'
    }
    return data
  }
  if (data?.detail) return data.detail
  if (data && typeof data === 'object') {
    const first = Object.values(data)[0]
    if (Array.isArray(first)) return first[0]
    if (typeof first === 'string') return first
  }
  return error?.message || 'Something went wrong. Please try again.'
}

export default api
