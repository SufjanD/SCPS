import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Car, Shield, BarChart2, Lock } from 'lucide-react'

const DEMOS = [
  { email: 'student@uni.edu', label: 'Student', icon: Car, color: 'text-blue-400', desc: 'Find & reserve parking' },
  { email: 'security@uni.edu', label: 'Security', icon: Shield, color: 'text-emerald-400', desc: 'Live monitoring & alerts' },
  { email: 'admin@uni.edu', label: 'Management', icon: BarChart2, color: 'text-purple-400', desc: 'Reports & analytics' },
]

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const user = await login(email, password)
      if (user.role === 'student') navigate('/student')
      else if (user.role === 'security') navigate('/security')
      else navigate('/management')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.')
    } finally { setLoading(false) }
  }

  function quickLogin(demoEmail) {
    setEmail(demoEmail)
    setPassword('demo123')
    setError('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-600/30">
            <span className="text-3xl">🅿️</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Smart Campus Parking</h1>
          <p className="text-slate-400 text-sm mt-1">University Parking Management System</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/70 backdrop-blur border border-slate-700 rounded-2xl p-6 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">University Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
                placeholder="your@uni.edu" required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="••••••••" required
                />
                <Lock className="absolute right-3 top-2.5 w-4 h-4 text-slate-500" />
              </div>
            </div>

            {error && (
              <div className="bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition text-sm"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-5">
            <p className="text-xs text-slate-500 mb-3 text-center">— Quick Demo Login —</p>
            <div className="grid grid-cols-3 gap-2">
              {DEMOS.map(d => (
                <button key={d.email} onClick={() => quickLogin(d.email)}
                  className="bg-slate-900/80 hover:bg-slate-700 border border-slate-600 hover:border-slate-500 rounded-xl p-3 text-center transition group"
                >
                  <d.icon className={`w-5 h-5 mx-auto mb-1.5 ${d.color}`} />
                  <div className="text-xs font-medium text-white">{d.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5 leading-tight">{d.desc}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600 text-center mt-3">Password: <span className="text-slate-400 font-mono">demo123</span></p>
          </div>
        </div>
      </div>
    </div>
  )
}
