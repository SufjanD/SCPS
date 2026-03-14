import { createContext, useContext, useState, useCallback } from 'react'
import { api, disconnectSocket } from '../api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('scps_user') || 'null') } catch { return null }
  })

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('scps_token', data.token)
    localStorage.setItem('scps_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('scps_token')
    localStorage.removeItem('scps_user')
    disconnectSocket()
    setUser(null)
  }, [])

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
