import React, { useState } from 'react'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

/**
 * S-57 sublayer definitions grouped by category.
 * Each entry maps an S-57 layer name to display info.
 * The `patterns` array lists MapLibre layer id suffixes that belong to this sublayer.
 */
const S57_SUBLAYER_GROUPS = [
  {
    id: 'depth',
    name: 'Depth',
    sublayers: [
      { id: 'DEPARE', name: 'Depth Areas', desc: 'Graduated depth shading', patterns: ['depare-fill', 'depare-outline'] },
      { id: 'DEPCNT', name: 'Depth Contours', desc: 'Bathymetric contour lines', patterns: ['depcnt'] },
      { id: 'SOUNDG', name: 'Soundings', desc: 'Individual depth measurements', patterns: ['soundg'] },
      { id: 'DRGARE', name: 'Dredged Areas', desc: 'Maintained channel depths', patterns: ['drgare-fill', 'drgare-outline'] },
    ]
  },
  {
    id: 'land',
    name: 'Land & Shore',
    sublayers: [
      { id: 'LNDARE', name: 'Land Areas', desc: 'Land mass fill', patterns: ['lndare-fill', 'lndare-outline'] },
      { id: 'COALNE', name: 'Coastline', desc: 'Shoreline boundary', patterns: ['coalne'] },
      { id: 'SLCONS', name: 'Shore Structures', desc: 'Piers, breakwaters, seawalls', patterns: ['slcons'] },
    ]
  },
  {
    id: 'navaid',
    name: 'Navigation Aids',
    sublayers: [
      { id: 'BOYSPP', name: 'Buoys', desc: 'Channel markers & buoys', patterns: ['boyspp'] },
      { id: 'BCNSPP', name: 'Beacons', desc: 'Fixed navigation beacons', patterns: ['bcnspp'] },
      { id: 'LIGHTS', name: 'Lights', desc: 'Lighthouses & navigation lights', patterns: ['lights'] },
    ]
  },
  {
    id: 'hazard',
    name: 'Hazards',
    sublayers: [
      { id: 'WRECKS', name: 'Wrecks', desc: 'Shipwrecks & submerged hulks', patterns: ['wrecks'] },
      { id: 'OBSTRN', name: 'Obstructions', desc: 'Underwater obstructions', patterns: ['obstrn'] },
      { id: 'UWTROC', name: 'Underwater Rocks', desc: 'Submerged rocks', patterns: ['uwtroc'] },
    ]
  },
  {
    id: 'area',
    name: 'Areas & Zones',
    sublayers: [
      { id: 'RESARE', name: 'Restricted Areas', desc: 'No-go & restricted zones', patterns: ['resare-fill', 'resare-outline'] },
      { id: 'ACHARE', name: 'Anchorages', desc: 'Designated anchorage areas', patterns: ['achare-fill', 'achare-outline'] },
      { id: 'SEAARE', name: 'Sea Areas', desc: 'Named water bodies', patterns: ['seaare'] },
    ]
  },
  {
    id: 'infra',
    name: 'Infrastructure',
    sublayers: [
      { id: 'BRIDGE', name: 'Bridges', desc: 'Bridge crossings', patterns: ['bridge'] },
    ]
  },
]

const S57SubLayerMenu = React.memo(function S57SubLayerMenu({ sublayerVisibility, onToggleSublayer, onToggleGroup, onClose }) {
  const [expandedGroups, setExpandedGroups] = useState(() => {
    // Start with all groups expanded
    const expanded = {}
    S57_SUBLAYER_GROUPS.forEach(g => { expanded[g.id] = true })
    return expanded
  })

  const toggleGroupExpanded = (groupId) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  const isGroupAllVisible = (group) => {
    return group.sublayers.every(sl => sublayerVisibility[sl.id] !== false)
  }

  const isGroupPartiallyVisible = (group) => {
    const visible = group.sublayers.filter(sl => sublayerVisibility[sl.id] !== false)
    return visible.length > 0 && visible.length < group.sublayers.length
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        onClick={onClose}
      />

      {/* Menu Content */}
      <div className="absolute top-14 left-0 bg-terminal-surface rounded-lg shadow-glow-green border border-terminal-border overflow-hidden z-40 min-w-[280px] max-h-[70vh] overflow-y-auto"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <div className="px-4 py-3 border-b border-terminal-border">
          <h3 className="text-sm font-semibold text-terminal-green uppercase tracking-wide">Vector Chart Layers</h3>
        </div>

        <div className="py-1">
          {S57_SUBLAYER_GROUPS.map((group) => {
            const allVisible = isGroupAllVisible(group)
            const partial = isGroupPartiallyVisible(group)
            const expanded = expandedGroups[group.id]

            return (
              <div key={group.id}>
                {/* Group header */}
                <div className="flex items-center px-3 py-2 hover:bg-terminal-green/5 transition-colors">
                  <button
                    onClick={() => toggleGroupExpanded(group.id)}
                    className="p-1 touch-manipulation"
                    aria-label={expanded ? 'Collapse' : 'Expand'}
                  >
                    {expanded
                      ? <ChevronDownIcon className="w-4 h-4 text-terminal-green-dim" />
                      : <ChevronRightIcon className="w-4 h-4 text-terminal-green-dim" />
                    }
                  </button>
                  <span className="flex-1 text-xs font-semibold text-terminal-green uppercase tracking-wider ml-1">
                    {group.name}
                  </span>
                  <button
                    onClick={() => onToggleGroup(group.id, !allVisible)}
                    className="p-1 touch-manipulation"
                    aria-label={allVisible ? 'Hide all' : 'Show all'}
                    title={allVisible ? `Hide all ${group.name}` : `Show all ${group.name}`}
                  >
                    {allVisible
                      ? <EyeIcon className="w-4 h-4 text-terminal-green" />
                      : partial
                        ? <EyeIcon className="w-4 h-4 text-terminal-green-dim" />
                        : <EyeSlashIcon className="w-4 h-4 text-terminal-green-dim" />
                    }
                  </button>
                </div>

                {/* Sublayers */}
                {expanded && group.sublayers.map((sublayer) => {
                  const visible = sublayerVisibility[sublayer.id] !== false
                  return (
                    <button
                      key={sublayer.id}
                      onClick={() => onToggleSublayer(sublayer.id)}
                      className="w-full pl-9 pr-4 py-2.5 text-left hover:bg-terminal-green/10 transition-colors flex items-center space-x-3 touch-manipulation"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                        visible
                          ? 'bg-terminal-green/20 border-terminal-green'
                          : 'border-terminal-border'
                      }`}>
                        {visible && (
                          <CheckIcon className="w-3 h-3 text-terminal-green" strokeWidth={3} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-terminal-green truncate">
                          {sublayer.name}
                        </div>
                        <div className="text-xs text-terminal-green-dim truncate">
                          {sublayer.desc}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
})

export { S57_SUBLAYER_GROUPS }
export default S57SubLayerMenu
