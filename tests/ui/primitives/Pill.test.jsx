import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { Pill } from '../../../src/ui/primitives/Pill.jsx'

describe('Pill', () => {
  it('fires onClick', () => {
    const fn = vi.fn()
    const { getByRole } = render(<Pill onClick={fn}>Go</Pill>)
    fireEvent.click(getByRole('button'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('applies beacon tone background when active', () => {
    const { getByRole } = render(<Pill active tone="beacon">Lock</Pill>)
    const btn = getByRole('button')
    expect(btn.style.background).toContain('--beacon')
  })

  it('exposes title as accessible name', () => {
    const { getByTitle } = render(<Pill title="Center boat" icon="crosshair" />)
    expect(getByTitle('Center boat')).toBeInTheDocument()
  })
})
