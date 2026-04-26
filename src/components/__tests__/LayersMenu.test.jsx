import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import LayersMenu from '../LayersMenu'

const baseLayers = [
  { id: 's57', name: 'Vector Charts', description: 'desc-s57', visible: true },
  { id: 'bluetopo', name: 'BlueTopo', description: 'desc-bt', visible: false },
  {
    id: 'live-satellite',
    name: 'Live Satellite Imagery',
    description: 'desc-live',
    visible: false,
    requiresInternet: true
  }
]

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value
  })
}

describe('LayersMenu', () => {
  beforeEach(() => setOnline(true))
  afterEach(() => setOnline(true))

  it('renders all provided layers with names and descriptions', () => {
    render(<LayersMenu layers={baseLayers} onToggleLayer={() => {}} onClose={() => {}} />)
    for (const l of baseLayers) {
      expect(screen.getByText(l.name)).toBeInTheDocument()
      expect(screen.getByText(l.description)).toBeInTheDocument()
    }
  })

  it('invokes onToggleLayer with the layer id when a row is clicked', () => {
    const onToggleLayer = vi.fn()
    render(<LayersMenu layers={baseLayers} onToggleLayer={onToggleLayer} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Live Satellite Imagery'))
    expect(onToggleLayer).toHaveBeenCalledWith('live-satellite')
  })

  it('shows "Internet required" pill only for layers with requiresInternet', () => {
    render(<LayersMenu layers={baseLayers} onToggleLayer={() => {}} onClose={() => {}} />)
    expect(screen.getByTestId('online-pill-live-satellite')).toHaveTextContent('Internet required')
    expect(screen.queryByTestId('online-pill-s57')).toBeNull()
    expect(screen.queryByTestId('online-pill-bluetopo')).toBeNull()
  })

  it('shows "Offline" and dims the row when navigator.onLine is false', () => {
    setOnline(false)
    render(<LayersMenu layers={baseLayers} onToggleLayer={() => {}} onClose={() => {}} />)
    const pill = screen.getByTestId('online-pill-live-satellite')
    expect(pill).toHaveTextContent('Offline')
    // Row button is the closest <button> ancestor
    const row = pill.closest('button')
    expect(row.className).toMatch(/opacity-50/)
  })

  it('reacts to the browser offline event', () => {
    render(<LayersMenu layers={baseLayers} onToggleLayer={() => {}} onClose={() => {}} />)
    expect(screen.getByTestId('online-pill-live-satellite')).toHaveTextContent('Internet required')
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByTestId('online-pill-live-satellite')).toHaveTextContent('Offline')
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<LayersMenu layers={baseLayers} onToggleLayer={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('layers-menu-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
