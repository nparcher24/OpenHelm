import React, { useState } from 'react'
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { Glass } from '../ui/primitives'

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
      <div
        className="absolute right-0 z-40"
        style={{ top: 96, minWidth: 460, maxHeight: '80vh', overflow: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        <Glass radius={18} style={{
          padding: 0, overflow: 'hidden', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-elev)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
        }}>
          <div style={{ padding: '18px 22px', borderBottom: '0.5px solid var(--bg-hairline-strong)', flexShrink: 0 }}>
            <h3 style={{ fontSize: 20, fontWeight: 600, color: 'var(--fg1)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vector Chart Layers</h3>
          </div>

          <div style={{ overflowY: 'auto', padding: '6px 0' }}>
            {S57_SUBLAYER_GROUPS.map((group) => {
              const allVisible = isGroupAllVisible(group)
              const partial = isGroupPartiallyVisible(group)
              const expanded = expandedGroups[group.id]

              return (
                <div key={group.id}>
                  {/* Group header */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '12px 18px' }}>
                    <button
                      onClick={() => toggleGroupExpanded(group.id)}
                      style={{ padding: 8, background: 'transparent', border: 0, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      aria-label={expanded ? 'Collapse' : 'Expand'}
                    >
                      {expanded
                        ? <ChevronDownIcon style={{ width: 24, height: 24, color: 'var(--fg2)' }} />
                        : <ChevronRightIcon style={{ width: 24, height: 24, color: 'var(--fg2)' }} />
                      }
                    </button>
                    <span style={{ flex: 1, fontSize: 17, fontWeight: 600, color: 'var(--fg1)', textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: 6 }}>
                      {group.name}
                    </span>
                    <button
                      onClick={() => onToggleGroup(group.id, !allVisible)}
                      style={{ padding: 8, background: 'transparent', border: 0, cursor: 'pointer', touchAction: 'manipulation', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      aria-label={allVisible ? 'Hide all' : 'Show all'}
                      title={allVisible ? `Hide all ${group.name}` : `Show all ${group.name}`}
                    >
                      {allVisible
                        ? <EyeIcon style={{ width: 24, height: 24, color: 'var(--fg1)' }} />
                        : partial
                          ? <EyeIcon style={{ width: 24, height: 24, color: 'var(--fg2)' }} />
                          : <EyeSlashIcon style={{ width: 24, height: 24, color: 'var(--fg2)' }} />
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
                        style={{ width: '100%', paddingLeft: 56, paddingRight: 22, paddingTop: 14, paddingBottom: 14, textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, touchAction: 'manipulation' }}
                      >
                        <div style={{
                          width: 24, height: 24, borderRadius: 6, border: visible ? '2px solid var(--signal)' : '2px solid var(--bg-hairline-strong)',
                          background: visible ? 'rgba(0,200,100,0.12)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                          {visible && (
                            <CheckIcon style={{ width: 18, height: 18, color: 'var(--signal)', strokeWidth: 3 }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--fg1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sublayer.name}
                          </div>
                          <div style={{ fontSize: 16, color: 'var(--fg2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        </Glass>
      </div>
    </>
  )
})

export { S57_SUBLAYER_GROUPS }
export default S57SubLayerMenu
