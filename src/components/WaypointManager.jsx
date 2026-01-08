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
        <h2 className="text-2xl font-bold text-terminal-green text-glow uppercase tracking-wider">
          Waypoint Manager
        </h2>
        <p className="text-terminal-green-dim mt-1">
          {loading ? 'Loading...' : `${waypoints.length} waypoint${waypoints.length !== 1 ? 's' : ''} saved`}
        </p>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-4 bg-terminal-red/10 border border-terminal-red/50 rounded-lg text-terminal-red">
          {error}
        </div>
      )}

      {/* Action Bar */}
      <div className="mb-4 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Selection info */}
          {selectedIds.size > 0 && (
            <span className="text-terminal-green font-mono text-sm">
              {selectedIds.size} selected
            </span>
          )}

          {/* Multi-delete button */}
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="terminal-btn-danger flex items-center space-x-2"
            >
              <TrashIcon className="w-4 h-4" />
              <span>Delete ({selectedIds.size})</span>
            </button>
          )}

          {/* Clear selection */}
          {selectedIds.size > 0 && (
            <button
              onClick={() => setSelectedIds(new Set())}
              className="terminal-btn text-sm"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Copy to clipboard */}
          <button
            onClick={handleCopyToClipboard}
            disabled={waypoints.length === 0}
            className="terminal-btn flex items-center space-x-2"
            title={selectedIds.size > 0 ? 'Copy selected to clipboard' : 'Copy all to clipboard'}
          >
            {copySuccess ? (
              <CheckIcon className="w-4 h-4 text-terminal-green" />
            ) : (
              <ClipboardDocumentIcon className="w-4 h-4" />
            )}
            <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
          </button>

          {/* Email share */}
          <button
            onClick={handleEmailShare}
            disabled={waypoints.length === 0}
            className="terminal-btn flex items-center space-x-2"
            title={selectedIds.size > 0 ? 'Email selected waypoints' : 'Email all waypoints'}
          >
            <EnvelopeIcon className="w-4 h-4" />
            <span>Email</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            disabled={waypoints.length === 0}
            className="terminal-btn-primary flex items-center space-x-2"
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-terminal-surface rounded-lg border border-terminal-border overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-terminal-green border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : waypoints.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-terminal-green-dim mb-2">No waypoints saved</div>
            <div className="text-xs text-terminal-green-dim">
              Long-press on the chart to add waypoints
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-terminal-bg text-terminal-green border-b border-terminal-border">
              <tr>
                <th className="px-4 py-3 w-12">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = isSomeSelected
                    }}
                    onChange={toggleAllSelection}
                    className="accent-terminal-green cursor-pointer"
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
                  className={`border-b border-terminal-border transition-colors ${
                    selectedIds.has(wp.id)
                      ? 'bg-terminal-green/10'
                      : 'hover:bg-terminal-green/5'
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(wp.id)}
                      onChange={() => toggleSelection(wp.id)}
                      className="accent-terminal-green cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <WaypointIcon iconId={wp.icon} color={wp.color} className="w-6 h-6" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-terminal-green font-medium">{wp.name}</div>
                    <div className="text-terminal-green-dim text-xs sm:hidden font-mono">
                      {formatCoordinates(wp.latitude, wp.longitude)}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-terminal-green-dim font-mono text-xs">
                      {formatCoordinates(wp.latitude, wp.longitude)}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-terminal-green-dim text-xs truncate max-w-[200px] block">
                      {wp.description || '-'}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-terminal-green-dim text-xs">
                      {new Date(wp.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => setEditingWaypoint(wp)}
                        className="p-2 hover:bg-terminal-green/10 rounded transition-colors"
                        title="Edit"
                      >
                        <PencilSquareIcon className="w-4 h-4 text-terminal-cyan" />
                      </button>
                      <button
                        onClick={() => handleDeleteSingle(wp.id)}
                        disabled={isDeleting}
                        className="p-2 hover:bg-terminal-red/10 rounded transition-colors"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4 text-terminal-red" />
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
      <div className="mt-4 text-xs text-terminal-green-dim">
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
