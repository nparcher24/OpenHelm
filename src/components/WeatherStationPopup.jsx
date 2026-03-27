import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { getStationData } from '../services/weatherDataService'
import TidePlot from './TidePlot'

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
    <div className="absolute top-4 right-4 w-80 max-h-[70vh] overflow-y-auto bg-terminal-surface border border-terminal-border rounded-lg shadow-glow-green z-30">
      {/* Header */}
      <div className="flex items-start justify-between p-3 border-b border-terminal-border">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${typeInfo.bg} ${typeInfo.border} ${typeInfo.text} border`}>
              {typeInfo.label}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-terminal-green mt-1 truncate">{station.name}</h3>
          <div className="text-xs text-terminal-green-dim font-mono">
            ID: {station.id} {station.state && `· ${station.state}`}
          </div>
        </div>
        <button onClick={onClose} className="p-1 text-terminal-green-dim hover:text-terminal-green touch-manipulation">
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        {loading ? (
          <div className="text-sm text-terminal-green/50 py-4 text-center">Loading station data...</div>
        ) : !data ? (
          <div className="text-sm text-terminal-green/50 py-4 text-center">No data available</div>
        ) : (
          <div className="space-y-3">
            {/* Tide Data */}
            {data.tides && (
              <div>
                <h4 className="text-xs font-semibold text-terminal-green uppercase tracking-wide mb-2">Tide Predictions</h4>
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
                        <span className="text-terminal-green-dim">{p.t}</span>
                        <span className="text-terminal-green font-mono">{p.v.toFixed(1)} ft</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Current Data */}
            {data.currents && (
              <div>
                <h4 className="text-xs font-semibold text-terminal-green uppercase tracking-wide mb-2">Current Predictions</h4>
                <div className="space-y-1">
                  {data.currents.predictions?.slice(0, 10).map((p, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className={
                        p.type === 'flood' ? 'text-red-400' :
                        p.type === 'ebb' ? 'text-blue-400' : 'text-yellow-400'
                      }>
                        {p.type}
                      </span>
                      <span className="text-terminal-green-dim">{p.t}</span>
                      <span className="text-terminal-green font-mono">{Math.abs(p.speed).toFixed(1)} kt</span>
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
                <h4 className="text-xs font-semibold text-terminal-green uppercase tracking-wide mb-2">Wind Observations</h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-terminal-green">{obs.speed != null ? obs.speed.toFixed(0) : '--'}</div>
                    <div className="text-xs text-terminal-green-dim">kt</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-terminal-green">{obs.gust != null ? obs.gust.toFixed(0) : '--'}</div>
                    <div className="text-xs text-terminal-green-dim">gust kt</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-terminal-green">{obs.dir != null ? `${obs.dir}°` : '--'}</div>
                    <div className="text-xs text-terminal-green-dim">dir</div>
                  </div>
                </div>
                <div className="text-xs text-terminal-green/40 mt-1 text-center">
                  {obs.t}
                </div>
              </div>
              )
            })()}

            {/* NDBC Data */}
            {data.ndbc && data.ndbc.observations?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-terminal-green uppercase tracking-wide mb-2">Buoy Observations</h4>
                {(() => {
                  const obs = data.ndbc.observations[0]
                  return (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {obs.windSpeed != null && (
                        <div className="flex justify-between">
                          <span className="text-terminal-green-dim">Wind</span>
                          <span className="text-terminal-green font-mono">{obs.windSpeed.toFixed(0)} kt</span>
                        </div>
                      )}
                      {obs.windGust != null && (
                        <div className="flex justify-between">
                          <span className="text-terminal-green-dim">Gust</span>
                          <span className="text-terminal-green font-mono">{obs.windGust.toFixed(0)} kt</span>
                        </div>
                      )}
                      {obs.waveHeight != null && (
                        <div className="flex justify-between">
                          <span className="text-terminal-green-dim">Waves</span>
                          <span className="text-terminal-green font-mono">{obs.waveHeight.toFixed(1)} ft</span>
                        </div>
                      )}
                      {obs.wavePeriod != null && (
                        <div className="flex justify-between">
                          <span className="text-terminal-green-dim">Period</span>
                          <span className="text-terminal-green font-mono">{obs.wavePeriod.toFixed(0)} s</span>
                        </div>
                      )}
                      {obs.airTemp != null && (
                        <div className="flex justify-between">
                          <span className="text-terminal-green-dim">Air</span>
                          <span className="text-terminal-green font-mono">{obs.airTemp.toFixed(0)}°F</span>
                        </div>
                      )}
                      {obs.waterTemp != null && (
                        <div className="flex justify-between">
                          <span className="text-terminal-green-dim">Water</span>
                          <span className="text-terminal-green font-mono">{obs.waterTemp.toFixed(0)}°F</span>
                        </div>
                      )}
                      {obs.pressure != null && (
                        <div className="flex justify-between">
                          <span className="text-terminal-green-dim">Pressure</span>
                          <span className="text-terminal-green font-mono">{obs.pressure.toFixed(0)} mb</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
                <div className="text-xs text-terminal-green/40 mt-1">{data.ndbc.observations[0].t}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default WeatherStationPopup
