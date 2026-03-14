import { useMemo } from 'react'

const STATUS_COLORS = {
  free:     { bg: '#22c55e', border: '#16a34a', label: 'Free' },
  occupied: { bg: '#ef4444', border: '#dc2626', label: 'Occupied' },
  reserved: { bg: '#3b82f6', border: '#2563eb', label: 'Reserved' },
  blocked:  { bg: '#6b7280', border: '#4b5563', label: 'Blocked' },
}

const LPR_DOT = {
  registered:   '#22c55e',
  unregistered: '#f59e0b',
  unreadable:   '#6b7280',
}

function ParkingSpaceCell({ space, selected, onClick, showLPR = false }) {
  const col = STATUS_COLORS[space.status] || STATUS_COLORS.free
  const isAlert = space.status === 'occupied' && space.lpr_status === 'unregistered'

  return (
    <div
      onClick={() => onClick(space)}
      title={`${space.label} - ${col.label}${space.current_plate ? ` (${space.current_plate})` : ''}`}
      className="space-dot relative"
      style={{
        width: 48,
        height: 28,
        background: col.bg,
        border: `2px solid ${selected ? '#fff' : isAlert ? '#f97316' : col.border}`,
        borderRadius: 4,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: selected ? '0 0 0 2px white' : isAlert ? '0 0 8px rgba(249,115,22,0.7)' : undefined,
        transition: 'all 0.15s',
        opacity: space.status === 'blocked' ? 0.5 : 1,
      }}
    >
      {/* Space label */}
      <span style={{ fontSize: 9, fontWeight: 700, color: 'white', letterSpacing: '0.02em' }}>
        {space.label.split('-')[1]}
      </span>

      {/* Disabled icon */}
      {space.type === 'disabled' && (
        <span style={{ fontSize: 7, position: 'absolute', top: 1, right: 2, opacity: 0.9 }}>♿</span>
      )}

      {/* LPR dot */}
      {showLPR && space.lpr_status && (
        <div style={{
          position: 'absolute',
          top: -4, right: -4,
          width: 8, height: 8,
          borderRadius: '50%',
          background: LPR_DOT[space.lpr_status] || '#6b7280',
          border: '1px solid #0f172a',
        }} />
      )}

      {/* Overstay flame */}
      {space.overstay && (
        <span style={{ position: 'absolute', top: -6, left: -2, fontSize: 10 }}>🔥</span>
      )}
    </div>
  )
}

export default function ParkingMap({ spaces, onSelectSpace, selectedId, filter = 'all', showLPR = false, horizon = 'now', predictions = [] }) {
  // Group by zone then row
  const byZone = useMemo(() => {
    const zones = {}
    spaces.forEach(s => {
      if (!zones[s.zone_id]) zones[s.zone_id] = { name: s.zone_name, color: s.zone_color, rows: {} }
      const row = s.row_pos ?? 0
      if (!zones[s.zone_id].rows[row]) zones[s.zone_id].rows[row] = []
      zones[s.zone_id].rows[row].push(s)
    })
    Object.values(zones).forEach(z =>
      Object.values(z.rows).forEach(row => row.sort((a, b) => a.col_pos - b.col_pos))
    )
    return zones
  }, [spaces])

  // Filter
  const isVisible = (s) => {
    if (filter === 'all') return true
    return s.type === filter
  }

  const predMap = useMemo(() => {
    const m = {}
    predictions.forEach(p => { m[`${p.zone_id}-${p.horizon_hours}`] = p.predicted_occupancy_pct })
    return m
  }, [predictions])

  return (
    <div className="space-y-5">
      {Object.entries(byZone).map(([zoneId, zone]) => {
        const zoneSpaces = Object.values(zone.rows).flat()
        const freeCount = zoneSpaces.filter(s => s.status === 'free').length
        const totalCount = zoneSpaces.length
        const horizonKey = `${zoneId}-${horizon === 'now' ? null : parseInt(horizon)}`
        const predPct = predMap[`${zoneId}-${horizon === '+1hr' ? 1 : horizon === '+2hr' ? 2 : 4}`]

        return (
          <div key={zoneId} className="bg-slate-800/50 rounded-xl border border-slate-700 p-4">
            {/* Zone header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: zone.color || '#3b82f6' }} />
                <span className="font-semibold text-white text-sm">{zone.name}</span>
              </div>
              <div className="flex items-center gap-3">
                {horizon !== 'now' && predPct !== undefined && (
                  <div className="flex items-center gap-1 bg-purple-900/50 border border-purple-700 rounded-full px-2.5 py-0.5">
                    <span className="text-xs text-purple-300">🤖 {horizon}:</span>
                    <span className="text-xs font-bold text-purple-200">{Math.round(predPct)}% full</span>
                  </div>
                )}
                <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${freeCount > 0 ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                  {freeCount}/{totalCount} free
                </div>
              </div>
            </div>

            {/* Space grid */}
            <div className="space-y-2">
              {Object.entries(zone.rows).map(([rowIdx, rowSpaces]) => (
                <div key={rowIdx} className="flex gap-2 flex-wrap">
                  {rowSpaces.filter(isVisible).map(space => (
                    <ParkingSpaceCell
                      key={space.id}
                      space={space}
                      selected={selectedId === space.id}
                      onClick={onSelectSpace}
                      showLPR={showLPR}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 justify-center py-2">
        {Object.entries(STATUS_COLORS).map(([status, col]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className="w-4 h-2.5 rounded" style={{ background: col.bg, border: `1px solid ${col.border}` }} />
            <span className="text-xs text-slate-400">{col.label}</span>
          </div>
        ))}
        {showLPR && <>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" /><span className="text-xs text-slate-400">Registered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500" /><span className="text-xs text-slate-400">External</span>
          </div>
        </>}
      </div>
    </div>
  )
}
