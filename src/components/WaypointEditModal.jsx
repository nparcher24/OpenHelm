/**
 * WaypointEditModal Component
 * Modal for creating and editing waypoints
 * Used in both ChartView (create) and Settings (edit)
 */

import { useState, useCallback } from 'react'
import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline'
import { WAYPOINT_ICONS, WAYPOINT_COLORS, WaypointIcon, formatLatitude, formatLongitude } from '../utils/waypointIcons'
import { computeDriftCorrected, DEFAULT_DEPTH_M } from '../utils/driftCalc'
import { getDepthAtLocation } from '../services/blueTopoTileService'
import { Glass, Pill } from '../ui/primitives'

export default function WaypointEditModal({
  waypoint, // null for create, object for edit
  initialPosition, // { lat, lng } for create mode
  latestDrift, // latest drift calibration row or null
  onSave,
  onDelete,
  onClose
}) {
  const isEdit = !!waypoint

  // Form state
  const [name, setName] = useState(waypoint?.name || '')
  const [description, setDescription] = useState(waypoint?.description || '')
  const [icon, setIcon] = useState(waypoint?.icon || 'map-pin')
  const [color, setColor] = useState(waypoint?.color || '#00ff00')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // Drift-compensation UI state
  const [driftStatus, setDriftStatus] = useState('idle') // 'idle' | 'loading' | 'ready' | 'noop'
  const [driftCorrected, setDriftCorrected] = useState(null)
  const [driftMessage, setDriftMessage] = useState(null)

  // Get coordinates from waypoint or initial position
  const lat = waypoint?.latitude ?? initialPosition?.lat
  const lng = waypoint?.longitude ?? initialPosition?.lng

  // Normalize field names between the API row (snake_case) and the shape
  // returned by the in-memory fit (camelCase).
  const driftSpeedMps =
    latestDrift?.driftSpeedMps ?? latestDrift?.drift_speed_mps ?? null
  const driftBearingDeg =
    latestDrift?.driftBearingDeg ?? latestDrift?.drift_bearing_deg ?? null
  const hasDrift = driftSpeedMps != null && driftBearingDeg != null

  const handleCompensateForDrift = useCallback(async () => {
    if (!hasDrift || lat == null || lng == null) return
    setDriftStatus('loading')
    setDriftMessage(null)
    let depthM = null
    try {
      // getDepthAtLocation takes arguments as (lon, lat)
      const depthRes = await getDepthAtLocation(lng, lat)
      if (depthRes?.success && typeof depthRes.depth === 'number' && depthRes.depth > 0) {
        depthM = depthRes.depth
      }
    } catch (err) {
      // Non-fatal — we'll fall back to DEFAULT_DEPTH_M.
      console.warn('Drift depth lookup failed, using default:', err)
    }

    const corrected = computeDriftCorrected(lat, lng, depthM, {
      driftSpeedMps,
      driftBearingDeg
    })
    if (!corrected) {
      setDriftStatus('noop')
      setDriftMessage('Drift is too small to compensate')
      setDriftCorrected(null)
      return
    }
    setDriftCorrected(corrected)
    setDriftStatus('ready')
  }, [hasDrift, lat, lng, driftSpeedMps, driftBearingDeg])

  const handleClearDriftCorrection = useCallback(() => {
    setDriftCorrected(null)
    setDriftStatus('idle')
    setDriftMessage(null)
  }, [])

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        latitude: lat,
        longitude: lng,
        icon,
        color
      })
    } catch (err) {
      setError(err.message || 'Failed to save waypoint')
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this waypoint?')) return

    setSaving(true)
    try {
      await onDelete()
    } catch (err) {
      setError(err.message || 'Failed to delete waypoint')
      setSaving(false)
    }
  }

  const iconIds = Object.keys(WAYPOINT_ICONS)

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'var(--bg-scrim)', zIndex: 50 }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 50, width: '90%', maxWidth: 448 }}>
        <Glass radius={16} style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--bg-hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg1)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isEdit ? 'Edit Waypoint' : 'Add Waypoint'}
            </h2>
            <button
              onClick={onClose}
              style={{ padding: 4, borderRadius: 6, background: 'transparent', border: 0, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <XMarkIcon style={{ width: 24, height: 24, color: 'var(--fg1)' }} />
            </button>
          </div>

          {/* Form */}
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Error message */}
            {error && (
              <div style={{ padding: 12, background: 'rgba(255,80,80,0.08)', border: '0.5px solid var(--tint-red)', borderRadius: 8, color: 'var(--tint-red)', fontSize: 14 }}>
                {error}
              </div>
            )}

            {/* Name input */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--fg2)', marginBottom: 4 }}>Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter waypoint name"
                autoFocus
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '0.5px solid var(--bg-hairline-strong)', borderRadius: 8, color: 'var(--fg1)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Description textarea */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--fg2)', marginBottom: 4 }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '0.5px solid var(--bg-hairline-strong)', borderRadius: 8, color: 'var(--fg1)', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }}
              />
            </div>

            {/* Position display (read-only) */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--fg2)', marginBottom: 4 }}>Position</label>
              <div style={{ fontFamily: 'monospace', fontSize: 18, color: 'var(--fg1)', background: 'var(--bg)', padding: '8px 12px', borderRadius: 8, border: '0.5px solid var(--bg-hairline-strong)' }}>
                {formatLatitude(lat)} / {formatLongitude(lng)}
              </div>
            </div>

            {/* Drift compensation */}
            <div>
              {driftStatus !== 'ready' && (
                <button
                  type="button"
                  onClick={handleCompensateForDrift}
                  disabled={!hasDrift || driftStatus === 'loading'}
                  style={{ width: '100%', minHeight: 44, background: 'var(--bg-elev)', border: '0.5px solid var(--bg-hairline-strong)', borderRadius: 8, fontSize: 12, color: 'var(--fg1)', textTransform: 'uppercase', cursor: hasDrift && driftStatus !== 'loading' ? 'pointer' : 'default', opacity: hasDrift ? 1 : 0.3 }}
                >
                  {driftStatus === 'loading' ? 'Computing...' : 'Compensate for Drift'}
                </button>
              )}
              {!hasDrift && driftStatus === 'idle' && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--fg2)', textAlign: 'center' }}>
                  No drift calibrated — go to GPS page
                </div>
              )}
              {driftStatus === 'noop' && driftMessage && (
                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--tint-yellow)', textAlign: 'center' }}>
                  {driftMessage}
                </div>
              )}

              {driftStatus === 'ready' && driftCorrected && (
                <div style={{ marginTop: 4 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--tint-teal)', marginBottom: 4 }}>
                    Drift-Corrected Hold Position{driftCorrected.approximate ? ' (approx.)' : ''}
                  </label>
                  <div style={{ fontFamily: 'monospace', fontSize: 18, color: 'var(--tint-teal)', background: 'var(--bg)', padding: '8px 12px', borderRadius: 8, border: '0.5px solid var(--bg-hairline-strong)' }}>
                    {formatLatitude(driftCorrected.lat)} / {formatLongitude(driftCorrected.lng)}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, color: 'var(--fg2)', fontFamily: 'monospace', textAlign: 'center' }}>
                    Offset {driftCorrected.offsetM.toFixed(1)} m @{' '}
                    {driftCorrected.upstreamBearingDeg.toFixed(0)}° (upstream)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg2)', fontFamily: 'monospace', textAlign: 'center' }}>
                    drift {driftCorrected.driftOffsetM.toFixed(1)} m + boat {driftCorrected.boatLengthM.toFixed(1)} m
                    {' · '}sink {driftCorrected.sinkTimeS.toFixed(0)} s
                  </div>
                  <button
                    type="button"
                    onClick={handleClearDriftCorrection}
                    style={{ marginTop: 8, width: '100%', minHeight: 36, background: 'var(--bg-elev)', border: '0.5px solid var(--bg-hairline-strong)', borderRadius: 8, fontSize: 12, color: 'var(--fg2)', textTransform: 'uppercase', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Icon selector */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--fg2)', marginBottom: 8 }}>Icon</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {iconIds.map(iconId => (
                  <button
                    key={iconId}
                    onClick={() => setIcon(iconId)}
                    style={{
                      padding: 12, borderRadius: 8,
                      border: icon === iconId ? '2px solid var(--signal)' : '1.5px solid var(--bg-hairline-strong)',
                      background: icon === iconId ? 'rgba(0,200,100,0.08)' : 'var(--bg)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      touchAction: 'manipulation'
                    }}
                    title={WAYPOINT_ICONS[iconId].label}
                  >
                    <WaypointIcon iconId={iconId} color={color} className="w-6 h-6" />
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--fg2)', marginBottom: 8 }}>Color</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {WAYPOINT_COLORS.map(({ hex, label }) => (
                  <button
                    key={hex}
                    onClick={() => setColor(hex)}
                    style={{
                      height: 40, borderRadius: 8,
                      border: color === hex ? '2px solid #fff' : '2px solid transparent',
                      background: hex,
                      cursor: 'pointer',
                      transform: color === hex ? 'scale(1.1)' : 'scale(1)',
                      transition: 'all 150ms',
                      touchAction: 'manipulation'
                    }}
                    title={label}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div style={{ paddingTop: 8, borderTop: '0.5px solid var(--bg-hairline-strong)' }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--fg2)', marginBottom: 8 }}>Preview</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg)', padding: 12, borderRadius: 8 }}>
                <WaypointIcon iconId={icon} color={color} className="w-8 h-8" />
                <div>
                  <div style={{ color: 'var(--fg1)', fontWeight: 500 }}>{name || 'Waypoint Name'}</div>
                  <div style={{ color: 'var(--fg2)', fontSize: 12 }}>
                    {WAYPOINT_ICONS[icon]?.label || 'General'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--bg-hairline-strong)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {isEdit && onDelete ? (
              <Pill
                onClick={handleDelete}
                style={{ minHeight: 44, background: 'var(--tint-red)', color: '#fff', opacity: saving ? 0.5 : 1 }}
              >
                <TrashIcon style={{ width: 16, height: 16 }} />
                <span>Delete</span>
              </Pill>
            ) : (
              <div />
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Pill
                onClick={onClose}
                style={{ minHeight: 44, opacity: saving ? 0.5 : 1 }}
              >
                Cancel
              </Pill>
              <Pill
                onClick={handleSave}
                style={{ minHeight: 44, background: 'var(--signal)', color: '#fff', opacity: (saving || !name.trim()) ? 0.5 : 1 }}
              >
                {saving ? 'Saving...' : 'Save'}
              </Pill>
            </div>
          </div>
        </Glass>
      </div>
    </>
  )
}
