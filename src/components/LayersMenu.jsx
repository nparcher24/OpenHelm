import { CheckIcon } from '@heroicons/react/24/outline'

function LayersMenu({ layers, onToggleLayer, onClose }) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        onClick={onClose}
      />

      {/* Menu Content */}
      <div className="absolute bottom-14 left-0 bg-terminal-surface rounded-lg shadow-glow-green border border-terminal-border overflow-hidden z-40 min-w-[240px]">
        <div className="px-4 py-3 border-b border-terminal-border">
          <h3 className="text-sm font-semibold text-terminal-green uppercase tracking-wide">Map Layers</h3>
        </div>

        <div className="py-2">
          {layers.map((layer) => (
            <button
              key={layer.id}
              onClick={() => onToggleLayer(layer.id)}
              className="w-full px-4 py-3 text-left hover:bg-terminal-green/10 transition-colors flex items-center justify-between space-x-3"
            >
              <div className="flex items-center space-x-3 flex-1">
                {/* Checkbox indicator */}
                <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                  layer.visible
                    ? 'bg-terminal-green/20 border-terminal-green'
                    : 'border-terminal-border'
                }`}>
                  {layer.visible && (
                    <CheckIcon className="w-4 h-4 text-terminal-green" strokeWidth={3} />
                  )}
                </div>

                {/* Layer info */}
                <div className="flex-1">
                  <div className="text-sm font-medium text-terminal-green">
                    {layer.name}
                  </div>
                  {layer.description && (
                    <div className="text-xs text-terminal-green-dim mt-0.5">
                      {layer.description}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

export default LayersMenu
