import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useSocket } from '../hooks/useSocket'
import { useAuth } from '../hooks/useAuth'
import Navbar from '../components/Navbar'
import ParkingMap from '../components/ParkingMap'
import SpaceDetail from '../components/SpaceDetail'
import { Map, Calendar, Brain, RefreshCw, X, Clock, CheckCircle, AlertCircle } from 'lucide-react'

const HORIZONS = [
  { key: 'now', label: 'Now' },
  { key: '+1hr', label: '+1 hr', h: 1 },
  { key: '+2hr', label: '+2 hr', h: 2 },
  { key: '+4hr', label: '+4 hr', h: 4 },
]
const FILTERS = ['all', 'standard', 'disabled', 'reserved']

export default function StudentApp() {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState([])
  const [predictions, setPredictions] = useState([])
  const [activeReservation, setActiveReservation] = useState(null)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [horizon, setHorizon] = useState('now')
  const [tab, setTab] = useState('map')
  const [lastUpdate, setLastUpdate] = useState(null)
  const [isStale, setIsStale] = useState(false)
  const [connected, setConnected] = useState(true)
  const [loading, setLoading] = useState(true)

  const loadSpaces = useCallback(async () => {
    try {
      const { data } = await api.get('/spaces')
      setSpaces(data)
      setLastUpdate(new Date())
      setIsStale(false)
      setConnected(true)
    } catch { setConnected(false) }
    finally { setLoading(false) }
  }, [])

  const loadPredictions = useCallback(async () => {
    try {
      const { data } = await api.get('/reports/predictions')
      setPredictions(data)
    } catch {}
  }, [])

  const loadActiveReservation = useCallback(async () => {
    try {
      const { data } = await api.get('/reservations/active')
      setActiveReservation(data)
    } catch {}
  }, [])

  useEffect(() => {
    loadSpaces()
    loadPredictions()
    loadActiveReservation()

    // Auto refresh every 30s
    const iv = setInterval(loadSpaces, 30000)
    // Stale check
    const staleCheck = setInterval(() => {
      if (lastUpdate && Date.now() - new Date(lastUpdate).getTime() > 60000) setIsStale(true)
    }, 10000)

    return () => { clearInterval(iv); clearInterval(staleCheck) }
  }, [])

  // Real-time socket updates
  useSocket('space_update', update => {
    setSpaces(prev => prev.map(s => s.id === update.id
      ? { ...s, ...update, last_update: new Date().toISOString() }
      : s
    ))
    setLastUpdate(new Date())
    setIsStale(false)
  })

  const totalFree = spaces.filter(s => s.status === 'free').length

  // Stale indicator
  const secondsAgo = lastUpdate ? Math.round((Date.now() - new Date(lastUpdate).getTime()) / 1000) : null

  async function cancelReservation() {
    if (!activeReservation) return
    try {
      await api.post(`/reservations/${activeReservation.id}/cancel`)
      setActiveReservation(null)
      loadSpaces()
    } catch {}
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Navbar
        title="SCPS Student"
        connected={connected}
        links={[
          { to: '/student', label: 'Map', icon: Map },
          { to: '/student/reservations', label: 'My Bookings', icon: Calendar },
        ]}
      />

      <div className="flex-1 overflow-auto pb-24">
        {/* Status bar */}
        <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between">
          <div className={`flex items-center gap-1.5 text-xs ${isStale ? 'text-yellow-400' : 'text-slate-400'}`}>
            <RefreshCw className={`w-3 h-3 ${isStale ? 'text-yellow-400' : ''}`} />
            {secondsAgo !== null ? `Updated ${secondsAgo}s ago` : 'Loading...'}
            {isStale && <span className="text-yellow-400 ml-1">· Live updates paused</span>}
          </div>
          <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${totalFree > 0 ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'}`}>
            {totalFree} spaces available
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {/* Active reservation banner */}
          {activeReservation && (
            <div className="bg-blue-900/40 border border-blue-600 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-blue-200">
                    Space <strong>{activeReservation.space_label}</strong> reserved
                  </div>
                  <div className="text-xs text-blue-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    Expires {new Date(activeReservation.expiry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    · {activeReservation.zone_name}
                  </div>
                </div>
              </div>
              <button onClick={cancelReservation}
                className="text-xs text-blue-400 hover:text-red-400 px-2 py-1 hover:bg-slate-700 rounded transition">
                Cancel
              </button>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition capitalize
                  ${filter === f ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-600'}`}>
                {f === 'all' ? '🔲 All Types' : f === 'disabled' ? '♿ Accessible' : f === 'standard' ? '🚗 Standard' : '🔵 Reserved'}
              </button>
            ))}
          </div>

          {/* Horizon (AI) selector */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-medium text-slate-300">AI Prediction View</span>
              <span className="text-xs text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded">ML powered</span>
            </div>
            <div className="flex gap-2">
              {HORIZONS.map(h => (
                <button key={h.key} onClick={() => setHorizon(h.key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition
                    ${horizon === h.key
                      ? 'bg-purple-700 text-white'
                      : 'bg-slate-700 text-slate-400 hover:text-white'}`}>
                  {h.label}
                </button>
              ))}
            </div>
            {horizon !== 'now' && (
              <p className="text-xs text-slate-500 mt-2">
                Showing predicted occupancy {horizon} from now based on historical patterns
              </p>
            )}
          </div>

          {/* Parking Map */}
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Loading parking data...
            </div>
          ) : !connected ? (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-red-400 font-medium">Cannot load parking data</p>
              <p className="text-slate-500 text-sm mt-1">Check your connection</p>
              <button onClick={loadSpaces} className="mt-3 px-4 py-2 bg-slate-700 rounded-lg text-sm text-white hover:bg-slate-600 transition">
                Retry
              </button>
            </div>
          ) : (
            <ParkingMap
              spaces={spaces}
              onSelectSpace={setSelected}
              selectedId={selected?.id}
              filter={filter}
              horizon={horizon}
              predictions={predictions}
            />
          )}
        </div>
      </div>

      {/* Space detail bottom sheet */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/30 z-30" onClick={() => setSelected(null)} />
          <SpaceDetail
            space={selected}
            onClose={() => setSelected(null)}
            userRole="student"
            onReserved={(data) => {
              setSelected(null)
              loadSpaces()
              loadActiveReservation()
            }}
          />
        </>
      )}
    </div>
  )
}
