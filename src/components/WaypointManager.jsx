/**
 * WaypointManager Component
 * Settings page UI for managing waypoints
 * Features: list, multi-select, edit, delete, CSV export, share
 */

import { useState, useEffect } from 'react'
import {
  TrashIcon,
  PencilSquareIcon,
  DocumentArrowDownIcon,
  ClipboardDocumentIcon,
  EnvelopeIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import {
  getAllWaypoints,
  updateWaypoint,
  deleteWaypoint,
  deleteWaypointsBatch,
  exportWaypointsCSV,
  formatWaypointsForClipboard,
  generateWaypointEmailLink
} from '../services/waypointService'
import { WaypointIcon, formatCoordinates } from '../utils/waypointIcons'
import WaypointEditModal from './WaypointEditModal'
import { Pill } from '../ui/primitives'

export default function WaypointManager() {
  const [waypoints, setWaypoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [editingWaypoint, setEditingWaypoint] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)

  // Load waypoints on mount
  useEffect(() => {
    loadWaypoints()
  }, [])

  const loadWaypoints = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getAllWaypoints()
      setWaypoints(result.waypoints || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Multi-select handlers
  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const toggleAllSelection = () => {
    if (selectedIds.size === waypoints.length && waypoints.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(waypoints.map(wp => wp.id)))
    }
  }

  // Delete handlers
  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} waypoint(s)? This cannot be undone.`)) return

    setIsDeleting(true)
    setError(null)

    try {
      const result = await deleteWaypointsBatch(Array.from(selectedIds))
      if (result.failed?.length > 0) {
        setError(`Deleted ${result.deleted.length}, but ${result.failed.length} failed`)
      }
      setSelectedIds(new Set())
      await loadWaypoints()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDeleteSingle = async (id) => {
    if (!confirm('Delete this waypoint?')) return

    setIsDeleting(true)
    setError(null)

    try {
      await deleteWaypoint(id)
      setSelectedIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      await loadWaypoints()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDeleting(false)
    }
  }

  // Edit handler
  const handleSaveEdit = async (data) => {
    try {
      await updateWaypoint(editingWaypoint.id, data)
      setEditingWaypoint(null)
      await loadWaypoints()
    } catch (err) {
      throw err // Let modal handle error display
    }
  }

  // Export CSV
  const handleExportCSV = async () => {
    try {
      const csv = await exportWaypointsCSV()
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `waypoints_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(`Export failed: ${err.message}`)
    }
  }

  // Share handlers
  const handleCopyToClipboard = async () => {
    const selected = selectedIds.size > 0
      ? waypoints.filter(wp => selectedIds.has(wp.id))
      : waypoints

    const text = formatWaypointsForClipboard(selected)

    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      setError('Failed to copy to clipboard')
    }
  }

  const handleEmailShare = () => {
    const selected = selectedIds.size > 0
      ? waypoints.filter(wp => selectedIds.has(wp.id))
      : waypoints

    const mailtoUrl = generateWaypointEmailLink(selected)
    window.location.href = mailtoUrl
  }

  // Check indeterminate state for header checkbox
  const isAllSelected = selectedIds.size === waypoints.length && waypoints.length > 0
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < waypoints.length

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 style={{ color: 'var(--fg1)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', textTransform: 'uppercase' }}>
          Waypoint Manager
        </h2>
        <p style={{ color: 'var(--fg2)', marginTop: 4 }}>
          {loading ? 'Loading...' : `${waypoints.length} waypoint${waypoints.length !== 1 ? 's' : ''} saved`}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div style={{ marginBottom: 16, padding: 16, background: 'rgba(255,80,80,0.08)', border: '0.5px solid var(--tint-red)', borderRadius: 8, color: 'var(--tint-red)' }}>
          {error}
        </div>
      )}

      {/* Action Bar */}
      <div className="mb-4 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Selection info */}
          {selectedIds.size > 0 && (
            <span style={{ color: 'var(--fg1)', fontFamily: 'monospace', fontSize: 14 }}>
              {selectedIds.size} selected
            </span>
          )}

          {/* Multi-delete button */}
          {selectedIds.size > 0 && (
            <Pill
              onClick={handleDeleteSelected}
              style={{ minHeight: 44, background: 'var(--tint-red)', color: '#fff', opacity: isDeleting ? 0.5 : 1 }}
            >
              <TrashIcon style={{ width: 16, height: 16 }} />
              <span>Delete ({selectedIds.size})</span>
            </Pill>
          )}

          {/* Clear selection */}
          {selectedIds.size > 0 && (
            <Pill
              onClick={() => setSelectedIds(new Set())}
              style={{ minHeight: 44 }}
            >
              Clear
            </Pill>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Copy to clipboard */}
          <Pill
            onClick={handleCopyToClipboard}
            style={{ minHeight: 44, opacity: waypoints.length === 0 ? 0.35 : 1 }}
            title={selectedIds.size > 0 ? 'Copy selected to clipboard' : 'Copy all to clipboard'}
          >
            {copySuccess ? (
              <CheckIcon style={{ width: 16, height: 16, color: 'var(--fg1)' }} />
            ) : (
              <ClipboardDocumentIcon style={{ width: 16, height: 16 }} />
            )}
            <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
          </Pill>

          {/* Email share */}
          <Pill
            onClick={handleEmailShare}
            style={{ minHeight: 44, opacity: waypoints.length === 0 ? 0.35 : 1 }}
            title={selectedIds.size > 0 ? 'Email selected waypoints' : 'Email all waypoints'}
          >
            <EnvelopeIcon style={{ width: 16, height: 16 }} />
            <span>Email</span>
          </Pill>

          {/* Export CSV */}
          <Pill
            onClick={handleExportCSV}
            style={{ minHeight: 44, background: 'var(--signal)', color: '#fff', opacity: waypoints.length === 0 ? 0.35 : 1 }}
          >
            <DocumentArrowDownIcon style={{ width: 16, height: 16 }} />
            <span>Export CSV</span>
          </Pill>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-elev)', borderRadius: 10, border: '0.5px solid var(--bg-hairline-strong)', overflow: 'hidden' }}>
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div style={{ width: 32, height: 32, border: '4px solid var(--fg1)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : waypoints.length === 0 ? (
          <div className="p-8 text-center">
            <div style={{ color: 'var(--fg2)', marginBottom: 8 }}>No waypoints saved</div>
            <div style={{ color: 'var(--fg2)', fontSize: 12 }}>
              Long-press on the chart to add waypoints
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ background: 'var(--bg)', color: 'var(--fg1)', borderBottom: '0.5px solid var(--bg-hairline-strong)' }}>
              <tr>
                <th className="px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected
                    }}
                    onChange={toggleAllSelection}
                    className="cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 text-left w-12">Icon</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left hidden sm:table-cell">Position</th>
                <th className="px-4 py-3 text-left hidden md:table-cell">Description</th>
                <th className="px-4 py-3 text-left hidden lg:table-cell">Created</th>
                <th className="px-4 py-3 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {waypoints.map(wp => (
                <tr
                  key={wp.id}
                  style={{
                    borderBottom: '0.5px solid var(--bg-hairline-strong)',
                    background: selectedIds.has(wp.id) ? 'rgba(var(--signal-rgb,0,200,100),0.08)' : 'transparent'
                  }}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(wp.id)}
                      onChange={() => toggleSelection(wp.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <WaypointIcon iconId={wp.icon} color={wp.color} className="w-6 h-6" />
                  </td>
                  <td className="px-4 py-3">
                    <div style={{ color: 'var(--fg1)', fontWeight: 500 }}>{wp.name}</div>
                    <div style={{ color: 'var(--fg2)', fontSize: 12, fontFamily: 'monospace' }} className="sm:hidden">
                      {formatCoordinates(wp.latitude, wp.longitude)}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span style={{ color: 'var(--fg2)', fontFamily: 'monospace', fontSize: 12 }}>
                      {formatCoordinates(wp.latitude, wp.longitude)}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span style={{ color: 'var(--fg2)', fontSize: 12 }} className="truncate max-w-[200px] block">
                      {wp.description || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span style={{ color: 'var(--fg2)', fontSize: 12 }}>
                      {new Date(wp.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => setEditingWaypoint(wp)}
                        style={{ padding: 8, borderRadius: 6, background: 'transparent', border: 0, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Edit"
                      >
                        <PencilSquareIcon style={{ width: 16, height: 16, color: 'var(--tint-teal)' }} />
                      </button>
                      <button
                        onClick={() => handleDeleteSingle(wp.id)}
                        disabled={isDeleting}
                        style={{ padding: 8, borderRadius: 6, background: 'transparent', border: 0, cursor: 'pointer', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isDeleting ? 0.5 : 1 }}
                        title="Delete"
                      >
                        <TrashIcon style={{ width: 16, height: 16, color: 'var(--tint-red)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Help text */}
      <div style={{ marginTop: 16, fontSize: 12, color: 'var(--fg2)' }}>
        <p>Tip: Long-press on the chart to add new waypoints. Select multiple waypoints to share or delete in bulk.</p>
      </div>

      {/* Edit Modal */}
      {editingWaypoint && (
        <WaypointEditModal
          waypoint={editingWaypoint}
          onSave={handleSaveEdit}
          onDelete={async () => {
            await handleDeleteSingle(editingWaypoint.id)
            setEditingWaypoint(null)
          }}
          onClose={() => setEditingWaypoint(null)}
        />
      )}
    </div>
  )
}
