import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import StudentApp from './pages/StudentApp'
import SecurityDashboard from './pages/SecurityDashboard'
import ManagementPortal from './pages/ManagementPortal'

function RoleGuard({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function DefaultRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'student') return <Navigate to="/student" replace />
  if (user.role === 'security') return <Navigate to="/security" replace />
  return <Navigate to="/management" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/student/*" element={
            <RoleGuard roles={['student']}>
              <StudentApp />
            </RoleGuard>
          } />
          <Route path="/security/*" element={
            <RoleGuard roles={['security']}>
              <SecurityDashboard />
            </RoleGuard>
          } />
          <Route path="/management/*" element={
            <RoleGuard roles={['management']}>
              <ManagementPortal />
            </RoleGuard>
          } />
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
