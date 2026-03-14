import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LogOut, Car, Shield, BarChart2, Bell, Wifi } from 'lucide-react'

export default function Navbar({ title, links = [], alertCount = 0, connected = true }) {
  const { user, logout } = useAuth()
  const location = useLocation()

  const roleIcon = user?.role === 'student' ? Car : user?.role === 'security' ? Shield : BarChart2
  const RoleIcon = roleIcon

  return (
    <nav className="bg-slate-900 border-b border-slate-700 px-4 py-2 flex items-center gap-3 sticky top-0 z-50">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <span className="text-xl">🅿️</span>
        <span className="font-bold text-white hidden sm:block text-sm">{title || 'SCPS'}</span>
      </div>

      {/* Nav links */}
      <div className="flex items-center gap-1 flex-1">
        {links.map(l => (
          <Link key={l.to} to={l.to}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition
              ${location.pathname === l.to
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            {l.icon && <l.icon className="w-3.5 h-3.5" />}
            {l.label}
          </Link>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Connection status */}
        <div className={`flex items-center gap-1 text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
          <Wifi className="w-3.5 h-3.5" />
          <span className="hidden sm:block">{connected ? 'Live' : 'Offline'}</span>
        </div>

        {/* Alert bell */}
        {alertCount > 0 && (
          <div className="relative">
            <Bell className="w-4 h-4 text-yellow-400 pulse-alert" />
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          </div>
        )}

        {/* User info */}
        <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-2 py-1.5">
          <RoleIcon className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs text-white hidden sm:block">{user?.name?.split(' ')[0]}</span>
        </div>

        <button onClick={logout}
          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </nav>
  )
}
