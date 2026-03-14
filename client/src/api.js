import axios from 'axios'
import { io } from 'socket.io-client'

const BASE = import.meta.env.DEV
  ? 'http://localhost:3001'
  : (import.meta.env.VITE_API_URL || '')

export const api = axios.create({ baseURL: BASE + '/api' })

// Inject JWT token
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('scps_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Handle 401
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('scps_token')
      localStorage.removeItem('scps_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

let socket = null

export function getSocket() {
  if (!socket) {
    const token = localStorage.getItem('scps_token')
    socket = io(BASE, {
      auth: { token },
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) { socket.disconnect(); socket = null }
}
