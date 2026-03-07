import useVesselData from '../hooks/useVesselData'

// Warning thresholds
const WARNINGS = {
  engineTemp: { warn: 200, alarm: 220 },
  oilPressure: { warnLow: 25, alarmLow: 15 },
  batteryVoltage: { warnLow: 12.0, warnHigh: 15.0 },
  rpmRedline: 5500,
  rpmAmber: 4000
}

function getValueColor(value, field) {
  if (value == null) return 'text-terminal-green-dim'
  switch (field) {
    case 'engineTemp':
      if (value >= WARNINGS.engineTemp.alarm) return 'text-terminal-red'
      if (value >= WARNINGS.engineTemp.warn) return 'text-terminal-amber'
      return 'text-terminal-green'
    case 'oilPressure':
      if (value <= WARNINGS.oilPressure.alarmLow) return 'text-terminal-red'
      if (value <= WARNINGS.oilPressure.warnLow) return 'text-terminal-amber'
      return 'text-terminal-green'
    case 'batteryVoltage':
      if (value < WARNINGS.batteryVoltage.warnLow || value > WARNINGS.batteryVoltage.warnHigh) return 'text-terminal-red'
      return 'text-terminal-green'
    default:
      return 'text-terminal-green'
  }
}

function formatValue(value, decimals = 1, unit = '') {
  if (value == null) return '--'
  return `${typeof value === 'number' ? value.toFixed(decimals) : value}${unit ? ` ${unit}` : ''}`
}

