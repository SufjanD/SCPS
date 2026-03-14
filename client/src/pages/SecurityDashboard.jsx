import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useSocket } from '../hooks/useSocket'
import Navbar from '../components/Navbar'
import ParkingMap from '../components/ParkingMap'
import SpaceDetail from '../components/SpaceDetail'
import {
  Car, AlertTriangle, CheckCircle, Shield, Clock, MapPin,
  Bell, Eye, XCircle, RefreshCw, Activity, Wifi, WifiOff
} from 'lucide-react'

const ALERT_ICONS = { overstay: '⏰', unauthorized: '🚨', sensor_offline: '📡', manual: '🔧' }
const ALERT_COLORS = {
  overstay: 'border-orange-600 bg-orange-900/20',
  unauthorized: 'border-red-600 bg-red-900/20',
  sensor_offline: 'border-yellow-600 bg-yellow-900/20',
  manual: 'border-gray-600 bg-gray-900/20',
}

function StatCard({ label, value, sub, color = 'blue', icon: Icon }) {
  const colors = {
    blue: 'bg-blue-900/30 border-blue-700 text-blue-400',
    green: 'bg-green-900/30 border-green-700 text-green-400',
    red: 'bg-red-900/30 border-red-700 text-red-400',
    yellow: 'bg-yellow-900/30 border-yellow-700 text-yellow-400',
    gray: 'bg-slate-800 border-slate-600 text-slate-400',
  }
  return (
    <div className={`border rounded-xl p-4 ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-bold text-white">{value}</div>
          <div className="text-xs font-medium mt-0.5 opacity-80">{label}</div>
          {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
        </div>
        {Icon && <Icon className="w-6 h-6 opacity-70" />}
      </div>
    </div>
  )
}

function ZoneRow({ zone }) {
  const pct = zone.total_spaces > 0 ? Math.round((zone.occupied_spaces / zone.total_spaces) * 100) : 0
  const color = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e'
  return (
    <tr className="border-b border-slate-700 hover:bg-slate-800/50 transition">
      <td className="py-2.5 px-3 text-sm text-white font-medium">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: zone.color || '#3b82f6' }} />
          {zone.name}
        </div>
      </td>
      <td className="py-2.5 px-3 text-sm text-slate-300">{zone.total_spaces}</td>
      <td className="py-2.5 px-3 text-sm text-green-400">{zone.free_spaces}</td>
      <td className="py-2.5 px-3 text-sm text-red-400">{zone.occupied_spaces}</td>
      <td className="py-2.5 px-3 text-sm text-blue-400">{zone.reserved_spaces}</td>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden" style={{ minWidth: 80 }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
        </div>
      </td>
    </tr>
  )
}

function AlertCard({ alert, onAck }) {
  const [acking, setAcking] = useState(false)
  const isResolved = alert.acknowledged || alert.auto_resolved

  async function ack() {
    setAcking(true)
    try { await api.post(`/alerts/${alert.id}/acknowledge`); onAck() }
    catch {} finally { setAcking(false) }
  }

  const minutesAgo = Math.round((Date.now() - new Date(alert.created_at).getTime()) / 60000)

  return (
    <div className={`border rounded-xl p-3 transition ${isResolved ? 'opacity-40' : ALERT_COLORS[alert.alert_type]} ${!isResolved ? 'pulse-alert' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <span className="text-lg flex-shrink-0">{ALERT_ICONS[alert.alert_type]}</span>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white uppercase tracking-wide">
              {alert.alert_type.replace('_', ' ')}
            </div>
            <div className="text-xs text-slate-300 mt-0.5 leading-relaxed">{alert.message}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <MapPin className="w-3 h-3" />{alert.space_label} · {alert.zone_name}
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />{minutesAgo}m ago
              </span>
            </div>
          </div>
        </div>
        {!isResolved && (
          <button onClick={ack} disabled={acking}
            className="flex-shrink-0 flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded-lg text-xs text-white transition">
            <CheckCircle className="w-3 h-3 text-green-400" />
            {acking ? '…' : 'Ack'}
          </button>
        )}
        {isResolved && (
          <span className="text-xs text-green-500 flex-shrink-0 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />{alert.auto_resolved ? 'Resolved' : 'Acked'}
          </span>
        )}
      </div>
    </div>
  )
}

function LprEventRow({ evt }) {
  const color = evt.result === 'registered' ? 'text-green-400' : evt.result === 'unregistered' ? 'text-yellow-400' : 'text-gray-400'
  const bg = evt.result === 'registered' ? 'bg-green-900/20' : evt.result === 'unregistered' ? 'bg-yellow-900/20' : 'bg-slate-800'
  const timeAgo = Math.round((Date.now() - new Date(evt.timestamp).getTime()) / 60000)
  return (
    <tr className={`border-b border-slate-700 hover:bg-slate-800/50 transition text-xs`}>
      <td className="py-2 px-3 font-mono text-white">{evt.plate_number || '—'}</td>
      <td className="py-2 px-3 text-slate-300">{evt.space_label}</td>
      <td className="py-2 px-3 text-slate-400">{evt.zone_name}</td>
      <td className="py-2 px-3">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${color}`}>
          {evt.result === 'registered' ? '✓ Registered' : evt.result === 'unregistered' ? '⚠ External' : '? Unreadable'}
        </span>
      </td>
      <td className="py-2 px-3 text-slate-500">{timeAgo < 60 ? `${timeAgo}m ago` : `${Math.round(timeAgo/60)}h ago`}</td>
    </tr>
  )
}

export default function SecurityDashboard() {
  const [spaces, setSpaces] = useState([])
  const [zones, setZones] = useState([])
  const [alerts, setAlerts] = useState([])
  const [lprEvents, setLprEvents] = useState([])
  const [selected, setSelected] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [connected, setConnected] = useState(true)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [s, z, a, l] = await Promise.all([
        api.get('/spaces'),
        api.get('/spaces/zones'),
        api.get('/alerts'),
        api.get('/alerts/lpr'),
      ])
      setSpaces(s.data)
      setZones(z.data)
      setAlerts(a.data)
      setLprEvents(l.data)
      setConnected(true)
    } catch { setConnected(false) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const iv = setInterval(load, 15000); return () => clearInterval(iv) }, [])

  useSocket('space_update', update => {
    setSpaces(prev => prev.map(s => s.id === update.id ? { ...s, ...update } : s))
  })
  useSocket('new_alerts', newAlerts => {
    setAlerts(prev => [...newAlerts, ...prev].slice(0, 50))
  })

  const stats = {
    total: spaces.length,
    free: spaces.filter(s => s.status === 'free').length,
    occupied: spaces.filter(s => s.status === 'occupied').length,
    reserved: spaces.filter(s => s.status === 'reserved').length,
    blocked: spaces.filter(s => s.status === 'blocked').length,
  }
  const unackedAlerts = alerts.filter(a => !a.acknowledged && !a.auto_resolved)
  const overstayAlerts = unackedAlerts.filter(a => a.alert_type === 'overstay')
  const unauthorizedAlerts = unackedAlerts.filter(a => a.alert_type === 'unauthorized')

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'map', label: 'Live Map' },
    { id: 'alerts', label: `Alerts ${unackedAlerts.length > 0 ? `(${unackedAlerts.length})` : ''}` },
    { id: 'lpr', label: 'LPR Log' },
  ]

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Navbar
        title="Security Dashboard"
        connected={connected}
        alertCount={unackedAlerts.length}
      />

      {/* Tabs */}
      <div className="bg-slate-800 border-b border-slate-700 px-4">
        <div className="flex gap-1 max-w-6xl mx-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-xs font-medium border-b-2 transition ${
                activeTab === t.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 py-2">
            <div className={`flex items-center gap-1 text-xs ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
              {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {connected ? 'Live' : 'Offline'}
            </div>
            <button onClick={load} className="p-1 hover:bg-slate-700 rounded">
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 py-5 space-y-5">

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatCard label="Total Spaces" value={stats.total} color="gray" icon={Car} />
                <StatCard label="Available" value={stats.free} color="green" icon={CheckCircle} />
                <StatCard label="Occupied" value={stats.occupied} color="red" icon={Car} />
                <StatCard label="Reserved" value={stats.reserved} color="blue" icon={Shield} />
                <StatCard label="Blocked" value={stats.blocked} color="gray" icon={XCircle} />
              </div>

              {/* Active alerts summary */}
              {unackedAlerts.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-orange-900/20 border border-orange-700 rounded-xl p-4 flex items-center gap-3">
                    <span className="text-2xl">⏰</span>
                    <div>
                      <div className="text-2xl font-bold text-white">{overstayAlerts.length}</div>
                      <div className="text-xs text-orange-300">Overstay Alerts</div>
                    </div>
                  </div>
                  <div className="bg-red-900/20 border border-red-700 rounded-xl p-4 flex items-center gap-3">
                    <span className="text-2xl">🚨</span>
                    <div>
                      <div className="text-2xl font-bold text-white">{unauthorizedAlerts.length}</div>
                      <div className="text-xs text-red-300">Unauthorized Vehicles</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Zone table */}
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span className="font-medium text-white text-sm">Zone Occupancy</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700 text-xs text-slate-500">
                        <th className="text-left py-2.5 px-3 font-medium">Zone</th>
                        <th className="text-left py-2.5 px-3 font-medium">Total</th>
                        <th className="text-left py-2.5 px-3 font-medium">Free</th>
                        <th className="text-left py-2.5 px-3 font-medium">Occupied</th>
                        <th className="text-left py-2.5 px-3 font-medium">Reserved</th>
                        <th className="text-left py-2.5 px-3 font-medium">Occupancy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zones.map(z => <ZoneRow key={z.id} zone={z} />)}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent alerts preview */}
              {unackedAlerts.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-yellow-400" />
                      <span className="font-medium text-white text-sm">Active Alerts</span>
                      <span className="bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full">{unackedAlerts.length}</span>
                    </div>
                    <button onClick={() => setActiveTab('alerts')} className="text-xs text-blue-400 hover:text-blue-300">
                      View all →
                    </button>
                  </div>
                  <div className="p-3 space-y-2">
                    {unackedAlerts.slice(0, 3).map(a => (
                      <AlertCard key={a.id} alert={a} onAck={load} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* MAP TAB */}
          {activeTab === 'map' && (
            <div>
              <div className="flex items-center gap-2 mb-4 text-sm text-slate-400">
                <Eye className="w-4 h-4" />
                Click any space to flag, clear, or navigate. Purple dot = unregistered vehicle.
              </div>
              <ParkingMap
                spaces={spaces}
                onSelectSpace={setSelected}
                selectedId={selected?.id}
                showLPR={true}
              />
            </div>
          )}

          {/* ALERTS TAB */}
          {activeTab === 'alerts' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">{unackedAlerts.length} active, {alerts.length - unackedAlerts.length} resolved</span>
              </div>
              {alerts.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-600" />
                  All clear — no alerts
                </div>
              ) : (
                alerts.map(a => <AlertCard key={a.id} alert={a} onAck={load} />)
              )}
            </div>
          )}

          {/* LPR LOG TAB */}
          {activeTab === 'lpr' && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                <Car className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-white text-sm">License Plate Recognition Log</span>
                <span className="text-xs text-slate-500 ml-auto">Last 100 events</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-500">
                      <th className="text-left py-2.5 px-3 font-medium">Plate</th>
                      <th className="text-left py-2.5 px-3 font-medium">Space</th>
                      <th className="text-left py-2.5 px-3 font-medium">Zone</th>
                      <th className="text-left py-2.5 px-3 font-medium">Status</th>
                      <th className="text-left py-2.5 px-3 font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lprEvents.map(e => <LprEventRow key={e.id} evt={e} />)}
                    {lprEvents.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-slate-500 text-sm">No LPR events yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Space detail */}
      {selected && activeTab === 'map' && (
        <>
          <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setSelected(null)} />
          <SpaceDetail
            space={selected}
            onClose={() => setSelected(null)}
            userRole="security"
            onReserved={() => { setSelected(null); load() }}
          />
        </>
      )}
    </div>
  )
}
