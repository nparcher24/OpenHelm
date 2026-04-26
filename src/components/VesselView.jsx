import useVesselData from '../hooks/useVesselData'
import useGpsData from '../hooks/useGpsData'
import HudOverlay from './HudOverlay'
import RetroGauge from './RetroGauge'
import { TopBar, Glass, Badge } from '../ui/primitives'

function VesselView() {
  const { vesselData, error, loading, dataAge } = useVesselData()
  const { gpsData } = useGpsData()

  if (loading) {
    return (
      <div className="h-full w-full" style={{ position: 'relative', background: 'var(--bg)' }}>
        <TopBar title="Vessel" />
        <div style={{ paddingTop: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div style={{
            width: 56, height: 56,
            border: '4px solid var(--signal-soft)',
            borderTopColor: 'var(--signal)',
            borderRadius: '50%', margin: '0 auto 20px',
            animation: 'oh-spin 900ms linear infinite',
          }}/>
          <div style={{ color: 'var(--fg2)', fontSize: 22 }}>Initializing vessel systems…</div>
        </div>
      </div>
    )
  }

  const isStale = dataAge != null && dataAge > 2000
  const statusText = vesselData?.isDemoMode ? 'DEMO MODE' :
                     vesselData?.isConnected ? 'NMEA 2000' :
                     'NO LINK'
  const statusTone = vesselData?.isConnected ? 'safe' :
                     vesselData?.isDemoMode ? 'caution' :
                     'warn'

  // Depth from vessel data (NMEA 2000 PGN 128267) — already in feet
  const depthFt = vesselData?.waterDepth
  // Convert back to meters for HudOverlay (it does ft conversion internally)
  const depthMeters = depthFt != null ? depthFt / 3.28084 : null

  return (
    <div className="h-full w-full overflow-auto" style={{ position: 'relative', background: 'var(--bg)', color: 'var(--fg1)' }}>
      <TopBar
        title="Vessel"
        center={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge tone={statusTone} dot>{statusText}</Badge>
            {isStale && <Badge tone="warn">STALE</Badge>}
          </div>
        }
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {vesselData?.engineHours != null && (
              <span style={{ color: 'var(--fg3)', fontSize: 18, fontFamily: 'var(--font-mono)' }}>
                ENG {vesselData.engineHours.toFixed(1)} HRS
              </span>
            )}
            <span style={{ color: 'var(--fg3)', fontSize: 18, fontFamily: 'var(--font-mono)' }}>
              PGN {vesselData?.pgnCount || 0}
            </span>
          </div>
        }
      />

      <div style={{ paddingTop: 114 }}>
        {error && (
          <Glass radius={12} style={{ margin: '12px 20px', padding: 16, border: '0.5px solid var(--tint-red)', color: 'var(--tint-red)', fontSize: 17 }}>
            {error}
          </Glass>
        )}

        {/* ── HUD Section (upper portion) ── */}
        <div style={{ position: 'relative', height: 240 }}>
          <HudOverlay
            heading={gpsData?.heading}
            speedMs={gpsData?.groundSpeed}
            depthMeters={depthMeters}
          />

          {/* Center info when no GPS */}
          {!gpsData?.heading && !gpsData?.groundSpeed && !depthMeters && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--fg3)', fontSize: 18 }}>Awaiting GPS signal</span>
            </div>
          )}
        </div>

        {/* ── Gauge Panel ── */}
        <div style={{ padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* RPM — full width, large */}
          <Glass radius={12} style={{ padding: '10px 14px' }}>
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
          </Glass>

          {/* 2-column grid for remaining gauges */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <Glass radius={12} style={{ padding: '8px 10px' }}>
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
            </Glass>
            <Glass radius={12} style={{ padding: '8px 10px' }}>
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
            </Glass>
            <Glass radius={12} style={{ padding: '8px 10px' }}>
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
            </Glass>
            <Glass radius={12} style={{ padding: '8px 10px' }}>
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
            </Glass>
            <Glass radius={12} style={{ padding: '8px 10px' }}>
              <RetroGauge
                label="TRIM"
                value={vesselData?.trimPosition}
                min={0}
                max={100}
                unit="%"
                majorInterval={25}
                minorInterval={5}
              />
            </Glass>
            <Glass radius={12} style={{ padding: '8px 10px' }}>
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
            </Glass>
          </div>

          {/* Small text readouts row */}
          <Glass radius={12} style={{ padding: '10px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <SmallReadout label="WATER TEMP" value={vesselData?.waterTemp} unit="°F" />
              <SmallReadout label="BATT AMPS" value={vesselData?.batteryCurrent} unit="A" decimals={1} />
              <SmallReadout label="WATER DEPTH" value={vesselData?.waterDepth} unit="ft" />
              {vesselData?.fuelCapacity != null && (
                <SmallReadout label="FUEL CAP" value={vesselData.fuelCapacity} unit="gal" />
              )}
            </div>
          </Glass>
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
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--fg3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--fg1)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {display}
        {unit && <span style={{ fontSize: 13, color: 'var(--fg3)', marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  )
}

export default VesselView