function RpmGauge({ rpm }) {
  const maxRpm = 6500
  const segments = 26
  const rpmPerSegment = maxRpm / segments
  const activeSegments = rpm != null ? Math.min(Math.round(rpm / rpmPerSegment), segments) : 0

  return (
    <div className="bg-terminal-surface p-3 rounded-lg border border-terminal-border flex flex-col h-full">
      <div className="text-xs text-terminal-green-dim uppercase tracking-wider mb-2">Engine RPM</div>

      {/* Segmented bar gauge */}
      <div className="flex gap-[2px] mb-2 h-10 items-end">
        {Array.from({ length: segments }, (_, i) => {
          const segRpm = (i + 1) * rpmPerSegment
          const isActive = i < activeSegments
          let colorClass = 'bg-terminal-green'
          if (segRpm > WARNINGS.rpmRedline) colorClass = 'bg-terminal-red'
          else if (segRpm > WARNINGS.rpmAmber) colorClass = 'bg-terminal-amber'

          return (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-all ${
                isActive ? colorClass : 'bg-terminal-border'
              }`}
              style={{ height: `${60 + (i / segments) * 40}%` }}
            />
          )
        })}
      </div>

      {/* Tick labels */}
      <div className="flex justify-between text-[10px] text-terminal-green-dim font-mono px-0.5 mb-3">
        <span>0</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
        <span>6</span>
      </div>

      {/* Digital readout */}
      <div className="text-center mt-auto">
        <span className={`text-4xl font-mono font-bold text-glow ${
          rpm != null && rpm > WARNINGS.rpmRedline ? 'text-terminal-red' :
          rpm != null && rpm > WARNINGS.rpmAmber ? 'text-terminal-amber' :
          rpm != null ? 'text-terminal-green' : 'text-terminal-green-dim'
        }`}>
          {rpm != null ? rpm.toLocaleString() : '----'}
        </span>
        <span className="text-xs text-terminal-green-dim ml-2">RPM</span>
      </div>
    </div>
  )
}

function DataCard({ label, value, unit, decimals = 1, field, children }) {
  const colorClass = field ? getValueColor(value, field) : 'text-terminal-green'
  return (
    <div className="bg-terminal-surface p-3 rounded-lg border border-terminal-border">
      <div className="text-xs text-terminal-green-dim uppercase tracking-wider mb-1">{label}</div>
      {children || (
        <div className={`text-2xl font-mono ${colorClass} text-glow`}>
          {formatValue(value, decimals, unit)}
        </div>
      )}
    </div>
  )
}

function FuelBar({ level }) {
  const pct = level != null ? Math.max(0, Math.min(100, level)) : 0
  const barColor = level != null && level < 15 ? 'bg-terminal-red' :
                   level != null && level < 25 ? 'bg-terminal-amber' :
                   'bg-terminal-green'
  return (
    <div className="mt-1">
      <div className="w-full h-3 bg-terminal-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function VesselView() {
  const { vesselData, error, loading, dataAge } = useVesselData()

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

  return (
    <div className="h-full p-3 flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            vesselData?.isConnected ? 'bg-terminal-green animate-pulse' :
            vesselData?.isDemoMode ? 'bg-terminal-amber animate-pulse' :
            'bg-terminal-red'
          }`} />
          <span className={`text-sm font-bold uppercase ${
            vesselData?.isConnected ? 'text-terminal-green' :
            vesselData?.isDemoMode ? 'text-terminal-amber' :
            'text-terminal-red'
          }`}>
            {statusText}
          </span>
          <span className="text-terminal-green-dim text-sm">
            PGNs: {vesselData?.pgnCount || 0}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-sm font-mono ${isStale ? 'text-terminal-red font-bold' : 'text-terminal-green-dim'}`}>
            {dataAge != null ? (dataAge > 2000 ? 'STALE' : `${(dataAge / 1000).toFixed(1)}s`) : '--'}
          </span>
        </div>
      </div>

      {error && (
        <div className="p-2 bg-terminal-surface border border-terminal-red rounded text-terminal-red text-xs mb-2">
          {error}
        </div>
      )}

      {/* Main content - 3 columns */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left column - RPM */}
        <div className="w-1/3 flex flex-col">
          <RpmGauge rpm={vesselData?.rpm} />
        </div>

        {/* Middle column - Engine & Fuel */}
        <div className="w-1/3 flex flex-col gap-2">
          <DataCard label="Engine Temp" value={vesselData?.engineTemp} unit="°F" decimals={0} field="engineTemp" />
          <DataCard label="Oil Pressure" value={vesselData?.oilPressure} unit="PSI" field="oilPressure" />
          <DataCard label="Trim" value={vesselData?.trimPosition} unit="%" decimals={0} />
          <DataCard label="Engine Hours" value={vesselData?.engineHours} unit="hrs" />
          <DataCard label="Fuel Rate" value={vesselData?.fuelRate} unit="GPH" />
          <DataCard label="Fuel Level" value={vesselData?.fuelLevel} unit="%" field="fuelLevel">
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-mono text-glow ${
                vesselData?.fuelLevel != null && vesselData.fuelLevel < 15 ? 'text-terminal-red' :
                vesselData?.fuelLevel != null && vesselData.fuelLevel < 25 ? 'text-terminal-amber' :
                'text-terminal-green'
              }`}>
                {formatValue(vesselData?.fuelLevel, 1, '%')}
              </span>
              {vesselData?.fuelCapacity != null && (
                <span className="text-xs text-terminal-green-dim">
                  / {vesselData.fuelCapacity} gal
                </span>
              )}
            </div>
            <FuelBar level={vesselData?.fuelLevel} />
          </DataCard>
        </div>

        {/* Right column - Environment & Electrical */}
        <div className="w-1/3 flex flex-col gap-2">
          <DataCard label="Water Depth" value={vesselData?.waterDepth} unit="ft" />
          <DataCard label="Water Temp" value={vesselData?.waterTemp} unit="°F" decimals={0} />
          <DataCard label="Battery Voltage" value={vesselData?.batteryVoltage} unit="V" decimals={2} field="batteryVoltage" />
          <DataCard label="Battery Current" value={vesselData?.batteryCurrent} unit="A" decimals={1} />
        </div>
      </div>
    </div>
  )
}

export default VesselView
