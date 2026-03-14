import { useState } from 'react'
import { api } from '../api'
import { Navigation, BookmarkPlus, X, Clock, Car, MapPin, Info } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const STATUS_LABELS = { free: 'Available', occupied: 'Occupied', reserved: 'Reserved', blocked: 'Blocked/Out of Service' }
const STATUS_COLORS = { free: 'text-green-400', occupied: 'text-red-400', reserved: 'text-blue-400', blocked: 'text-gray-400' }
const LPR_LABELS = { registered: 'University Member', unregistered: 'External Vehicle', unreadable: 'Plate Unreadable' }
const LPR_COLORS = { registered: 'bg-green-800 text-green-200', unregistered: 'bg-yellow-800 text-yellow-200', unreadable: 'bg-gray-700 text-gray-300' }

export default function SpaceDetail({ space, onClose, onReserved, userRole }) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function handleReserve() {
    setLoading(true); setError('')
    try {
      const { data } = await api.post(`/spaces/${space.id}/reserve`)
      setMsg(data.message)
      onReserved && onReserved(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Reservation failed. Try again.')
    } finally { setLoading(false) }
  }

  async function handleFlag(reason) {
    setLoading(true); setError('')
    try {
      await api.post(`/spaces/${space.id}/flag`, { reason })
      setMsg(`Space ${space.label} flagged as ${reason}`)
      onReserved && onReserved()
    } catch { setError('Failed to flag space') }
    finally { setLoading(false) }
  }

  async function handleClear() {
    setLoading(true)
    try {
      await api.post(`/spaces/${space.id}/clear`)
      setMsg(`Space ${space.label} cleared`)
      onReserved && onReserved()
    } catch { setError('Failed to clear flag') }
    finally { setLoading(false) }
  }

  const parkedMinutes = space.parked_since
    ? Math.round((Date.now() - new Date(space.parked_since).getTime()) / 60000)
    : null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 slide-up max-w-2xl mx-auto">
      <div className="bg-slate-800 border border-slate-600 border-b-0 rounded-t-2xl shadow-2xl p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">{space.label}</span>
              <span className={`text-sm font-medium ${STATUS_COLORS[space.status]}`}>
                {STATUS_LABELS[space.status]}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <MapPin className="w-3 h-3" />{space.zone_name}
              </span>
              <span className="text-xs text-slate-400 capitalize">{space.type} space</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-lg transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* LPR badge */}
        {space.lpr_status && (
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mb-3 ${LPR_COLORS[space.lpr_status]}`}>
            <Car className="w-3 h-3" />
            {LPR_LABELS[space.lpr_status]}
            {space.current_plate && <span className="font-mono ml-1 opacity-80">· {space.current_plate}</span>}
          </div>
        )}

        {/* Parked since */}
        {parkedMinutes !== null && (
          <div className={`flex items-center gap-1.5 text-xs mb-3 ${parkedMinutes > 120 ? 'text-orange-400' : 'text-slate-400'}`}>
            <Clock className="w-3 h-3" />
            Parked {parkedMinutes}min ago
            {parkedMinutes > 120 && <span className="text-orange-400 font-bold ml-1">⚠ Overstay</span>}
          </div>
        )}

        {/* Flag reason */}
        {space.flag_reason && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
            <Info className="w-3 h-3" />Reason: {space.flag_reason}
          </div>
        )}

        {/* Messages */}
        {msg && <div className="bg-green-900/40 border border-green-700 rounded-lg px-3 py-2 text-green-300 text-xs mb-3">{msg}</div>}
        {error && <div className="bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs mb-3">{error}</div>}

        {/* Actions */}
        {!msg && (
          <div className="flex gap-2 flex-wrap">
            {/* Student actions */}
            {userRole === 'student' && (
              <>
                <button
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=Campus+${encodeURIComponent(space.label)}&travelmode=driving`)}
                  className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-xs font-medium text-white transition"
                >
                  <Navigation className="w-3.5 h-3.5 text-blue-400" />Navigate Here
                </button>
                {space.status === 'free' && (
                  <button
                    onClick={handleReserve} disabled={loading}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-2 rounded-lg text-xs font-medium text-white transition"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    {loading ? 'Reserving…' : 'Reserve This Space'}
                  </button>
                )}
              </>
            )}

            {/* Security actions */}
            {(userRole === 'security' || userRole === 'management') && (
              <>
                {space.status !== 'blocked' ? (
                  <>
                    <button onClick={() => handleFlag('blocked')} disabled={loading}
                      className="flex items-center gap-1.5 bg-orange-700 hover:bg-orange-600 px-3 py-2 rounded-lg text-xs font-medium text-white transition">
                      🚧 Flag as Blocked
                    </button>
                    <button onClick={() => handleFlag('out_of_service')} disabled={loading}
                      className="flex items-center gap-1.5 bg-red-700 hover:bg-red-600 px-3 py-2 rounded-lg text-xs font-medium text-white transition">
                      ⚠ Out of Service
                    </button>
                  </>
                ) : (
                  <button onClick={handleClear} disabled={loading}
                    className="flex items-center gap-1.5 bg-green-700 hover:bg-green-600 px-3 py-2 rounded-lg text-xs font-medium text-white transition">
                    ✓ Clear Flag
                  </button>
                )}
                <button
                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=Campus+${encodeURIComponent(space.label)}`)}
                  className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded-lg text-xs font-medium text-white transition">
                  <Navigation className="w-3.5 h-3.5 text-blue-400" />Navigate
                </button>
              </>
            )}
          </div>
        )}

        {msg && (
          <button onClick={onClose} className="w-full mt-2 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-xs text-white transition">
            Close
          </button>
        )}
      </div>
    </div>
  )
}
