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
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 w-[90%] max-w-md">
        <div className="bg-terminal-surface rounded-lg shadow-glow-green border-2 border-terminal-green overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-terminal-border bg-terminal-bg flex items-center justify-between">
            <h2 className="text-lg font-bold text-terminal-green uppercase tracking-wider">
              {isEdit ? 'Edit Waypoint' : 'Add Waypoint'}
            </h2>
            <button
              onClick={onClose}
              className="p-1 hover:bg-terminal-green/10 rounded transition-colors"
            >
              <XMarkIcon className="w-6 h-6 text-terminal-green" />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 space-y-4">
            {/* Error message */}
            {error && (
              <div className="p-3 bg-terminal-red/10 border border-terminal-red/50 rounded text-terminal-red text-sm">
                {error}
              </div>
            )}

            {/* Name input */}
            <div>
              <label className="block text-sm text-terminal-green-dim mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter waypoint name"
                className="terminal-input w-full"
                autoFocus
              />
            </div>

            {/* Description textarea */}
            <div>
              <label className="block text-sm text-terminal-green-dim mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                className="terminal-input w-full resize-none"
              />
            </div>

            {/* Position display (read-only) */}
            <div>
              <label className="block text-sm text-terminal-green-dim mb-1">Position</label>
              <div className="font-mono text-lg text-terminal-green bg-terminal-bg px-3 py-2 rounded border border-terminal-border">
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
                  className="w-full min-h-[44px] bg-terminal-surface border border-terminal-green rounded text-xs text-terminal-green uppercase disabled:opacity-30 disabled:border-terminal-border active:bg-terminal-green active:text-black"
                >
                  {driftStatus === 'loading' ? 'Computing...' : 'Compensate for Drift'}
                </button>
              )}
              {!hasDrift && driftStatus === 'idle' && (
                <div className="mt-1 text-xs text-terminal-green-dim text-center">
                  No drift calibrated — go to GPS page
                </div>
              )}
              {driftStatus === 'noop' && driftMessage && (
                <div className="mt-1 text-xs text-terminal-amber text-center">
                  {driftMessage}
                </div>
              )}

              {driftStatus === 'ready' && driftCorrected && (
                <div className="mt-1">
                  <label className="block text-sm text-terminal-cyan mb-1">
                    Drift-Corrected Hold Position{driftCorrected.approximate ? ' (approx.)' : ''}
                  </label>
                  <div className="font-mono text-lg text-terminal-cyan bg-terminal-bg px-3 py-2 rounded border border-terminal-cyan/40">
                    {formatLatitude(driftCorrected.lat)} / {formatLongitude(driftCorrected.lng)}
                  </div>
                  <div className="mt-1 text-xs text-terminal-green-dim font-mono text-center">
                    Offset {driftCorrected.offsetM.toFixed(1)} m @{' '}
                    {driftCorrected.upstreamBearingDeg.toFixed(0)}° (upstream)
                  </div>
                  <div className="text-xs text-terminal-green-dim font-mono text-center">
                    drift {driftCorrected.driftOffsetM.toFixed(1)} m + boat {driftCorrected.boatLengthM.toFixed(1)} m
                    {' · '}sink {driftCorrected.sinkTimeS.toFixed(0)} s
                  </div>
                  <button
                    type="button"
                    onClick={handleClearDriftCorrection}
                    className="mt-2 w-full min-h-[36px] bg-terminal-surface border border-terminal-border rounded text-xs text-terminal-green-dim uppercase active:bg-terminal-green active:text-black"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Icon selector */}
            <div>
              <label className="block text-sm text-terminal-green-dim mb-2">Icon</label>
              <div className="grid grid-cols-4 gap-2">
                {iconIds.map(iconId => (
                  <button
                    key={iconId}
                    onClick={() => setIcon(iconId)}
                    className={`p-3 rounded border-2 transition-all flex flex-col items-center justify-center touch-manipulation ${
                      icon === iconId
                        ? 'border-terminal-green bg-terminal-green/10 shadow-glow-green-sm'
                        : 'border-terminal-border hover:border-terminal-green/50'
                    }`}
                    title={WAYPOINT_ICONS[iconId].label}
                  >
                    <WaypointIcon iconId={iconId} color={color} className="w-6 h-6" />
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="block text-sm text-terminal-green-dim mb-2">Color</label>
              <div className="grid grid-cols-4 gap-2">
                {WAYPOINT_COLORS.map(({ hex, label }) => (
                  <button
                    key={hex}
                    onClick={() => setColor(hex)}
                    className={`h-10 rounded border-2 transition-all touch-manipulation ${
                      color === hex
                        ? 'border-white shadow-lg scale-110'
                        : 'border-transparent hover:border-white/50'
                    }`}
                    style={{ backgroundColor: hex }}
                    title={label}
                  />
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="pt-2 border-t border-terminal-border">
              <label className="block text-sm text-terminal-green-dim mb-2">Preview</label>
              <div className="flex items-center space-x-3 bg-terminal-bg p-3 rounded">
                <WaypointIcon iconId={icon} color={color} className="w-8 h-8" />
                <div>
                  <div className="text-terminal-green font-medium">{name || 'Waypoint Name'}</div>
                  <div className="text-terminal-green-dim text-xs">
                    {WAYPOINT_ICONS[icon]?.label || 'General'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 py-3 border-t border-terminal-border bg-terminal-bg flex items-center justify-between">
            {isEdit && onDelete ? (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="terminal-btn-danger flex items-center space-x-2"
              >
                <TrashIcon className="w-4 h-4" />
                <span>Delete</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="terminal-btn"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="terminal-btn-primary"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
