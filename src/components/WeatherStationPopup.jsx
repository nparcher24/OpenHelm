import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { getStationData } from '../services/weatherDataService'
import TidePlot from './TidePlot'
import { Glass } from '../ui/primitives'

const TYPE_COLORS = {
  tide: { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', label: 'Tide Station' },
  current: { bg: 'bg-green-500/20', border: 'border-green-500/50', text: 'text-green-400', label: 'Current Station' },
  met: { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', label: 'Met Station' },
  ndbc: { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', label: 'NDBC Buoy' }
}

function WeatherStationPopup({ station, regionId, forecastTime, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!station || !regionId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const result = await getStationData(regionId, station.id)
      if (!cancelled) {
        setData(result)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [station?.id, regionId])

  if (!station) return null

  const typeInfo = TYPE_COLORS[station.stationType] || TYPE_COLORS.met

  return (
    <Glass className="absolute top-4 right-4 w-80 max-h-[70vh] overflow-y-auto z-30" radius={12}>
      {/* Header */}
      <div className="flex items-start justify-between p-3" style={{ borderBottom: '0.5px solid var(--bg-hairline-strong)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${typeInfo.bg} ${typeInfo.border} ${typeInfo.text} border`}>
              {typeInfo.label}
            </span>
          </div>
          <h3 className="text-sm font-semibold mt-1 truncate" style={{ color: 'var(--fg1)' }}>{station.name}</h3>
          <div className="text-xs font-mono" style={{ color: 'var(--fg2)' }}>
            ID: {station.id} {station.state && `· ${station.state}`}
          </div>
        </div>
        <button onClick={onClose} className="p-1 touch-manipulation" style={{ color: 'var(--fg2)' }}>
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        {loading ? (
          <div className="text-sm py-4 text-center" style={{ color: 'var(--fg2)' }}>Loading station data...</div>
        ) : !data ? (
          <div className="text-sm py-4 text-center" style={{ color: 'var(--fg2)' }}>No data available</div>
        ) : (
          <div className="space-y-3">
            {/* Tide Data */}
            {data.tides && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--fg1)' }}>Tide Predictions</h4>
                <TidePlot
                  predictions={data.tides.predictions}
                  hiLo={data.tides.hiLo}
                  centerTime={forecastTime}
                  width={260}
                  height={100}
                />
                {/* High/Low table */}
                {data.tides.hiLo && data.tides.hiLo.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {data.tides.hiLo.slice(0, 8).map((p, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className={p.type === 'H' ? 'text-blue-400' : 'text-cyan-400'}>
                          {p.type === 'H' ? 'High' : 'Low'}
                        </span>
                        <span style={{ color: 'var(--fg2)' }}>{p.t}</span>
                        <span className="font-mono" style={{ color: 'var(--fg1)' }}>{p.v.toFixed(1)} ft</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Current Data */}
            {data.currents && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--fg1)' }}>Current Predictions</h4>
                <div className="space-y-1">
                  {data.currents.predictions?.slice(0, 10).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className={
                        p.type === 'flood' ? 'text-red-400' :
                        p.type === 'ebb' ? 'text-blue-400' : 'text-yellow-400'
                      }>
                        {p.type}
                      </span>
                      <span style={{ color: 'var(--fg2)' }}>{p.t}</span>
                      <span className="font-mono" style={{ color: 'var(--fg1)' }}>{Math.abs(p.speed).toFixed(1)} kt</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wind/Met Data */}
            {data.wind && data.wind.observations?.length > 0 && (() => {
              const obs = data.wind.observations[0]
              return (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--fg1)' }}>Wind Observations</h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold" style={{ color: 'var(--fg1)' }}>{obs.speed != null ? obs.speed.toFixed(0) : '--'}</div>
                    <div className="text-xs" style={{ color: 'var(--fg2)' }}>kt</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" style={{ color: 'var(--fg1)' }}>{obs.gust != null ? obs.gust.toFixed(0) : '--'}</div>
                    <div className="text-xs" style={{ color: 'var(--fg2)' }}>gust kt</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" style={{ color: 'var(--fg1)' }}>{obs.dir != null ? `${obs.dir}°` : '--'}</div>
                    <div className="text-xs" style={{ color: 'var(--fg2)' }}>dir</div>
                  </div>
                </div>
                <div className="text-xs mt-1 text-center" style={{ color: 'var(--fg2)', opacity: 0.5 }}>
                  {obs.t}
                </div>
              </div>
              )
            })()}

            {/* NDBC Data */}
            {data.ndbc && data.ndbc.observations?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--fg1)' }}>Buoy Observations</h4>
                {(() => {
                  const obs = data.ndbc.observations[0]
                  return (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {obs.windSpeed != null && (
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg2)' }}>Wind</span>
                          <span className="font-mono" style={{ color: 'var(--fg1)' }}>{obs.windSpeed.toFixed(0)} kt</span>
                        </div>
                      )}
                      {obs.windGust != null && (
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg2)' }}>Gust</span>
                          <span className="font-mono" style={{ color: 'var(--fg1)' }}>{obs.windGust.toFixed(0)} kt</span>
                        </div>
                      )}
                      {obs.waveHeight != null && (
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg2)' }}>Waves</span>
                          <span className="font-mono" style={{ color: 'var(--fg1)' }}>{obs.waveHeight.toFixed(1)} ft</span>
                        </div>
                      )}
                      {obs.wavePeriod != null && (
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg2)' }}>Period</span>
                          <span className="font-mono" style={{ color: 'var(--fg1)' }}>{obs.wavePeriod.toFixed(0)} s</span>
                        </div>
                      )}
                      {obs.airTemp != null && (
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg2)' }}>Air</span>
                          <span className="font-mono" style={{ color: 'var(--fg1)' }}>{obs.airTemp.toFixed(0)}°F</span>
                        </div>
                      )}
                      {obs.waterTemp != null && (
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg2)' }}>Water</span>
                          <span className="font-mono" style={{ color: 'var(--fg1)' }}>{obs.waterTemp.toFixed(0)}°F</span>
                        </div>
                      )}
                      {obs.pressure != null && (
                        <div className="flex justify-between">
                          <span style={{ color: 'var(--fg2)' }}>Pressure</span>
                          <span className="font-mono" style={{ color: 'var(--fg1)' }}>{obs.pressure.toFixed(0)} mb</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
                <div className="text-xs mt-1" style={{ color: 'var(--fg2)', opacity: 0.4 }}>{data.ndbc.observations[0].t}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </Glass>
  )
}

export default WeatherStationPopup
