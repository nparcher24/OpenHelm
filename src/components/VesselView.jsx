import useVesselData from '../hooks/useVesselData'
import useGpsData from '../hooks/useGpsData'
import HudOverlay from './HudOverlay'
import RetroGauge from './RetroGauge'

function VesselView() {
  const { vesselData, error, loading, dataAge } = useVesselData()
  const { gpsData } = useGpsData()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-terminal-green text-glow animate-pulse">
          INITIALIZING VESSEL SYSTEMS...
        </div>
      </div>
    )
  }

  const isStale = dataAge != null && dataAge > 2000
  const statusText = vesselData?.isDemoMode ? 'DEMO MODE' :
                     vesselData?.isConnected ? 'NMEA 2000' :
                     'NO LINK'

  // Depth from vessel data (NMEA 2000 PGN 128267) — already in feet
  const depthFt = vesselData?.waterDepth
  // Convert back to meters for HudOverlay (it does ft conversion internally)
  const depthMeters = depthFt != null ? depthFt / 3.28084 : null

  return (
    <div className="h-full flex flex-col bg-terminal-bg overflow-hidden">

      {/* ── Status Bar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-terminal-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${
            vesselData?.isConnected ? 'bg-terminal-green animate-pulse' :
            vesselData?.isDemoMode ? 'bg-terminal-amber animate-pulse' :
            'bg-terminal-red'
          }`} />
          <span className={`text-xs font-bold uppercase font-mono ${
            vesselData?.isConnected ? 'text-terminal-green' :
            vesselData?.isDemoMode ? 'text-terminal-amber' :
            'text-terminal-red'
          }`}>
            {statusText}
          </span>
          <span className="text-terminal-green-dim text-xs font-mono">
            PGN {vesselData?.pgnCount || 0}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {vesselData?.engineHours != null && (
            <span className="text-xs text-terminal-green-dim font-mono">
              ENG {vesselData.engineHours.toFixed(1)} HRS
            </span>
          )}
          <span className={`text-xs font-mono ${isStale ? 'text-terminal-red font-bold' : 'text-terminal-green-dim'}`}>
            {dataAge != null ? (dataAge > 2000 ? 'STALE' : `${(dataAge / 1000).toFixed(1)}s`) : '--'}
          </span>
        </div>
      </div>

      {error && (
        <div className="px-3 py-1 bg-terminal-surface border-b border-terminal-red text-terminal-red text-xs font-mono">
          {error}
        </div>
      )}

      {/* ── HUD Section (upper portion) ── */}
      <div className="relative flex-1 min-h-0">
        <HudOverlay
          heading={gpsData?.heading}
          speedMs={gpsData?.groundSpeed}
          depthMeters={depthMeters}
        />

        {/* Center info when no GPS */}
        {!gpsData?.heading && !gpsData?.groundSpeed && !depthMeters && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-terminal-green-dim text-sm font-mono opacity-50">
              AWAITING GPS SIGNAL
            </span>
          </div>
        )}
      </div>

      {/* ── Gauge Panel (lower portion) ── */}
      <div className="flex-shrink-0 border-t border-terminal-border bg-terminal-surface px-3 py-2 space-y-1.5">

        {/* RPM — full width, large */}
        <RetroGauge
          label="RPM"
          value={vesselData?.rpm}
          min={0}
          max={6500}
          majorInterval={1000}
          minorInterval={250}
          warnAt={4000}
          alarmAt={5500}
          large
        />

        {/* 2-column grid for remaining gauges */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <RetroGauge
            label="ENG TMP"
            value={vesselData?.engineTemp}
            min={100}
            max={260}
            unit="°F"
            majorInterval={40}
            minorInterval={10}
            warnAt={200}
            alarmAt={220}
          />
          <RetroGauge
            label="VOLTS"
            value={vesselData?.batteryVoltage}
            min={10}
            max={16}
            unit="V"
            decimals={1}
            majorInterval={2}
            minorInterval={0.5}
            warnAt={12}
            alarmAt={11}
            invertWarning
          />
          <RetroGauge
            label="OIL PSI"
            value={vesselData?.oilPressure}
            min={0}
            max={80}
            unit="PSI"
            majorInterval={20}
            minorInterval={5}
            warnAt={25}
            alarmAt={15}
            invertWarning
          />
          <RetroGauge
            label="FUEL"
            value={vesselData?.fuelLevel}
            min={0}
            max={100}
            unit="%"
            majorInterval={25}
            minorInterval={5}
            warnAt={25}
            alarmAt={15}
            invertWarning
          />
          <RetroGauge
            label="TRIM"
            value={vesselData?.trimPosition}
            min={0}
            max={100}
            unit="%"
            majorInterval={25}
            minorInterval={5}
          />
          <RetroGauge
            label="FUEL RT"
            value={vesselData?.fuelRate}
            min={0}
            max={30}
            unit="GPH"
            decimals={1}
            majorInterval={10}
            minorInterval={2}
          />
        </div>

        {/* Small text readouts row */}
        <div className="flex justify-between pt-1 border-t border-terminal-border">
          <SmallReadout label="WATER TEMP" value={vesselData?.waterTemp} unit="°F" />
          <SmallReadout label="BATT AMPS" value={vesselData?.batteryCurrent} unit="A" decimals={1} />
          <SmallReadout label="WATER DEPTH" value={vesselData?.waterDepth} unit="ft" />
          {vesselData?.fuelCapacity != null && (
            <SmallReadout label="FUEL CAP" value={vesselData.fuelCapacity} unit="gal" />
          )}
        </div>
      </div>
    </div>
  )
}

function SmallReadout({ label, value, unit, decimals = 0 }) {
  const display = value != null
    ? `${typeof value === 'number' ? value.toFixed(decimals) : value}`
    : '--'
  return (
    <div className="text-center">
      <div className="text-[9px] text-terminal-green-dim uppercase tracking-wider font-mono">{label}</div>
      <div className="text-sm font-mono text-terminal-green text-glow-sm">
        {display}
        {unit && <span className="text-[9px] text-terminal-green-dim ml-0.5">{unit}</span>}
      </div>
    </div>
  )
}

export default VesselView
