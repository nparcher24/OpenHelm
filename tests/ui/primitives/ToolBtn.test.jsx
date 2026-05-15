import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ToolBtn } from '../../../src/ui/primitives/ToolBtn.jsx'

describe('ToolBtn', () => {
  it('fires onClick', () => {
    const fn = vi.fn()
    const { getByRole } = render(<ToolBtn icon="plus" onClick={fn} title="Zoom"/>)
    fireEvent.click(getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })
  it('exposes title for accessibility', () => {
    const { getByTitle } = render(<ToolBtn icon="plus" title="Zoom in"/>)
    expect(getByTitle('Zoom in')).toBeInTheDocument()
  })
  it('renders icon when name given', () => {
    const { container } = render(<ToolBtn icon="plus"/>)
    expect(container.querySelector('svg')).toBeTruthy()
  })
  it('uses signal-soft background when active', () => {
    const { getByRole } = render(<ToolBtn icon="plus" active/>)
    expect(getByRole('button').style.background).toContain('signal-soft')
  })
})
