/**
 * WaypointDropdown Component
 * Dropdown list of saved waypoints for quick navigation
 * Shows in the Chart view navbar area
 */

import { WaypointIcon, formatCoordinates } from '../utils/waypointIcons'

export default function WaypointDropdown({
  waypoints,
  onSelect,
  onClose
}) {
  return (
    <>
      {/* Backdrop for dismissing */}
      <div
        className="fixed inset-0 z-30"
        onClick={onClose}
      />

      {/* Dropdown */}
      <div className="absolute top-14 right-0 bg-terminal-surface rounded-lg shadow-glow-green border-2 border-terminal-green z-40 min-w-[280px] max-h-[400px] overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2 border-b border-terminal-border bg-terminal-bg">
          <div className="text-sm font-bold text-terminal-green uppercase tracking-wider">
            Waypoints ({waypoints.length})
          </div>
        </div>

        {/* List */}
        <div className="max-h-[340px] overflow-y-auto">
          {waypoints.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-terminal-green-dim mb-2">No waypoints saved</div>
              <div className="text-xs text-terminal-green-dim">
                Long-press on the chart to add one
              </div>
            </div>
          ) : (
            waypoints.map(wp => (
              <button
                key={wp.id}
                onClick={() => onSelect(wp)}
                className="w-full px-4 py-3 text-left hover:bg-terminal-green/10 active:bg-terminal-green/20 transition-colors flex items-center space-x-3 border-b border-terminal-border touch-manipulation"
              >
                <WaypointIcon iconId={wp.icon} color={wp.color} className="w-6 h-6 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-terminal-green font-medium truncate">{wp.name}</div>
                  <div className="text-terminal-green-dim text-xs font-mono">
                    {formatCoordinates(wp.latitude, wp.longitude)}
                  </div>
                  {wp.description && (
                    <div className="text-terminal-green-dim text-xs truncate mt-0.5">
                      {wp.description}
                    </div>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer - link to settings */}
        {waypoints.length > 0 && (
          <div className="px-4 py-2 border-t border-terminal-border bg-terminal-bg">
            <a
              href="/settings?section=waypoints"
              className="text-xs text-terminal-cyan hover:underline"
            >
              Manage waypoints in Settings →
            </a>
          </div>
        )}
      </div>
    </>
  )
}
